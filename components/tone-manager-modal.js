"use client";

import { useMemo, useState } from "react";

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

export default function ToneManagerModal({
  open,
  onClose,
  writingStyle,
  writingStyles,
  onWritingStyleChange,
  onWritingStylesChange,
  onSuccess,
  onError
}) {
  const [savingStyle, setSavingStyle] = useState(false);
  const [newToneName, setNewToneName] = useState("");
  const [newToneDescription, setNewToneDescription] = useState("");
  const [newToneRules, setNewToneRules] = useState("");
  const [toneExamplesText, setToneExamplesText] = useState("");
  const [extractingTone, setExtractingTone] = useState(false);
  const [creatingTone, setCreatingTone] = useState(false);

  const selectedWritingStyle = useMemo(
    () => (writingStyles || []).find((style) => style.id === writingStyle) || null,
    [writingStyles, writingStyle]
  );

  function handleClose() {
    setToneExamplesText("");
    onClose();
  }

  function clearToneExamples() {
    setToneExamplesText("");
  }

  async function saveWritingStyle() {
    if (!writingStyle) return;
    setSavingStyle(true);
    try {
      await api("/api/preferences", {
        method: "POST",
        body: JSON.stringify({ writingStyle })
      });
      onSuccess?.("Tone profile updated. New drafts will use this tone.");
    } catch (error) {
      onError?.(error.message);
    } finally {
      setSavingStyle(false);
    }
  }

  async function createToneProfile() {
    const label = newToneName.trim();
    const description = newToneDescription.trim();
    const rules = newToneRules.trim();

    if (!label || !rules) {
      onError?.("Tone name and tone rules are required.");
      return;
    }

    setCreatingTone(true);
    try {
      const created = await api("/api/preferences", {
        method: "POST",
        body: JSON.stringify({ newToneProfile: { label, description, rules } })
      });

      onWritingStyleChange?.(created.writingStyle || "");
      onWritingStylesChange?.(Array.isArray(created.writingStyles) ? created.writingStyles : []);
      setNewToneName("");
      setNewToneDescription("");
      setNewToneRules("");
      onSuccess?.(
        created?.mode === "updated"
          ? `Tone profile "${label}" updated and selected.`
          : `Tone profile "${label}" created and selected.`
      );
    } catch (error) {
      onError?.(error.message);
    } finally {
      setCreatingTone(false);
    }
  }

  async function extractToneFromExamples() {
    const examples = toneExamplesText.trim();
    if (!examples) {
      onError?.("Paste 3-5 example posts first.");
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
      onSuccess?.(
        `Extracted tone from ${result?.meta?.exampleCount || "your"} example posts. Review and edit before saving.`
      );
    } catch (error) {
      onError?.(error.message);
    } finally {
      setExtractingTone(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="repo-manager-overlay"
        aria-label="Close tone manager"
        onClick={handleClose}
      />
      <section className="tone-manager-modal panel" aria-label="Tone manager">
        <div className="tone-manager-head">
          <div>
            <p className="tiny">writing setup</p>
            <h3>Tone Profile</h3>
            <p className="soft compact-note">Applies to newly generated drafts.</p>
          </div>
          <button className="btn btn-compact" onClick={handleClose}>
            Close
          </button>
        </div>

        <section className="tone-method">
          <p className="tiny tone-method-label">1. Select from:</p>
          <div className="style-row tone-style-row">
            <div className="tone-select-wrap">
              <select
                id="writing-style"
                className="style-select tone-select-control"
                aria-label="Tone profile"
                value={writingStyle}
                onChange={(event) => onWritingStyleChange?.(event.target.value)}
              >
                {(writingStyles || []).map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label} {style.isPreset ? "(Preset)" : "(Custom)"}
                  </option>
                ))}
              </select>
              <span className="tone-select-chevron" aria-hidden="true">▾</span>
            </div>
            <button className="btn btn-compact" disabled={savingStyle || !writingStyle} onClick={saveWritingStyle}>
              {savingStyle ? "Saving..." : "Save tone"}
            </button>
          </div>
          {selectedWritingStyle ? (
            <p className="tone-style-meta">
              <span className={`chip ${selectedWritingStyle.isPreset ? "chip-on" : ""}`}>
                {selectedWritingStyle.isPreset ? "Preset" : "Custom"}
              </span>
              <span>{selectedWritingStyle.description || "Applies this tone to newly generated drafts."}</span>
            </p>
          ) : null}
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
  );
}
