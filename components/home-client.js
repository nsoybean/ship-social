"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload;
}

function useQueryMessage() {
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const connected = params.get("connected");

    if (error) {
      setMessage(error);
      setMessageType("error");
      return;
    }

    if (connected) {
      setMessage("GitHub connected successfully.");
      setMessageType("success");
      params.delete("connected");
      const query = params.toString();
      const url = query ? `/?${query}` : "/";
      window.history.replaceState({}, "", url);
    }
  }, []);

  return [message, setMessage, messageType, setMessageType];
}

function formatTime(value) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

function formatXPreviewTime(value) {
  if (!value) return "now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}

export default function HomeClient() {
  const splitContainerRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [githubRepos, setGithubRepos] = useState([]);
  const [connectedRepos, setConnectedRepos] = useState([]);
  const [inboxItems, setInboxItems] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [triggeringRepoId, setTriggeringRepoId] = useState("");
  const [savingStyle, setSavingStyle] = useState(false);
  const [deletingInboxId, setDeletingInboxId] = useState("");
  const [message, setMessage, messageType, setMessageType] = useQueryMessage();
  const [toastOpen, setToastOpen] = useState(false);
  const [repoManagerOpen, setRepoManagerOpen] = useState(false);
  const [toneManagerOpen, setToneManagerOpen] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(true);
  const [writingStyle, setWritingStyle] = useState("");
  const [writingStyles, setWritingStyles] = useState([]);
  const [newToneName, setNewToneName] = useState("");
  const [newToneDescription, setNewToneDescription] = useState("");
  const [newToneRules, setNewToneRules] = useState("");
  const [toneExamplesText, setToneExamplesText] = useState("");
  const [extractingTone, setExtractingTone] = useState(false);
  const [creatingTone, setCreatingTone] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [activeVariantId, setActiveVariantId] = useState("");
  const [editorText, setEditorText] = useState("");
  const [xPreviewPinned, setXPreviewPinned] = useState(false);
  const [inboxPaneWidth, setInboxPaneWidth] = useState(54);
  const [isResizingSplit, setIsResizingSplit] = useState(false);

  async function refreshData() {
    const auth = await api("/api/auth/me");
    if (!auth.authenticated) {
      setStatus("signed_out");
      setUser(null);
      setGithubRepos([]);
      setConnectedRepos([]);
      setInboxItems([]);
      setDrafts([]);
      return;
    }

    setStatus("signed_in");
    setUser(auth.user);
    setWritingStyle(auth.user?.writingStyle || "");
    setWritingStyles(Array.isArray(auth.writingStyles) ? auth.writingStyles : []);

    const [reposPayload, connectedPayload, inboxPayload, draftsPayload] = await Promise.all([
      api("/api/github/repos"),
      api("/api/repos"),
      api("/api/inbox"),
      api("/api/drafts")
    ]);

    setGithubRepos(reposPayload.repos || []);
    setConnectedRepos(connectedPayload.repos || []);
    setInboxItems(inboxPayload.items || []);
    setDrafts(draftsPayload.drafts || []);
  }

  useEffect(() => {
    refreshData().catch((error) => {
      setStatus("signed_out");
      showErrorToast(error.message);
    });
  }, []);

  useEffect(() => {
    if (!message) return;
    setToastOpen(true);
    const timer = setTimeout(() => {
      setToastOpen(false);
      setMessage("");
    }, 3600);
    return () => clearTimeout(timer);
  }, [message, setMessage]);

  useEffect(() => {
    if (drafts.length === 0) {
      setActiveDraftId("");
      setActiveVariantId("");
      setEditorText("");
      return;
    }

    if (!activeDraftId || !drafts.some((draft) => draft.id === activeDraftId)) {
      setActiveDraftId(drafts[0].id);
    }
  }, [drafts, activeDraftId]);

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) || null,
    [drafts, activeDraftId]
  );
  const xCharLimit = 280;
  const xCharCount = editorText.length;
  const xCharsRemaining = xCharLimit - xCharCount;
  const xIsOverflow = xCharsRemaining < 0;
  const toast =
    toastOpen && message ? (
      <div
        className={`toast toast-top-center ${messageType === "error" ? "toast-error" : "toast-success"}`}
        role="status"
        aria-live="polite"
      >
        <span>{message}</span>
        <button
          type="button"
          className="toast-close"
          onClick={() => {
            setToastOpen(false);
            setMessage("");
          }}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
    ) : null;

  useEffect(() => {
    if (!activeDraft) {
      setActiveVariantId("");
      setEditorText("");
      setXPreviewPinned(false);
      return;
    }

    const fallbackVariantId = activeDraft.selectedVariantId || activeDraft.variants?.[0]?.id || "";
    setActiveVariantId((prev) => {
      const stillExists = activeDraft.variants?.some((item) => item.id === prev);
      return stillExists ? prev : fallbackVariantId;
    });
  }, [activeDraft]);

  useEffect(() => {
    if (!activeDraft || !activeVariantId) {
      setEditorText("");
      return;
    }

    const variant = activeDraft.variants?.find((item) => item.id === activeVariantId);
    setEditorText(variant?.text || "");
  }, [activeDraft, activeVariantId]);

  const filteredRepos = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return githubRepos;
    return githubRepos.filter((repo) => repo.full_name.toLowerCase().includes(needle));
  }, [githubRepos, search]);

  const selectedRepos = useMemo(() => {
    return filteredRepos.filter((repo) => selected[repo.id]);
  }, [filteredRepos, selected]);

  const writingStyleLookup = useMemo(() => {
    const map = new Map();
    for (const item of writingStyles || []) {
      if (item?.id) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [writingStyles]);

  const toneLabel =
    writingStyleLookup.get(activeDraft?.writingStyleId || "")?.label ||
    activeDraft?.writingStyleId ||
    "release_crisp";
  const releaseContext = activeDraft?.release?.context || null;
  const releasePr = releaseContext?.pr || null;
  const releaseUrl = activeDraft?.release?.url || null;
  const releaseUrlLabel = activeDraft?.release?.source === "merged_pr"
    ? "Open PR on GitHub in a new tab"
    : "Open release on GitHub in a new tab";
  const releaseTag = activeDraft?.release?.tag || "release";
  const releaseTitle = activeDraft?.release?.title || "Untitled";
  const releasePrUrl = releasePr?.url || null;
  let releaseRepoUrl = null;
  if (releasePrUrl) {
    const match = releasePrUrl.match(/^(https?:\/\/github\.com\/[^/]+\/[^/]+)/i);
    releaseRepoUrl = match ? match[1] : null;
  } else if (releaseUrl) {
    const match = releaseUrl.match(/^(https?:\/\/github\.com\/[^/]+\/[^/]+)/i);
    releaseRepoUrl = match ? match[1] : null;
  }
  const releaseBaseBranchUrl = releaseRepoUrl && releasePr?.baseRef
    ? `${releaseRepoUrl}/tree/${encodeURIComponent(releasePr.baseRef)}`
    : null;
  const releaseCommitsUrl = releasePrUrl ? `${releasePrUrl}/commits` : null;
  const releaseFilesTabUrl = releasePrUrl ? `${releasePrUrl}/files` : null;
  const releaseFiles = Array.isArray(releaseContext?.files) ? releaseContext.files : [];
  const releaseCommits = Array.isArray(releaseContext?.commits) ? releaseContext.commits : [];
  const releaseTagLabel = releasePr?.number ? `PR #${releasePr.number}` : releaseTag;
  const releaseBranchLabel = releasePr?.headRef || releaseTitle;
  const isGenerationOk = activeDraft?.generationStatus
    ? activeDraft.generationStatus === "ok"
    : activeDraft?.generationSource === "ai_sdk";
  const generationModelLabel = isGenerationOk
    ? (activeDraft?.generationModel || "Unknown")
    : "Error";
  const splitMinWidth = 36;
  const splitMaxWidth = 64;

  function showSuccessToast(text) {
    setMessageType("success");
    setMessage(text);
  }

  function showErrorToast(text) {
    setMessageType("error");
    setMessage(text);
  }

  function closeToneManager() {
    setToneManagerOpen(false);
    setToneExamplesText("");
  }

  function clearToneExamples() {
    setToneExamplesText("");
  }

  function clampInboxPaneWidth(value) {
    return Math.max(splitMinWidth, Math.min(splitMaxWidth, value));
  }

  function updateInboxPaneWidth(clientX) {
    const container = splitContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (!rect.width) return;

    const nextValue = ((clientX - rect.left) / rect.width) * 100;
    setInboxPaneWidth(clampInboxPaneWidth(nextValue));
  }

  function startSplitResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    setIsResizingSplit(true);
  }

  function onSplitKeyDown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -2 : 2;
    setInboxPaneWidth((prev) => clampInboxPaneWidth(prev + delta));
  }

  useEffect(() => {
    if (!isResizingSplit) return undefined;

    function onPointerMove(event) {
      updateInboxPaneWidth(event.clientX);
    }

    function onPointerUp() {
      setIsResizingSplit(false);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizingSplit]);

  async function connectSelectedRepos() {
    if (selectedRepos.length === 0) {
      showErrorToast("Pick at least one repo first.");
      return;
    }

    setBusy(true);
    try {
      await api("/api/repos", {
        method: "POST",
        body: JSON.stringify({
          selectedRepos: selectedRepos.map((repo) => ({
            ...repo,
            autoGenerate: true
          }))
        })
      });
      showSuccessToast(`Connected ${selectedRepos.length} repo(s).`);
      await refreshData();
    } catch (error) {
      showErrorToast(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutomation(repoId, nextValue) {
    setBusy(true);
    try {
      await api(`/api/repos/${repoId}/toggle`, {
        method: "POST",
        body: JSON.stringify({ autoGenerate: nextValue })
      });
      await refreshData();
    } catch (error) {
      showErrorToast(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function manualTriggerRepo(repoId, fullName) {
    setTriggeringRepoId(repoId);
    try {
      const response = await api(`/api/repos/${repoId}/trigger`, { method: "POST" });
      const signalLabel = response.signal === "merged_pr" ? "merged PR" : "GitHub release";
      showSuccessToast(`Draft generated from ${signalLabel} for ${fullName}.`);
      await refreshData();
      if (response?.draft?.id) {
        setActiveDraftId(response.draft.id);
      }
    } catch (error) {
      showErrorToast(error.message);
      await refreshData();
    } finally {
      setTriggeringRepoId("");
    }
  }

  async function saveWritingStyle() {
    if (!writingStyle) return;
    setSavingStyle(true);
    try {
      await api("/api/preferences", {
        method: "POST",
        body: JSON.stringify({ writingStyle })
      });
      showSuccessToast("Tone profile updated. New drafts will use this tone.");
      await refreshData();
    } catch (error) {
      showErrorToast(error.message);
    } finally {
      setSavingStyle(false);
    }
  }

  async function createToneProfile() {
    const label = newToneName.trim();
    const description = newToneDescription.trim();
    const rules = newToneRules.trim();

    if (!label || !rules) {
      showErrorToast("Tone name and tone rules are required.");
      return;
    }

    setCreatingTone(true);
    try {
      const created = await api("/api/preferences", {
        method: "POST",
        body: JSON.stringify({
          newToneProfile: {
            label,
            description,
            rules
          }
        })
      });

      setWritingStyle(created.writingStyle || "");
      setWritingStyles(Array.isArray(created.writingStyles) ? created.writingStyles : []);
      setNewToneName("");
      setNewToneDescription("");
      setNewToneRules("");
      showSuccessToast(
        created?.mode === "updated"
          ? `Tone profile "${label}" updated and selected.`
          : `Tone profile "${label}" created and selected.`
      );
    } catch (error) {
      showErrorToast(error.message);
    } finally {
      setCreatingTone(false);
    }
  }

  async function extractToneFromExamples() {
    const examples = toneExamplesText.trim();
    if (!examples) {
      showErrorToast("Paste 3-5 example posts first.");
      return;
    }

    setExtractingTone(true);
    try {
      const result = await api("/api/preferences/tone-extract", {
        method: "POST",
        body: JSON.stringify({ examples })
      });

      const suggested = result?.suggestedTone || {};
      setNewToneName(String(suggested.label || "").trim());
      setNewToneDescription(String(suggested.description || "").trim());
      setNewToneRules(String(suggested.rules || "").trim());
      showSuccessToast(
        `Extracted tone from ${result?.meta?.exampleCount || "your"} example posts. Review and edit before saving.`
      );
    } catch (error) {
      showErrorToast(error.message);
    } finally {
      setExtractingTone(false);
    }
  }

  async function removeInboxItem(itemId, draftId) {
    setDeletingInboxId(itemId);
    try {
      await api(`/api/inbox/${itemId}`, { method: "DELETE" });
      if (activeDraftId === draftId) {
        setActiveDraftId("");
      }
      showSuccessToast("Inbox item deleted.");
      await refreshData();
    } catch (error) {
      showErrorToast(error.message);
    } finally {
      setDeletingInboxId("");
    }
  }

  async function saveDraft(statusUpdate = null) {
    if (!activeDraft) return;

    try {
      const payload = {
        selectedVariantId: activeVariantId,
        editedText: editorText
      };

      if (statusUpdate) {
        payload.status = statusUpdate;
      }

      await api(`/api/drafts/${activeDraft.id}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showSuccessToast(statusUpdate === "approved" ? "Draft approved." : "Draft saved.");
      await refreshData();
    } catch (error) {
      showErrorToast(error.message);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(editorText || "");
      showSuccessToast("Draft copied to clipboard.");
    } catch {
      showErrorToast("Clipboard not available. Copy manually.");
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setStatus("signed_out");
    setUser(null);
    setGithubRepos([]);
    setConnectedRepos([]);
    setInboxItems([]);
    setDrafts([]);
    setSelected({});
    setRepoManagerOpen(false);
    setRepoPickerOpen(true);
    setActiveDraftId("");
    setActiveVariantId("");
    setEditorText("");
  }

  if (status === "loading") {
    return (
      <main className="screen">
        <p className="soft">Booting your launch console...</p>
      </main>
    );
  }

  if (status === "signed_out") {
    return (
      <main className="screen">
        {toast}
        <div className="paper-grid" aria-hidden="true" />
        <section className="landing-card landing-hero">
          <div className="landing-hero-copy">
            <div className="badge-row">
              <span className="dot dot-pink" />
              <span className="dot dot-yellow" />
              <span className="dot dot-mint" />
              <span className="label">ship social</span>
            </div>
            <h1>
              Stay focused.
              <br />
              Ship more.
            </h1>
            <p className="lead">
              {`ship your features -> we write the posts -> you publish`}
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href="/api/auth/github/start">Connect GitHub</a>
            </div>
            <pre className="mini-log">{`> release.created\n> draft_variants.generated\n> inbox.ready\n> publish.approved`}</pre>
          </div>
          <div className="landing-hero-art" aria-hidden="true">
            <DotLottieReact
              src="/animations/space-boy-developer.lottie"
              autoplay
              loop
              className="landing-lottie"
            />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="screen app-screen">
      {toast}
      <header className="topbar">
        <div>
          <p className="tiny">GitHub connected</p>
          <h2>Ship - Social</h2>
          <p className="topbar-subline">Ship feature - check inbox - approve draft - publish</p>
        </div>
        <div className="topbar-actions">
          <div className="user-pill">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="avatar" /> : <span>GH</span>}
            <div>
              <strong>{user?.githubName || user?.githubLogin}</strong>
              <p>@{user?.githubLogin}</p>
            </div>
          </div>
          <div className="topbar-cta-group">
            <button
              className="btn btn-topbar"
              onClick={() => {
                setRepoManagerOpen(false);
                setToneManagerOpen(true);
              }}
            >
              Tone
            </button>
            <button
              className="btn btn-topbar"
              onClick={() => {
                closeToneManager();
                setRepoPickerOpen(true);
                setRepoManagerOpen(true);
              }}
            >
              Repos ({connectedRepos.length})
            </button>
            <button className="btn btn-topbar" onClick={() => refreshData()}>Refresh</button>
            <button className="btn btn-topbar" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <section
        ref={splitContainerRef}
        className={`grid-two split-grid ${isResizingSplit ? "is-resizing" : ""}`}
        style={{ "--inbox-pane-width": `${inboxPaneWidth}%` }}
      >
        <article className="panel inbox-panel">
          <div className="panel-head">
            <h3>Inbox</h3>
            <span className="tiny">{inboxItems.length} items</span>
          </div>
          <div className="inbox-list">
            {inboxItems.length === 0 ? (
              <div className="empty-inbox">
                <p className="soft">
                  No draft events yet. Open <strong>Repos</strong> to connect a repository and run a manual trigger.
                </p>
                <button
                  className="btn btn-compact"
                  onClick={() => {
                    closeToneManager();
                    setRepoPickerOpen(true);
                    setRepoManagerOpen(true);
                  }}
                >
                  Open Repos
                </button>
              </div>
            ) : (
              inboxItems.map((item) => (
                <article
                  key={item.id}
                  className={`inbox-item ${activeDraftId === item.draftId ? "active" : ""}`}
                >
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <span>{formatTime(item.createdAt)}</span>
                  <div className="inbox-item-actions">
                    <button className="btn btn-compact" onClick={() => setActiveDraftId(item.draftId)}>
                      Open
                    </button>
                    <button
                      className="btn btn-compact"
                      disabled={deletingInboxId === item.id}
                      onClick={() => removeInboxItem(item.id, item.draftId)}
                    >
                      {deletingInboxId === item.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>

        <button
          type="button"
          className="split-divider"
          onPointerDown={startSplitResize}
          onKeyDown={onSplitKeyDown}
          role="separator"
          aria-label="Resize inbox and draft workspace panels"
          aria-orientation="vertical"
          aria-valuemin={splitMinWidth}
          aria-valuemax={splitMaxWidth}
          aria-valuenow={Math.round(inboxPaneWidth)}
        >
          <span className="split-divider-grip" />
        </button>

        <article className="panel">
          <div className="panel-head">
            <h3>Draft workspace</h3>
            <span className="tiny">{activeDraft ? activeDraft.status : "idle"}</span>
          </div>

          {!activeDraft ? (
            <p className="soft">Choose an inbox item to review generated post variants.</p>
          ) : (
            <>
              <section className="composer-block">
                <div className="composer-head">
                  <div>
                    <p className="tiny">post composer</p>
                    <div className="release-meta-row">
                      {releaseUrl ? (
                        <a
                          className="composer-release-link"
                          href={releaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={releaseUrlLabel}
                          title={releaseUrlLabel}
                        >
                          {releaseTagLabel}
                        </a>
                      ) : (
                        <span>{releaseTagLabel}</span>
                      )}
                      <span className="release-meta-sep">.</span>
                      {releaseUrl ? (
                        <a
                          className="composer-release-link"
                          href={releaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={releaseUrlLabel}
                          title={releaseUrlLabel}
                        >
                          {releaseBranchLabel}
                        </a>
                      ) : (
                        <span>{releaseBranchLabel}</span>
                      )}
                    </div>
                    <p className="soft">
                      tone: {toneLabel}
                    </p>
                    <p className="soft">
                      source: {generationModelLabel}
                    </p>
                  </div>
                  {activeDraft.imageDataUrl ? (
                    <img className="composer-thumb" src={activeDraft.imageDataUrl} alt="Generated release visual" />
                  ) : null}
                </div>
                <div className="composer-controls">
                  <div className="variant-tabs">
                    {(activeDraft.variants || []).map((variant) => (
                      <button
                        key={variant.id}
                        className={`chip chip-button ${variant.id === activeVariantId ? "chip-on" : ""}`}
                        onClick={() => setActiveVariantId(variant.id)}
                      >
                        {variant.type}
                      </button>
                    ))}
                  </div>
                  <div className="x-preview-toggle-row">
                    <button
                      type="button"
                      className="btn btn-compact x-preview-toggle"
                      onClick={() => setXPreviewPinned((prev) => !prev)}
                      aria-expanded={xPreviewPinned}
                      aria-controls={`x-preview-${activeDraft.id}`}
                    >
                      {xPreviewPinned ? "Hide X preview" : "Preview on X"}
                    </button>
                  </div>
                </div>
                <textarea
                  className="draft-editor"
                  value={editorText}
                  onChange={(event) => setEditorText(event.target.value)}
                  rows={8}
                />
                <div className="composer-text-metrics">
                  <span className={`x-char-count ${xIsOverflow ? "overflow" : ""}`}>
                    {xCharCount}/{xCharLimit}
                  </span>
                </div>
                <section
                  className={`x-preview-control-wrap ${xPreviewPinned ? "is-open" : ""}`}
                  aria-label="X post preview controls"
                >
                  <div id={`x-preview-${activeDraft.id}`} className="x-preview-popover x-preview-wrap">
                    <article className="x-card">
                      <header className="x-card-header">
                        <div className="x-avatar">
                          {user?.avatarUrl ? (
                            <img src={user.avatarUrl} alt={`${user?.githubLogin || "user"} avatar`} />
                          ) : (
                            <span>{(user?.githubLogin || "ss").slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="x-user-meta">
                          <strong>{user?.githubName || user?.githubLogin || "Ship Social"}</strong>
                          <p>
                            @{user?.githubLogin || "shipsocial"} • {formatXPreviewTime(activeDraft.updatedAt)}
                          </p>
                        </div>
                        <span className="x-badge">𝕏</span>
                      </header>
                      <p className="x-content">
                        {editorText || "Your release draft will render here as a live X preview."}
                      </p>
                      {activeDraft.imageDataUrl ? (
                        <div className="x-media">
                          <img src={activeDraft.imageDataUrl} alt="Preview media for X post" />
                        </div>
                      ) : null}
                      <footer className="x-metrics">
                        <span>Reply</span>
                        <span>Repost</span>
                        <span>Like</span>
                        <span>Bookmark</span>
                      </footer>
                    </article>
                    <p className={`x-hint ${xIsOverflow ? "overflow" : ""}`}>
                      {xIsOverflow
                        ? `Over limit by ${Math.abs(xCharsRemaining)} characters.`
                        : `${xCharsRemaining} characters left.`}
                    </p>
                  </div>
                </section>
                <div className="row-actions">
                  <button className="btn" onClick={() => saveDraft()}>Save</button>
                  <button className="btn" onClick={copyDraft}>Copy</button>
                  <button className="btn btn-primary" onClick={() => saveDraft("approved")}>Approve</button>
                </div>
              </section>

              <section className="intel-block">
                <details className="intel-details intel-details-standalone" open>
                  <summary>Technical details</summary>
                  {releasePr ? (
                    <section className="intel-section">
                      <p className="tiny">pull request</p>
                      <div className="intel-kv-grid">
                        <p><span>PR</span> #{releasePr.number || "-"}</p>
                        <p>
                          <span>base</span>
                          {" "}
                          {releaseBaseBranchUrl && releasePr.baseRef ? (
                            <a
                              className="intel-inline-link"
                              href={releaseBaseBranchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {releasePr.baseRef}
                            </a>
                          ) : (releasePr.baseRef || "-")}
                        </p>
                        <p><span>head</span> {releasePr.headRef || "-"}</p>
                        <p>
                          <span>files</span>
                          {" "}
                          {releaseFilesTabUrl && typeof releasePr.changedFiles === "number" ? (
                            <a
                              className="intel-inline-link"
                              href={releaseFilesTabUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {releasePr.changedFiles}
                            </a>
                          ) : (releasePr.changedFiles ?? "-")}
                        </p>
                        <p>
                          <span>commits</span>
                          {" "}
                          {releaseCommitsUrl && typeof releasePr.commits === "number" ? (
                            <a
                              className="intel-inline-link"
                              href={releaseCommitsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {releasePr.commits}
                            </a>
                          ) : (releasePr.commits ?? "-")}
                        </p>
                        <p>
                          <span>delta</span>
                          {" "}
                          {typeof releasePr.additions === "number" ? `+${releasePr.additions}` : "-"}
                          {" / "}
                          {typeof releasePr.deletions === "number" ? `-${releasePr.deletions}` : "-"}
                        </p>
                      </div>
                    </section>
                  ) : null}

                  {releaseFiles.length > 0 ? (
                    <section className="intel-section">
                      <p className="tiny">files changed</p>
                      <ul className="intel-list">
                        {releaseFiles.slice(0, 6).map((file, index) => (
                          <li key={`${activeDraft.id}-file-${index}`}>
                            <code>{file.filename}</code>
                            <span>{file.status || "changed"} • {file.changes ?? 0} changes</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {releaseCommits.length > 0 ? (
                    <section className="intel-section">
                      <p className="tiny">commit messages</p>
                      <ul className="intel-list">
                        {releaseCommits.slice(0, 8).map((commit, index) => (
                          <li key={`${activeDraft.id}-commit-${index}`}>
                            <span>{commit.message || "No message"}</span>
                            {commit.author ? <em>by {commit.author}</em> : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </details>
              </section>
            </>
          )}
        </article>
      </section>

      {toneManagerOpen ? (
        <>
          <button
            type="button"
            className="repo-manager-overlay"
            aria-label="Close tone manager"
            onClick={closeToneManager}
          />
          <section className="tone-manager-modal panel" aria-label="Tone manager">
            <div className="tone-manager-head">
              <div>
                <p className="tiny">writing setup</p>
                <h3>Tone Profile</h3>
                <p className="soft compact-note">Applies to newly generated drafts.</p>
              </div>
              <button className="btn btn-compact" onClick={closeToneManager}>
                Close
              </button>
            </div>

            <section className="tone-method">
              <p className="tiny tone-method-label">1. Select from:</p>
              <div className="style-row tone-style-row">
                <select
                  id="writing-style"
                  className="style-select"
                  aria-label="Tone profile"
                  value={writingStyle}
                  onChange={(event) => setWritingStyle(event.target.value)}
                >
                  {(writingStyles || []).map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.label} {style.isPreset ? "(Preset)" : "(Custom)"}
                    </option>
                  ))}
                </select>
                <button className="btn btn-compact" disabled={savingStyle || !writingStyle} onClick={saveWritingStyle}>
                  {savingStyle ? "Saving..." : "Save tone"}
                </button>
              </div>
            </section>

            <div className="tone-choice-divider" aria-hidden="true">
              <span>OR</span>
            </div>

            <section className="tone-method">
              <p className="tiny tone-method-label">2. Create custom...</p>
              <p className="tone-method-subtle">Minor helper: extract from posts to prefill the custom fields.</p>
              <details className="tone-extract-inline tone-extract-wow">
                <summary>
                  <span className="tone-extract-kicker">AI</span>
                  <span className="tone-extract-title">Extract from posts</span>
                  <span className="tone-extract-prompt">Try it</span>
                </summary>
                <section className="tone-extract-block">
                  <div className="tone-extract-meta">
                    <button
                      className="btn btn-compact"
                      disabled={!toneExamplesText.trim()}
                      onClick={clearToneExamples}
                    >
                      Clear examples
                    </button>
                  </div>
                  <p className="soft tone-extract-help">
                    Paste 3-5 of your recent social posts. We will infer your tone and prefill a custom tone profile.
                  </p>
                  <textarea
                    className="draft-editor tone-examples-input"
                    rows={5}
                    value={toneExamplesText}
                    onChange={(event) => setToneExamplesText(event.target.value)}
                    placeholder={"Example 1...\n\nExample 2...\n\nExample 3..."}
                  />
                  <div className="tone-builder-actions">
                    <button
                      className="btn btn-compact tone-extract-run"
                      disabled={extractingTone || !toneExamplesText.trim()}
                      onClick={extractToneFromExamples}
                    >
                      {extractingTone ? "Extracting..." : "Extract tone"}
                    </button>
                  </div>
                </section>
              </details>

              <div className="tone-builder">
                <p className="tiny">create custom tone</p>
              <input
                className="search"
                value={newToneName}
                onChange={(event) => setNewToneName(event.target.value)}
                placeholder="Tone name (e.g. Friendly Indie Hacker)"
              />
              <input
                className="search"
                value={newToneDescription}
                onChange={(event) => setNewToneDescription(event.target.value)}
                placeholder="Short description (optional)"
              />
              <textarea
                className="draft-editor"
                rows={4}
                value={newToneRules}
                onChange={(event) => setNewToneRules(event.target.value)}
                placeholder="How this tone should write (1st person, casual, build-in-public voice, etc.)"
              />
              <div className="tone-builder-actions">
                <button className="btn btn-compact" disabled={creatingTone} onClick={createToneProfile}>
                  {creatingTone ? "Saving..." : "Save custom tone"}
                </button>
              </div>
              </div>
            </section>
          </section>
        </>
      ) : null}

      {repoManagerOpen ? (
        <>
          <button
            type="button"
            className="repo-manager-overlay"
            aria-label="Close repo manager"
            onClick={() => setRepoManagerOpen(false)}
          />
          <section className="repo-manager-modal panel" aria-label="Repository manager">
            <div className="repo-manager-head">
              <div>
                <p className="tiny">onboarding / setup</p>
                <h3>Repo Manager</h3>
              </div>
              <button className="btn btn-compact" onClick={() => setRepoManagerOpen(false)}>
                Close
              </button>
            </div>
            <div className="repo-manager-grid">
              <article className="panel">
                <div className="panel-head">
                  <h3>Pick repos to connect</h3>
                  <div className="panel-head-actions">
                    <span className="tiny">{githubRepos.length} available</span>
                    {connectedRepos.length > 0 ? (
                      <button className="btn btn-compact" onClick={() => setRepoPickerOpen((prev) => !prev)}>
                        {repoPickerOpen ? "Hide picker" : "Add more repos"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {repoPickerOpen ? (
                  <>
                    <input
                      className="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search owner/repo"
                    />
                    <div className="repo-list">
                      {filteredRepos.map((repo) => (
                        <label key={repo.id} className="repo-item">
                          <input
                            type="checkbox"
                            checked={Boolean(selected[repo.id])}
                            onChange={(event) => {
                              setSelected((prev) => ({
                                ...prev,
                                [repo.id]: event.target.checked
                              }));
                            }}
                          />
                          <div>
                            <strong>{repo.full_name}</strong>
                            <p>{repo.private ? "private" : "public"} • {repo.default_branch}</p>
                          </div>
                          {repo.connected ? <span className="chip">connected</span> : null}
                        </label>
                      ))}
                    </div>
                    <button className="btn btn-primary" disabled={busy} onClick={connectSelectedRepos}>
                      {busy ? "Connecting..." : `Connect selected (${selectedRepos.length})`}
                    </button>
                  </>
                ) : (
                  <p className="soft compact-note">
                    Repo picker is minimized. Click <strong>Add more repos</strong> whenever you want to connect additional repositories.
                  </p>
                )}
              </article>

              <article className="panel">
                <div className="panel-head">
                  <h3>Connected repos</h3>
                  <span className="tiny">{connectedRepos.length} active</span>
                </div>
                <div className="connected-list">
                  {connectedRepos.length === 0 ? (
                    <p className="soft">No repos connected yet.</p>
                  ) : (
                    connectedRepos.map((repo) => (
                      <div key={repo.id} className="connected-item">
                        <div>
                          <strong>{repo.fullName}</strong>
                          <p>{repo.private ? "private" : "public"} • branch {repo.defaultBranch}</p>
                          {repo.lastReleaseTag || repo.lastReleaseTitle ? (
                            <p>
                              latest: {repo.lastReleaseTag || "release"}
                              {repo.lastReleaseTitle ? ` • ${repo.lastReleaseTitle}` : ""}
                            </p>
                          ) : null}
                          <p>last manual trigger: {formatTime(repo.lastManualTriggerAt)}</p>
                        </div>
                        <div className="connected-actions">
                          <button
                            className="btn btn-compact"
                            disabled={triggeringRepoId === repo.id || busy}
                            onClick={() => manualTriggerRepo(repo.id, repo.fullName)}
                          >
                            {triggeringRepoId === repo.id ? "Triggering..." : "Manual trigger"}
                          </button>
                          <button
                            className={`chip chip-button ${repo.autoGenerate ? "chip-on" : "chip-off"}`}
                            disabled={busy || Boolean(triggeringRepoId)}
                            onClick={() => toggleAutomation(repo.id, !repo.autoGenerate)}
                          >
                            {repo.autoGenerate ? "auto on" : "auto off"}
                          </button>
                          {repo.lastTriggerStatus ? (
                            <span className={`chip ${repo.lastTriggerStatus === "ok" ? "chip-on" : "chip-off"}`}>
                              {repo.lastTriggerStatus}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          </section>
        </>
      ) : null}

    </main>
  );
}
