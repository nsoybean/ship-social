const els = {
  landingPanel: document.getElementById("landing-panel"),
  loginPanel: document.getElementById("login-panel"),
  openLoginButtons: Array.from(document.querySelectorAll("[data-action='open-login']")),
  backToLanding: document.getElementById("back-to-landing"),
  appPanel: document.getElementById("app-panel"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  whoami: document.getElementById("whoami"),
  refreshAll: document.getElementById("refresh-all"),
  logout: document.getElementById("logout"),
  repoForm: document.getElementById("repo-form"),
  repoName: document.getElementById("repo-name"),
  repoAuto: document.getElementById("repo-auto"),
  githubToken: document.getElementById("github-token"),
  repoList: document.getElementById("repo-list"),
  brandingForm: document.getElementById("branding-form"),
  brandLogo: document.getElementById("brand-logo"),
  brandColor: document.getElementById("brand-color"),
  brandTone: document.getElementById("brand-tone"),
  brandAudience: document.getElementById("brand-audience"),
  xTokenForm: document.getElementById("x-token-form"),
  xToken: document.getElementById("x-token"),
  inboxList: document.getElementById("inbox-list"),
  releaseList: document.getElementById("release-list"),
  postList: document.getElementById("post-list"),
  approvalPanel: document.getElementById("approval-panel"),
  approvalTitle: document.getElementById("approval-title"),
  approvalSubtitle: document.getElementById("approval-subtitle"),
  approvalStatus: document.getElementById("approval-status"),
  variantTabs: document.getElementById("variant-tabs"),
  editor: document.getElementById("editor"),
  charCount: document.getElementById("char-count"),
  copyDraft: document.getElementById("copy-draft"),
  regenerateDraft: document.getElementById("regenerate-draft"),
  approveDraft: document.getElementById("approve-draft"),
  publishDraft: document.getElementById("publish-draft"),
  imagePreview: document.getElementById("image-preview"),
  threadPreview: document.getElementById("thread-preview"),
  approvalMessage: document.getElementById("approval-message")
};

const state = {
  sessionToken: localStorage.getItem("ship_social_session") || "",
  me: null,
  repos: [],
  inbox: [],
  releases: [],
  posts: [],
  branding: null,
  approvalBundle: null,
  activeVariantId: null,
  pollHandle: null
};

function setMessage(message, isError = false) {
  els.approvalMessage.textContent = message || "";
  els.approvalMessage.style.color = isError ? "#ff9db4" : "";
}

async function api(path, options = {}, auth = true) {
  const headers = {
    ...(options.headers || {})
  };

  if (auth && state.sessionToken) {
    headers.Authorization = `Bearer ${state.sessionToken}`;
  }

  const init = {
    method: options.method || "GET",
    headers
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload;
}

function showAuth() {
  if (els.landingPanel) {
    els.landingPanel.classList.add("hidden");
  }
  els.loginPanel.classList.remove("hidden");
  els.appPanel.classList.add("hidden");
}

function showApp() {
  if (els.landingPanel) {
    els.landingPanel.classList.add("hidden");
  }
  els.loginPanel.classList.add("hidden");
  els.appPanel.classList.remove("hidden");
}

function showLanding() {
  if (els.landingPanel) {
    els.landingPanel.classList.remove("hidden");
  }
  els.loginPanel.classList.add("hidden");
  els.appPanel.classList.add("hidden");
}

function renderRepos() {
  if (state.repos.length === 0) {
    els.repoList.innerHTML = `<p class="muted">No repositories connected yet.</p>`;
    return;
  }

  els.repoList.innerHTML = state.repos
    .map(
      (repo) => `
      <article class="card">
        <div class="row">
          <strong>${repo.repoFullName}</strong>
          <span class="chip">${repo.autoGenerate ? "auto" : "manual"}</span>
        </div>
        <div class="row-actions">
          <button class="btn" data-action="generate" data-repo-id="${repo.id}">Generate latest release</button>
          <button class="btn" data-action="toggle-auto" data-repo-id="${repo.id}" data-auto="${repo.autoGenerate ? "off" : "on"}">
            ${repo.autoGenerate ? "Disable auto" : "Enable auto"}
          </button>
        </div>
      </article>
    `
    )
    .join("");
}

function renderInbox() {
  if (state.inbox.length === 0) {
    els.inboxList.innerHTML = `<p class="muted">No inbox items yet. Trigger a release generation.</p>`;
    return;
  }

  els.inboxList.innerHTML = state.inbox
    .map(
      (item) => `
      <article class="card">
        <div class="row">
          <strong>${item.title}</strong>
          <span class="chip">${item.kind}</span>
        </div>
        <p class="muted">${item.body || ""}</p>
        <div class="row-actions">
          <button class="btn btn-primary" data-action="open-approval" data-token="${item.approvalToken}">Open</button>
        </div>
      </article>
    `
    )
    .join("");
}

function renderReleases() {
  if (state.releases.length === 0) {
    els.releaseList.innerHTML = `<p class="muted">No releases ingested yet.</p>`;
    return;
  }

  els.releaseList.innerHTML = state.releases
    .map(
      (release) => `
      <article class="card">
        <div class="row">
          <strong>${release.tag || "release"} - ${release.title}</strong>
          <span class="chip">${release.status}</span>
        </div>
        <p class="muted">${release.url ? `<a href="${release.url}" target="_blank" rel="noreferrer">GitHub release</a>` : ""}</p>
      </article>
    `
    )
    .join("");
}

function renderPosts() {
  if (state.posts.length === 0) {
    els.postList.innerHTML = `<p class="muted">Drafts will appear here once a release is processed.</p>`;
    return;
  }

  els.postList.innerHTML = state.posts
    .map((post) => {
      const variant = post.variants.find((item) => item.id === post.selectedVariantId) || post.variants[0];
      const text = variant ? variant.text : "";
      const preview = text.length > 210 ? `${text.slice(0, 210)}…` : text;
      const attempt = post.latestAttempt ? `<span class="micro">Last: ${post.latestAttempt.status}</span>` : "";

      return `
      <article class="card">
        <div class="row">
          <strong>${post.release ? post.release.title : "Release"}</strong>
          <span class="chip">${post.status}</span>
        </div>
        <p>${preview}</p>
        <div class="row">
          ${attempt}
          <button class="btn" data-action="open-approval" data-token="${findApprovalTokenForPost(post.id) || ""}">Open draft</button>
        </div>
      </article>`;
    })
    .join("");
}

function findApprovalTokenForPost(postDraftId) {
  const match = state.inbox.find((item) => item.postDraftId === postDraftId && item.approvalToken);
  return match ? match.approvalToken : "";
}

function updateEditorCount() {
  const value = els.editor.value || "";
  els.charCount.textContent = `${value.length} chars`;
}

function getActiveVariant() {
  if (!state.approvalBundle || !state.approvalBundle.draft) return null;
  const variants = state.approvalBundle.draft.variants || [];
  return variants.find((item) => item.id === state.activeVariantId) || variants[0] || null;
}

function renderVariantTabs() {
  const draft = state.approvalBundle && state.approvalBundle.draft;
  if (!draft) {
    els.variantTabs.innerHTML = "";
    return;
  }

  const variants = draft.variants || [];
  if (!state.activeVariantId && variants.length > 0) {
    state.activeVariantId = draft.selectedVariantId || variants[0].id;
  }

  els.variantTabs.innerHTML = variants
    .map(
      (variant) => `<button class="tab ${variant.id === state.activeVariantId ? "active" : ""}" data-action="select-variant" data-variant-id="${variant.id}">${variant.type}</button>`
    )
    .join("");

  const active = getActiveVariant();
  els.editor.value = active ? active.text : "";
  updateEditorCount();
}

function renderApproval() {
  if (!state.approvalBundle) {
    els.approvalPanel.classList.add("hidden");
    return;
  }

  const { draft, release, approval, image } = state.approvalBundle;
  els.approvalPanel.classList.remove("hidden");
  els.approvalTitle.textContent = release ? release.title : "Approve draft";
  els.approvalSubtitle.textContent = release
    ? `${release.tag || "release"} • ${release.url || ""}`
    : "Review and approve your generated post.";
  els.approvalStatus.textContent = approval.status;

  renderVariantTabs();
  els.imagePreview.src = image ? image.dataUrl : "";

  const thread = Array.isArray(draft.thread) ? draft.thread : [];
  els.threadPreview.textContent = thread.map((item) => item.text).join("\n\n");
}

async function loadApproval(token, updateUrl = true) {
  if (!token) return;
  try {
    const bundle = await api(`/api/approvals/${token}`, {}, false);
    state.approvalBundle = bundle;
    state.activeVariantId = bundle.draft.selectedVariantId || (bundle.draft.variants[0] && bundle.draft.variants[0].id);
    renderApproval();
    setMessage("Draft loaded.");

    if (updateUrl) {
      const params = new URLSearchParams(window.location.search);
      params.set("approval", token);
      window.history.replaceState({}, "", `/?${params.toString()}`);
    }
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function refreshAll() {
  if (!state.sessionToken) return;
  const [me, repos, branding, inbox, releases, posts] = await Promise.all([
    api("/api/auth/me"),
    api("/api/repos"),
    api("/api/branding"),
    api("/api/inbox"),
    api("/api/releases"),
    api("/api/posts")
  ]);

  state.me = me;
  state.repos = repos;
  state.branding = branding;
  state.inbox = inbox;
  state.releases = releases;
  state.posts = posts;

  els.whoami.textContent = me.email;
  if (branding) {
    els.brandLogo.value = branding.logoUrl || "";
    els.brandColor.value = branding.primaryColor || "#1c8dff";
    els.brandTone.value = branding.tone || "Transparent builder";
    els.brandAudience.value = branding.audience || "Developers";
  }

  renderRepos();
  renderInbox();
  renderReleases();
  renderPosts();

  const tokenInUrl = new URLSearchParams(window.location.search).get("approval");
  if (tokenInUrl) {
    await loadApproval(tokenInUrl, false);
  }
}

function installPolling() {
  if (state.pollHandle) {
    clearInterval(state.pollHandle);
  }

  state.pollHandle = setInterval(async () => {
    try {
      await refreshAll();
    } catch {
      // noop
    }
  }, 6000);
}

function clearSession() {
  state.sessionToken = "";
  state.me = null;
  localStorage.removeItem("ship_social_session");
  if (state.pollHandle) {
    clearInterval(state.pollHandle);
    state.pollHandle = null;
  }
  showLanding();
}

els.openLoginButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showAuth();
    els.loginEmail.focus();
  });
});

if (els.backToLanding) {
  els.backToLanding.addEventListener("click", () => {
    showLanding();
  });
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const response = await api(
      "/api/auth/login",
      {
        method: "POST",
        body: {
          email: els.loginEmail.value.trim()
        }
      },
      false
    );

    state.sessionToken = response.sessionToken;
    localStorage.setItem("ship_social_session", state.sessionToken);
    showApp();
    await refreshAll();
    installPolling();
  } catch (error) {
    alert(error.message);
  }
});

els.logout.addEventListener("click", () => {
  clearSession();
});

els.refreshAll.addEventListener("click", async () => {
  try {
    await refreshAll();
  } catch (error) {
    alert(error.message);
  }
});

els.repoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/repos/connect", {
      method: "POST",
      body: {
        repoFullName: els.repoName.value.trim(),
        autoGenerate: els.repoAuto.checked,
        githubToken: els.githubToken.value.trim() || undefined
      }
    });
    els.repoName.value = "";
    await refreshAll();
  } catch (error) {
    alert(error.message);
  }
});

els.brandingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/branding", {
      method: "POST",
      body: {
        logoUrl: els.brandLogo.value.trim(),
        primaryColor: els.brandColor.value.trim(),
        tone: els.brandTone.value,
        audience: els.brandAudience.value
      }
    });
    await refreshAll();
  } catch (error) {
    alert(error.message);
  }
});

els.xTokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/settings/tokens", {
      method: "POST",
      body: {
        xAccessToken: els.xToken.value.trim()
      }
    });
    els.xToken.value = "";
    await refreshAll();
  } catch (error) {
    alert(error.message);
  }
});

els.repoList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const repoId = button.dataset.repoId;

  try {
    if (action === "generate") {
      await api(`/api/repos/${repoId}/generate-latest`, { method: "POST", body: {} });
      await refreshAll();
      return;
    }

    if (action === "toggle-auto") {
      await api(`/api/repos/${repoId}/automation`, {
        method: "POST",
        body: {
          autoGenerate: button.dataset.auto === "on"
        }
      });
      await refreshAll();
    }
  } catch (error) {
    alert(error.message);
  }
});

document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action='open-approval']");
  if (!button) return;

  const token = button.dataset.token;
  if (!token) {
    alert("No approval token available yet");
    return;
  }

  await loadApproval(token);
});

els.variantTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='select-variant']");
  if (!button) return;
  state.activeVariantId = button.dataset.variantId;
  renderVariantTabs();
});

els.editor.addEventListener("input", () => {
  updateEditorCount();
});

els.copyDraft.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.editor.value || "");
    setMessage("Draft copied to clipboard.");
  } catch {
    setMessage("Clipboard write failed. Copy manually.", true);
  }
});

els.regenerateDraft.addEventListener("click", async () => {
  if (!state.approvalBundle) return;

  try {
    await api(`/api/approvals/${state.approvalBundle.approval.token}/regenerate`, { method: "POST", body: {} }, false);
    setMessage("Regeneration queued. Refreshing in a few seconds.");
    setTimeout(() => refreshAll().catch(() => {}), 2500);
  } catch (error) {
    setMessage(error.message, true);
  }
});

els.approveDraft.addEventListener("click", async () => {
  if (!state.approvalBundle) return;

  try {
    const payload = {
      selectedVariantId: state.activeVariantId,
      editedText: els.editor.value
    };
    const response = await api(
      `/api/approvals/${state.approvalBundle.approval.token}/approve`,
      { method: "POST", body: payload },
      false
    );
    state.approvalBundle.approval = response.approval;
    state.approvalBundle.draft = response.draft;
    setMessage("Draft approved.");
    renderApproval();
    await refreshAll();
  } catch (error) {
    setMessage(error.message, true);
  }
});

els.publishDraft.addEventListener("click", async () => {
  if (!state.approvalBundle) return;

  try {
    if (state.approvalBundle.approval.status === "pending") {
      await api(
        `/api/approvals/${state.approvalBundle.approval.token}/approve`,
        {
          method: "POST",
          body: {
            selectedVariantId: state.activeVariantId,
            editedText: els.editor.value
          }
        },
        false
      );
    }

    await api(`/api/approvals/${state.approvalBundle.approval.token}/publish`, { method: "POST", body: {} }, false);
    setMessage("Publish queued. If X token is missing, copy-ready fallback will be generated.");
    setTimeout(() => refreshAll().catch(() => {}), 2500);
  } catch (error) {
    setMessage(error.message, true);
  }
});

(async function boot() {
  const tokenInUrl = new URLSearchParams(window.location.search).get("approval");

  if (!state.sessionToken && tokenInUrl) {
    showApp();
    await loadApproval(tokenInUrl, false);
    setMessage("Approval view loaded from inbox link.");
    return;
  }

  if (!state.sessionToken) {
    showLanding();
    return;
  }

  try {
    await refreshAll();
    showApp();
    installPolling();
  } catch {
    clearSession();
  }
})();
