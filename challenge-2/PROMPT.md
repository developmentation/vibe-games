# Challenge 2 — Build Prompt

Goal: build a working customer-support triage demo at `challenge-2/server-1/`
with one or more swappable UIs at `challenge-2/ui-1/`, `ui-2/`, `ui-3/`. Deploy
target is Render.com from the `developmentation/vibe-games` GitHub repo, with
the Render Root Directory set to `challenge-2`. Local dev: `npm install` then
`node server-1/index.js`. Same command on Render. Time budget for first
working slice: 40 minutes.

This document is the contract. Build to it. Do not over-elaborate.

---

## What already exists

- `challenge_2.tickets` — 200 synthetic support tickets for a fictional Alberta
  telco "Pronghorn Mobile". Every row carries: external_ref, customer_id,
  channel (email, chat, phone, portal), category (billing, technical, account,
  shipping, refund, feature_request, complaint), subcategory, priority (low,
  normal, high, urgent), status (open, in_progress, resolved, escalated,
  closed), subject, body markdown, sentiment, expected_resolution
  (auto_resolve, human_required, escalation_required), language (en, fr; ~10%
  fr), tags array, metadata object, submitted_at, raw_payload.
- `challenge_2.customers` — 188 customers inferred from ticket emails. Carries
  plan_tier (Basic, Family, Pro), signup_date, city.
- `challenge_2.ticket_messages` — empty conversation table the triage agent
  will fill with `customer`, `agent`, `system`, or `ai` rows.
- `challenge-2/scripts/generate-tickets.mjs` — re-runnable generator backed by
  Vertex Claude Sonnet with a tool-enforced Zod schema. `--count N` tops up.
- `challenge-2/sql/schema.sql` — schema + indexes (status, priority, category,
  channel, submitted_at, customer_id). Already applied to Render Postgres.
- `lib/db.mjs`, `lib/vertex.mjs`, `lib/openai.mjs`, `lib/util.mjs` — DB pool
  with retry, Vertex Claude raw-predict (vision + tool-use capable), arg
  parsing + pmap. Re-use from server code; do not rewrite.
- Root `.env` carries `DB_CONNECTION_STRING`, `VERTEX_SERVICE_ACCOUNT_JSON`,
  `VERTEX_*`, `OPENAI_API_KEY`, `ELEVENLABS_*`, `GOOGLE_CLIENT_ID/SECRET`. The
  server reads from `../../.env` locally; on Render the env panel provides
  the same variables.
- `challenge-2/server-1/index.js` — placeholder Express server with
  `/api/health` and a stubbed `/api/schema`. Replace as the build progresses.
- `challenge-2/ui-1/`, `ui-2/`, `ui-3/` — pre-staged UI folders. ui-2 ships
  with a generic case-management console shell (tabs: Queue, Cases, Workflow,
  Analytics, Settings). ui-3 is a reserved slot.

## Style and constraints

- No emojis in code, UI copy, or docs.
- Plain declarative prose. Follow `00-writing-style-guide.md` at the repo root.
- Prototype-grade middleware: permissive CORS (`origin: true, credentials: true`),
  no helmet, no rate limiting.
- Vue 3, Axios, Tailwind from CDN. No Vite, no bundler, no TypeScript on the
  front end. FormKit only if a structured edit form is needed.
- ES modules (.mjs) on the server. Idempotent SQL with `IF NOT EXISTS` /
  `ADD COLUMN IF NOT EXISTS`. Migrations auto-run on boot.

---

## Directory layout

```
challenge-2/
├── PROMPT.md
├── package.json
├── server-1/
│   ├── index.js                   <- express bootstrap + static mounts
│   ├── routes/
│   │   ├── tickets.js             <- GET/PATCH /api/tickets[...]
│   │   ├── triage.js              <- POST /api/triage/:ticket_id, /batch
│   │   ├── reply.js               <- POST /api/reply/:ticket_id (draft + send)
│   │   ├── stream.js              <- GET /api/stream (SSE for batch triage)
│   │   └── ai.js                  <- POST /api/ai/chat
│   ├── services/
│   │   ├── triage-agent.js        <- Vertex Claude Sonnet classifier + responder
│   │   ├── reply-templates.js     <- canned auto-resolve templates per subcategory
│   │   └── events.js              <- in-memory pub-sub
│   └── migrations/
│       └── 001_triage.sql         <- adds agent_classification + triage_runs
├── ui-1/                          <- inbox + per-ticket detail (build first)
├── ui-2/                          <- case-management console (queue, cases, workflow tabs)
└── ui-3/                          <- reserved
```

---

## Database additions

`server-1/migrations/001_triage.sql`:

```sql
-- Agent classification result, attached to a ticket.
CREATE TABLE IF NOT EXISTS challenge_2.agent_classifications (
  id              BIGSERIAL PRIMARY KEY,
  ticket_id       BIGINT NOT NULL REFERENCES challenge_2.tickets(id) ON DELETE CASCADE,
  model           TEXT NOT NULL,
  category        TEXT NOT NULL,
  subcategory     TEXT,
  priority        TEXT NOT NULL,
  sentiment       TEXT,
  recommended_action TEXT NOT NULL,            -- auto_resolve, draft_reply, escalate
  suggested_reply_markdown TEXT,
  escalation_summary_markdown TEXT,
  tags            JSONB DEFAULT '[]'::jsonb,
  confidence      NUMERIC(4,3),
  raw_response    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_classifications_ticket_idx
  ON challenge_2.agent_classifications (ticket_id, created_at DESC);

-- Batch triage run (so the UI can group results).
CREATE TABLE IF NOT EXISTS challenge_2.triage_runs (
  id              BIGSERIAL PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  tickets_processed INT NOT NULL DEFAULT 0,
  model           TEXT,
  note            TEXT
);

-- Allow re-using the existing ticket_messages table for agent drafts.
-- (No schema change needed; author_role can already be 'ai'.)
```

---

## API contract

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/tickets` | List tickets. Query: `?status=open&priority=high&category=billing&q=...&limit=50&offset=0`. Returns sorted by `submitted_at DESC`. Includes most recent classification per ticket. |
| `GET`  | `/api/tickets/:id` | One ticket, its customer, its classification, and its messages. |
| `PATCH`| `/api/tickets/:id` | Update status, priority, assigned reviewer. Logged as a system message. |
| `POST` | `/api/triage/:id` | Run the triage agent on a single ticket. Inserts an `agent_classifications` row. Returns the classification. |
| `POST` | `/api/triage/batch` | Body: `{ filter: { status: 'open' }, limit: 50 }`. Creates a `triage_runs` row, enqueues tickets, returns `{ run_id }`. The SSE stream carries per-ticket completions. |
| `GET`  | `/api/stream/:run_id` | SSE for batch triage. Events: `triage_started`, `ticket_classified` (with classification payload), `triage_finished`. |
| `POST` | `/api/reply/:ticket_id` | Body: `{ body_markdown, send?: boolean }`. Inserts a `ticket_messages` row with role `ai` if drafted, transitions status when `send: true`. |
| `POST` | `/api/ai/chat` | Body: `{ ticket_id?, message }`. Conversational Claude Sonnet over the ticket and its customer record. The full ticket body + classification get injected into the system prompt. |
| `GET`  | `/api/health` | `{ status, db, uptime_seconds }`. |

SSE event envelope:

```json
{
  "event_type": "ticket_classified",
  "run_id": 4,
  "ticket_id": 173,
  "category": "billing",
  "subcategory": "duplicate_charge",
  "priority": "high",
  "recommended_action": "draft_reply",
  "confidence": 0.91
}
```

---

## Triage agent (services/triage-agent.js)

One Vertex Claude Sonnet call per ticket. Tool name `record_triage`.

Tool input schema:

```js
{
  type: 'object',
  required: ['category','priority','recommended_action','tags','rationale'],
  properties: {
    category: { type: 'string', enum: ['billing','technical','account','shipping','refund','feature_request','complaint'] },
    subcategory: { type: 'string' },
    priority: { type: 'string', enum: ['low','normal','high','urgent'] },
    sentiment: { type: 'string', enum: ['neutral','frustrated','angry','confused','polite','urgent'] },
    recommended_action: { type: 'string', enum: ['auto_resolve','draft_reply','escalate'] },
    suggested_reply_markdown: { type: 'string' },
    escalation_summary_markdown: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    rationale: { type: 'string' }
  }
}
```

System prompt: "You are the first-responder triage agent for Pronghorn Mobile.
Read the ticket. Classify category, priority, and sentiment from the body
exactly. Decide one of: auto_resolve (write a complete reply that resolves the
issue without human intervention), draft_reply (write a reply that a human
agent can review and send), or escalate (produce a 3-sentence summary the
human triage lead needs). Use only facts in the ticket; do not invent account
numbers or amounts. Reply in the customer's language."

The agent receives the ticket body, the customer record (plan tier, signup
date), and any prior `ticket_messages` rows. It does NOT receive other
tickets.

---

## Front-end requirements (ui-1)

Single-page Vue app, "Inbox" pattern.

Layout:
1. **Left column (list)**: ticket rows showing subject, customer name, channel
   icon, priority pill, sentiment pill, and the agent's recommended action
   pill (or "unclassified"). Filterable by status, priority, category, search.
2. **Right pane (detail)**: selected ticket. Sections in order:
   - Customer summary (name, email, plan, signup date).
   - Ticket body (rendered markdown).
   - Agent classification card with category, subcategory, priority,
     sentiment, recommended_action, confidence, rationale.
   - Suggested reply or escalation summary in an editable textarea.
   - Conversation thread (every `ticket_messages` row, latest at the bottom).
3. **Action bar (top of right pane)**: Run triage, Send reply, Escalate,
   Resolve, Reopen. Each writes a `ticket_messages` row.
4. **Batch panel (top right)**: "Triage all open" button. Opens an SSE
   feed; the list updates live as classifications complete.

Visual states:
- Sentiment pill colour: neutral (grey), polite (sky), frustrated (amber),
  angry (rose), confused (violet), urgent (red).
- Priority pill: low (slate), normal (sky), high (amber), urgent (red).
- Recommended action pill: auto_resolve (emerald), draft_reply (sky),
  escalate (amber).

---

## Front-end requirements (ui-2)

Case-management console. ui-2 already ships with a tabbed shell (Queue,
Cases, Workflow, Analytics, Settings). Wire each tab to live data:

- **Queue**: unclassified tickets only. Click a row to triage immediately.
- **Cases**: all classified tickets grouped by recommended_action. Bulk
  actions: send drafted replies, escalate selected.
- **Workflow**: visualize ticket transitions (open → classified → drafted →
  sent / escalated / resolved). Sankey or simple counts.
- **Analytics**: counts by category, priority, sentiment, language. Average
  time to first agent response (computed from `submitted_at` to first
  `ticket_messages` row with role `ai`).
- **Settings**: model name, batch concurrency knob, language overrides.

---

## ui-3 placeholder

Reserved. Likely candidate: a public-facing customer status portal at
`/ui-3/?token=<jwt>` that shows the customer their own ticket history with
read-only access. Implement only if time allows.

---

## Build order (40 minutes)

1. **0-5**: confirm the placeholder boots locally; verify `/api/tickets`
   route returns rows from the DB.
2. **5-10**: implement `GET /api/tickets` with filtering and `GET /api/tickets/:id`.
   Confirm rows render in ui-1 list.
3. **10-15**: triage agent service + `POST /api/triage/:id`. Verify a single
   classification round-trip writes to `agent_classifications`.
4. **15-22**: ui-1 list + detail wired to live data, including the action bar.
5. **22-30**: batch triage + SSE. List updates live as classifications complete.
6. **30-35**: reply send + status transitions.
7. **35-40**: polish ui-2 tabs with live counts.

If time runs short, drop ui-2 entirely and ship ui-1.

---

## Deployment to Render.com

- Type: Web Service. Branch: main.
- Root Directory: `challenge-2`.
- Build Command: `npm install`.
- Start Command: `node server-1/index.js`.
- Health Check: `/api/health`.
- Env vars: copy from local `.env` (DB_CONNECTION_STRING, VERTEX_*, OPENAI_*, REFRESH_TOKEN).
- Optional: `ACTIVE_UI=ui-2` to land on the case-management console at `/`.

Render sets `process.env.PORT`. The server binds to `0.0.0.0`.

---

## Acceptance criteria for the first working slice

- Inbox lists all 200 tickets with filters working.
- "Run triage" on one ticket inserts a classification row and the detail pane
  shows the classification + suggested reply.
- "Triage all open" runs the agent across the open tickets, SSE updates the
  list one row at a time, and each classification persists.
- "Send reply" writes a `ticket_messages` row with role `ai` and the ticket
  status transitions correctly.
- ui-2 Queue tab shows only unclassified tickets and the Cases tab groups by
  recommended action.

If all five work end-to-end against the deployed Render instance, ship it.
