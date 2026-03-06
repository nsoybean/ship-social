"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleNotch as CircleNotchIcon } from "@phosphor-icons/react";

type GithubRepo = {
  id: string;
  full_name: string;
  private?: boolean;
  default_branch?: string;
  connected?: boolean;
  [key: string]: any;
};

type ConnectedRepo = {
  id: string;
  fullName: string;
  private?: boolean;
  defaultBranch?: string;
  autoGenerate?: boolean;
  lastReleaseTag?: string;
  lastReleaseTitle?: string;
  lastManualTriggerAt?: string;
  lastTriggerStatus?: string;
  [key: string]: any;
};

type RepoManagerModalProps = {
  open: boolean;
  onClose: () => void;
  user?: any;
  repos?: {
    githubRepos?: GithubRepo[];
    connectedRepos?: ConnectedRepo[];
  };
  loadingGithubRepos?: boolean;
  onRefreshRepos?: () => void | Promise<void>;
  onReposChange?: (payload?: { draftId?: string | null }) => void | Promise<void>;
  onTriggeringChange?: (isTriggering: boolean) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
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

  return payload as T;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

export default function RepoManagerModal({
  open,
  onClose,
  user,
  repos,
  loadingGithubRepos = false,
  onRefreshRepos,
  onReposChange,
  onTriggeringChange,
  onSuccess,
  onError
}: RepoManagerModalProps) {
  void user;
  const { githubRepos = [], connectedRepos = [] } = repos || {};

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [repoPickerOpen, setRepoPickerOpen] = useState(true);
  const [triggeringRepoId, setTriggeringRepoId] = useState("");
  const [triggerOptionsRepoId, setTriggerOptionsRepoId] = useState("");
  const [loadingTriggerOptionsRepoId, setLoadingTriggerOptionsRepoId] = useState("");
  const [refreshingRepos, setRefreshingRepos] = useState(false);
  const [triggerOptionsByRepo, setTriggerOptionsByRepo] = useState<Record<string, any>>({});
  const [triggerSignalByRepo, setTriggerSignalByRepo] = useState<Record<string, string>>({});
  const [selectedCommitShasByRepo, setSelectedCommitShasByRepo] = useState<Record<string, string[]>>({});
  const repoListLoading = loadingGithubRepos || refreshingRepos;

  useEffect(() => {
    const connectedRepoIds = new Set((connectedRepos || []).map((repo) => repo.id));
    setTriggerOptionsByRepo((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([repoId]) => connectedRepoIds.has(repoId)))
    );
    setTriggerSignalByRepo((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([repoId]) => connectedRepoIds.has(repoId)))
    );
    setSelectedCommitShasByRepo((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([repoId]) => connectedRepoIds.has(repoId)))
    );
    if (triggerOptionsRepoId && !connectedRepoIds.has(triggerOptionsRepoId)) {
      setTriggerOptionsRepoId("");
    }
  }, [connectedRepos, triggerOptionsRepoId]);

  const filteredRepos = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return githubRepos;
    return githubRepos.filter((repo) => repo.full_name?.toLowerCase().includes(needle));
  }, [githubRepos, search]);

  const selectedRepos = useMemo(() => {
    return filteredRepos.filter((repo) => selected[repo.id]);
  }, [filteredRepos, selected]);

  async function connectSelectedRepos() {
    if (selectedRepos.length === 0) {
      onError?.("Pick at least one repo first.");
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
      onSuccess?.(`Connected ${selectedRepos.length} repo(s).`);
      onReposChange?.();
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutomation(repoId: string, nextValue: boolean) {
    setBusy(true);
    try {
      await api(`/api/repos/${repoId}/toggle`, {
        method: "POST",
        body: JSON.stringify({ autoGenerate: nextValue })
      });
      onReposChange?.();
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function getTriggerSignalLabel(signal: string, commitCount = 0) {
    if (signal === "merged_pr") return "merged PR";
    if (signal === "default_branch_commit") {
      if (commitCount > 1) {
        return `${commitCount} selected commits`;
      }
      return "default-branch commit";
    }
    return "GitHub release";
  }

  async function loadTriggerOptions(repoId: string) {
    setLoadingTriggerOptionsRepoId(repoId);
    try {
      const response = await api<any>(`/api/repos/${repoId}/trigger-options`);
      setTriggerOptionsByRepo((prev) => ({ ...prev, [repoId]: response.options || {} }));
      setTriggerSignalByRepo((prev) => ({ ...prev, [repoId]: prev[repoId] || "auto" }));
      setSelectedCommitShasByRepo((prev) => ({ ...prev, [repoId]: prev[repoId] || [] }));
      return response.options || null;
    } catch (error) {
      onError?.(getErrorMessage(error));
      return null;
    } finally {
      setLoadingTriggerOptionsRepoId("");
    }
  }

  async function toggleTriggerOptions(repoId: string) {
    if (triggerOptionsRepoId === repoId) {
      setTriggerOptionsRepoId("");
      return;
    }
    setTriggerOptionsRepoId(repoId);
    if (!triggerOptionsByRepo[repoId]) {
      await loadTriggerOptions(repoId);
    }
  }

  async function refreshReposList() {
    if (!onRefreshRepos) {
      await onReposChange?.();
      return;
    }

    setRefreshingRepos(true);
    try {
      await onRefreshRepos();
      onSuccess?.("Repository list refreshed.");
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setRefreshingRepos(false);
    }
  }

  function toggleCommitSelection(repoId: string, sha: string, maxSelectable = 8) {
    setSelectedCommitShasByRepo((prev) => {
      const current = Array.isArray(prev[repoId]) ? prev[repoId] : [];
      const hasSha = current.includes(sha);
      if (hasSha) {
        return { ...prev, [repoId]: current.filter((item) => item !== sha) };
      }
      if (current.length >= maxSelectable) {
        onError?.(`Select up to ${maxSelectable} commits.`);
        return prev;
      }
      return { ...prev, [repoId]: [...current, sha] };
    });
  }

  async function manualTriggerRepo(repo: ConnectedRepo, config: Record<string, any> = {}) {
    const repoId = repo.id;
    const fullName = repo.fullName;
    const signal = String(config.signal || "auto");
    const commitShas = Array.isArray(config.commitShas) ? config.commitShas : [];
    const requestPayload: {
      signal: string;
      prNumber?: number;
      commitShas?: string[];
    } = { signal };
    if (signal === "merged_pr" && config.prNumber) {
      requestPayload.prNumber = config.prNumber;
    }
    if (signal === "commits") {
      requestPayload.commitShas = commitShas;
    }

    onTriggeringChange?.(true);
    setTriggeringRepoId(repoId);
    try {
      const response = await api<any>(`/api/repos/${repoId}/trigger`, {
        method: "POST",
        body: JSON.stringify(requestPayload)
      });
      const signalLabel = getTriggerSignalLabel(response.signal, commitShas.length);
      onSuccess?.(`Draft generated from ${signalLabel} for ${fullName}.`);
      await onReposChange?.({ draftId: response?.draft?.id || null });
      setTriggerOptionsRepoId("");
    } catch (error) {
      onError?.(getErrorMessage(error));
      await onReposChange?.();
    } finally {
      setTriggeringRepoId("");
      onTriggeringChange?.(false);
    }
  }

  async function triggerWithSelectedSignal(repo: ConnectedRepo) {
    const repoId = repo.id;
    const options = triggerOptionsByRepo[repoId];
    const signal = triggerSignalByRepo[repoId] || "auto";
    const selectedCommits = selectedCommitShasByRepo[repoId] || [];

    if (!options) {
      onError?.("Load trigger options first.");
      return;
    }

    if (signal === "github_release" && !options?.github_release?.available) {
      onError?.("No published GitHub release available for this repo.");
      return;
    }

    if (signal === "merged_pr" && !options?.merged_pr?.available) {
      onError?.("No merged PR available on default branch.");
      return;
    }

    if (signal === "commits" && selectedCommits.length === 0) {
      onError?.("Select at least one commit.");
      return;
    }

    await manualTriggerRepo(repo, {
      signal,
      prNumber: options?.merged_pr?.item?.prNumber || null,
      commitShas: selectedCommits
    });
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="repo-manager-overlay"
        aria-label="Close repo manager"
        onClick={onClose}
      />
      <section className="repo-manager-modal panel" aria-label="Repository manager">
        <div className="repo-manager-head">
          <div>
            <p className="tiny">onboarding / setup</p>
            <h3>Repo Manager</h3>
          </div>
          <button className="btn btn-compact" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="repo-manager-grid">
          <article className="panel">
            <div className="panel-head">
              <h3>Pick repos to connect</h3>
              <div className="panel-head-actions">
                <span className="tiny">{githubRepos.length} available</span>
                <div className="panel-head-actions-right">
                  <button
                    className="btn btn-compact"
                    disabled={busy || repoListLoading}
                    onClick={refreshReposList}
                  >
                    {repoListLoading ? (
                      <>
                        <CircleNotchIcon aria-hidden size={14} className="icon-spin" />
                        Refreshing...
                      </>
                    ) : (
                      "Refresh"
                    )}
                  </button>
                  {connectedRepos.length > 0 ? (
                    <button className="btn btn-compact" onClick={() => setRepoPickerOpen((prev) => !prev)}>
                      {repoPickerOpen ? "Hide picker" : "Add more repos"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {repoPickerOpen ? (
              <>
                <input
                  className="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search owner/repo"
                  disabled={repoListLoading}
                />
                {repoListLoading ? (
                  <div className="repo-list-loading" role="status" aria-live="polite">
                    <CircleNotchIcon aria-hidden size={16} className="icon-spin" />
                    <span>Fetching repositories...</span>
                  </div>
                ) : null}
                <div className="repo-list">
                  {filteredRepos.map((repo) => (
                    <label key={repo.id} className="repo-item">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[repo.id])}
                        disabled={repoListLoading}
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
                <button className="btn btn-primary" disabled={busy || repoListLoading} onClick={connectSelectedRepos}>
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
                connectedRepos.map((repo) => {
                  const options = triggerOptionsByRepo[repo.id];
                  const selectedSignal = triggerSignalByRepo[repo.id] || "auto";
                  const selectedCommitShas = selectedCommitShasByRepo[repo.id] || [];
                  const commitOption = options?.commits || null;
                  const maxSelectable = commitOption?.maxSelectable || 8;
                  const isOptionsOpen = triggerOptionsRepoId === repo.id;
                  const loadingOptions = loadingTriggerOptionsRepoId === repo.id;
                  const isTriggeringThisRepo = triggeringRepoId === repo.id;

                  return (
                    <div key={repo.id} className={`connected-item ${isOptionsOpen ? "connected-item-open" : ""}`}>
                      <div className="connected-item-main">
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
                          disabled={isTriggeringThisRepo || busy}
                          onClick={() => manualTriggerRepo(repo, { signal: "auto" })}
                        >
                          {isTriggeringThisRepo ? "Triggering..." : "Manual trigger"}
                        </button>
                        <button
                          className="btn btn-compact"
                          disabled={busy || Boolean(triggeringRepoId)}
                          onClick={() => toggleTriggerOptions(repo.id)}
                        >
                          {isOptionsOpen ? "Hide options" : "Trigger options"}
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
                      {isOptionsOpen ? (
                        <section className="trigger-options-panel" aria-label={`Trigger options for ${repo.fullName}`}>
                          {loadingOptions ? (
                            <p className="soft">Loading trigger options...</p>
                          ) : (
                            <>
                              <div className="trigger-signal-grid">
                                <label className="trigger-signal-row">
                                  <input
                                    type="radio"
                                    name={`trigger-signal-${repo.id}`}
                                    checked={selectedSignal === "auto"}
                                    onChange={() =>
                                      setTriggerSignalByRepo((prev) => ({ ...prev, [repo.id]: "auto" }))}
                                  />
                                  <div>
                                    <strong>Auto (recommended)</strong>
                                    <p>{options?.auto?.description || "Release → PR → commit fallback"}</p>
                                  </div>
                                </label>
                                <label className="trigger-signal-row">
                                  <input
                                    type="radio"
                                    name={`trigger-signal-${repo.id}`}
                                    checked={selectedSignal === "github_release"}
                                    onChange={() =>
                                      setTriggerSignalByRepo((prev) => ({ ...prev, [repo.id]: "github_release" }))}
                                    disabled={!options?.github_release?.available}
                                  />
                                  <div>
                                    <strong>GitHub Release</strong>
                                    <p>
                                      {options?.github_release?.available
                                        ? `${options.github_release.item.tag || "Release"} • ${options.github_release.item.title}`
                                        : options?.github_release?.error || "No published release found"}
                                    </p>
                                  </div>
                                </label>
                                <label className="trigger-signal-row">
                                  <input
                                    type="radio"
                                    name={`trigger-signal-${repo.id}`}
                                    checked={selectedSignal === "merged_pr"}
                                    onChange={() =>
                                      setTriggerSignalByRepo((prev) => ({ ...prev, [repo.id]: "merged_pr" }))}
                                    disabled={!options?.merged_pr?.available}
                                  />
                                  <div>
                                    <strong>Merged PR</strong>
                                    <p>
                                      {options?.merged_pr?.available
                                        ? `${options.merged_pr.item.tag} • ${options.merged_pr.item.title}`
                                        : options?.merged_pr?.error || "No merged PR found"}
                                    </p>
                                  </div>
                                </label>
                                <label className="trigger-signal-row">
                                  <input
                                    type="radio"
                                    name={`trigger-signal-${repo.id}`}
                                    checked={selectedSignal === "commits"}
                                    onChange={() => setTriggerSignalByRepo((prev) => ({ ...prev, [repo.id]: "commits" }))}
                                    disabled={!options?.commits?.available}
                                  />
                                  <div>
                                    <strong>Commits</strong>
                                    <p>
                                      {options?.commits?.available
                                        ? `Pick 1-${maxSelectable} commits from ${repo.defaultBranch}`
                                        : options?.commits?.error || "No commits found"}
                                    </p>
                                  </div>
                                </label>
                              </div>

                              {selectedSignal === "commits" && options?.commits?.available ? (
                                <div className="trigger-commit-picker">
                                  <p className="soft trigger-commit-count">
                                    Selected {selectedCommitShas.length}/{maxSelectable} commits
                                  </p>
                                  <div className="trigger-commit-list">
                                    {options.commits.items.map((commit) => (
                                      <label key={commit.sha} className="trigger-commit-item">
                                        <input
                                          type="checkbox"
                                          checked={selectedCommitShas.includes(commit.sha)}
                                          onChange={() => toggleCommitSelection(repo.id, commit.sha, maxSelectable)}
                                        />
                                        <div>
                                          <strong>{commit.message || `Commit ${commit.shortSha}`}</strong>
                                          <p>{commit.shortSha} • {commit.author || "unknown"}</p>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              <div className="trigger-options-actions">
                                <button
                                  className="btn btn-compact btn-primary"
                                  disabled={busy || Boolean(triggeringRepoId)}
                                  onClick={() => triggerWithSelectedSignal(repo)}
                                >
                                  {isTriggeringThisRepo ? (
                                    <>
                                      <CircleNotchIcon
                                        aria-hidden
                                        size={14}
                                        className="icon-spin"
                                      />
                                      Triggering...
                                    </>
                                  ) : (
                                    "Trigger selected"
                                  )}
                                </button>
                                <button
                                  className="btn btn-compact"
                                  disabled={busy || Boolean(triggeringRepoId)}
                                  onClick={() => loadTriggerOptions(repo.id)}
                                >
                                  Refresh options
                                </button>
                              </div>
                            </>
                          )}
                        </section>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
