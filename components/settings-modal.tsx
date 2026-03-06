"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { HexColorPicker } from "react-colorful";
import Popover from "popover";

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

type SettingsPayload = {
  writingStyle: string;
  writingStyles: WritingStyle[];
  aiSettings: AiSettings;
  brandProfile: BrandProfile;
  brandProfiles: BrandOption[];
  activeBrandProfile: string;
};

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  writingStyle: string;
  writingStyles: WritingStyle[];
  aiSettings: AiSettings;
  aiCapabilities: AiCapabilities;
  brandProfile: BrandProfile;
  brandProfiles: BrandOption[];
  activeBrandProfile: string;
  onSettingsChange?: (settings: SettingsPayload) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

type SettingsTab = "ai" | "tone" | "brand";
type BrandColorKey = keyof BrandProfile["colors"];

const BRAND_COLOR_PRESETS = [
  {
    name: "Ship",
    primary: "#5ea2ff",
    accent: "#92edce",
    background: "#fcfcff",
  },
  {
    name: "Sunset",
    primary: "#f97316",
    accent: "#facc15",
    background: "#fff7ed",
  },
  {
    name: "Forest",
    primary: "#166534",
    accent: "#22c55e",
    background: "#f0fdf4",
  },
  {
    name: "Slate",
    primary: "#334155",
    accent: "#0ea5e9",
    background: "#f8fafc",
  },
  {
    name: "Rose",
    primary: "#be185d",
    accent: "#fb7185",
    background: "#fff1f2",
  },
];
const MAX_BRAND_PROFILES = 3;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function normalizeProvider(value: unknown): AiProvider {
  const candidate = String(value || "")
    .trim()
    .toLowerCase();
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

function normalizeAiSettings(value: any, fallback: AiSettings): AiSettings {
  return {
    provider: normalizeProvider(value?.provider),
    textModel:
      String(value?.textModel || fallback.textModel).trim() ||
      fallback.textModel,
    imageModel:
      String(value?.imageModel || fallback.imageModel).trim() ||
      fallback.imageModel,
  };
}

function normalizeBrandProfile(
  value: any,
  fallback: BrandProfile,
): BrandProfile {
  const colors = value?.colors || {};

  return {
    logoUrl: String(value?.logoUrl || "").trim(),
    title: String(value?.title || "").trim(),
    description: String(value?.description || "").trim(),
    colors: {
      primary: normalizeHexColor(colors?.primary, fallback.colors.primary),
      accent: normalizeHexColor(colors?.accent, fallback.colors.accent),
      background: normalizeHexColor(
        colors?.background,
        fallback.colors.background,
      ),
    },
  };
}

function normalizeBrandProfiles(
  value: any,
  fallback: BrandProfile,
): BrandOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any) => {
      const id = String(item?.id || "").trim();
      const label = String(item?.label || "").trim();
      if (!id || !label) return null;

      const profile = normalizeBrandProfile(item, fallback);
      return {
        id,
        label,
        logoUrl: profile.logoUrl,
        title: profile.title,
        description: profile.description,
        colors: profile.colors,
        isPreset: Boolean(item?.isPreset),
      };
    })
    .filter(Boolean);
}

function isLikelyImageCapableModel(
  provider: "gateway" | "openai",
  modelId: string,
) {
  const value = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!value) return false;

  const imageHints = [
    "image",
    "vision",
    "flux",
    "stable-diffusion",
    "sd",
    "dall",
    "recraft",
    "ideogram",
    "imagen",
  ];
  const looksImageCapable = imageHints.some((hint) => value.includes(hint));

  if (provider === "gateway") {
    return value.includes("/") && looksImageCapable;
  }

  return looksImageCapable;
}

function isValidLogoValue(value: string) {
  const input = String(value || "").trim();
  if (!input) return false;
  if (/^https?:\/\/\S+$/i.test(input)) return true;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(input)) return true;
  return false;
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

export default function SettingsModal({
  open,
  onClose,
  writingStyle,
  writingStyles,
  aiSettings,
  aiCapabilities,
  brandProfile,
  brandProfiles,
  activeBrandProfile,
  onSettingsChange,
  onSuccess,
  onError,
}: SettingsModalProps) {
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const providerHelpTriggerRef = useRef<HTMLButtonElement | null>(null);
  const providerHelpPopoverRef = useRef<any>(null);
  const providerHelpHideTimerRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("ai");
  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingTone, setCreatingTone] = useState(false);
  const [extractingTone, setExtractingTone] = useState(false);

  const [draftWritingStyle, setDraftWritingStyle] = useState(
    writingStyle || "",
  );
  const [draftAiSettings, setDraftAiSettings] = useState<AiSettings>(
    normalizeAiSettings(aiSettings, {
      provider: "auto",
      textModel: aiCapabilities.defaultTextModel || "openai/o4-mini",
      imageModel:
        aiCapabilities.defaultGatewayImageModel ||
        "google/gemini-2.5-flash-image",
    }),
  );
  const [draftBrandProfile, setDraftBrandProfile] = useState<BrandProfile>(
    normalizeBrandProfile(brandProfile, {
      logoUrl: "",
      title: "",
      description: "",
      colors: {
        primary: "#5ea2ff",
        accent: "#92edce",
        background: "#fcfcff",
      },
    }),
  );
  const [draftBrandProfiles, setDraftBrandProfiles] = useState<BrandOption[]>(
    [],
  );
  const [draftActiveBrandProfile, setDraftActiveBrandProfile] = useState(
    String(activeBrandProfile || ""),
  );

  const [newToneName, setNewToneName] = useState("");
  const [newToneDescription, setNewToneDescription] = useState("");
  const [newToneRules, setNewToneRules] = useState("");
  const [toneExamplesText, setToneExamplesText] = useState("");
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);
  const [logoUrlInputValue, setLogoUrlInputValue] = useState("");
  const [activeColorKey, setActiveColorKey] =
    useState<BrandColorKey>("primary");

  const fallbackAiSettings = useMemo<AiSettings>(
    () => ({
      provider: "auto",
      textModel: aiCapabilities.defaultTextModel || "openai/o4-mini",
      imageModel:
        aiCapabilities.defaultGatewayImageModel ||
        "google/gemini-2.5-flash-image",
    }),
    [aiCapabilities.defaultTextModel, aiCapabilities.defaultGatewayImageModel],
  );

  const fallbackBrandProfile = useMemo<BrandProfile>(
    () => ({
      logoUrl: "",
      title: "",
      description: "",
      colors: {
        primary: "#5ea2ff",
        accent: "#92edce",
        background: "#fcfcff",
      },
    }),
    [],
  );

  useEffect(() => {
    if (!open) return;

    const nextBrandProfiles = normalizeBrandProfiles(
      brandProfiles,
      fallbackBrandProfile,
    );
    const nextActiveBrandId =
      String(activeBrandProfile || "").trim() &&
      nextBrandProfiles.some(
        (item) => item.id === String(activeBrandProfile || "").trim(),
      )
        ? String(activeBrandProfile || "").trim()
        : nextBrandProfiles[0]?.id || "";
    const nextActiveBrand = nextBrandProfiles.find(
      (item) => item.id === nextActiveBrandId,
    );

    setActiveTab("ai");
    setDraftWritingStyle(writingStyle || "");
    setDraftAiSettings(normalizeAiSettings(aiSettings, fallbackAiSettings));
    setDraftBrandProfiles(nextBrandProfiles);
    setDraftActiveBrandProfile(nextActiveBrandId);
    setDraftBrandProfile(
      normalizeBrandProfile(
        nextActiveBrand || fallbackBrandProfile,
        fallbackBrandProfile,
      ),
    );
    setNewToneName("");
    setNewToneDescription("");
    setNewToneRules("");
    setToneExamplesText("");
    setShowLogoUrlInput(false);
    setLogoUrlInputValue("");
    setActiveColorKey("primary");
  }, [
    open,
    writingStyle,
    aiSettings,
    brandProfile,
    brandProfiles,
    activeBrandProfile,
    fallbackAiSettings,
    fallbackBrandProfile,
  ]);

  useEffect(() => {
    setShowLogoUrlInput(false);
    setLogoUrlInputValue("");
  }, [draftActiveBrandProfile]);

  const selectedWritingStyle = useMemo(
    () =>
      (writingStyles || []).find((style) => style.id === draftWritingStyle) ||
      null,
    [writingStyles, draftWritingStyle],
  );

  const activeBrandOption = useMemo(
    () =>
      draftBrandProfiles.find((item) => item.id === draftActiveBrandProfile) ||
      null,
    [draftBrandProfiles, draftActiveBrandProfile],
  );

  const isDirty = useMemo(() => {
    const writingStyleChanged =
      (draftWritingStyle || "") !== (writingStyle || "");
    const aiChanged =
      JSON.stringify(
        normalizeAiSettings(draftAiSettings, fallbackAiSettings),
      ) !== JSON.stringify(normalizeAiSettings(aiSettings, fallbackAiSettings));
    const nextBrandProfiles = normalizeBrandProfiles(
      brandProfiles,
      fallbackBrandProfile,
    );
    const currentActiveId =
      String(activeBrandProfile || "").trim() &&
      nextBrandProfiles.some(
        (item) => item.id === String(activeBrandProfile || "").trim(),
      )
        ? String(activeBrandProfile || "").trim()
        : nextBrandProfiles[0]?.id || "";
    const currentActiveProfile =
      nextBrandProfiles.find((item) => item.id === currentActiveId) || null;
    const currentActiveLabel = String(currentActiveProfile?.label || "").trim();
    const draftActiveLabel = String(activeBrandOption?.label || "").trim();

    const activeBrandChanged = draftActiveBrandProfile !== currentActiveId;
    const activeBrandLabelChanged = draftActiveLabel !== currentActiveLabel;
    const committedDraftProfiles = draftBrandProfiles.map((item) =>
      item.id === draftActiveBrandProfile
        ? {
            ...item,
            ...normalizeBrandProfile(draftBrandProfile, fallbackBrandProfile),
          }
        : {
            ...item,
            ...normalizeBrandProfile(item, fallbackBrandProfile),
          },
    );
    const brandProfilesChanged =
      JSON.stringify(committedDraftProfiles) !==
      JSON.stringify(nextBrandProfiles);

    return (
      writingStyleChanged ||
      aiChanged ||
      activeBrandChanged ||
      activeBrandLabelChanged ||
      brandProfilesChanged
    );
  }, [
    draftWritingStyle,
    writingStyle,
    draftAiSettings,
    aiSettings,
    draftBrandProfile,
    draftBrandProfiles,
    draftActiveBrandProfile,
    activeBrandOption,
    brandProfiles,
    activeBrandProfile,
    fallbackAiSettings,
    fallbackBrandProfile,
  ]);

  const providerOptions = useMemo(() => {
    const options: Array<{
      value: AiProvider;
      label: string;
      disabled: boolean;
    }> = [
      { value: "auto", label: "Auto (recommended)", disabled: false },
      {
        value: "gateway",
        label: aiCapabilities.gatewayConfigured
          ? "Vercel AI Gateway"
          : "Vercel AI Gateway (missing key)",
        disabled:
          !aiCapabilities.gatewayConfigured &&
          draftAiSettings.provider !== "gateway",
      },
      {
        value: "openai",
        label: aiCapabilities.openaiConfigured
          ? "OpenAI"
          : "OpenAI (missing key)",
        disabled:
          !aiCapabilities.openaiConfigured &&
          draftAiSettings.provider !== "openai",
      },
    ];

    return options;
  }, [
    aiCapabilities.gatewayConfigured,
    aiCapabilities.openaiConfigured,
    draftAiSettings.provider,
  ]);

  const noProviderConfigured =
    !aiCapabilities.gatewayConfigured && !aiCapabilities.openaiConfigured;

  const effectiveProvider =
    draftAiSettings.provider === "auto"
      ? aiCapabilities.gatewayConfigured
        ? "gateway"
        : aiCapabilities.openaiConfigured
          ? "openai"
          : "none"
      : draftAiSettings.provider;
  const providerDocs =
    effectiveProvider === "gateway"
      ? {
          label: "Vercel AI Gateway models",
          url: "https://vercel.com/ai-gateway/models",
        }
      : effectiveProvider === "openai"
        ? {
            label: "OpenAI models",
            url: "https://developers.openai.com/api/docs/models",
          }
        : null;
  const hasBrandProfiles = draftBrandProfiles.length > 0;
  const canAddBrandProfile = draftBrandProfiles.length < MAX_BRAND_PROFILES;

  useEffect(() => {
    const trigger = providerHelpTriggerRef.current;
    if (!open || activeTab !== "ai" || !providerDocs || !trigger) {
      if (providerHelpHideTimerRef.current) {
        window.clearTimeout(providerHelpHideTimerRef.current);
        providerHelpHideTimerRef.current = null;
      }
      if (providerHelpPopoverRef.current) {
        providerHelpPopoverRef.current.remove();
        providerHelpPopoverRef.current = null;
      }
      return;
    }

    function clearHideTimer() {
      if (providerHelpHideTimerRef.current) {
        window.clearTimeout(providerHelpHideTimerRef.current);
        providerHelpHideTimerRef.current = null;
      }
    }

    function removePopover() {
      if (providerHelpPopoverRef.current) {
        providerHelpPopoverRef.current.remove();
        providerHelpPopoverRef.current = null;
      }
    }

    function scheduleHidePopover() {
      clearHideTimer();
      providerHelpHideTimerRef.current = window.setTimeout(() => {
        removePopover();
      }, 140);
    }

    function renderPopover() {
      clearHideTimer();
      if (providerHelpPopoverRef.current) return;

      const popover = new (Popover as any)({
        button: trigger,
        position: "bottom",
        align: "right",
        className: "settings-docs-popover",
      });
      const content = document.createElement("div");
      content.className = "settings-docs-popover-content";
      content.innerHTML = `Models can be found here: <a href="${providerDocs.url}" target="_blank" rel="noreferrer">${providerDocs.url}</a>`;
      popover.setContent(content).render();
      providerHelpPopoverRef.current = popover;

      popover.el.addEventListener("mouseenter", clearHideTimer);
      popover.el.addEventListener("mouseleave", scheduleHidePopover);
    }

    trigger.addEventListener("mouseenter", renderPopover);
    trigger.addEventListener("mouseleave", scheduleHidePopover);
    trigger.addEventListener("focus", renderPopover);
    trigger.addEventListener("blur", scheduleHidePopover);

    return () => {
      trigger.removeEventListener("mouseenter", renderPopover);
      trigger.removeEventListener("mouseleave", scheduleHidePopover);
      trigger.removeEventListener("focus", renderPopover);
      trigger.removeEventListener("blur", scheduleHidePopover);
      clearHideTimer();
      removePopover();
    };
  }, [open, activeTab, providerDocs]);

  function resolveBrandProfilesState() {
    return normalizeBrandProfiles(
      brandProfiles,
      fallbackBrandProfile,
    );
  }

  function resolveBrandById(id: string, profiles: BrandOption[]) {
    return profiles.find((item) => item.id === id) || profiles[0] || null;
  }

  function validateBrandProfilesForSave(profiles: BrandOption[]) {
    for (const profile of profiles) {
      const label = String(profile.label || "").trim();
      const profileName = label || "Unnamed profile";
      const normalized = normalizeBrandProfile(profile, fallbackBrandProfile);

      if (!label) {
        return "Profile label is required.";
      }
      if (!normalized.title) {
        return `Brand name is required for "${profileName}".`;
      }
      if (!normalized.description) {
        return `Description is required for "${profileName}".`;
      }
      if (!normalized.logoUrl) {
        return `Image is required for "${profileName}".`;
      }
      if (!isValidLogoValue(normalized.logoUrl)) {
        return `Image must be a valid URL or uploaded image for "${profileName}".`;
      }
    }

    return "";
  }

  function updateActiveBrandOption(update: Partial<BrandOption>) {
    setDraftBrandProfiles((prev) =>
      prev.map((item) =>
        item.id === draftActiveBrandProfile
          ? {
              ...item,
              ...update,
            }
          : item,
      ),
    );
  }

  function updateActiveBrandLabel(value: string) {
    updateActiveBrandOption({ label: value });
  }

  function getNextBrandLabel(profiles: BrandOption[]) {
    const used = new Set(
      profiles
        .map((item) =>
          String(item.label || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    for (let index = 1; index <= MAX_BRAND_PROFILES; index += 1) {
      const candidate = `Profile ${index}`;
      if (!used.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
    return `Profile ${profiles.length + 1}`;
  }

  function addBrandProfile() {
    if (!canAddBrandProfile) {
      onError?.(`You can add up to ${MAX_BRAND_PROFILES} brand profiles.`);
      return;
    }

    const committed = draftBrandProfiles.map((item) =>
      item.id === draftActiveBrandProfile
        ? {
            ...item,
            ...normalizeBrandProfile(draftBrandProfile, fallbackBrandProfile),
          }
        : item,
    );
    const created = {
      id: `brand_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: getNextBrandLabel(committed),
      ...normalizeBrandProfile({}, fallbackBrandProfile),
    };
    const nextProfiles = [...committed, created];
    setDraftBrandProfiles(nextProfiles);
    setDraftActiveBrandProfile(created.id);
    setDraftBrandProfile(normalizeBrandProfile(created, fallbackBrandProfile));
  }

  function deleteActiveBrandProfile() {
    if (draftBrandProfiles.length <= 1) {
      onError?.("At least one brand profile is required.");
      return;
    }

    const selected = resolveBrandById(
      draftActiveBrandProfile,
      draftBrandProfiles,
    );
    if (!selected) return;
    const confirmed = window.confirm(
      `Delete profile "${selected.label}"? This cannot be undone until you click Save.`,
    );
    if (!confirmed) return;

    const remaining = draftBrandProfiles.filter(
      (item) => item.id !== selected.id,
    );
    if (remaining.length === 0) {
      onError?.("At least one brand profile is required.");
      return;
    }
    const nextActive = remaining[0];
    setDraftBrandProfiles(remaining);
    setDraftActiveBrandProfile(nextActive.id);
    setDraftBrandProfile(
      normalizeBrandProfile(nextActive, fallbackBrandProfile),
    );
  }

  function applyBrandColorPreset(preset: {
    primary: string;
    accent: string;
    background: string;
  }) {
    const nextColors = {
      primary: preset.primary,
      accent: preset.accent,
      background: preset.background,
    };

    setDraftBrandProfile((prev) => ({
      ...prev,
      colors: nextColors,
    }));
    updateActiveBrandOption({ colors: nextColors });
  }

  function changeActiveBrandProfile(nextBrandId: string) {
    const committed = draftBrandProfiles.map((item) =>
      item.id === draftActiveBrandProfile
        ? {
            ...item,
            ...normalizeBrandProfile(draftBrandProfile, fallbackBrandProfile),
          }
        : item,
    );
    setDraftBrandProfiles(committed);
    setDraftActiveBrandProfile(nextBrandId);
    const selected = resolveBrandById(nextBrandId, committed);
    setDraftBrandProfile(
      normalizeBrandProfile(
        selected || fallbackBrandProfile,
        fallbackBrandProfile,
      ),
    );
  }

  function resetDraft() {
    const nextBrandProfiles = resolveBrandProfilesState();
    const nextActiveBrandId =
      String(activeBrandProfile || "").trim() &&
      nextBrandProfiles.some(
        (item) => item.id === String(activeBrandProfile || "").trim(),
      )
        ? String(activeBrandProfile || "").trim()
        : nextBrandProfiles[0]?.id || "";
    const nextActiveBrand = resolveBrandById(
      nextActiveBrandId,
      nextBrandProfiles,
    );

    setDraftWritingStyle(writingStyle || "");
    setDraftAiSettings(normalizeAiSettings(aiSettings, fallbackAiSettings));
    setDraftBrandProfiles(nextBrandProfiles);
    setDraftActiveBrandProfile(nextActiveBrandId);
    setDraftBrandProfile(
      normalizeBrandProfile(
        nextActiveBrand || fallbackBrandProfile,
        fallbackBrandProfile,
      ),
    );
  }

  async function saveSettings() {
    if (!String(draftAiSettings.textModel || "").trim()) {
      onError?.("Text model is required.");
      return;
    }
    if (!String(draftAiSettings.imageModel || "").trim()) {
      onError?.("Image model is required.");
      return;
    }

    if (
      (effectiveProvider === "gateway" || effectiveProvider === "openai") &&
      !isLikelyImageCapableModel(effectiveProvider, draftAiSettings.imageModel)
    ) {
      onError?.(
        `Image model must support image generation for ${
          effectiveProvider === "gateway" ? "Vercel AI Gateway" : "OpenAI"
        }.`,
      );
      return;
    }

    setSavingSettings(true);

    try {
      const committedBrandProfiles = draftBrandProfiles.map((item) =>
        item.id === draftActiveBrandProfile
          ? {
              ...item,
              ...normalizeBrandProfile(draftBrandProfile, fallbackBrandProfile),
            }
          : item,
      );
      const selectedBrand = resolveBrandById(
        draftActiveBrandProfile,
        committedBrandProfiles,
      );
      if (committedBrandProfiles.length > 0) {
        const brandValidationError = validateBrandProfilesForSave(
          committedBrandProfiles,
        );
        if (brandValidationError) {
          onError?.(brandValidationError);
          return;
        }
      }
      const requestBody: Record<string, unknown> = {
        writingStyle: draftWritingStyle,
        aiSettings: draftAiSettings,
      };
      if (committedBrandProfiles.length > 0 && selectedBrand) {
        requestBody.brandProfiles = committedBrandProfiles;
        requestBody.brandProfile = normalizeBrandProfile(
          selectedBrand,
          fallbackBrandProfile,
        );
        requestBody.activeBrandProfile = draftActiveBrandProfile;
        requestBody.activeBrandLabel = String(selectedBrand.label || "").trim();
      }

      const payload = await api<any>("/api/preferences", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });

      const nextWritingStyles = Array.isArray(payload.writingStyles)
        ? payload.writingStyles
        : writingStyles;
      const nextBrandProfiles = normalizeBrandProfiles(
        payload.brandProfiles,
        fallbackBrandProfile,
      );
      const normalizedBrandProfiles =
        nextBrandProfiles.length > 0
          ? nextBrandProfiles
          : committedBrandProfiles;
      const nextActiveBrandProfile =
        String(payload.activeBrandProfile || draftActiveBrandProfile).trim() ||
        normalizedBrandProfiles[0]?.id ||
        "";
      const nextActiveBrand = resolveBrandById(
        nextActiveBrandProfile,
        normalizedBrandProfiles,
      );
      const nextSettings = {
        writingStyle: String(payload.writingStyle || draftWritingStyle),
        writingStyles: nextWritingStyles,
        aiSettings: normalizeAiSettings(payload.aiSettings, fallbackAiSettings),
        brandProfile: normalizeBrandProfile(
          nextActiveBrand || fallbackBrandProfile,
          fallbackBrandProfile,
        ),
        brandProfiles: normalizedBrandProfiles,
        activeBrandProfile: nextActiveBrandProfile,
      };

      setDraftWritingStyle(nextSettings.writingStyle);
      setDraftAiSettings(nextSettings.aiSettings);
      setDraftBrandProfiles(nextSettings.brandProfiles);
      setDraftActiveBrandProfile(nextSettings.activeBrandProfile);
      setDraftBrandProfile(nextSettings.brandProfile);
      onSettingsChange?.(nextSettings);
      onSuccess?.("Settings saved.");
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setSavingSettings(false);
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
      const payload = await api<any>("/api/preferences", {
        method: "POST",
        body: JSON.stringify({
          newToneProfile: { label, description, rules },
        }),
      });

      const nextWritingStyles = Array.isArray(payload.writingStyles)
        ? payload.writingStyles
        : writingStyles;
      const nextWritingStyle = String(
        payload.writingStyle || draftWritingStyle,
      );

      setDraftWritingStyle(nextWritingStyle);
      setNewToneName("");
      setNewToneDescription("");
      setNewToneRules("");

      onSettingsChange?.({
        writingStyle: nextWritingStyle,
        writingStyles: nextWritingStyles,
        aiSettings: normalizeAiSettings(
          payload.aiSettings || draftAiSettings,
          fallbackAiSettings,
        ),
        brandProfile: normalizeBrandProfile(
          payload.brandProfile || draftBrandProfile,
          fallbackBrandProfile,
        ),
        brandProfiles: normalizeBrandProfiles(
          payload.brandProfiles || draftBrandProfiles,
          fallbackBrandProfile,
        ),
        activeBrandProfile: String(
          payload.activeBrandProfile || draftActiveBrandProfile || "",
        ),
      });

      onSuccess?.(
        payload?.mode === "updated"
          ? `Tone profile "${label}" updated and selected.`
          : `Tone profile "${label}" created and selected.`,
      );
    } catch (error) {
      onError?.(getErrorMessage(error));
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
      const result = await api<any>("/api/preferences/tone-extract", {
        method: "POST",
        body: JSON.stringify({ examples }),
      });

      const suggested = result?.suggestedTone || {};
      setNewToneName(String(suggested.label || "").trim());
      setNewToneDescription(String(suggested.description || "").trim());
      setNewToneRules(String(suggested.rules || "").trim());
      onSuccess?.(
        `Extracted tone from ${result?.meta?.exampleCount || "your"} example posts. Review and save.`,
      );
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setExtractingTone(false);
    }
  }

  function updateBrandColor(key: BrandColorKey, value: string) {
    setDraftBrandProfile((prev) => {
      const nextColors = {
        ...prev.colors,
        [key]: value,
      };
      updateActiveBrandOption({ colors: nextColors });
      return {
        ...prev,
        colors: nextColors,
      };
    });
  }

  function selectLogoFile() {
    logoFileInputRef.current?.click();
  }

  function openLogoUrlInput() {
    setLogoUrlInputValue(
      /^https?:\/\//i.test(draftBrandProfile.logoUrl)
        ? draftBrandProfile.logoUrl
        : "",
    );
    setShowLogoUrlInput(true);
  }

  function applyLogoUrlInput() {
    const logoUrl = logoUrlInputValue.trim();
    if (!logoUrl) {
      onError?.("Image URL cannot be empty.");
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(logoUrl)) {
      onError?.("Please provide a valid http(s) image URL.");
      return;
    }

    setDraftBrandProfile((prev) => ({
      ...prev,
      logoUrl,
    }));
    updateActiveBrandOption({ logoUrl });
    setShowLogoUrlInput(false);
  }

  function cancelLogoUrlInput() {
    setShowLogoUrlInput(false);
    setLogoUrlInputValue("");
  }

  async function onLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      onError?.("Please choose an image file.");
      event.currentTarget.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      onError?.("Please choose an image under 2MB.");
      event.currentTarget.value = "";
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () =>
          reject(new Error("Failed to read the selected image."));
        reader.readAsDataURL(file);
      });

      if (!/^data:image\//i.test(dataUrl)) {
        onError?.("Could not read this image file.");
        return;
      }

      setDraftBrandProfile((prev) => ({
        ...prev,
        logoUrl: dataUrl,
      }));
      updateActiveBrandOption({ logoUrl: dataUrl });
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      event.currentTarget.value = "";
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="repo-manager-overlay"
        aria-label="Close settings"
        onClick={onClose}
      />

      <section
        className={`settings-modal panel ${activeTab === "ai" ? "settings-modal-ai" : ""}`}
        aria-label="Settings manager"
      >
        <div className="settings-head">
          <div>
            <p className="tiny">workspace setup</p>
            <h3>Settings</h3>
            <p className="soft compact-note">
              Configure models, tone, and brand in one place.
            </p>
          </div>
          <button className="btn btn-compact" onClick={onClose}>
            Close
          </button>
        </div>

        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Settings sections"
        >
          <button
            type="button"
            className={`settings-tab ${activeTab === "ai" ? "settings-tab-active" : ""}`}
            role="tab"
            aria-selected={activeTab === "ai"}
            onClick={() => setActiveTab("ai")}
          >
            AI
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === "tone" ? "settings-tab-active" : ""}`}
            role="tab"
            aria-selected={activeTab === "tone"}
            onClick={() => setActiveTab("tone")}
          >
            Tone
          </button>
          <button
            type="button"
            className={`settings-tab ${activeTab === "brand" ? "settings-tab-active" : ""}`}
            role="tab"
            aria-selected={activeTab === "brand"}
            onClick={() => setActiveTab("brand")}
          >
            Brand
          </button>
        </div>

        <div className="settings-body">
          {activeTab === "ai" ? (
            <section
              className="settings-panel settings-grid"
              aria-label="AI settings"
            >
              <label className="settings-field settings-field-full">
                <span className="tiny">Provider</span>
                <select
                  className="style-select"
                  value={draftAiSettings.provider}
                  onChange={(event) =>
                    setDraftAiSettings((prev) => {
                      const nextProvider = normalizeProvider(
                        event.target.value,
                      );
                      let nextImageModel = prev.imageModel;

                      if (
                        nextProvider === "openai" &&
                        nextImageModel.includes("/") &&
                        !nextImageModel.startsWith("openai/")
                      ) {
                        nextImageModel =
                          aiCapabilities.defaultOpenAIImageModel ||
                          "gpt-image-1";
                      }

                      if (
                        nextProvider === "gateway" &&
                        !nextImageModel.includes("/")
                      ) {
                        nextImageModel =
                          aiCapabilities.defaultGatewayImageModel ||
                          "google/gemini-2.5-flash-image";
                      }

                      return {
                        ...prev,
                        provider: nextProvider,
                        imageModel: nextImageModel,
                      };
                    })
                  }
                >
                  {providerOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="settings-model-row settings-field-full">
                <label className="settings-field settings-model-item">
                  <span className="tiny">Text model</span>
                  <input
                    className="search"
                    value={draftAiSettings.textModel}
                    onChange={(event) =>
                      setDraftAiSettings((prev) => ({
                        ...prev,
                        textModel: event.target.value,
                      }))
                    }
                    placeholder={
                      aiCapabilities.defaultTextModel || "openai/o4-mini"
                    }
                  />
                </label>

                <label className="settings-field settings-model-item">
                  <span className="tiny">Image model</span>
                  <input
                    className="search"
                    value={draftAiSettings.imageModel}
                    onChange={(event) =>
                      setDraftAiSettings((prev) => ({
                        ...prev,
                        imageModel: event.target.value,
                      }))
                    }
                    placeholder={
                      effectiveProvider === "openai"
                        ? aiCapabilities.defaultOpenAIImageModel ||
                          "gpt-image-1"
                        : aiCapabilities.defaultGatewayImageModel ||
                          "google/gemini-2.5-flash-image"
                    }
                  />
                </label>
              </div>

              <div className="settings-note-row">
                <p className="soft settings-note">
                  Effective provider:{" "}
                  <strong>
                    {effectiveProvider === "gateway"
                      ? "Vercel AI Gateway"
                      : effectiveProvider === "openai"
                        ? "OpenAI"
                        : "None"}
                  </strong>
                  {providerDocs ? (
                    <span className="settings-provider-help">
                      <button
                        ref={providerHelpTriggerRef}
                        type="button"
                        className="settings-help-icon"
                        aria-label={`Model docs for ${providerDocs.label}`}
                      >
                        ?
                      </button>
                    </span>
                  ) : null}
                </p>
                {noProviderConfigured ? (
                  <p className="error-text">
                    No provider key configured. Add Vercel AI Gateway or OpenAI
                    key in environment.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeTab === "tone" ? (
            <section className="settings-panel" aria-label="Tone settings">
              <div className="tone-method">
                <p className="tiny tone-method-label">Active tone profile</p>
                <div className="tone-style-row">
                  <div className="tone-select-wrap">
                    <select
                      className="style-select tone-select-control"
                      aria-label="Tone profile"
                      value={draftWritingStyle}
                      onChange={(event) =>
                        setDraftWritingStyle(event.target.value)
                      }
                    >
                      {(writingStyles || []).map((style) => (
                        <option key={style.id} value={style.id}>
                          {style.label}{" "}
                          {style.isPreset ? "(Preset)" : "(Custom)"}
                        </option>
                      ))}
                    </select>
                    <span className="tone-select-chevron" aria-hidden="true">
                      ▾
                    </span>
                  </div>
                </div>

                {selectedWritingStyle ? (
                  <p className="tone-style-meta">
                    <span
                      className={`chip ${selectedWritingStyle.isPreset ? "chip-on" : ""}`}
                    >
                      {selectedWritingStyle.isPreset ? "Preset" : "Custom"}
                    </span>
                    <span>
                      {selectedWritingStyle.description ||
                        "Applies this tone to newly generated drafts."}
                    </span>
                  </p>
                ) : null}
              </div>

              <details className="tone-extract-inline tone-extract-wow settings-subsection">
                <summary>
                  <span className="tone-extract-kicker">AI</span>
                  <span className="tone-extract-title">
                    Extract from example posts
                  </span>
                  <span className="tone-extract-prompt">Optional</span>
                </summary>
                <section className="tone-extract-block">
                  <p className="soft tone-extract-help">
                    Paste 3-5 recent posts. We infer your tone and prefill the
                    custom tone fields.
                  </p>
                  <textarea
                    className="draft-editor tone-examples-input"
                    rows={5}
                    value={toneExamplesText}
                    onChange={(event) =>
                      setToneExamplesText(event.target.value)
                    }
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

              <div className="tone-builder settings-subsection">
                <p className="tiny">Create or update custom tone</p>
                <input
                  className="search"
                  value={newToneName}
                  onChange={(event) => setNewToneName(event.target.value)}
                  placeholder="Tone name (e.g. Builder Voice)"
                />
                <input
                  className="search"
                  value={newToneDescription}
                  onChange={(event) =>
                    setNewToneDescription(event.target.value)
                  }
                  placeholder="Short description"
                />
                <textarea
                  className="draft-editor"
                  rows={5}
                  value={newToneRules}
                  onChange={(event) => setNewToneRules(event.target.value)}
                  placeholder="How this tone should write (POV, sentence style, CTA style, etc.)"
                />
                <div className="tone-builder-actions">
                  <button
                    className="btn btn-compact"
                    disabled={
                      creatingTone ||
                      !newToneName.trim() ||
                      !newToneRules.trim()
                    }
                    onClick={createToneProfile}
                  >
                    {creatingTone ? "Saving..." : "Save custom tone"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === "brand" ? (
            <section
              className="settings-panel settings-grid"
              aria-label="Brand settings"
            >
              <div className="settings-field settings-field-full">
                <span className="tiny">Select active profiles</span>
                <div className="settings-brand-grid">
                  {(draftBrandProfiles || []).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`settings-brand-preview settings-brand-selector-card ${
                        item.id === draftActiveBrandProfile
                          ? "settings-brand-preview-active"
                          : ""
                      }`}
                      onClick={() => changeActiveBrandProfile(item.id)}
                      aria-pressed={item.id === draftActiveBrandProfile}
                      style={{
                        background: item.colors.background,
                        borderColor: item.colors.primary,
                      }}
                    >
                      {item.logoUrl ? (
                        <img
                          src={item.logoUrl}
                          alt={`${item.label} logo preview`}
                          className="settings-brand-logo"
                        />
                      ) : (
                        <div
                          className="settings-brand-logo settings-brand-logo-fallback"
                          style={{ background: item.colors.accent }}
                        >
                          LOGO
                        </div>
                      )}
                      <div>
                        <div className="settings-brand-card-head">
                          <p className="tiny">Profile: {item.label}</p>
                          {item.id === draftActiveBrandProfile ? (
                            <span className="settings-brand-active-pill">
                              Active
                            </span>
                          ) : null}
                        </div>
                        <h4 style={{ color: item.colors.primary }}>
                          {item.title || "Your brand name"}
                        </h4>
                        <p className="settings-brand-desc">
                          {item.description ||
                            "Your brand description appears here."}
                        </p>
                      </div>
                    </button>
                  ))}
                  {canAddBrandProfile ? (
                    <button
                      type="button"
                      className="settings-brand-add-card"
                      onClick={addBrandProfile}
                      aria-label="Add brand profile"
                    >
                      <span aria-hidden="true">+</span>
                      <small>Add profile</small>
                    </button>
                  ) : null}
                </div>
              </div>

              {hasBrandProfiles ? (
                <>
                  <label className="settings-field settings-field-full">
                <span className="tiny">Profile label (UI only)</span>
                <input
                  className="search"
                  value={activeBrandOption?.label || ""}
                  onChange={(event) =>
                    updateActiveBrandLabel(event.target.value)
                  }
                  placeholder="e.g. Main Product"
                  maxLength={64}
                />
              </label>

              <label className="settings-field settings-field-full">
                <span className="tiny">Brand name</span>
                <input
                  className="search"
                  value={draftBrandProfile.title}
                  onChange={(event) =>
                    setDraftBrandProfile((prev) => {
                      const title = event.target.value;
                      updateActiveBrandOption({ title });
                      return {
                        ...prev,
                        title,
                      };
                    })
                  }
                  placeholder="Ship - Social"
                  maxLength={120}
                />
              </label>

              <label className="settings-field settings-field-full">
                <span className="tiny">Description</span>
                <textarea
                  className="draft-editor"
                  rows={3}
                  value={draftBrandProfile.description}
                  onChange={(event) =>
                    setDraftBrandProfile((prev) => {
                      const description = event.target.value;
                      updateActiveBrandOption({ description });
                      return {
                        ...prev,
                        description,
                      };
                    })
                  }
                  placeholder="One-line description of your brand"
                  maxLength={280}
                />
              </label>

              <div className="settings-field settings-field-full">
                <p className="tiny">Image</p>
                <div className="settings-image-field">
                  <button
                    type="button"
                    className="settings-image-preview-btn"
                    onClick={selectLogoFile}
                    aria-label="Upload brand image"
                  >
                    {draftBrandProfile.logoUrl ? (
                      <img
                        src={draftBrandProfile.logoUrl}
                        alt="Brand image preview"
                        className="settings-brand-logo"
                      />
                    ) : (
                      <div
                        className="settings-brand-logo settings-brand-logo-fallback"
                        style={{ background: draftBrandProfile.colors.accent }}
                      >
                        LOGO
                      </div>
                    )}
                  </button>
                  <div className="settings-image-actions">
                    <div className="settings-image-actions-row">
                      <button
                        type="button"
                        className="btn btn-compact"
                        onClick={selectLogoFile}
                      >
                        Upload
                      </button>
                      <button
                        type="button"
                        className="btn btn-compact"
                        onClick={openLogoUrlInput}
                      >
                        Paste URL
                      </button>
                      <button
                        type="button"
                        className="btn btn-compact"
                        onClick={() =>
                          setDraftBrandProfile((prev) => {
                            updateActiveBrandOption({ logoUrl: "" });
                            setShowLogoUrlInput(false);
                            setLogoUrlInputValue("");
                            return {
                              ...prev,
                              logoUrl: "",
                            };
                          })
                        }
                      >
                        Clear
                      </button>
                    </div>
                    <p className="soft settings-image-help">
                      Click the image card to upload. URL input is optional via
                      Paste URL.
                    </p>
                    {showLogoUrlInput ? (
                      <div className="settings-image-url-inline">
                        <input
                          className="search"
                          value={logoUrlInputValue}
                          onChange={(event) =>
                            setLogoUrlInputValue(event.target.value)
                          }
                          placeholder="https://..."
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              applyLogoUrlInput();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-compact"
                          onClick={applyLogoUrlInput}
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          className="btn btn-compact"
                          onClick={cancelLogoUrlInput}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onLogoFileChange}
                    style={{ display: "none" }}
                  />
                </div>
              </div>

              <div className="settings-field settings-field-full">
                <span className="tiny">Color (preset)</span>
                <div className="settings-color-preset-row">
                  {BRAND_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className="settings-color-preset"
                      onClick={() => applyBrandColorPreset(preset)}
                      title={`${preset.name} preset`}
                    >
                      <span style={{ background: preset.primary }} />
                      <span style={{ background: preset.accent }} />
                      <span style={{ background: preset.background }} />
                      <em>{preset.name}</em>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-field settings-field-full">
                <span className="tiny">Color (custom)</span>
                <div className="settings-color-controls">
                  <div className="settings-color-toggle">
                    {(
                      ["primary", "accent", "background"] as BrandColorKey[]
                    ).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`settings-color-key ${activeColorKey === key ? "settings-color-key-active" : ""}`}
                        onClick={() => setActiveColorKey(key)}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="settings-color-picker-wrap">
                    <HexColorPicker
                      color={draftBrandProfile.colors[activeColorKey]}
                      onChange={(value) =>
                        updateBrandColor(activeColorKey, value)
                      }
                    />
                  </div>
                  <div className="settings-color-input-row">
                    <label className="settings-field">
                      <span className="tiny">Primary</span>
                      <input
                        className="search"
                        value={draftBrandProfile.colors.primary}
                        onChange={(event) =>
                          updateBrandColor("primary", event.target.value)
                        }
                        placeholder="#5ea2ff"
                      />
                    </label>
                    <label className="settings-field">
                      <span className="tiny">Accent</span>
                      <input
                        className="search"
                        value={draftBrandProfile.colors.accent}
                        onChange={(event) =>
                          updateBrandColor("accent", event.target.value)
                        }
                        placeholder="#92edce"
                      />
                    </label>
                    <label className="settings-field">
                      <span className="tiny">Background</span>
                      <input
                        className="search"
                        value={draftBrandProfile.colors.background}
                        onChange={(event) =>
                          updateBrandColor("background", event.target.value)
                        }
                        placeholder="#fcfcff"
                      />
                    </label>
                  </div>
                </div>
              </div>
                </>
              ) : (
                <p className="soft settings-note">
                  No brand profiles yet. Click <strong>+ Add profile</strong> to
                  create your first one.
                </p>
              )}
            </section>
          ) : null}
        </div>

        <footer className="settings-footer">
          {activeTab === "brand" && draftBrandProfiles.length > 0 ? (
            <button
              className="btn btn-compact settings-danger-btn"
              disabled={savingSettings || draftBrandProfiles.length <= 1}
              onClick={deleteActiveBrandProfile}
            >
              Delete profile
            </button>
          ) : null}
          <button
            className="btn btn-compact"
            disabled={savingSettings || !isDirty}
            onClick={resetDraft}
          >
            Reset
          </button>
          <button
            className="btn btn-primary"
            disabled={savingSettings || !isDirty}
            onClick={saveSettings}
          >
            {savingSettings ? "Saving..." : "Save changes"}
          </button>
        </footer>
      </section>
    </>
  );
}
