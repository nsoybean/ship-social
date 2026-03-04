const fs = require("node:fs");
const path = require("node:path");

function json(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function text(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

async function readJson(req) {
  const body = await readBody(req);
  if (body.length === 0) {
    return {};
  }

  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function serveStatic(req, res, publicDir) {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const target = path.join(publicDir, normalized);
  const safePath = path.normalize(target);

  if (!safePath.startsWith(path.normalize(publicDir))) {
    return false;
  }

  if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
    return false;
  }

  const ext = path.extname(safePath);
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";

  const data = fs.readFileSync(safePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": data.length
  });
  res.end(data);
  return true;
}

module.exports = {
  json,
  text,
  readJson,
  readBody,
  serveStatic
};
