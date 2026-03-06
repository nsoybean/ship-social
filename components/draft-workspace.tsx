"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent } from "react";
import {
  ArrowsCounterClockwise as ArrowsCounterClockwiseIcon,
  BookmarkSimple as BookmarkSimpleIcon,
  ChartBar as ChartBarIcon,
  Chat as ChatIcon,
  Heart as HeartIcon,
  Share as ShareIcon,
} from "@phosphor-icons/react";

type WritingStyle = {
  id: string;
  label: string;
  [key: string]: any;
};

type DraftVariant = {
  id: string;
  type: string;
  text: string;
};

type DraftItem = {
  id: string;
  status?: string;
  selectedVariantId?: string;
  variants?: DraftVariant[];
  writingStyleId?: string;
  release?: any;
  generationStatus?: string;
  generationSource?: string;
  generationModel?: string;
  imageDataUrl?: string | null;
  updatedAt?: string;
};

type AppUser = {
  avatarUrl?: string;
  githubLogin?: string;
  githubName?: string;
};

type DraftWorkspaceProps = {
  draft: DraftItem | null;
  user: AppUser | null;
  writingStyles: WritingStyle[];
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  onRefresh?: () => Promise<void> | void;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload as T;
}

function formatXPreviewTime(value: string | null | undefined) {
  if (!value) return "now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export default function DraftWorkspace({
  draft,
  user,
  writingStyles,
  onSuccess,
  onError,
  onRefresh,
}: DraftWorkspaceProps) {
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeVariantId, setActiveVariantId] = useState("");
  const [editorText, setEditorText] = useState("");
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [updatingImage, setUpdatingImage] = useState(false);
  const [xPreviewPinned, setXPreviewPinned] = useState(true);

  useEffect(() => {
    setCustomImageUrl("");
  }, [draft?.id]);

  useEffect(() => {
    if (!draft) {
      setActiveVariantId("");
      setEditorText("");
      setCustomImageUrl("");
      setXPreviewPinned(true);
      return;
    }

    const fallbackVariantId =
      draft.selectedVariantId || draft.variants?.[0]?.id || "";
    setActiveVariantId((prev) => {
      const stillExists = draft.variants?.some(
        (item: DraftVariant) => item.id === prev,
      );
      return stillExists ? prev : fallbackVariantId;
    });
  }, [draft]);

  useEffect(() => {
    if (!draft || !activeVariantId) {
      setEditorText("");
      return;
    }

    const variant = draft.variants?.find(
      (item: DraftVariant) => item.id === activeVariantId,
    );
    setEditorText(variant?.text || "");
  }, [draft, activeVariantId]);

  const writingStyleLookup = useMemo(() => {
    const map = new Map();
    for (const item of writingStyles || []) {
      if (item?.id) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [writingStyles]);

  const xCharLimit = 280;
  const xCharCount = editorText.length;
  const xCharsRemaining = xCharLimit - xCharCount;
  const xIsOverflow = xCharsRemaining < 0;

  const toneLabel =
    writingStyleLookup.get(draft?.writingStyleId || "")?.label ||
    draft?.writingStyleId ||
    "release_crisp";

  const releaseContext = draft?.release?.context || null;
  const releasePr = releaseContext?.pr || null;
  const releaseUrl = draft?.release?.url || null;
  const releaseUrlLabel =
    draft?.release?.source === "merged_pr"
      ? "Open PR on GitHub in a new tab"
      : draft?.release?.source === "default_branch_commit"
        ? "Open commit on GitHub in a new tab"
        : "Open release on GitHub in a new tab";
  const releaseTag = draft?.release?.tag || "release";
  const releaseTitle = draft?.release?.title || "Untitled";
  const releasePrUrl = releasePr?.url || null;
  let releaseRepoUrl = null;
  if (releasePrUrl) {
    const match = releasePrUrl.match(
      /^(https?:\/\/github\.com\/[^/]+\/[^/]+)/i,
    );
    releaseRepoUrl = match ? match[1] : null;
  } else if (releaseUrl) {
    const match = releaseUrl.match(/^(https?:\/\/github\.com\/[^/]+\/[^/]+)/i);
    releaseRepoUrl = match ? match[1] : null;
  }
  const releaseBaseBranchUrl =
    releaseRepoUrl && releasePr?.baseRef
      ? `${releaseRepoUrl}/tree/${encodeURIComponent(releasePr.baseRef)}`
      : null;
  const releaseCommitsUrl = releasePrUrl ? `${releasePrUrl}/commits` : null;
  const releaseFilesTabUrl = releasePrUrl ? `${releasePrUrl}/files` : null;
  const releaseFiles = Array.isArray(releaseContext?.files)
    ? releaseContext.files
    : [];
  const releaseCommits = Array.isArray(releaseContext?.commits)
    ? releaseContext.commits
    : [];
  const releaseTagLabel = releasePr?.number
    ? `PR #${releasePr.number}`
    : releaseTag;
  const releaseBranchLabel = releasePr?.headRef || releaseTitle;
  const isGenerationOk = draft?.generationStatus
    ? draft.generationStatus === "ok"
    : draft?.generationSource === "ai_sdk";
  const generationModelLabel = isGenerationOk
    ? draft?.generationModel || "Unknown"
    : "Error";

  function isSupportedCustomImageUrl(value: string) {
    return /^https?:\/\/\S+/i.test(value) || /^data:image\//i.test(value);
  }

  async function updateDraftImage(
    nextImageDataUrl: string | null,
    successMessage: string,
  ) {
    if (!draft) return;

    setUpdatingImage(true);
    try {
      await api(`/api/drafts/${draft.id}`, {
        method: "POST",
        body: JSON.stringify({ imageDataUrl: nextImageDataUrl }),
      });
      onSuccess?.(successMessage);
      setCustomImageUrl("");
      await onRefresh?.();
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setUpdatingImage(false);
    }
  }

  async function applyCustomImageUrl() {
    const value = customImageUrl.trim();
    if (!value) {
      onError?.("Paste an image URL first.");
      return;
    }

    if (!isSupportedCustomImageUrl(value)) {
      onError?.("Use a valid https image URL or data:image URL.");
      return;
    }

    await updateDraftImage(value, "Custom image applied.");
  }

  function pickCustomImageFile() {
    imageFileInputRef.current?.click();
  }

  async function applyCustomImageFile(
    file: File | null,
    successMessage = "Image replaced.",
  ) {
    if (!file) return false;
    if (!file.type.startsWith("image/")) {
      onError?.("Please choose an image file.");
      return false;
    }

    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      onError?.("Image is too large. Please use an image under 8MB.");
      return false;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () =>
        reject(new Error("Failed to read the selected image."));
      reader.readAsDataURL(file);
    }).catch((error) => {
      onError?.(getErrorMessage(error) || "Failed to read the selected image.");
      return "";
    });

    if (!dataUrl) return false;
    if (!/^data:image\//i.test(dataUrl)) {
      onError?.("Could not read this image file.");
      return false;
    }

    await updateDraftImage(dataUrl, successMessage);
    return true;
  }

  async function onCustomImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    await applyCustomImageFile(file, "Image replaced.");
    input.value = "";
  }

  async function onComposerPaste(event: ClipboardEvent<HTMLElement>) {
    if (xPreviewPinned || !draft || updatingImage) return;

    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) {
      onError?.("Clipboard image is not available.");
      return;
    }

    event.preventDefault();
    await applyCustomImageFile(file, "Clipboard image applied.");
  }

  async function saveDraft(statusUpdate: "approved" | null = null) {
    if (!draft) return;

    try {
      const payload: {
        selectedVariantId: string;
        editedText: string;
        status?: "approved";
      } = {
        selectedVariantId: activeVariantId,
        editedText: editorText,
      };

      if (statusUpdate) {
        payload.status = statusUpdate;
      }

      await api(`/api/drafts/${draft.id}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      onSuccess?.(
        statusUpdate === "approved" ? "Draft approved." : "Draft saved.",
      );
      await onRefresh?.();
    } catch (error) {
      onError?.(getErrorMessage(error));
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(editorText || "");
      onSuccess?.("Draft copied to clipboard.");
    } catch {
      onError?.("Clipboard not available. Copy manually.");
    }
  }

  async function copyPreviewText() {
    const value = String(editorText || "").trim();
    if (!value) {
      onError?.("Nothing to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      onSuccess?.("Preview text copied.");
    } catch {
      onError?.("Clipboard not available. Copy manually.");
    }
  }

  async function copyPreviewImage() {
    const imageData = String(draft?.imageDataUrl || "").trim();
    if (!imageData) {
      onError?.("No image to copy.");
      return;
    }

    try {
      if (
        typeof ClipboardItem !== "undefined" &&
        typeof navigator?.clipboard?.write === "function"
      ) {
        const response = await fetch(imageData);
        const blob = await response.blob();
        if (blob && blob.type.startsWith("image/")) {
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob }),
          ]);
          onSuccess?.("Preview image copied.");
          return;
        }
      }

      await navigator.clipboard.writeText(imageData);
      onSuccess?.("Image URL copied.");
    } catch {
      try {
        await navigator.clipboard.writeText(imageData);
        onSuccess?.("Image URL copied.");
      } catch {
        onError?.("Clipboard not available. Copy manually.");
      }
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h3>Draft workspace</h3>
        <span className="tiny">{draft ? draft.status : "idle"}</span>
      </div>

      {!draft ? (
        <p className="soft">
          Choose an inbox item to review generated post variants.
        </p>
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
                <p className="soft composer-meta-line">tone: {toneLabel}</p>
                <p className="soft composer-meta-line">
                  model: {generationModelLabel}
                </p>
              </div>
              <div className="composer-thumb-wrap">
                {draft.imageDataUrl ? (
                  <img
                    className="composer-thumb"
                    src={draft.imageDataUrl}
                    alt="Generated release visual"
                  />
                ) : (
                  <div className="composer-thumb composer-thumb-empty">
                    <span>No image</span>
                  </div>
                )}
              </div>
            </div>
            <div className="composer-controls">
              <div className="variant-tabs">
                {(draft.variants || []).map((variant) => (
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
                  aria-controls={`composer-stage-${draft.id}`}
                >
                  {xPreviewPinned ? "Back to editor" : "Preview as X"}
                </button>
              </div>
            </div>
            <section
              id={`composer-stage-${draft.id}`}
              className={`composer-flip-panel ${xPreviewPinned ? "preview-face" : "edit-face"}`}
              aria-label={
                xPreviewPinned ? "X preview view" : "Post editor view"
              }
              onPaste={onComposerPaste}
            >
              {xPreviewPinned ? (
                <div className="x-preview-wrap composer-preview-wrap">
                  <article className="x-card">
                    <header className="x-card-header">
                      <div className="x-avatar">
                        {user?.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={`${user?.githubLogin || "user"} avatar`}
                          />
                        ) : (
                          <span>
                            {(user?.githubLogin || "ss")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="x-user-meta">
                        <strong>
                          {user?.githubName ||
                            user?.githubLogin ||
                            "Ship Social"}
                        </strong>
                        <p>
                          @{user?.githubLogin || "shipsocial"} •{" "}
                          {formatXPreviewTime(draft.updatedAt)}
                        </p>
                      </div>
                      <span className="x-badge">𝕏</span>
                    </header>
                    <p
                      className="x-content x-copy-target"
                      onClick={copyPreviewText}
                      role="button"
                      tabIndex={0}
                      aria-label="Copy preview text"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void copyPreviewText();
                        }
                      }}
                    >
                      {editorText ||
                        "Your release draft will render here as a live X preview."}
                    </p>
                    {draft.imageDataUrl ? (
                      <div
                        className="x-media x-copy-target"
                        role="button"
                        tabIndex={0}
                        aria-label="Copy preview image"
                        onClick={copyPreviewImage}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void copyPreviewImage();
                          }
                        }}
                      >
                        <img
                          src={draft.imageDataUrl}
                          alt="Preview media for X post"
                        />
                      </div>
                    ) : null}
                    <footer className="x-metrics x-metrics-live">
                      <span className="x-metric x-metric-icon-only">
                        <ChatIcon aria-hidden="true" />
                      </span>
                      <span className="x-metric x-metric-icon-only">
                        <ArrowsCounterClockwiseIcon aria-hidden="true" />
                      </span>
                      <span className="x-metric x-metric-icon-only">
                        <HeartIcon aria-hidden="true" />
                      </span>
                      <span className="x-metric x-metric-icon-only">
                        <ChartBarIcon aria-hidden="true" />
                      </span>
                      <span className="x-metric x-metric-end x-metric-icon-only">
                        <BookmarkSimpleIcon aria-hidden="true" />
                      </span>
                      <span className="x-metric x-metric-icon-only">
                        <ShareIcon aria-hidden="true" />
                      </span>
                    </footer>
                  </article>
                </div>
              ) : (
                <>
                  <div className="composer-image-tools">
                    <input
                      className="search composer-image-url-input"
                      value={customImageUrl}
                      onChange={(event) =>
                        setCustomImageUrl(event.target.value)
                      }
                      placeholder="Paste image URL (https://...)"
                    />
                    <div className="composer-image-tool-actions">
                      <button
                        type="button"
                        className="btn btn-compact"
                        disabled={updatingImage}
                        onClick={pickCustomImageFile}
                      >
                        {updatingImage ? "Updating..." : "Upload image"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-compact"
                        disabled={updatingImage || !customImageUrl.trim()}
                        onClick={applyCustomImageUrl}
                      >
                        {updatingImage ? "Applying..." : "Use URL"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-compact"
                        disabled={updatingImage || !draft.imageDataUrl}
                        onClick={() => updateDraftImage(null, "Image removed.")}
                      >
                        Remove image
                      </button>
                    </div>
                    <input
                      ref={imageFileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={onCustomImageFileChange}
                    />
                    <p className="soft composer-image-hint">
                      Replace AI image via upload, URL, or paste from clipboard
                      (Cmd/Ctrl+V).
                    </p>
                  </div>
                  <textarea
                    className="draft-editor"
                    value={editorText}
                    onChange={(event) => setEditorText(event.target.value)}
                    rows={8}
                  />
                  <div className="composer-text-metrics">
                    <span
                      className={`x-char-count ${xIsOverflow ? "overflow" : ""}`}
                    >
                      {xCharCount}/{xCharLimit}
                    </span>
                  </div>
                </>
              )}
            </section>
            <div className="row-actions">
              <button className="btn" onClick={() => saveDraft()}>
                Save
              </button>
              <button className="btn" onClick={copyDraft}>
                Copy
              </button>
              <button
                className="btn btn-primary"
                onClick={() => saveDraft("approved")}
              >
                Approve
              </button>
            </div>
          </section>

          <section className="intel-block">
            <details className="intel-details intel-details-standalone" open>
              <summary>Technical details</summary>
              {releasePr ? (
                <section className="intel-section">
                  <p className="tiny">pull request</p>
                  <div className="intel-kv-grid">
                    <p>
                      <span>PR</span> #{releasePr.number || "-"}
                    </p>
                    <p>
                      <span>base</span>{" "}
                      {releaseBaseBranchUrl && releasePr.baseRef ? (
                        <a
                          className="intel-inline-link"
                          href={releaseBaseBranchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {releasePr.baseRef}
                        </a>
                      ) : (
                        releasePr.baseRef || "-"
                      )}
                    </p>
                    <p>
                      <span>head</span> {releasePr.headRef || "-"}
                    </p>
                    <p>
                      <span>files</span>{" "}
                      {releaseFilesTabUrl &&
                      typeof releasePr.changedFiles === "number" ? (
                        <a
                          className="intel-inline-link"
                          href={releaseFilesTabUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {releasePr.changedFiles}
                        </a>
                      ) : (
                        (releasePr.changedFiles ?? "-")
                      )}
                    </p>
                    <p>
                      <span>commits</span>{" "}
                      {releaseCommitsUrl &&
                      typeof releasePr.commits === "number" ? (
                        <a
                          className="intel-inline-link"
                          href={releaseCommitsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {releasePr.commits}
                        </a>
                      ) : (
                        (releasePr.commits ?? "-")
                      )}
                    </p>
                    <p>
                      <span>delta</span>{" "}
                      {typeof releasePr.additions === "number"
                        ? `+${releasePr.additions}`
                        : "-"}
                      {" / "}
                      {typeof releasePr.deletions === "number"
                        ? `-${releasePr.deletions}`
                        : "-"}
                    </p>
                  </div>
                </section>
              ) : null}

              {releaseFiles.length > 0 ? (
                <section className="intel-section">
                  <p className="tiny">files changed</p>
                  <ul className="intel-list">
                    {releaseFiles.slice(0, 6).map((file, index) => (
                      <li key={`${draft.id}-file-${index}`}>
                        <code>{file.filename}</code>
                        <span>
                          {file.status || "changed"} • {file.changes ?? 0}{" "}
                          changes
                        </span>
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
                      <li key={`${draft.id}-commit-${index}`}>
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
  );
}
