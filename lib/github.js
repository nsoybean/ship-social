const GITHUB_BASE = "https://github.com";
const GITHUB_API = "https://api.github.com";


export function getGithubOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID || "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || "";
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  if (!clientId || !clientSecret) {
    throw new Error("Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET");
  }

  return {
    clientId,
    clientSecret,
    appUrl,
    callbackUrl: `${appUrl}/api/auth/github/callback`
  };
}

export function buildGithubAuthorizeUrl(state) {
  const { clientId, callbackUrl } = getGithubOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: "repo read:user",
    state
  });

  return `${GITHUB_BASE}/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code) {
  const { clientId, clientSecret, callbackUrl } = getGithubOAuthConfig();

  const response = await fetch(`${GITHUB_BASE}/login/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub token exchange failed (${response.status}): ${body.slice(0, 140)}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error(payload.error_description || "GitHub did not return access token");
  }

  return payload.access_token;
}

async function githubApi(path, accessToken) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${path} failed (${response.status}): ${body.slice(0, 140)}`);
  }

  return response.json();
}

export async function fetchGithubProfile(accessToken) {
  return githubApi("/user", accessToken);
}

export async function fetchGithubRepos(accessToken) {
  const repos = await githubApi("/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator", accessToken);
  return Array.isArray(repos) ? repos : [];
}

function shortText(input, max = 180) {
  const value = String(input || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function listTopChangedPaths(files) {
  return files
    .slice()
    .sort((a, b) => (b.changes || 0) - (a.changes || 0))
    .slice(0, 5)
    .map((file) => file.filename);
}

function buildContextHighlights(pr, files, commits) {
  const highlights = [];

  if (pr.title) {
    highlights.push(`PR merged: ${shortText(pr.title, 110)}`);
  }

  const topPaths = listTopChangedPaths(files);
  if (topPaths.length > 0) {
    highlights.push(`Key files touched: ${topPaths.join(", ")}`);
  }

  if (pr.additions || pr.deletions) {
    highlights.push(
      `Code delta: +${pr.additions || 0} / -${pr.deletions || 0} across ${pr.changed_files || files.length} files`
    );
  }

  const commitMessages = commits
    .map((commit) => shortText(commit?.commit?.message || "", 90))
    .filter(Boolean)
    .slice(0, 2);
  if (commitMessages.length > 0) {
    highlights.push(`Commit messages: ${commitMessages.join(" | ")}`);
  }

  if (pr.body) {
    highlights.push(shortText(pr.body, 120));
  }

  return highlights.slice(0, 5);
}

function extractPatchPreview(patch) {
  const lines = String(patch || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1).trim())
    .filter(Boolean)
    .slice(0, 2);
  return lines.join(" | ");
}

export async function fetchLatestReleaseForRepo(fullName, accessToken) {
  const safeName = String(fullName || "").trim();
  if (!safeName.includes("/")) {
    throw new Error("Invalid repo full name");
  }

  const response = await fetch(`${GITHUB_API}/repos/${safeName}/releases/latest`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    cache: "no-store"
  });

  if (response.status === 404) {
    throw new Error("No published GitHub release found for this repository yet.");
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub latest release request failed (${response.status}): ${body.slice(0, 140)}`);
  }

  const release = await response.json();
  return {
    id: String(release.id),
    title: release.name || release.tag_name || "Untitled release",
    body: release.body || "",
    tag: release.tag_name || "",
    url: release.html_url || `https://github.com/${safeName}/releases`,
    source: "github_release"
  };
}

export async function fetchLatestMergedPrForRepo(fullName, defaultBranch, accessToken) {
  const safeName = String(fullName || "").trim();
  const safeBranch = String(defaultBranch || "main").trim();
  if (!safeName.includes("/")) {
    throw new Error("Invalid repo full name");
  }

  const endpoint = `${GITHUB_API}/repos/${safeName}/pulls?state=closed&base=${encodeURIComponent(
    safeBranch
  )}&sort=updated&direction=desc&per_page=50`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub PR lookup failed (${response.status}): ${body.slice(0, 140)}`);
  }

  const pulls = await response.json();
  if (!Array.isArray(pulls)) {
    throw new Error("Invalid PR response from GitHub");
  }

  const merged = pulls.find((pr) => Boolean(pr?.merged_at));
  if (!merged) {
    throw new Error(`No merged PR found on ${safeBranch} branch yet.`);
  }

  return {
    id: `pr_${merged.id}`,
    title: merged.title || `Merged PR #${merged.number}`,
    body: merged.body || "",
    tag: `PR #${merged.number}`,
    url: merged.html_url || `https://github.com/${safeName}/pull/${merged.number}`,
    source: "merged_pr",
    mergedAt: merged.merged_at,
    prNumber: merged.number
  };
}

export async function fetchMergedPrContextForRepo(fullName, prNumber, accessToken) {
  const safeName = String(fullName || "").trim();
  const safePr = Number(prNumber);
  if (!safeName.includes("/")) {
    throw new Error("Invalid repo full name");
  }
  if (!Number.isFinite(safePr) || safePr <= 0) {
    throw new Error("Invalid pull request number");
  }

  const [pr, files, commits] = await Promise.all([
    githubApi(`/repos/${safeName}/pulls/${safePr}`, accessToken),
    githubApi(`/repos/${safeName}/pulls/${safePr}/files?per_page=100`, accessToken),
    githubApi(`/repos/${safeName}/pulls/${safePr}/commits?per_page=100`, accessToken)
  ]);

  const normalizedFiles = (Array.isArray(files) ? files : []).slice(0, 35).map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions || 0,
    deletions: file.deletions || 0,
    changes: file.changes || 0,
    patchPreview: extractPatchPreview(file.patch)
  }));

  const normalizedCommits = (Array.isArray(commits) ? commits : []).slice(0, 25).map((commit) => ({
    sha: commit.sha,
    message: shortText(commit?.commit?.message || "", 220),
    author: commit?.commit?.author?.name || commit?.author?.login || ""
  }));

  const context = {
    pr: {
      number: pr.number,
      title: pr.title || "",
      body: pr.body || "",
      url: pr.html_url || `https://github.com/${safeName}/pull/${safePr}`,
      mergedAt: pr.merged_at || null,
      author: pr?.user?.login || "",
      baseRef: pr?.base?.ref || "",
      headRef: pr?.head?.ref || "",
      labels: Array.isArray(pr.labels) ? pr.labels.map((item) => item.name).filter(Boolean) : [],
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
      changedFiles: pr.changed_files || normalizedFiles.length,
      commits: pr.commits || normalizedCommits.length
    },
    files: normalizedFiles,
    commits: normalizedCommits,
    highlights: buildContextHighlights(pr, normalizedFiles, commits),
    fetchedAt: new Date().toISOString()
  };

  return context;
}
