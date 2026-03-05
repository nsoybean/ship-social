CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id TEXT NOT NULL UNIQUE,
  github_login TEXT NOT NULL DEFAULT '',
  github_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  writing_style TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS connected_repos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false,
  default_branch TEXT NOT NULL DEFAULT 'main',
  auto_generate BOOLEAN NOT NULL DEFAULT true,
  last_manual_trigger_at TIMESTAMPTZ NULL,
  last_release_tag TEXT NULL,
  last_release_title TEXT NULL,
  last_trigger_status TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, github_repo_id)
);
CREATE INDEX IF NOT EXISTS idx_connected_repos_user_id ON connected_repos(user_id);

CREATE TABLE IF NOT EXISTS manual_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES connected_repos(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT NULL,
  release JSONB NULL,
  triggered_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manual_runs_user_id_triggered_at ON manual_runs(user_id, triggered_at DESC);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id TEXT NOT NULL REFERENCES connected_repos(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES manual_runs(id) ON DELETE CASCADE,
  release JSONB NULL,
  writing_style_id TEXT NOT NULL,
  generation_source TEXT NULL,
  generation_status TEXT NULL,
  generation_model TEXT NULL,
  generation_error TEXT NULL,
  image_data_url TEXT NULL,
  image_prompt TEXT NULL,
  selected_variant_id TEXT NULL,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_user_id_updated_at ON drafts(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  draft_id TEXT NULL REFERENCES drafts(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_items_user_id_created_at ON inbox_items(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tone_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rules TEXT NOT NULL,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tone_profiles_user_id ON tone_profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tone_profiles_user_id_label_lower ON tone_profiles(user_id, LOWER(label));
