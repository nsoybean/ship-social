# Ship -> Social (Next.js)

Cute, developer-first workflow for release distribution.

Flow: **Connect GitHub -> select repos -> ship feature -> approve -> publish**

## Tech

- Next.js App Router
- GitHub OAuth (real account connect)
- GitHub repo discovery and selection
- Local JSON persistence in `data/state.json`

## 1) Create GitHub OAuth App

In GitHub settings, create an OAuth App with:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/github/callback`

Copy Client ID and Client Secret.

## 2) Configure env

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set:

- `APP_URL=http://localhost:3000`
- `GITHUB_CLIENT_ID=...`
- `GITHUB_CLIENT_SECRET=...`
- `AI_TEXT_MODEL=openai/o4-mini`
- `AI_IMAGE_MODEL=google/gemini-2.5-flash-image` (Gemini Nano Banana via AI Gateway, lower-cost default)
- `AI_GATEWAY_API_KEY=...` (recommended for gateway models like `openai/*` and `google/*`)
- `OPENAI_API_KEY=...` (optional fallback if not using gateway; image model falls back to `gpt-image-1`)

Other image model options:
- `AI_IMAGE_MODEL=google/gemini-3.1-flash-image-preview` (Nano Banana 2)

## 3) Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Note: Gateway models like `openai/o4-mini` and `google/gemini-2.5-flash-image` require `ai@5+` (already set in `package.json`).

## What works now

- GitHub OAuth login
- Fetch your GitHub repos
- Select multiple repos and connect them
- Toggle auto-generation flag per connected repo
- Manual trigger per connected repo (pull latest GitHub release)
- Trigger now auto-generates 3 draft variants + release image and creates an inbox item
- Draft workspace supports edit, save, copy, approve
- Configurable writing styles (Release Crisp / Builder Story / Outcome First)
- PR context fetcher for merged-PR releases (PR metadata, changed files, commits, derived highlights)

## Release signal (manual trigger)

Manual trigger resolves release signal in this order:

1. Latest published **GitHub Release** (`/releases/latest`)
2. Fallback: latest **merged PR** into the repo default branch (for teams using PR merge as release workflow)

If `OPENAI_API_KEY` is missing, the app falls back to deterministic template generation.

Model/provider behavior:

- If `AI_GATEWAY_API_KEY` (or `VERCEL_AI_GATEWAY_API_KEY`) is present, the app uses model IDs directly (for example `openai/o4-mini`).
- Otherwise, if `OPENAI_API_KEY` is present, it uses `@ai-sdk/openai` provider with model IDs converted automatically.
- For Gemini image models on gateway (`google/*image*`), image generation runs through `generateText` + `result.files` (multimodal output).

For merged-PR signal, the app fetches extra release context:

- PR metadata (labels, branches, additions/deletions, merged time)
- Changed files with patch previews
- Commit messages
- Derived highlights used by generation prompts/templates

## API routes

- `GET /api/auth/github/start`
- `GET /api/auth/github/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/github/repos`
- `GET /api/repos`
- `POST /api/repos`
- `POST /api/repos/:id/toggle`
- `POST /api/repos/:id/trigger`
- `GET /api/inbox`
- `GET /api/drafts`
- `POST /api/drafts/:id`
- `GET /api/preferences`
- `POST /api/preferences`
