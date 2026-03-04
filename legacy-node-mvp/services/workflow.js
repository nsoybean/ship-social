const { readState, withState } = require("../store");
const { id, token } = require("../utils/id");
const { parseRepoFullName, fetchLatestRelease } = require("./github");
const { createVariants, createThread } = require("./generation");
const { makeCard } = require("./image");
const { publishToX } = require("./publishing");

function nowIso() {
  return new Date().toISOString();
}

function createWorkflow({ appUrl }) {
  let enqueue = null;

  function setEnqueue(enqueueFn) {
    enqueue = enqueueFn;
  }

  function requireQueue() {
    if (!enqueue) {
      throw new Error("Queue is not ready");
    }
    return enqueue;
  }

  function ensureUserByEmail(emailInput) {
    const email = String(emailInput || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("Valid email is required");
    }

    return withState((state) => {
      let user = state.users.find((item) => item.email === email);
      if (!user) {
        user = {
          id: id("usr"),
          email,
          githubToken: null,
          xAccessToken: null,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        state.users.push(user);
      }
      return { ...user };
    });
  }

  function createSession(userId) {
    const sessionToken = token("sess");
    withState((state) => {
      state.sessions = state.sessions.filter((item) => item.userId !== userId);
      state.sessions.push({
        id: id("ses"),
        userId,
        token: sessionToken,
        createdAt: nowIso()
      });
    });
    return sessionToken;
  }

  function getUserBySession(sessionToken) {
    const tokenValue = String(sessionToken || "").trim();
    if (!tokenValue) {
      return null;
    }

    const state = readState();
    const session = state.sessions.find((item) => item.token === tokenValue);
    if (!session) {
      return null;
    }

    const user = state.users.find((item) => item.id === session.userId);
    if (!user) {
      return null;
    }

    return { ...user };
  }

  function getBranding(userId) {
    const state = readState();
    return state.brandingProfiles.find((item) => item.userId === userId) || null;
  }

  function upsertBranding(userId, input) {
    const payload = {
      logoUrl: String(input.logoUrl || "").trim(),
      primaryColor: String(input.primaryColor || "#1c8dff").trim(),
      tone: String(input.tone || "Transparent builder").trim() || "Transparent builder",
      audience: String(input.audience || "Developers").trim() || "Developers"
    };

    withState((state) => {
      const existing = state.brandingProfiles.find((item) => item.userId === userId);
      if (existing) {
        existing.logoUrl = payload.logoUrl;
        existing.primaryColor = payload.primaryColor;
        existing.tone = payload.tone;
        existing.audience = payload.audience;
        existing.updatedAt = nowIso();
        return;
      }

      state.brandingProfiles.push({
        id: id("brand"),
        userId,
        ...payload,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    });

    return getBranding(userId);
  }

  function updateUserTokens(userId, input) {
    const payload = {
      githubToken: typeof input.githubToken === "string" ? input.githubToken.trim() : undefined,
      xAccessToken: typeof input.xAccessToken === "string" ? input.xAccessToken.trim() : undefined
    };

    return withState((state) => {
      const user = state.users.find((item) => item.id === userId);
      if (!user) {
        throw new Error("User not found");
      }

      if (payload.githubToken !== undefined) {
        user.githubToken = payload.githubToken || null;
      }
      if (payload.xAccessToken !== undefined) {
        user.xAccessToken = payload.xAccessToken || null;
      }

      user.updatedAt = nowIso();
      return { ...user };
    });
  }

  function listRepos(userId) {
    const state = readState();
    return state.repos
      .filter((repo) => repo.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((repo) => ({ ...repo }));
  }

  function connectRepo(userId, input) {
    const parsed = parseRepoFullName(input.repoFullName);
    const autoGenerate = input.autoGenerate !== false;

    if (typeof input.githubToken === "string") {
      updateUserTokens(userId, { githubToken: input.githubToken });
    }

    return withState((state) => {
      let repo = state.repos.find((item) => item.userId === userId && item.repoFullName === parsed.fullName);
      if (!repo) {
        repo = {
          id: id("repo"),
          userId,
          repoName: parsed.repo,
          repoOwner: parsed.owner,
          repoFullName: parsed.fullName,
          defaultBranch: "main",
          webhookEnabled: autoGenerate,
          autoGenerate,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        state.repos.push(repo);
      } else {
        repo.autoGenerate = autoGenerate;
        repo.webhookEnabled = autoGenerate;
        repo.updatedAt = nowIso();
      }

      return { ...repo };
    });
  }

  function setRepoAutomation(userId, repoId, autoGenerate) {
    return withState((state) => {
      const repo = state.repos.find((item) => item.id === repoId && item.userId === userId);
      if (!repo) {
        throw new Error("Repository not found");
      }

      repo.autoGenerate = Boolean(autoGenerate);
      repo.webhookEnabled = Boolean(autoGenerate);
      repo.updatedAt = nowIso();
      return { ...repo };
    });
  }

  function triggerManualGenerate(userId, repoId) {
    const state = readState();
    const repo = state.repos.find((item) => item.id === repoId && item.userId === userId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    return requireQueue()("ingest_release", {
      repoId,
      mode: "manual_latest"
    });
  }

  function listReleases(userId) {
    const state = readState();
    const repoIds = new Set(state.repos.filter((repo) => repo.userId === userId).map((repo) => repo.id));
    return state.releases
      .filter((release) => repoIds.has(release.repoId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((release) => ({ ...release }));
  }

  function listPosts(userId) {
    const state = readState();
    return state.postDrafts
      .filter((draft) => draft.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((draft) => {
        const release = state.releases.find((item) => item.id === draft.releaseId) || null;
        const image = draft.imageAssetId ? state.mediaAssets.find((asset) => asset.id === draft.imageAssetId) : null;
        const latestAttempt = state.publishAttempts
          .filter((attempt) => attempt.postDraftId === draft.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;

        return {
          ...draft,
          release,
          image,
          latestAttempt
        };
      });
  }

  function listInbox(userId) {
    const state = readState();
    return state.inboxItems
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((item) => {
        const draft = state.postDrafts.find((post) => post.id === item.postDraftId) || null;
        const release = draft ? state.releases.find((entry) => entry.id === draft.releaseId) : null;
        return {
          ...item,
          draftStatus: draft ? draft.status : null,
          releaseTitle: release ? release.title : null
        };
      });
  }

  function getApprovalByToken(approvalToken) {
    const value = String(approvalToken || "").trim();
    const state = readState();
    const approval = state.approvals.find((item) => item.token === value);
    if (!approval) {
      return null;
    }

    const draft = state.postDrafts.find((item) => item.id === approval.postDraftId);
    if (!draft) {
      return null;
    }

    const release = state.releases.find((item) => item.id === draft.releaseId) || null;
    const repo = release ? state.repos.find((item) => item.id === release.repoId) : null;
    const image = draft.imageAssetId ? state.mediaAssets.find((asset) => asset.id === draft.imageAssetId) : null;

    return {
      approval,
      draft,
      release,
      repo,
      image
    };
  }

  function regenerateFromApprovalToken(approvalToken) {
    const bundle = getApprovalByToken(approvalToken);
    if (!bundle) {
      throw new Error("Approval not found");
    }

    return requireQueue()("generate_posts", {
      releaseId: bundle.draft.releaseId,
      reason: "manual_regenerate"
    });
  }

  function approveDraft(approvalToken, input) {
    const selectedVariantId = String(input.selectedVariantId || "").trim();
    const editedText = typeof input.editedText === "string" ? input.editedText.trim() : "";

    return withState((state) => {
      const approval = state.approvals.find((item) => item.token === approvalToken);
      if (!approval) {
        throw new Error("Approval token not found");
      }

      const draft = state.postDrafts.find((item) => item.id === approval.postDraftId);
      if (!draft) {
        throw new Error("Draft not found");
      }

      if (selectedVariantId) {
        const variantExists = draft.variants.some((variant) => variant.id === selectedVariantId);
        if (!variantExists) {
          throw new Error("Selected variant does not exist");
        }
        draft.selectedVariantId = selectedVariantId;
      } else if (!draft.selectedVariantId && draft.variants.length > 0) {
        draft.selectedVariantId = draft.variants[0].id;
      }

      if (editedText) {
        const activeId = draft.selectedVariantId || (draft.variants[0] && draft.variants[0].id);
        if (!activeId) {
          throw new Error("No variant available to edit");
        }

        const current = draft.variants.find((variant) => variant.id === activeId);
        if (!current) {
          throw new Error("Variant not found");
        }

        current.text = editedText;
      }

      approval.status = "approved";
      approval.approvedAt = nowIso();
      approval.updatedAt = nowIso();
      draft.status = "approved";
      draft.updatedAt = nowIso();

      return {
        approval: { ...approval },
        draft: { ...draft }
      };
    });
  }

  function requestPublish(approvalToken) {
    const bundle = getApprovalByToken(approvalToken);
    if (!bundle) {
      throw new Error("Approval not found");
    }

    if (bundle.approval.status !== "approved" && bundle.approval.status !== "published") {
      throw new Error("Draft must be approved before publishing");
    }

    withState((state) => {
      const draft = state.postDrafts.find((item) => item.id === bundle.draft.id);
      if (draft) {
        draft.status = "publishing";
        draft.updatedAt = nowIso();
      }
    });

    return requireQueue()("publish_post", {
      approvalId: bundle.approval.id
    });
  }

  function handleGithubReleaseWebhook(webhookRelease) {
    const state = readState();
    const targets = state.repos.filter(
      (repo) => repo.repoFullName === webhookRelease.repoFullName && repo.webhookEnabled
    );

    const jobs = targets.map((repo) =>
      requireQueue()("ingest_release", {
        repoId: repo.id,
        mode: "webhook",
        releaseData: webhookRelease.release
      })
    );

    return jobs;
  }

  async function ingestReleaseJob(job) {
    const { repoId, mode, releaseData } = job.payload;
    const state = readState();
    const repo = state.repos.find((item) => item.id === repoId);
    if (!repo) {
      throw new Error("Repository not found for ingest");
    }

    const user = state.users.find((item) => item.id === repo.userId);
    if (!user) {
      throw new Error("User not found for repository");
    }

    let normalizedRelease = releaseData;
    if (mode === "manual_latest") {
      const latest = await fetchLatestRelease({
        repoFullName: repo.repoFullName,
        githubToken: user.githubToken
      });
      normalizedRelease = latest.release;
    }

    if (!normalizedRelease || !normalizedRelease.githubReleaseId) {
      throw new Error("Unable to resolve release data");
    }

    const releaseId = withState((next) => {
      let release = next.releases.find(
        (item) => item.repoId === repo.id && item.githubReleaseId === String(normalizedRelease.githubReleaseId)
      );

      if (!release) {
        release = {
          id: id("rel"),
          repoId: repo.id,
          githubReleaseId: String(normalizedRelease.githubReleaseId),
          title: normalizedRelease.title || normalizedRelease.tag || "Untitled release",
          body: normalizedRelease.body || "",
          tag: normalizedRelease.tag || "",
          url: normalizedRelease.url || `https://github.com/${repo.repoFullName}/releases`,
          status: "ingested",
          processed: false,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        next.releases.push(release);
      } else {
        release.title = normalizedRelease.title || release.title;
        release.body = normalizedRelease.body || release.body;
        release.tag = normalizedRelease.tag || release.tag;
        release.url = normalizedRelease.url || release.url;
        release.status = "ingested";
        release.updatedAt = nowIso();
      }

      return release.id;
    });

    requireQueue()("generate_posts", { releaseId, reason: mode });
  }

  async function generatePostsJob(job) {
    const { releaseId } = job.payload;
    const state = readState();

    const release = state.releases.find((item) => item.id === releaseId);
    if (!release) {
      throw new Error("Release not found for generation");
    }

    const repo = state.repos.find((item) => item.id === release.repoId);
    if (!repo) {
      throw new Error("Repository not found for release");
    }

    const user = state.users.find((item) => item.id === repo.userId);
    if (!user) {
      throw new Error("User not found for release");
    }

    const branding = state.brandingProfiles.find((item) => item.userId === user.id) || {
      primaryColor: "#1c8dff",
      tone: "Transparent builder",
      audience: "Developers",
      logoUrl: ""
    };

    const variants = createVariants({
      release,
      repoName: repo.repoName,
      branding
    }).map((variant) => ({
      id: id("var"),
      type: variant.type,
      text: variant.text
    }));

    const thread = createThread({ release, repoName: repo.repoName });

    const card = makeCard({
      title: release.title,
      subtitle: repo.repoFullName,
      version: release.tag || "latest",
      primaryColor: branding.primaryColor,
      logoUrl: branding.logoUrl
    });

    withState((next) => {
      let media = next.mediaAssets.find((asset) => asset.releaseId === release.id && asset.type === "release_card");
      if (!media) {
        media = {
          id: id("img"),
          releaseId: release.id,
          type: "release_card",
          dataUrl: card.dataUrl,
          svg: card.svg,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        next.mediaAssets.push(media);
      } else {
        media.dataUrl = card.dataUrl;
        media.svg = card.svg;
        media.updatedAt = nowIso();
      }

      let draft = next.postDrafts.find((item) => item.releaseId === release.id);
      if (!draft) {
        draft = {
          id: id("draft"),
          releaseId: release.id,
          userId: user.id,
          selectedVariantId: variants[0].id,
          variants,
          thread,
          imageAssetId: media.id,
          status: "draft_ready",
          publishedText: null,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        next.postDrafts.push(draft);
      } else {
        draft.variants = variants;
        draft.thread = thread;
        draft.selectedVariantId = variants[0].id;
        draft.imageAssetId = media.id;
        draft.status = "draft_ready";
        draft.updatedAt = nowIso();
      }

      next.approvals.forEach((item) => {
        if (item.postDraftId === draft.id && item.status === "pending") {
          item.status = "expired";
          item.updatedAt = nowIso();
        }
      });

      const approvalToken = token("apr");
      const approval = {
        id: id("apr"),
        userId: user.id,
        postDraftId: draft.id,
        token: approvalToken,
        status: "pending",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        approvedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      next.approvals.push(approval);

      next.inboxItems.push({
        id: id("inbox"),
        userId: user.id,
        kind: "draft_ready",
        title: `Draft ready: ${release.title}`,
        body: `${repo.repoFullName} ${release.tag || ""}`.trim(),
        postDraftId: draft.id,
        approvalId: approval.id,
        approvalToken,
        link: `${appUrl}/?approval=${approvalToken}`,
        status: "unread",
        createdAt: nowIso(),
        updatedAt: nowIso()
      });

      const trackedRelease = next.releases.find((item) => item.id === release.id);
      if (trackedRelease) {
        trackedRelease.processed = true;
        trackedRelease.status = "draft_ready";
        trackedRelease.updatedAt = nowIso();
      }
    });
  }

  async function publishPostJob(job) {
    const { approvalId } = job.payload;
    const state = readState();
    const approval = state.approvals.find((item) => item.id === approvalId);
    if (!approval) {
      throw new Error("Approval not found for publish");
    }

    const draft = state.postDrafts.find((item) => item.id === approval.postDraftId);
    if (!draft) {
      throw new Error("Draft not found for publish");
    }

    const user = state.users.find((item) => item.id === draft.userId);
    if (!user) {
      throw new Error("User not found for publish");
    }

    const release = state.releases.find((item) => item.id === draft.releaseId);
    if (!release) {
      throw new Error("Release not found for publish");
    }

    const selected = draft.variants.find((variant) => variant.id === draft.selectedVariantId) || draft.variants[0];
    if (!selected) {
      throw new Error("No draft variation available");
    }

    const publishedText = selected.text;
    const result = await publishToX({
      text: publishedText,
      accessToken: user.xAccessToken
    });

    withState((next) => {
      const trackedApproval = next.approvals.find((item) => item.id === approval.id);
      const trackedDraft = next.postDrafts.find((item) => item.id === draft.id);

      next.publishAttempts.push({
        id: id("pub"),
        postDraftId: draft.id,
        channel: "x",
        status: result.ok ? "success" : result.mode === "copy_fallback" ? "copied" : "failed",
        response: result.response,
        error: result.ok ? null : result.response && result.response.warning ? result.response.warning : null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });

      if (trackedDraft) {
        trackedDraft.publishedText = publishedText;
        trackedDraft.status = result.ok ? "published" : "copy_ready";
        trackedDraft.updatedAt = nowIso();
      }

      if (trackedApproval) {
        trackedApproval.status = result.ok ? "published" : "approved";
        trackedApproval.updatedAt = nowIso();
      }

      next.inboxItems.push({
        id: id("inbox"),
        userId: user.id,
        kind: result.ok ? "published" : "copy_ready",
        title: result.ok ? `Published: ${release.title}` : `Ready to copy: ${release.title}`,
        body: result.ok
          ? "Your post is live on X."
          : "X token missing or invalid. Copy-ready text is available in the draft.",
        postDraftId: draft.id,
        approvalId: approval.id,
        approvalToken: approval.token,
        link: `${appUrl}/?approval=${approval.token}`,
        status: "unread",
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    });
  }

  return {
    setEnqueue,
    handlers: {
      ingest_release: ingestReleaseJob,
      generate_posts: generatePostsJob,
      publish_post: publishPostJob
    },
    auth: {
      loginWithEmail(email) {
        const user = ensureUserByEmail(email);
        const sessionToken = createSession(user.id);
        return {
          user,
          sessionToken
        };
      },
      me(sessionToken) {
        const user = getUserBySession(sessionToken);
        if (!user) {
          return null;
        }

        return {
          ...user,
          githubToken: user.githubToken ? "configured" : null,
          xAccessToken: user.xAccessToken ? "configured" : null
        };
      },
      sessionUser(sessionToken) {
        return getUserBySession(sessionToken);
      }
    },
    settings: {
      updateTokens: updateUserTokens,
      getBranding,
      upsertBranding
    },
    repos: {
      list: listRepos,
      connect: connectRepo,
      setAutomation: setRepoAutomation,
      triggerManualGenerate
    },
    releases: {
      list: listReleases
    },
    posts: {
      list: listPosts
    },
    inbox: {
      list: listInbox,
      getApprovalByToken,
      regenerateFromApprovalToken,
      approveDraft,
      requestPublish
    },
    webhooks: {
      handleGithubReleaseWebhook
    }
  };
}

module.exports = {
  createWorkflow
};
