# Challenge 1 — Build Prompt

Goal: build a working drag-and-drop AISH intake demo at `challenge-1/server-1/`
with one or more swappable UIs at `challenge-1/ui-1/`, `ui-2/`, `ui-3/`. Deploy
target is Render.com from the `developmentation/vibe-games` GitHub repo. Local
dev runs with `npm install` then `node server-1/index.js`. Same command on
Render. Time budget for first working slice: 40 minutes.

This document is the contract. Build to it. Do not over-elaborate.

---

## What already exists

- `challenge-1/eligibility.schema.json` — the AISH eligibility field schema. ~65 leaves across nine groups (applicant_identity, residency_status, household, financial, medical, expenses, banking, consent, eligibility_assessment, _metadata). Per-leaf `x-sources`, `x-derived`, `x-conditional`, `x-optional`, `x-system` markers drive coverage logic.
- `challenge-1/eligibility.template.json` — empty starting JSON the master extends.
- `challenge-1/scripts/extract-applicant.mjs` — working extraction agent. Lift the field merge, completeness, derived-assessment, and Claude vision call into a service module the API can import.
- `challenge-1/sql/schema.sql` — applicants + documents + extraction_runs + extraction_passes + review_queue. Already deployed to Render Postgres. The case-management tables below extend this schema.
- 100 synthetic applicants in `challenge_1.applicants`, ~2000 generated AISH document images in `challenge_1.documents`, and on-disk PNGs at `challenge-1/generated/<applicant_id>/*.png` that the demoer drags into the UI.
- `lib/db.mjs`, `lib/vertex.mjs`, `lib/openai.mjs`, `lib/util.mjs` — DB pool with retry, Vertex Claude raw-predict (vision-capable), OpenAI helpers, arg parsing + pmap. Re-use these from server code; do not rewrite them.
- Root `.env` carries `DB_CONNECTION_STRING`, `VERTEX_SERVICE_ACCOUNT_JSON`, `VERTEX_*`, `OPENAI_API_KEY`, `ELEVENLABS_*`, `GOOGLE_CLIENT_ID/SECRET`. The server reads from `../../.env` (project root) so the same file works locally and on Render. On Render, the same variables are configured in the web service env panel.

## Style and constraints

- No emojis in code, UI copy, or docs.
- Plain declarative prose. Follow `00-writing-style-guide.md` at the repo root.
- Prototype-grade middleware: permissive CORS (`origin: true, credentials: true`), no helmet, no rate limiting. Keep cookies non-essential. Body limit raised to 80 MB to accommodate 20+ images at 2-4 MB each.
- No Vite, no bundler, no TypeScript on the front end. Vue 3 from CDN, FormKit from CDN, Axios from CDN, Tailwind from CDN. Vue uses the global build, components written as plain JS objects.
- ES modules (.mjs) on the server; same conventions as the existing `lib/`.
- Idempotent SQL: every schema change uses `IF NOT EXISTS` / `IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`. Migrations are auto-run on server boot.

---

## Directory layout

```
challenge-1/
├── PROMPT.md                      <- this file
├── package.json                   <- ONE package.json for the deploy unit
├── .env                           <- symlink or copy of root .env (gitignored)
├── server-1/                      <- the Node backend
│   ├── index.js                   <- express bootstrap + static mounts
│   ├── routes/
│   │   ├── cases.js               <- POST/GET/PATCH /api/case[...]
│   │   ├── upload.js              <- multer + per-case storage
│   │   ├── process.js             <- kick off extraction for queued files
│   │   ├── stream.js              <- GET /api/case/:id/stream (SSE)
│   │   └── ai.js                  <- POST /api/case/:id/instructions, /chat
│   ├── services/
│   │   ├── extractor.js           <- per-image Claude vision call
│   │   ├── merger.js              <- mergeValue, setAtPath, completenessPct
│   │   ├── events.js              <- in-memory pub-sub keyed by case_id
│   │   └── pdf.js                 <- (optional) PDF-page-to-image fan-out
│   └── migrations/
│       └── 001_cases.sql          <- run at boot
├── ui-1/                          <- drag-drop intake demo (build first)
│   ├── index.html
│   ├── app.js                     <- Vue 3 SFC-like inline templates
│   └── styles.css                 <- minimal; Tailwind via CDN does most work
├── ui-2/                          <- case-review console (build second)
│   ├── index.html
│   └── app.js
├── ui-3/                          <- placeholder
└── generated/                     <- gitignored (sample source images)
    extracted/                     <- gitignored (per-applicant master.json)
```

`server-1/index.js` serves:
- `GET /` — redirects to `GET /ui-1/` (override via `ACTIVE_UI=ui-2` env).
- `GET /ui-1/*`, `/ui-2/*`, `/ui-3/*` — static from the sibling UI folders.
- `GET /shared/*` — shared CDN-shim helpers if any. Reserve the path even if empty.
- `GET /api/*` — backend.

---

## Database additions

`server-1/migrations/001_cases.sql` (run on boot, before the routes mount):

```sql
CREATE TABLE IF NOT EXISTS challenge_1.cases (
  id              BIGSERIAL PRIMARY KEY,
  case_number     TEXT UNIQUE NOT NULL,
  applicant_id    BIGINT REFERENCES challenge_1.applicants(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft, processing, ready_for_review, submitted, approved, rejected, withdrawn
  master_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  completeness_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at    TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cases_status_idx       ON challenge_1.cases (status);
CREATE INDEX IF NOT EXISTS cases_applicant_idx    ON challenge_1.cases (applicant_id);
CREATE INDEX IF NOT EXISTS cases_updated_at_idx   ON challenge_1.cases (updated_at DESC);

CREATE TABLE IF NOT EXISTS challenge_1.case_files (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES challenge_1.cases(id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  byte_size       INT NOT NULL,
  content         BYTEA NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending, processing, done, error
  extracted_fields JSONB,
  error_message   TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS case_files_case_idx    ON challenge_1.case_files (case_id);
CREATE INDEX IF NOT EXISTS case_files_status_idx  ON challenge_1.case_files (status);

CREATE TABLE IF NOT EXISTS challenge_1.case_events (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES challenge_1.cases(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,                  -- upload_received, processing_started, field_merged, completeness_updated, ai_response, submitted, error
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_events_case_idx   ON challenge_1.case_events (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS challenge_1.case_messages (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES challenge_1.cases(id) ON DELETE CASCADE,
  author_role     TEXT NOT NULL,                  -- caseworker, ai, applicant
  body_markdown   TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## API contract

All endpoints under `/api`. JSON in/out unless noted.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/case` | Create a new case. Body: `{ applicant_id?, caseworker?: string }`. Returns `{ case_id, case_number, master_json, completeness_percent }`. |
| `GET`  | `/api/case` | List cases. Query: `?status=draft&limit=50&offset=0`. Returns array sorted by `updated_at DESC`. |
| `GET`  | `/api/case/:id` | Fetch a case with master_json and a summary of files. |
| `PATCH`| `/api/case/:id` | Apply manual edits to master_json. Body: `{ patch: { "applicant_identity.legal_first_name": "Tara" } }`. Server recomputes completeness and emits a `field_merged` event. |
| `POST` | `/api/case/:id/upload` | Multipart upload of N files (multer, max 80 MB). Saves each file as `pending`, emits `upload_received` events, returns `{ files: [{ id, filename, status }] }`. |
| `POST` | `/api/case/:id/process` | Kicks off extraction for every `pending` file. Returns immediately; SSE carries progress. |
| `GET`  | `/api/case/:id/stream` | SSE feed. Events: `upload_received`, `processing_started`, `field_merged`, `completeness_updated`, `file_done`, `case_done`, `error`. Each event sends the relevant slice of state. |
| `GET`  | `/api/case/:id/file/:fileId` | Returns the raw image bytes (for thumbnails). |
| `POST` | `/api/case/:id/submit` | Validates that completeness >= threshold and marks the case `submitted`. Body: `{ override_warnings?: boolean }`. |
| `POST` | `/api/case/:id/instructions` | LLM call (Vertex Claude Sonnet) that reads the master_json and produces a markdown letter describing what is missing. Returns `{ letter_markdown }`. Logged as a `case_message` with role `ai`. |
| `POST` | `/api/case/:id/chat` | Free-form chat with Claude Sonnet about this case. Body: `{ message }`. Returns `{ reply_markdown }`. The full case master_json is injected into the system prompt. |
| `GET`  | `/api/schema` | Returns `eligibility.schema.json` + `eligibility.template.json` so the front end never has to import them separately. |
| `GET`  | `/api/health` | `{ status: 'ok', db: 'ok' | 'down', uptime_seconds }`. |

`case_number` format: `AISH-YYYYMMDD-<6-char base36>`.

The SSE event envelope:

```json
{
  "event_type": "field_merged",
  "case_id": 12,
  "ts": "2026-05-20T19:42:11.013Z",
  "payload": {
    "file_id": 88,
    "filename": "alberta-driver-licence-front.png",
    "fields_returned": 10,
    "fields_new": 8,
    "fields_upgraded": 1,
    "cumulative_completeness_percent": 38.4
  }
}
```

The front end maintains a single source of truth (the master_json) and applies field merges from SSE rather than re-fetching. Browser sets `EventSource('/api/case/<id>/stream')` once on mount.

---

## Front-end requirements (ui-1)

1. **Header**: case number, applicant suggestion (matching applicant from the DB by name + DOB once those fields are populated), completeness meter (0-100% with colour bands), Submit button (disabled until threshold met).
2. **Drop zone**: drag-and-drop area, also clickable. Accepts PNG, JPG, PDF. Shows per-file upload progress (axios `onUploadProgress`) and per-file processing status (`pending` → `processing` → `done` or `error`) driven by SSE.
3. **Form panel**: an accordion of nine sections matching the schema top-level groups. Each section is a FormKit-rendered group. Filled fields are bright; empty required fields are flagged with a soft warning ring. The user can edit any field directly.
4. **Right rail**: a "What's missing" panel that lists the unfilled required fields, grouped by section. A "Generate instructions" button calls `/instructions` and shows the markdown letter in a drawer the user can copy or send.
5. **Footer**: tabs to toggle between FormKit view and raw JSON view (CodeMirror via CDN, read-only). Both views share state.

Visual states:
- File status pills: `pending` (grey), `uploading` (blue with progress bar), `processing` (animated blue), `done` (green), `error` (red).
- Field merge animation: the source field briefly highlights when SSE delivers a `field_merged` payload that touched it.

FormKit setup:
- Use the global UMD build from `https://cdn.jsdelivr.net/npm/@formkit/vue@1/dist/index.umd.js` and the Tailwind theme from `https://cdn.jsdelivr.net/npm/@formkit/themes@1/dist/index.umd.js`. Configure plugin with `defaultConfig({ theme: 'genesis' })`.
- Render each schema group programmatically: walk `eligibility.schema.json`, emit a `<FormKit type="group" name="applicant_identity">` block, then a child `<FormKit>` per leaf. Map types: `string` → `text`, `string` with `format: date` → `date`, `boolean` → `checkbox`, `number` → `number`, `array` → `repeater`, `object` inside an array → `repeater` with nested group, `enum` → `select`.
- Validation: every leaf is treated as required unless it is `x-optional`, `x-system`, or `x-conditional: partnered` while the applicant is not partnered. Arrays satisfy "required" with at least one entry.

Demo affordance: a "Drop in chunks" toggle. When on, the UI buffers files locally and uploads them in batches of 5 with a 2-second gap so the audience can watch the form populate in waves.

---

## Front-end requirements (ui-2)

Case-review console, lower priority than ui-1. Build after ui-1 is working.

Layout:
- Left pane: list of cases (filtered by status), each row showing case_number, applicant name (from master_json), completeness, and last activity.
- Centre pane: selected case in read-only FormKit view, with a notes drawer and a chat panel.
- Right pane: action buttons (Approve, Reject, Request more info, Send to medical reviewer). Each writes a `case_event` and a `case_message`.

The chat panel uses `/api/case/:id/chat`. Claude Sonnet receives the full master_json in the system prompt and can be asked things like "draft a follow-up letter requesting the missing pay stub" or "summarize the medical findings". The system prompt explicitly instructs Claude to never invent data not present in the master_json.

---

## ui-3 placeholder

Empty for now. Reserve the folder. Likely candidates if time permits: an analytics dashboard (counts by status, average completeness, time-to-decision) or a public-facing applicant status portal (read-only, shows only the applicant's own case).

---

## Build order (40 minutes)

Aim for a working slice you can demo at minute 25 and polish through minute 40.

1. **Minute 0-5**: scaffold. Create `challenge-1/package.json`, install `express multer pg cors dotenv`. Stub `server-1/index.js` that serves `/ui-1` static and exposes `/api/health`. Confirm `node server-1/index.js` boots and `curl /api/health` returns ok. Make sure `.env` is read from `../.env` (one level above `challenge-1`).
2. **Minute 5-10**: migrations + schema endpoint. Wire `server-1/migrations/001_cases.sql` to run on boot. Add `GET /api/schema`. Confirm via curl.
3. **Minute 10-15**: case CRUD + multer upload. Implement `POST /api/case`, `GET /api/case/:id`, `POST /api/case/:id/upload`. Confirm a file lands in `challenge_1.case_files`.
4. **Minute 15-22**: extractor service + processing. Lift the merge/completeness/extract logic from `challenge-1/scripts/extract-applicant.mjs` into `server-1/services/`. Implement `POST /api/case/:id/process` and `GET /api/case/:id/stream`. Confirm a 1-file upload yields a populated master_json and a non-zero completeness.
5. **Minute 22-30**: ui-1 hello-world to working. HTML with Vue + FormKit + Axios + Tailwind from CDN. Drop zone, file list, completeness bar, accordion of FormKit-rendered groups bound to the case state. Wire SSE.
6. **Minute 30-35**: instructions + submit. Add `/instructions` and a drawer that displays the letter. Add submit button + status transition.
7. **Minute 35-40**: polish. Per-file pills, merge animation, demo chunk toggle. Add a basic "Drop in chunks" affordance. Test by dragging in 5 files at a time from `challenge-1/generated/<applicant_id>/`.

If time runs short, drop ui-2 entirely and ship ui-1.

---

## Deployment to Render.com

The repo at `developmentation/vibe-games` is the deploy unit. In Render:
- Type: Web Service.
- Build command: `npm install`.
- Start command: `node server-1/index.js`.
- Root directory: `challenge-1`.
- Auto-deploy from `main`.
- Env vars: copy each variable from the local `.env` into Render's env panel. Set `NODE_ENV=production`. Do not commit `.env`.
- Health check: `/api/health`.

Render sets `process.env.PORT`. The server must bind to that and to `0.0.0.0`.

---

## Gitignore additions

Add to `.gitignore` at the repo root:

```
challenge-1/generated/
challenge-1/extracted/
challenge-1/node_modules/
challenge-1/.env
challenge-1/uploads/
```

Source PNGs and extraction artefacts stay local; the deployed instance pulls applicant data and document bytes from the DB instead.

---

## Acceptance criteria for the first working slice

- Drag the 20 PNGs from `challenge-1/generated/34/` onto ui-1, and within 60 seconds the FormKit panel shows the same data as `challenge-1/extracted/34/master.json` (modulo merge tie-breaks).
- Completeness bar climbs from 0 to ~80% as files land. Visible per-file SSE updates.
- "Generate instructions" returns a letter naming the still-missing fields, e.g. preferred name, SIN.
- "Submit" succeeds when completeness >= the configured threshold (default 70%); blocks otherwise with a clear message.
- Case appears in ui-2 list view (if built) and the chat replies to "summarize the medical findings" using only master_json content.

If the four bullets above work end-to-end against the deployed Render instance, the slice ships. Everything else is polish.
