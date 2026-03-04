# Ship -> Social (Next.js)

Turn GitHub release signals into social-ready drafts for indie hackers.

Core loop: **Ship feature -> check inbox -> approve draft -> publish**

## What The App Does

- Connects your GitHub account
- Lets you connect repos in **Repo Manager**
- Uses manual trigger (and release signal fallback) to generate post drafts
- Creates 3 angle variants (`technical`, `build-in-public`, `outcome-focused`)
- Generates a release visual
- Lets you edit/copy/approve in Draft workspace
- Shows technical release context (PR/files/commits) in expandable details

## Where Things Happen In UI

- **Top bar**
  - `Repos` -> opens Repo Manager (connect repos + manual trigger)
  - `Tone` -> opens Tone Profile dialog
- **Inbox**
  - Incoming draft-ready events
- **Draft workspace**
  - Composer, X preview, editable content, approve/save/copy
- **Tone dialog**
  - Method 1: select existing tone
  - Method 2: create custom tone
  - Optional helper: extract tone from pasted posts (3-5 examples) to prefill custom fields

## 1) Create GitHub OAuth App

In GitHub settings, create an OAuth App with:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/github/callback`

Copy Client ID and Client Secret.

## 2) Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set:

- `APP_URL=http://localhost:3000`
- `GITHUB_CLIENT_ID=...`
- `GITHUB_CLIENT_SECRET=...`
- `AI_TEXT_MODEL=openai/o4-mini`
- `AI_IMAGE_MODEL=google/gemini-2.5-flash-image`
- `AI_GATEWAY_API_KEY=...` (recommended when using `openai/*` or `google/*` model IDs)
- `OPENAI_API_KEY=...` (optional fallback when not using gateway)

Optional alternative image model:

- `AI_IMAGE_MODEL=google/gemini-3.1-flash-image-preview`

## 3) Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Release Signal Behavior (Manual Trigger)

Manual trigger resolves in this order:

1. Latest published **GitHub release** (`/releases/latest`)
2. Fallback: latest **merged PR** into default branch

For merged PR signal, the app fetches extra context:

- PR metadata (number, branches, additions/deletions, changed files, commits)
- Changed files (with patch previews)
- Commit messages

## AI + Model Behavior

- If gateway key exists (`AI_GATEWAY_API_KEY` or `VERCEL_AI_GATEWAY_API_KEY`), model IDs are used directly (for example `openai/o4-mini`, `google/gemini-2.5-flash-image`)
- Otherwise, if `OPENAI_API_KEY` is present, OpenAI provider fallback is used
- Gemini image models on gateway use multimodal `generateText` file output flow
- Draft composer shows:
  - `source: <model-id>` when generation succeeded
  - `source: Error` when generation failed and fallback path was used

## Tone Profile Features

- Built-in presets + custom tones
- AI extraction from pasted past posts:
  - Paste 3-5 examples
  - Click `Extract tone`
  - Review/edit generated name/description/rules
  - Save as custom tone

## Current Product Surface

- GitHub OAuth login
- GitHub repo discovery and connection
- Repo manager modal for onboarding/configuration
- Manual trigger per connected repo
- Draft + inbox creation from trigger
- Draft editor: save, copy, approve
- X-style preview
- Tone manager modal with extraction helper
- Draggable Inbox vs Draft workspace divider

## Data Persistence

Local JSON storage:

- `data/state.json`

## API Routes

- `GET /api/auth/github/start`
- `GET /api/auth/github/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/github/repos`
- `GET /api/repos`
- `POST /api/repos`
- `POST /api/repos/[id]/toggle`
- `POST /api/repos/[id]/trigger`
- `GET /api/inbox`
- `DELETE /api/inbox/[id]`
- `GET /api/drafts`
- `POST /api/drafts/[id]`
- `GET /api/preferences`
- `POST /api/preferences`
- `POST /api/preferences/tone-extract`
