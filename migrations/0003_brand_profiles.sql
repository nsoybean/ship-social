ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_brand_profile TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS brand_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  logo_url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brand_profiles_user_id ON brand_profiles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_profiles_user_id_label_lower ON brand_profiles(user_id, LOWER(label));
