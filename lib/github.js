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

export async function fetchGithubRepos(accessToken, page = 1) {
  const safePage = Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1);
  const repos = await githubApi(`/user/repos?per_page=100&page=${safePage}&sort=updated&affiliation=owner,collaborator`, accessToken);
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

function buildCommitContextHighlights(commit, files, commits) {
  const highlights = [];

  if (commit?.branch && commit?.message) {
    highlights.push(`Direct commit on ${commit.branch}: ${shortText(commit.message, 110)}`);
  } else if (commit?.message) {
    highlights.push(`Direct commit: ${shortText(commit.message, 110)}`);
  }

  const topPaths = listTopChangedPaths(files);
  if (topPaths.length > 0) {
    highlights.push(`Key files touched: ${topPaths.join(", ")}`);
  }

  if (commit?.additions || commit?.deletions) {
    highlights.push(
      `Code delta: +${commit.additions || 0} / -${commit.deletions || 0} across ${commit.changedFiles || files.length} files`
    );
  }

  const commitMessages = commits
    .map((item) => shortText(item?.message || "", 90))
    .filter(Boolean)
    .slice(0, 3);
  if (commitMessages.length > 0) {
    highlights.push(`Recent commits: ${commitMessages.join(" | ")}`);
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

function normalizeCommitSummary(commit) {
  const sha = String(commit?.sha || "").trim();
  const fullMessage = String(commit?.commit?.message || "").trim();
  const firstLine = fullMessage.split("\n")[0] || "";
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: shortText(firstLine, 220),
    author: commit?.commit?.author?.name || commit?.author?.login || "",
    committedAt: commit?.commit?.committer?.date || commit?.commit?.author?.date || null,
    url: commit?.html_url || null
  };
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

export async function fetchMergedPrByNumberForRepo(fullName, prNumber, accessToken) {
  const safeName = String(fullName || "").trim();
  const safePr = Number(prNumber);
  if (!safeName.includes("/")) {
    throw new Error("Invalid repo full name");
  }
  if (!Number.isFinite(safePr) || safePr <= 0) {
    throw new Error("Invalid pull request number");
  }

  const pr = await githubApi(`/repos/${safeName}/pulls/${safePr}`, accessToken);
  if (!pr?.merged_at) {
    throw new Error(`PR #${safePr} is not merged yet.`);
  }

  return {
    id: `pr_${pr.id || safePr}`,
    title: pr.title || `Merged PR #${safePr}`,
    body: pr.body || "",
    tag: `PR #${safePr}`,
    url: pr.html_url || `https://github.com/${safeName}/pull/${safePr}`,
    source: "merged_pr",
    mergedAt: pr.merged_at,
    prNumber: safePr
  };
}

export async function fetchLatestDefaultBranchCommitForRepo(fullName, defaultBranch, accessToken) {
  const safeName = String(fullName || "").trim();
  const safeBranch = String(defaultBranch || "main").trim();
  if (!safeName.includes("/")) {
    throw new Error("Invalid repo full name");
  }

  const commits = await githubApi(
    `/repos/${safeName}/commits?sha=${encodeURIComponent(safeBranch)}&per_page=1`,
    accessToken
  );
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error(`No commits found on ${safeBranch} branch yet.`);
  }

  const latest = commits[0];
  const sha = String(latest?.sha || "").trim();
  if (!sha) {
    throw new Error("Latest commit SHA missing from GitHub response");
  }

  const fullMessage = String(latest?.commit?.message || "").trim();
  const firstLine = fullMessage.split("\n")[0] || "";
  const shortSha = sha.slice(0, 7);

  return {
    id: `commit_${sha}`,
    title: shortText(firstLine || `Commit ${shortSha}`, 120),
    body: fullMessage,
    tag: `Commit ${shortSha}`,
    url: latest?.html_url || `https://github.com/${safeName}/commit/${sha}`,
    source: "default_branch_commit",
    branch: safeBranch,
    sha,
    committedAt: latest?.commit?.committer?.date || latest?.commit?.author?.date || null
  };
}

export async function fetchRecentDefaultBranchCommitsForRepo(fullName, defaultBranch, accessToken, limit = 20) {
  const safeName = String(fullName || "").trim();
  const safeBranch = String(defaultBranch || "main").trim();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  if (!safeName.includes("/")) {
    throw new Error("Invalid repo full name");
  }

  const commits = await githubApi(
    `/repos/${safeName}/commits?sha=${encodeURIComponent(safeBranch)}&per_page=${safeLimit}`,
    accessToken
  );

  if (!Array.isArray(commits)) return [];
  return commits.map((commit) => normalizeCommitSummary(commit)).filter((commit) => Boolean(commit.sha));
}

export async function fetchCommitBatchForRepo(fullName, defaultBranch, shas, accessToken) {
  const safeName = String(fullName || "").trim();
  const safeBranch = String(defaultBranch || "main").trim();
  const selectedShas = Array.from(
    new Set(
      (Array.isArray(shas) ? shas : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 8);

  if (!safeName.includes("/")) {
    throw new Error("Invalid repo full name");
  }
  if (selectedShas.length === 0) {
    throw new Error("No commit SHAs provided.");
  }

  const commitDetails = await Promise.all(
    selectedShas.map((sha) => githubApi(`/repos/${safeName}/commits/${encodeURIComponent(sha)}`, accessToken))
  );

  const commitSummaries = commitDetails
    .map((item) => normalizeCommitSummary(item))
    .filter((item) => Boolean(item.sha));

  if (commitSummaries.length === 0) {
    throw new Error("No valid commits found for selected SHAs.");
  }

  const fileMap = new Map();
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const detail of commitDetails) {
    totalAdditions += detail?.stats?.additions || 0;
    totalDeletions += detail?.stats?.deletions || 0;
    const files = Array.isArray(detail?.files) ? detail.files : [];
    for (const file of files) {
      const filename = String(file?.filename || "").trim();
      if (!filename) continue;
      const existing = fileMap.get(filename) || {
        filename,
        status: file?.status || "modified",
        additions: 0,
        deletions: 0,
        changes: 0,
        patchPreview: ""
      };

      existing.additions += file?.additions || 0;
      existing.deletions += file?.deletions || 0;
      existing.changes += file?.changes || 0;
      if (!existing.patchPreview) {
        existing.patchPreview = extractPatchPreview(file?.patch);
      }

      fileMap.set(filename, existing);
    }
  }

  const normalizedFiles = Array.from(fileMap.values())
    .sort((a, b) => (b.changes || 0) - (a.changes || 0))
    .slice(0, 20);

  const latestCommit = commitSummaries[0];
  const commitCount = commitSummaries.length;
  const oldestCommit = commitSummaries[commitSummaries.length - 1];
  const batchUrl =
    commitCount > 1 && oldestCommit?.sha && latestCommit?.sha
      ? `https://github.com/${safeName}/compare/${encodeURIComponent(oldestCommit.sha)}...${encodeURIComponent(latestCommit.sha)}`
      : latestCommit?.url || `https://github.com/${safeName}/commit/${latestCommit?.sha || ""}`;

  const batchTitle =
    commitCount === 1
      ? latestCommit.message || `Commit ${latestCommit.shortSha}`
      : `${commitCount} commits on ${safeBranch}`;
  const batchBody =
    commitCount === 1
      ? latestCommit.message || ""
      : commitSummaries
          .slice(0, 8)
          .map((commit) => `- ${commit.message || commit.shortSha}`)
          .join("\n");

  const commitMeta = {
    sha: latestCommit.sha,
    shortSha: latestCommit.shortSha,
    message: latestCommit.message,
    body: batchBody,
    author: latestCommit.author,
    committedAt: latestCommit.committedAt,
    branch: safeBranch,
    url: latestCommit.url || `https://github.com/${safeName}/commit/${latestCommit.sha}`,
    additions: totalAdditions,
    deletions: totalDeletions,
    changedFiles: normalizedFiles.length
  };

  return {
    release: {
      id: commitCount === 1 ? `commit_${latestCommit.sha}` : `commit_batch_${latestCommit.shortSha}`,
      title: batchTitle,
      body: batchBody,
      tag: commitCount === 1 ? `Commit ${latestCommit.shortSha}` : `${commitCount} commits`,
      url: batchUrl,
      source: "default_branch_commit",
      branch: safeBranch,
      sha: latestCommit.sha,
      committedAt: latestCommit.committedAt
    },
    context: {
      commit: commitMeta,
      files: normalizedFiles,
      commits: commitSummaries.slice(0, 25),
      highlights: buildCommitContextHighlights(commitMeta, normalizedFiles, commitSummaries),
      fetchedAt: new Date().toISOString()
    }
  };
}

export async function fetchDefaultBranchCommitContextForRepo(fullName, sha, defaultBranch, accessToken) {
  const safeName = String(fullName || "").trim();
  const safeSha = String(sha || "").trim();
  const safeBranch = String(defaultBranch || "main").trim();
  if (!safeName.includes("/")) {
    throw new Error("Invalid repo full name");
  }
  if (!safeSha) {
    throw new Error("Invalid commit sha");
  }

  const [commitDetail, recentCommits] = await Promise.all([
    githubApi(`/repos/${safeName}/commits/${encodeURIComponent(safeSha)}`, accessToken),
    githubApi(`/repos/${safeName}/commits?sha=${encodeURIComponent(safeBranch)}&per_page=10`, accessToken)
  ]);

  const files = Array.isArray(commitDetail?.files) ? commitDetail.files : [];
  const normalizedFiles = files.slice(0, 20).map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions || 0,
    deletions: file.deletions || 0,
    changes: file.changes || 0,
    patchPreview: extractPatchPreview(file.patch)
  }));

  const normalizedCommits = (Array.isArray(recentCommits) ? recentCommits : [])
    .map((commit) => normalizeCommitSummary(commit))
    .filter((commit) => Boolean(commit.sha));

  const commitMessage = String(commitDetail?.commit?.message || "").trim();
  const commitFirstLine = commitMessage.split("\n")[0] || "";
  const commitMeta = {
    sha: safeSha,
    shortSha: safeSha.slice(0, 7),
    message: shortText(commitFirstLine, 220),
    body: commitMessage,
    author: commitDetail?.commit?.author?.name || commitDetail?.author?.login || "",
    committedAt: commitDetail?.commit?.committer?.date || commitDetail?.commit?.author?.date || null,
    branch: safeBranch,
    url: commitDetail?.html_url || `https://github.com/${safeName}/commit/${safeSha}`,
    additions: commitDetail?.stats?.additions || 0,
    deletions: commitDetail?.stats?.deletions || 0,
    changedFiles: commitDetail?.files?.length || normalizedFiles.length
  };

  return {
    commit: commitMeta,
    files: normalizedFiles,
    commits: normalizedCommits.slice(0, 20),
    highlights: buildCommitContextHighlights(commitMeta, normalizedFiles, normalizedCommits),
    fetchedAt: new Date().toISOString()
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
    githubApi(`/repos/${safeName}/pulls/${safePr}/files?per_page=20`, accessToken),
    githubApi(`/repos/${safeName}/pulls/${safePr}/commits?per_page=20`, accessToken)
  ]);

  const normalizedFiles = (Array.isArray(files) ? files : []).slice(0, 20).map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions || 0,
    deletions: file.deletions || 0,
    changes: file.changes || 0,
    patchPreview: extractPatchPreview(file.patch)
  }));

  const normalizedCommits = (Array.isArray(commits) ? commits : []).slice(0, 20).map((commit) => ({
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
