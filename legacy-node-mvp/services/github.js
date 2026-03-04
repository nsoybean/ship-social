function parseRepoFullName(input) {
  const value = String(input || "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  const match = value.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) {
    throw new Error("Repository must look like owner/repo");
  }

  return {
    owner: match[1],
    repo: match[2],
    fullName: `${match[1]}/${match[2]}`
  };
}

function normalizeReleaseFromApi(repoFullName, payload) {
  return {
    githubReleaseId: payload.id ? String(payload.id) : `${repoFullName}:${payload.tag_name || payload.name || "unknown"}`,
    title: payload.name || payload.tag_name || "Untitled release",
    body: payload.body || "",
    tag: payload.tag_name || "",
    url: payload.html_url || `https://github.com/${repoFullName}/releases`
  };
}

async function fetchLatestRelease({ repoFullName, githubToken }) {
  const endpoint = `https://api.github.com/repos/${repoFullName}/releases/latest`;

  if (!githubToken) {
    const now = new Date();
    const week = Math.ceil((now.getDate() + 6) / 7);
    return {
      source: "mock",
      release: {
        githubReleaseId: `${repoFullName}:mock:${Date.now()}`,
        title: `v0.${week}.0 - Better activation loops`,
        body: "- Added onboarding checklist\n- Improved export speed by 31%\n- Fixed edge-case auth timeout",
        tag: `v0.${week}.0`,
        url: `https://github.com/${repoFullName}/releases`
      }
    };
  }

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub latest release request failed (${response.status}): ${text.slice(0, 180)}`);
  }

  const payload = await response.json();
  return {
    source: "github",
    release: normalizeReleaseFromApi(repoFullName, payload)
  };
}

function parseReleaseWebhook(payload) {
  const action = payload && payload.action;
  if (action !== "created" && action !== "published") {
    return null;
  }

  if (!payload.release || !payload.repository || !payload.repository.full_name) {
    return null;
  }

  const repoFullName = payload.repository.full_name;
  return {
    repoFullName,
    release: normalizeReleaseFromApi(repoFullName, payload.release)
  };
}

module.exports = {
  parseRepoFullName,
  fetchLatestRelease,
  parseReleaseWebhook
};
