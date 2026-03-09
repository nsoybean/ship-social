# Ship Social

![Landing page](public/screenshots/landing_page.png)

**An npm tool for developers who ship.** Turn your GitHub releases and merged PRs into ready-to-post social content — without leaving your workflow.

Core loop: **Ship feature → check inbox → approve draft → publish**

## Demo

![Demo](public/demo/demo.gif)

## What It Does

Ship Social is a local npm tool that pulls shipping signals from your GitHub repos (releases or merged PRs) on demand and generates social post drafts with a matching visual. You trigger it, review the drafts, and copy to post wherever you share.

- **Connect repos** via Repo Manager — pick the projects you're actively shipping
- **Trigger on demand** per repo to generate drafts from your latest release or merged PR
- **Get multiple draft variants** + a generated visual, ready to review in your inbox
- **Edit and approve** in a draft workspace with X-style preview
- **Match your voice** with tone profiles — use presets, create custom ones, or extract your tone from past posts

## Quickstart

Run this in a dedicated local folder (not inside an existing repo):

```bash
mkdir ship-social
cd ship-social
npx -y ship-social@latest quickstart
```

Quickstart will walk you through:

1. Entering your `GITHUB_ACCESS_TOKEN`
2. Entering an AI key (`AI_GATEWAY_API_KEY` recommended, or `OPENAI_API_KEY`)
3. Starting an embedded Postgres instance and running migrations
4. Launching the app at [http://localhost:3000](http://localhost:3000)

That's it. No manual database setup required.

## GitHub Access Token

Create a classic personal access token at [github.com/settings/tokens](https://github.com/settings/tokens).

If using a fine-grained token, ensure these scopes:

- `repo`
- `read:user`

## Environment Variables

Quickstart handles this automatically. For manual setup, copy the example file:

```bash
cp .env.example .env
```

Core variables:

| Variable | Description |
|---|---|
| `APP_URL` | `http://localhost:3000` |
| `GITHUB_ACCESS_TOKEN` | Your GitHub personal access token |
| `AI_GATEWAY_API_KEY` | Recommended — enables gateway model routing |
| `OPENAI_API_KEY` | Optional fallback if no gateway key |
| `AI_TEXT_MODEL` | Default: `openai/o4-mini` |
| `AI_IMAGE_MODEL` | Default: `google/gemini-2.5-flash-image` (gateway only) |
| `OPENAI_IMAGE_MODEL` | Default: `gpt-image-1` (used when gateway is not configured) |
| `DATABASE_URL` | Set automatically by quickstart; or provide your own Postgres URL |

Key links:

- GitHub token: [github.com/settings/tokens](https://github.com/settings/tokens)
- OpenAI key: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- AI Gateway: [vercel.com/docs/ai-gateway](https://vercel.com/docs/ai-gateway)

## Manual Setup (External Postgres)

If you prefer to use your own Postgres instance:

```bash
npm install
npm run db:migrate
npm run dev
```

Set `DATABASE_URL` in `.env` before running migrations. If quickstart detects an existing `DATABASE_URL`, it skips the embedded Postgres setup automatically.

## Troubleshooting

- **`DATABASE_URL is required for postgres storage backend`** — Set `DATABASE_URL` in `.env` or your shell, then rerun `npm run db:migrate`.
- **`ECONNREFUSED` or cannot connect to Postgres** — Verify host, port, and credentials in `DATABASE_URL` and confirm your Postgres server is running.

---

## Tech Stack

- **Framework:** Next.js 15 + React 19
- **Runtime:** Node.js >= 20
- **Styling:** Raw CSS (`app/globals.css`)
- **AI:** Vercel AI SDK + OpenAI / AI Gateway model routing
- **Database:** Postgres (`pg`) with optional embedded Postgres (`embedded-postgres`)
- **Migrations:** SQL files in `migrations/*.sql`
- **CLI:** `bin/ship-social.js` (`quickstart`)

## AI Model Routing

| Condition | Text model | Image model |
|---|---|---|
| `AI_GATEWAY_API_KEY` is set | `AI_TEXT_MODEL` via AI Gateway | `AI_IMAGE_MODEL` via AI Gateway |
| No gateway key, `OPENAI_API_KEY` is set | OpenAI via `AI_TEXT_MODEL` | `OPENAI_IMAGE_MODEL` (default `gpt-image-1`) |
| Neither key set | No AI generation | No AI generation |

- Gemini image models on gateway use multimodal `generateText` file output flow.
- Draft composer shows `source: <model-id>` on success or `source: Error` when a fallback was used.

## Release Signal Behavior

When you manually trigger draft generation, the app resolves the shipping signal in this order:

1. Latest published **GitHub release** (`/releases/latest`)
2. Fallback: latest **merged PR** into default branch

For merged PR signals, the app fetches extra context: PR metadata, changed files with patch previews, and commit messages.

## Tone Profiles

- Built-in presets + custom tones
- AI extraction from past posts:
  1. Paste 3–5 example posts
  2. Click `Extract tone`
  3. Review and edit the generated name, description, and rules
  4. Save as a custom tone

## Data Persistence

- Postgres only — `DATABASE_URL` is required at runtime
- Embedded Postgres data dir: `data/embedded-postgres`
- Migrations: `migrations/*.sql`
