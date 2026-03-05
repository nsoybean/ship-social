export function defaultState() {
  return {
    users: [],
    sessions: [],
    connectedRepos: [],
    manualRuns: [],
    drafts: [],
    inboxItems: []
  };
}

export function sanitizeState(raw) {
  const base = defaultState();
  const value = raw && typeof raw === "object" ? raw : {};

  return {
    users: Array.isArray(value.users) ? value.users : base.users,
    sessions: Array.isArray(value.sessions) ? value.sessions : base.sessions,
    connectedRepos: Array.isArray(value.connectedRepos) ? value.connectedRepos : base.connectedRepos,
    manualRuns: Array.isArray(value.manualRuns) ? value.manualRuns : base.manualRuns,
    drafts: Array.isArray(value.drafts) ? value.drafts : base.drafts,
    inboxItems: Array.isArray(value.inboxItems) ? value.inboxItems : base.inboxItems
  };
}
