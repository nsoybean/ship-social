"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { Dispatch, SetStateAction } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import DraftWorkspace from "./draft-workspace";
import InboxPanel from "./inbox-panel";
import RepoManagerModal from "./repo-manager-modal";
import SettingsModal from "./settings-modal";

type MessageType = "success" | "error";
type AppStatus = "loading" | "signed_out" | "signed_in";

type AppUser = {
  avatarUrl?: string;
  githubName?: string;
  githubLogin?: string;
  writingStyle?: string;
};

type InboxItem = {
  id: string;
  draftId: string;
  title: string;
  body: string;
  createdAt?: string;
};

type DraftItem = {
  id: string;
  status?: string;
  [key: string]: any;
};

type WritingStyle = {
  id: string;
  label: string;
  description?: string;
  isPreset?: boolean;
};

type AiProvider = "auto" | "gateway" | "openai";

type AiSettings = {
  provider: AiProvider;
  textModel: string;
  imageModel: string;
};

type AiCapabilities = {
  gatewayConfigured: boolean;
  openaiConfigured: boolean;
  availableProviders: string[];
  defaultTextModel: string;
  defaultGatewayImageModel: string;
  defaultOpenAIImageModel: string;
};

type BrandProfile = {
  logoUrl: string;
  title: string;
  description: string;
  colors: {
    primary: string;
    accent: string;
    background: string;
  };
};

type BrandOption = BrandProfile & {
  id: string;
  label: string;
  isPreset?: boolean;
};

type QueryMessageTuple = [
  string,
  Dispatch<SetStateAction<string>>,
  MessageType,
  Dispatch<SetStateAction<MessageType>>
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

const LANDING_FAQ_ITEMS = [
  {
    question: "What does Ship - Social do exactly?",
    answer:
      "It turns your GitHub shipping activity into social-ready draft posts. You ship features, we generate post variants and visuals, then you review and publish."
  },
  {
    question: "What counts as a release in this app?",
    answer:
      "By default, we use published GitHub Releases. If no release exists, we fall back to the latest merged PR on your default branch, then the latest direct commit on that branch."
  },
  {
    question: "Will it post automatically without my approval?",
    answer:
      "No. The default workflow is manual approval: draft lands in inbox, you edit if needed, then approve/publish. You stay in control of every post."
  },
  {
    question: "Which social platforms are supported?",
    answer:
      "For now, Ship - Social is focused on X (Twitter) only. This keeps the workflow fast and dev-focused while we nail quality before expanding to more platforms."
  },
  {
    question: "What GitHub permissions are required?",
    answer:
      "Read access to repository metadata and release/PR context is required so we can build accurate drafts. If you enable webhooks later, webhook setup permission is also needed."
  },
  {
    question: "Do you read my private repo code?",
    answer:
      "We fetch only release/PR context needed for drafting (title, notes, changed files summary, commit messages, small patch previews). We do not need full repository cloning."
  }
];

const LANDING_PROOF_EXAMPLES = [
  {
    id: "telegram-release",
    input: `GitHub PR #199 merged
repo: nsoybean/nira-ai
title: Feat/telegram
notes: show inline keyboard during loading
delta: +25 / -14 across 2 files`,
    output:
      "Shipped in nira-ai: Telegram replies now show inline \"Loading...\" in the keyboard, preset labels are shorter with clearer icons, and temp loading messages auto-clean once the real response lands. Chat flow feels much smoother now."
  },
  {
    id: "trigger-options-release",
    input: `files changed

components/home-client.js modified • 804 changes
lib/github.js modified • 303 changes
app/globals.css modified • 294 changes
app/api/repos/[id]/trigger-options/route.js added • 106 changes
app/api/repos/[id]/trigger/route.js modified • 97 changes
lib/store.js modified • 36 changes

commit messages

feat: more manual trigger git options (release, merged PR, default branch commits)
feat: card flip preview as X
feat: upload/replace image with url, file, or clipboard`,
    output:
      "Tired of fixed triggers? We added flexible trigger options so you decide if your posts fire on releases, merged PRs, or direct commits. Card-flip previews now look like X posts, and you can upload/replace card images. Dive in now!"
  }
];

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

const SPLIT_MIN_WIDTH = 36;
const SPLIT_MAX_WIDTH = 64;

const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "auto",
  textModel: "openai/o4-mini",
  imageModel: "google/gemini-2.5-flash-image"
};

const DEFAULT_AI_CAPABILITIES: AiCapabilities = {
  gatewayConfigured: false,
  openaiConfigured: false,
  availableProviders: [],
  defaultTextModel: "openai/o4-mini",
  defaultGatewayImageModel: "google/gemini-2.5-flash-image",
  defaultOpenAIImageModel: "gpt-image-1"
};

const DEFAULT_BRAND_PROFILE: BrandProfile = {
  logoUrl: "",
  title: "",
  description: "",
  colors: {
    primary: "#5ea2ff",
    accent: "#92edce",
    background: "#fcfcff"
  }
};

function normalizeProvider(value: unknown): AiProvider {
  const candidate = String(value || "").trim().toLowerCase();
  if (candidate === "gateway" || candidate === "openai") {
    return candidate;
  }
  return "auto";
}

function normalizeHexColor(value: unknown, fallback: string) {
  const color = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color.toLowerCase();
  }
  return fallback;
}

function normalizeAiSettings(value: any): AiSettings {
  return {
    provider: normalizeProvider(value?.provider),
    textModel: String(value?.textModel || DEFAULT_AI_SETTINGS.textModel).trim() || DEFAULT_AI_SETTINGS.textModel,
    imageModel: String(value?.imageModel || DEFAULT_AI_SETTINGS.imageModel).trim() || DEFAULT_AI_SETTINGS.imageModel
  };
}

function normalizeAiCapabilities(value: any): AiCapabilities {
  const providers = Array.isArray(value?.availableProviders)
    ? value.availableProviders
        .map((item: any) => String(item || "").trim().toLowerCase())
        .filter((item: string) => item === "gateway" || item === "openai")
    : [];

  return {
    gatewayConfigured: Boolean(value?.gatewayConfigured),
    openaiConfigured: Boolean(value?.openaiConfigured),
    availableProviders: Array.from(new Set(providers)),
    defaultTextModel: String(value?.defaultTextModel || DEFAULT_AI_CAPABILITIES.defaultTextModel),
    defaultGatewayImageModel: String(
      value?.defaultGatewayImageModel || DEFAULT_AI_CAPABILITIES.defaultGatewayImageModel
    ),
    defaultOpenAIImageModel: String(
      value?.defaultOpenAIImageModel || DEFAULT_AI_CAPABILITIES.defaultOpenAIImageModel
    )
  };
}

function normalizeBrandProfile(value: any): BrandProfile {
  const colors = value?.colors || {};

  return {
    logoUrl: String(value?.logoUrl || "").trim(),
    title: String(value?.title || "").trim(),
    description: String(value?.description || "").trim(),
    colors: {
      primary: normalizeHexColor(colors?.primary, DEFAULT_BRAND_PROFILE.colors.primary),
      accent: normalizeHexColor(colors?.accent, DEFAULT_BRAND_PROFILE.colors.accent),
      background: normalizeHexColor(colors?.background, DEFAULT_BRAND_PROFILE.colors.background)
    }
  };
}

function normalizeBrandProfiles(value: any): BrandOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any) => {
      const id = String(item?.id || "").trim();
      const label = String(item?.label || "").trim();
      if (!id || !label) return null;

      const profile = normalizeBrandProfile(item);
      return {
        id,
        label,
        logoUrl: profile.logoUrl,
        title: profile.title,
        description: profile.description,
        colors: profile.colors,
        isPreset: Boolean(item?.isPreset)
      };
    })
    .filter(Boolean);
}

function useQueryMessage(): QueryMessageTuple {
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>("success");

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

function getInboxStatusMeta(status: string | null | undefined) {
  const normalized = String(status || "draft_ready").toLowerCase();
  if (normalized === "approved") {
    return {
      value: normalized,
      label: "Approved",
      needsAttention: false
    };
  }

  if (normalized === "draft_ready") {
    return {
      value: normalized,
      label: "Needs review",
      needsAttention: true
    };
  }

  return {
    value: normalized,
    label: normalized.replace(/_/g, " "),
    needsAttention: true
  };
}

export default function HomeClient() {
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<AppStatus>("loading");
  const [user, setUser] = useState<AppUser | null>(null);
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [connectedRepos, setConnectedRepos] = useState<any[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [deletingInboxId, setDeletingInboxId] = useState("");
  const [message, setMessage, messageType, setMessageType] = useQueryMessage();
  const [toastOpen, setToastOpen] = useState(false);
  const [repoManagerOpen, setRepoManagerOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [clearingProfileData, setClearingProfileData] = useState(false);
  const [isGeneratingInboxDraft, setIsGeneratingInboxDraft] = useState(false);
  const [writingStyle, setWritingStyle] = useState("");
  const [writingStyles, setWritingStyles] = useState<WritingStyle[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [aiCapabilities, setAiCapabilities] = useState<AiCapabilities>(DEFAULT_AI_CAPABILITIES);
  const [brandProfile, setBrandProfile] = useState<BrandProfile>(DEFAULT_BRAND_PROFILE);
  const [brandProfiles, setBrandProfiles] = useState<BrandOption[]>([]);
  const [activeBrandProfile, setActiveBrandProfile] = useState("");
  const [refreshPendingCount, setRefreshPendingCount] = useState(0);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [inboxPaneWidth, setInboxPaneWidth] = useState(54);
  const [isResizingSplit, setIsResizingSplit] = useState(false);

  const showSuccessToast = useCallback((text: string) => {
    setMessageType("success");
    setMessage(text);
  }, [setMessage, setMessageType]);

  const showErrorToast = useCallback((text: string) => {
    setMessageType("error");
    setMessage(text);
  }, [setMessage, setMessageType]);

  const clampInboxPaneWidth = useCallback((value: number) => {
    return Math.max(SPLIT_MIN_WIDTH, Math.min(SPLIT_MAX_WIDTH, value));
  }, []);

  const refreshData = useCallback(async () => {
    setRefreshPendingCount((count) => count + 1);
    try {
      const auth = await api<any>("/api/auth/me");
      if (!auth.authenticated) {
        setStatus("signed_out");
        setUser(null);
        setGithubRepos([]);
        setConnectedRepos([]);
        setInboxItems([]);
        setDrafts([]);
        setWritingStyle("");
        setWritingStyles([]);
        setAiSettings(DEFAULT_AI_SETTINGS);
        setAiCapabilities(DEFAULT_AI_CAPABILITIES);
        setBrandProfile(DEFAULT_BRAND_PROFILE);
        setBrandProfiles([]);
        setActiveBrandProfile("");
        return;
      }

      setStatus("signed_in");
      setUser(auth.user);
      setWritingStyle(auth.user?.writingStyle || "");
      setWritingStyles(Array.isArray(auth.writingStyles) ? auth.writingStyles : []);
      setAiSettings(normalizeAiSettings(auth?.settings?.aiSettings));
      setAiCapabilities(normalizeAiCapabilities(auth?.settings?.aiCapabilities));
      setBrandProfile(normalizeBrandProfile(auth?.settings?.brandProfile));
      setBrandProfiles(normalizeBrandProfiles(auth?.settings?.brandProfiles));
      setActiveBrandProfile(String(auth?.settings?.activeBrandProfile || ""));

      const [reposPayload, connectedPayload, inboxPayload, draftsPayload] = await Promise.all([
        api<any>("/api/github/repos"),
        api<any>("/api/repos"),
        api<any>("/api/inbox"),
        api<any>("/api/drafts")
      ]);

      setGithubRepos(reposPayload.repos || []);
      setConnectedRepos(connectedPayload.items || []);
      setInboxItems(inboxPayload.items || []);
      setDrafts(draftsPayload.items || []);
    } finally {
      setRefreshPendingCount((count) => Math.max(0, count - 1));
    }
  }, []);

  const isRefreshingRepos = refreshPendingCount > 0;

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setStatus("signed_out");
    setUser(null);
    setGithubRepos([]);
    setConnectedRepos([]);
    setInboxItems([]);
    setDrafts([]);
    setRepoManagerOpen(false);
    setSettingsModalOpen(false);
    setActiveDraftId("");
    setIsGeneratingInboxDraft(false);
    setWritingStyle("");
    setWritingStyles([]);
    setAiSettings(DEFAULT_AI_SETTINGS);
    setAiCapabilities(DEFAULT_AI_CAPABILITIES);
    setBrandProfile(DEFAULT_BRAND_PROFILE);
    setBrandProfiles([]);
    setActiveBrandProfile("");
  }, []);

  const clearProfileData = useCallback(async () => {
    const confirmed = window.confirm(
      "Clear all profile data?\n\nThis will remove connected repos, manual runs, drafts, inbox items, custom tone profiles, AI settings, and brand details."
    );
    if (!confirmed) return;

    setClearingProfileData(true);
    try {
      await api("/api/profile/clear", { method: "POST" });
      setActiveDraftId("");
      showSuccessToast("Profile data cleared.");
      await refreshData();
    } catch (error) {
      showErrorToast(getErrorMessage(error));
    } finally {
      setClearingProfileData(false);
    }
  }, [refreshData, showErrorToast, showSuccessToast]);

  const updateInboxPaneWidth = useCallback((clientX: number) => {
    const container = splitContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (!rect.width) return;

    const nextValue = ((clientX - rect.left) / rect.width) * 100;
    setInboxPaneWidth(clampInboxPaneWidth(nextValue));
  }, [clampInboxPaneWidth]);

  const startSplitResize = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setIsResizingSplit(true);
  }, []);

  const onSplitKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -2 : 2;
    setInboxPaneWidth((prev) => clampInboxPaneWidth(prev + delta));
  }, [clampInboxPaneWidth]);

  const removeInboxItem = useCallback(async (itemId: string, draftId: string) => {
    setDeletingInboxId(itemId);
    try {
      await api(`/api/inbox/${itemId}`, { method: "DELETE" });
      if (activeDraftId === draftId) {
        setActiveDraftId("");
      }
      showSuccessToast("Inbox item deleted.");
      await refreshData();
    } catch (error) {
      showErrorToast(getErrorMessage(error));
    } finally {
      setDeletingInboxId("");
    }
  }, [activeDraftId, showSuccessToast, showErrorToast, refreshData]);

  const openSettingsModal = useCallback(() => {
    setRepoManagerOpen(false);
    setSettingsModalOpen(true);
  }, []);

  const openRepoManager = useCallback(() => {
    setSettingsModalOpen(false);
    setRepoManagerOpen(true);
  }, []);

  const handleReposChange = useCallback(async ({ draftId }: { draftId?: string } = {}) => {
    await refreshData();
    if (draftId) setActiveDraftId(draftId);
  }, [refreshData]);

  useEffect(() => {
    refreshData().catch((error: unknown) => {
      setStatus("signed_out");
      showErrorToast(getErrorMessage(error));
    });
  }, [refreshData, showErrorToast]);

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
      return;
    }

    if (activeDraftId && !drafts.some((draft) => draft.id === activeDraftId)) {
      setActiveDraftId("");
    }
  }, [drafts, activeDraftId]);

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) || null,
    [drafts, activeDraftId]
  );

  const prioritizedInboxItems = useMemo(() => {
    const draftStatusById = new Map(
      (drafts || []).map((draft) => [draft.id, draft.status || "draft_ready"])
    );

    return (inboxItems || [])
      .map((item: InboxItem) => {
        const status = draftStatusById.get(item.draftId) || "draft_ready";
        const meta = getInboxStatusMeta(status);
        return {
          ...item,
          draftStatus: status,
          statusLabel: meta.label,
          needsAttention: meta.needsAttention
        };
      })
      .sort((a, b) => {
        if (a.needsAttention !== b.needsAttention) {
          return a.needsAttention ? -1 : 1;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [inboxItems, drafts]);

  useEffect(() => {
    if (!isResizingSplit) return undefined;

    function onPointerMove(event: globalThis.PointerEvent) {
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
  }, [isResizingSplit, updateInboxPaneWidth]);

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
              Ship your features.
              <br />
              We write the posts.
            </h1>
            <p className="lead">
              Connect GitHub, approve the draft, and publish without breaking your shipping flow.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href="/api/auth/github/start">Connect GitHub</a>
            </div>
            <pre className="mini-log">{`> ship.detected\n> social_drafts.created\n> you.review\n> you.publish`}</pre>
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
        <section className="panel proof-section">
          <div className="panel-head proof-head">
            <h3>From GitHub release to X post</h3>
            <span className="tiny">How it works</span>
          </div>
          <div className="proof-examples">
            {LANDING_PROOF_EXAMPLES.map((example, index) => (
              <div key={example.id} className="proof-example">
                <p className="tiny proof-example-label">Example {index + 1}</p>
                <div className="proof-grid">
                  <article className="proof-card">
                    <p className="tiny">Input: shipping signal</p>
                    <pre className="proof-pre">{example.input}</pre>
                  </article>
                  <article className="proof-card">
                    <p className="tiny">Output: X-ready draft</p>
                    <div className="proof-x">
                      <div className="proof-x-head">
                        <strong>Nira AI</strong>
                        <span>@niraAI</span>
                      </div>
                      <p>{example.output}</p>
                    </div>
                  </article>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel faq-section">
          <div className="panel-head faq-head">
            <h3>FAQ</h3>
            <span className="tiny">Common doubts</span>
          </div>
          <div className="faq-list">
            {LANDING_FAQ_ITEMS.map((item) => (
              <details key={item.question} className="faq-item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="panel logo-cta-section">
          <div className="logo-cta-card">
            <img
              src="/ship-social-logo.png"
              alt="Ship Social astronaut logo"
              className="logo-cta-image"
              width={120}
              height={120}
              loading="lazy"
            />
            <div className="logo-cta-copy">
              <p className="tiny">Ready to ship</p>
              <h3>Turn every release into a polished social post</h3>
            </div>
            <a className="btn btn-primary logo-cta-button" href="/api/auth/github/start">
              Start with GitHub
            </a>
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
            <button className="btn btn-topbar" onClick={openSettingsModal}>
              Settings
            </button>
            <button className="btn btn-topbar" onClick={openRepoManager}>
              Repos ({connectedRepos.length})
            </button>
            <button className="btn btn-topbar" onClick={refreshData}>Refresh</button>
            <button
              className="btn btn-topbar"
              onClick={clearProfileData}
              disabled={clearingProfileData}
            >
              {clearingProfileData ? "Clearing..." : "Clear data"}
            </button>
            <button className="btn btn-topbar" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <section
        ref={splitContainerRef}
        className={`grid-two split-grid ${isResizingSplit ? "is-resizing" : ""}`}
        style={{ "--inbox-pane-width": `${inboxPaneWidth}%` } as CSSProperties}
      >
        <InboxPanel
          items={prioritizedInboxItems}
          activeDraftId={activeDraftId}
          onSelectDraft={setActiveDraftId}
          deletingId={deletingInboxId}
          onDeleteItem={removeInboxItem}
          onOpenRepos={openRepoManager}
          showGeneratingSkeleton={isGeneratingInboxDraft}
        />

        <button
          type="button"
          className="split-divider"
          onPointerDown={startSplitResize}
          onKeyDown={onSplitKeyDown}
          role="separator"
          aria-label="Resize inbox and draft workspace panels"
          aria-orientation="vertical"
          aria-valuemin={SPLIT_MIN_WIDTH}
          aria-valuemax={SPLIT_MAX_WIDTH}
          aria-valuenow={Math.round(inboxPaneWidth)}
        >
          <span className="split-divider-grip" />
        </button>

        <DraftWorkspace
          draft={activeDraft}
          user={user}
          writingStyles={writingStyles}
          onSuccess={showSuccessToast}
          onError={showErrorToast}
          onRefresh={refreshData}
        />
      </section>

      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        writingStyle={writingStyle}
        writingStyles={writingStyles}
        aiSettings={aiSettings}
        aiCapabilities={aiCapabilities}
        brandProfile={brandProfile}
        brandProfiles={brandProfiles}
        activeBrandProfile={activeBrandProfile}
        onSettingsChange={(next) => {
          setWritingStyle(next.writingStyle);
          setWritingStyles(next.writingStyles);
          setAiSettings(next.aiSettings);
          setBrandProfile(next.brandProfile);
          setBrandProfiles(next.brandProfiles);
          setActiveBrandProfile(next.activeBrandProfile);
        }}
        onSuccess={showSuccessToast}
        onError={showErrorToast}
      />

      <RepoManagerModal
        open={repoManagerOpen}
        onClose={() => setRepoManagerOpen(false)}
        user={user}
        repos={{ githubRepos, connectedRepos }}
        loadingGithubRepos={isRefreshingRepos}
        onRefreshRepos={refreshData}
        onReposChange={handleReposChange}
        onTriggeringChange={setIsGeneratingInboxDraft}
        onSuccess={showSuccessToast}
        onError={showErrorToast}
      />
    </main>
  );
}
