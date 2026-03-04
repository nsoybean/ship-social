const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const { JobQueue } = require("./queue");
const { createWorkflow } = require("./services/workflow");
const { parseReleaseWebhook } = require("./services/github");
const { json, text, readJson, readBody, serveStatic } = require("./utils/http");
const { readState } = require("./store");

const PORT = Number(process.env.PORT || 3000);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const workflow = createWorkflow({ appUrl: APP_URL });
const queue = new JobQueue({ handlers: workflow.handlers, pollIntervalMs: 900 });
workflow.setEnqueue((type, payload, options) => queue.enqueue(type, payload, options));
queue.start();

function getSessionToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  const fallback = req.headers["x-session-token"];
  return typeof fallback === "string" ? fallback.trim() : "";
}

function getUserOr401(req, res) {
  const token = getSessionToken(req);
  const user = workflow.auth.sessionUser(token);
  if (!user) {
    json(res, 401, { error: "Unauthorized" });
    return null;
  }

  return user;
}

function routeMatch(pathname, pattern) {
  const match = pathname.match(pattern);
  return match || null;
}

function verifyGithubSignature(rawBody, signatureHeader) {
  if (!GITHUB_WEBHOOK_SECRET) {
    return true;
  }

  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", GITHUB_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex")}`;

  const actualBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function handleApi(req, res) {
  const method = req.method;
  const url = new URL(req.url, APP_URL);
  const pathname = url.pathname;

  try {
    if (method === "GET" && pathname === "/api/health") {
      return json(res, 200, { ok: true, now: new Date().toISOString() });
    }

    if (method === "POST" && pathname === "/api/auth/login") {
      const body = await readJson(req);
      const session = workflow.auth.loginWithEmail(body.email);
      return json(res, 200, session);
    }

    if (method === "GET" && pathname === "/api/auth/me") {
      const token = getSessionToken(req);
      const me = workflow.auth.me(token);
      return json(res, me ? 200 : 401, me || { error: "Unauthorized" });
    }

    if (method === "POST" && pathname === "/api/settings/tokens") {
      const user = getUserOr401(req, res);
      if (!user) return;
      const body = await readJson(req);
      const updated = workflow.settings.updateTokens(user.id, body || {});
      return json(res, 200, {
        githubToken: updated.githubToken ? "configured" : null,
        xAccessToken: updated.xAccessToken ? "configured" : null
      });
    }

    if (method === "GET" && pathname === "/api/branding") {
      const user = getUserOr401(req, res);
      if (!user) return;
      const branding = workflow.settings.getBranding(user.id);
      return json(res, 200, branding || null);
    }

    if (method === "POST" && pathname === "/api/branding") {
      const user = getUserOr401(req, res);
      if (!user) return;
      const body = await readJson(req);
      const branding = workflow.settings.upsertBranding(user.id, body || {});
      return json(res, 200, branding);
    }

    if (method === "GET" && pathname === "/api/repos") {
      const user = getUserOr401(req, res);
      if (!user) return;
      return json(res, 200, workflow.repos.list(user.id));
    }

    if (method === "POST" && pathname === "/api/repos/connect") {
      const user = getUserOr401(req, res);
      if (!user) return;
      const body = await readJson(req);
      const repo = workflow.repos.connect(user.id, body || {});
      return json(res, 200, repo);
    }

    const automationMatch = routeMatch(pathname, /^\/api\/repos\/([^/]+)\/automation$/);
    if (method === "POST" && automationMatch) {
      const user = getUserOr401(req, res);
      if (!user) return;
      const body = await readJson(req);
      const repo = workflow.repos.setAutomation(user.id, automationMatch[1], body.autoGenerate);
      return json(res, 200, repo);
    }

    const generateMatch = routeMatch(pathname, /^\/api\/repos\/([^/]+)\/generate-latest$/);
    if (method === "POST" && generateMatch) {
      const user = getUserOr401(req, res);
      if (!user) return;
      const job = workflow.repos.triggerManualGenerate(user.id, generateMatch[1]);
      return json(res, 202, { queued: true, job });
    }

    if (method === "GET" && pathname === "/api/releases") {
      const user = getUserOr401(req, res);
      if (!user) return;
      return json(res, 200, workflow.releases.list(user.id));
    }

    if (method === "GET" && pathname === "/api/posts") {
      const user = getUserOr401(req, res);
      if (!user) return;
      return json(res, 200, workflow.posts.list(user.id));
    }

    if (method === "GET" && pathname === "/api/inbox") {
      const user = getUserOr401(req, res);
      if (!user) return;
      return json(res, 200, workflow.inbox.list(user.id));
    }

    const approvalMatch = routeMatch(pathname, /^\/api\/approvals\/([^/]+)$/);
    if (method === "GET" && approvalMatch) {
      const bundle = workflow.inbox.getApprovalByToken(approvalMatch[1]);
      if (!bundle) {
        return json(res, 404, { error: "Approval token not found" });
      }
      return json(res, 200, bundle);
    }

    const approvalRegenerateMatch = routeMatch(pathname, /^\/api\/approvals\/([^/]+)\/regenerate$/);
    if (method === "POST" && approvalRegenerateMatch) {
      const job = workflow.inbox.regenerateFromApprovalToken(approvalRegenerateMatch[1]);
      return json(res, 202, { queued: true, job });
    }

    const approvalApproveMatch = routeMatch(pathname, /^\/api\/approvals\/([^/]+)\/approve$/);
    if (method === "POST" && approvalApproveMatch) {
      const body = await readJson(req);
      const result = workflow.inbox.approveDraft(approvalApproveMatch[1], body || {});
      return json(res, 200, result);
    }

    const approvalPublishMatch = routeMatch(pathname, /^\/api\/approvals\/([^/]+)\/publish$/);
    if (method === "POST" && approvalPublishMatch) {
      const job = workflow.inbox.requestPublish(approvalPublishMatch[1]);
      return json(res, 202, { queued: true, job });
    }

    if (method === "POST" && pathname === "/api/webhooks/github") {
      const rawBody = await readBody(req);
      const signature = req.headers["x-hub-signature-256"];
      const signatureHeader = typeof signature === "string" ? signature : "";
      if (!verifyGithubSignature(rawBody, signatureHeader)) {
        return json(res, 401, { error: "Invalid GitHub webhook signature" });
      }

      const body = rawBody.length > 0 ? JSON.parse(rawBody.toString("utf8")) : {};
      const parsed = parseReleaseWebhook(body);
      if (!parsed) {
        return json(res, 200, { ok: true, ignored: true });
      }

      const jobs = workflow.webhooks.handleGithubReleaseWebhook(parsed);
      return json(res, 202, { ok: true, queued: jobs.length });
    }

    if (method === "GET" && pathname === "/api/jobs") {
      const user = getUserOr401(req, res);
      if (!user) return;
      const state = readState();
      return json(
        res,
        200,
        state.jobs
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 30)
      );
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, 400, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, APP_URL);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res);
    return;
  }

  const served = serveStatic(req, res, PUBLIC_DIR);
  if (!served) {
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      text(res, 200, fs.readFileSync(indexPath, "utf8"), "text/html; charset=utf-8");
      return;
    }

    text(res, 404, "Not found");
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Ship -> Social running at ${APP_URL}`);
});
