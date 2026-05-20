# Challenge 3 — Build Prompt

Goal: build a working K-12 personalized-learning demo at `challenge-3/server-1/`
with one or more swappable UIs at `challenge-3/ui-1/`, `ui-2/`, `ui-3/`. Deploy
target is Render.com from the `developmentation/vibe-games` GitHub repo, with
the Render Root Directory set to `challenge-3`. Local dev: `npm install` then
`node server-1/index.js`. Same command on Render. Time budget for first
working slice: 40 minutes.

This document is the contract. Build to it. Do not over-elaborate.

---

## What already exists

- `challenge_3.students` — 100 synthetic Alberta K-12 students. Carries:
  asin (9 digits), legal name, date_of_birth, current_grade (K, 1-12),
  school_name, school_division (Calgary Board of Education, Edmonton Public,
  Conseil scolaire FrancoSud, etc.), city, language_of_instruction (en, fr),
  has_complexity (boolean, ~34% true), complexity_profile JSONB
  ({ flags: [...], supports: [...] }), guardian contact, enrolled_at.
- `challenge_3.subjects` — 9 Alberta subject codes (ELA, MAT, SCI, SOC, FLA,
  PHE, FNA, CTF, CTS). `is_core` flag marks the four core academic subjects
  plus PHE.
- `challenge_3.grade_history` — ~6000 rows. Per student per subject per term
  for the last 3 school years. Fields: school_year (e.g. 2023-2024),
  grade_level, subject_code, term (1-3), mark_percent, letter_grade,
  performance (below_grade, approaching, at_grade, above_grade),
  struggling (boolean), excelling (boolean), teacher_comment.
- `challenge_3.iep_notes` — ~285 teacher-authored commentary blocks per
  student. Three note_types per student where commentary was generated:
  assessment, goal, intervention.
- Read-only Alberta curriculum DB (already populated, not maintained here):
  `postgresql://alberta_curriculum_extraction_f1c24832_user:fak2nVuDfnFRWM4oIwlvvUxnSQpcCQN5@dpg-d7n3fcho3t8c73ef5eqg-b.replica-cyan.oregon-postgres.render.com/alberta_curriculum_extraction_f1c24832`
  - `phase1.subjects` (code, name_en, parent_code, is_discipline) — joins to
    `challenge_3.subjects.code` (ELA, MAT, etc.).
  - `phase1.grades` (code, name_en, sort_order) — K (sort 0), 1-12.
  - `phase1.curriculum_nodes` — the curriculum tree (outcomes, learning
    objectives, indicators).
  - `phase2.curriculum_nodes_normalized` + `phase2.node_embeddings` for
    semantic retrieval.
  - `phase2.kg_nodes` / `phase2.kg_edges` for prerequisite graph traversal.
- `challenge-3/scripts/generate-students.mjs` — re-runnable generator.
  `--count N` tops up. Three-year grade history fills automatically for any
  student that does not yet have rows.
- `challenge-3/sql/schema.sql` — schema + indexes. Already applied to Render
  Postgres.
- `lib/db.mjs`, `lib/vertex.mjs`, `lib/openai.mjs`, `lib/util.mjs` — DB pool
  with retry, Vertex Claude raw-predict (vision + tool-use), OpenAI helpers,
  arg parsing + pmap. Re-use from server code.
- Root `.env` carries `DB_CONNECTION_STRING`,
  `VERTEX_SERVICE_ACCOUNT_JSON`, `VERTEX_*`, `OPENAI_API_KEY`,
  `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `GOOGLE_CLIENT_ID/SECRET`. The
  server reads from `../../.env` locally; Render injects via env panel.
- `challenge-3/server-1/index.js` — placeholder Express server with
  `/api/health` and a stubbed `/api/schema`.
- `challenge-3/ui-1/`, `ui-2/`, `ui-3/` — pre-staged. ui-2 ships with the
  generic case-management console shell (Queue, Cases, Workflow, Analytics,
  Settings tabs). ui-3 is reserved.

## Style and constraints

- No emojis in code, UI copy, or docs.
- Plain declarative prose. Follow `00-writing-style-guide.md` at the repo root.
- Permissive CORS, no helmet, no rate limiting.
- Vue 3, Axios, Tailwind from CDN. No bundler, no TypeScript on the front
  end. Add FormKit only if a complex multi-step form lands.
- ES modules (.mjs) on the server. Idempotent SQL.
- Two DB connections: the local `challenge_3.*` schema (read + write) and the
  read-only Alberta curriculum DB. Treat the curriculum DB as a separate
  pool; never write to it.

---

## Directory layout

```
challenge-3/
├── PROMPT.md
├── package.json
├── server-1/
│   ├── index.js                   <- express bootstrap + static mounts
│   ├── routes/
│   │   ├── students.js            <- GET /api/students[...]
│   │   ├── plans.js               <- POST /api/plans/:student_id (generate)
│   │   ├── outcomes.js            <- GET /api/outcomes (curriculum search)
│   │   ├── audio.js               <- POST /api/audio/:plan_id (ElevenLabs TTS)
│   │   └── ai.js                  <- POST /api/ai/chat
│   ├── services/
│   │   ├── curriculum.js          <- read-only pool against the curriculum DB
│   │   ├── plan-agent.js          <- Vertex Claude Sonnet plan builder
│   │   ├── tts.js                 <- ElevenLabs voice
│   │   └── events.js              <- in-memory pub-sub
│   └── migrations/
│       └── 001_plans.sql          <- adds learning_plans + plan_sections + plan_audio
├── ui-1/                          <- student dashboard + plan generator (build first)
├── ui-2/                          <- case-management console (roster, queue, workflow tabs)
└── ui-3/                          <- reserved
```

---

## Database additions

`server-1/migrations/001_plans.sql`:

```sql
CREATE TABLE IF NOT EXISTS challenge_3.learning_plans (
  id              BIGSERIAL PRIMARY KEY,
  student_id      BIGINT NOT NULL REFERENCES challenge_3.students(id) ON DELETE CASCADE,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  model           TEXT,
  audience        TEXT NOT NULL DEFAULT 'teacher',  -- teacher, parent, student
  summary_markdown TEXT,
  full_plan_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcomes_referenced JSONB DEFAULT '[]'::jsonb,    -- array of curriculum_node ids
  status          TEXT NOT NULL DEFAULT 'draft',    -- draft, shared, archived
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_plans_student_idx
  ON challenge_3.learning_plans (student_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS challenge_3.plan_sections (
  id              BIGSERIAL PRIMARY KEY,
  plan_id         BIGINT NOT NULL REFERENCES challenge_3.learning_plans(id) ON DELETE CASCADE,
  subject_code    TEXT NOT NULL REFERENCES challenge_3.subjects(code),
  current_grade   TEXT NOT NULL,
  target_grade    TEXT NOT NULL,                    -- may be lower (struggling) or higher (excelling)
  direction       TEXT NOT NULL,                    -- remediate, on_grade, accelerate
  rationale_markdown TEXT,
  outcomes_json   JSONB DEFAULT '[]'::jsonb,        -- [{ node_id, code, name, why }]
  activities_json JSONB DEFAULT '[]'::jsonb,        -- [{ title, modality, minutes, materials }]
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_sections_plan_idx ON challenge_3.plan_sections (plan_id);

CREATE TABLE IF NOT EXISTS challenge_3.plan_audio (
  id              BIGSERIAL PRIMARY KEY,
  plan_id         BIGINT NOT NULL REFERENCES challenge_3.learning_plans(id) ON DELETE CASCADE,
  audience        TEXT NOT NULL,
  voice_id        TEXT NOT NULL,
  mime_type       TEXT NOT NULL DEFAULT 'audio/mpeg',
  byte_size       INT NOT NULL,
  content         BYTEA NOT NULL,
  duration_seconds NUMERIC(6,2),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_audio_plan_idx ON challenge_3.plan_audio (plan_id);
```

---

## API contract

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/students` | List students. Query: `?grade=K&complexity=true&division=Calgary&q=...&limit=50&offset=0`. Returns sorted by current_grade, last_name. |
| `GET`  | `/api/students/:id` | One student with: profile, complexity_profile, grouped grade_history (struggling vs at-grade vs excelling subjects), and iep_notes. |
| `POST` | `/api/plans/:student_id` | Generate a learning plan. Body: `{ audience: 'teacher' \| 'parent' \| 'student', subjects?: ['ELA','MAT'], horizon_weeks?: 4 }`. Runs the plan agent (Vertex Claude Sonnet) with curriculum-DB context injected. Returns `{ plan_id, summary_markdown, sections }`. |
| `GET`  | `/api/plans/:plan_id` | Full plan with sections + outcome citations. |
| `GET`  | `/api/outcomes` | Search the read-only curriculum DB. Query: `?subject=MAT&grade=4&q=fractions&limit=20`. Returns outcomes (name, code, grade, subject, full_text). |
| `POST` | `/api/audio/:plan_id` | Generate ElevenLabs TTS of the plan summary. Body: `{ audience: 'parent', voice_id?: '<override>' }`. Writes to `plan_audio`. Returns `{ audio_id, byte_size, duration_seconds }`. |
| `GET`  | `/api/audio/:audio_id` | Stream the audio bytes for playback. |
| `POST` | `/api/ai/chat` | Body: `{ student_id, message, audience }`. Conversational Claude Sonnet over the student. The full student record + most recent plan are injected into the system prompt. |
| `GET`  | `/api/health` | `{ status, db_local, db_curriculum, uptime_seconds }`. |

---

## Plan agent (services/plan-agent.js)

Two-step pipeline so the LLM never invents outcomes.

**Step 1**: derive a target grade per subject.
- For each subject, average the last two terms' mark_percent.
- avg < 60 → target = current_grade - N (N = 1 or 2, capped at K).
- avg > 88 → target = current_grade + 1 (capped at 12).
- otherwise target = current_grade (on_grade).

**Step 2**: pull outcomes from the curriculum DB.
- For each (subject_code, target_grade), pull the top N outcomes from
  `phase1.curriculum_nodes` (or `phase2.curriculum_nodes_normalized`), keyed
  by subject + grade.
- Pass those to Vertex Claude Sonnet as the candidate set. Claude selects 3-6
  per subject, with a one-line "why" each, and proposes 2-3 activities per
  section.

Tool name `record_plan`. Tool input schema (collapsed):

```js
{
  type: 'object',
  required: ['summary_markdown','sections'],
  properties: {
    summary_markdown: { type: 'string' },         // 4-8 sentences, audience-tuned
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['subject_code','direction','target_grade','rationale_markdown','outcomes','activities'],
        properties: {
          subject_code: { type: 'string' },
          direction: { type: 'string', enum: ['remediate','on_grade','accelerate'] },
          target_grade: { type: 'string' },
          rationale_markdown: { type: 'string' },
          outcomes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['node_id','code','name','why'],
              properties: {
                node_id: { type: 'string' },
                code: { type: 'string' },
                name: { type: 'string' },
                why: { type: 'string' }
              }
            }
          },
          activities: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title','modality','minutes'],
              properties: {
                title: { type: 'string' },
                modality: { type: 'string', enum: ['read','watch','practice','project','discuss','quiz'] },
                minutes: { type: 'integer' },
                materials: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    }
  }
}
```

System prompt: "You are an Alberta K-12 personalized-learning planner. The
candidate outcomes you may cite are limited to those provided in the user
message. Do not invent or paraphrase outcome codes. Adjust language and depth
to the target audience (teacher: clinical, parent: warm + specific, student:
direct and short). Reflect complexity flags in the rationale. Never imply a
diagnosis."

---

## TTS (services/tts.js)

ElevenLabs HTTP API. Endpoint:
`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`.
Header `xi-api-key: $ELEVENLABS_API_KEY`. Body
`{ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }`.
Returns binary audio. Store in `plan_audio.content` as BYTEA.

Default `voice_id`: `process.env.ELEVENLABS_VOICE_ID`.

---

## Front-end requirements (ui-1)

Layout (three-column on wide viewports):

1. **Left**: student picker. Filter by grade band (K-3, 4-6, 7-9, 10-12),
   complexity, division. Each row shows name, current_grade, a struggling /
   excelling badge.
2. **Centre top**: student dashboard. Header with name, ASIN, current grade,
   complexity flags. Subject cards (one per subject in the student's history)
   showing the last-two-term trend sparkline and a coloured indicator
   (struggling, on grade, excelling).
3. **Centre middle**: "Generate a learning plan" panel. Audience toggle
   (teacher, parent, student). Subject multi-select (default all). Horizon
   slider (1-12 weeks). Generate button.
4. **Centre bottom**: rendered plan. Summary block. One card per section
   showing direction, target grade, rationale, outcomes (with curriculum
   codes linked to `/api/outcomes`), and activities.
5. **Right rail**: "Audio" — Generate TTS button. When ready, an inline audio
   player with playback rate control.

Visual cues:
- Direction badge: remediate (amber), on_grade (slate), accelerate (emerald).
- Subject card status: struggling (rose), approaching (amber),
  at_grade (slate), above_grade (emerald).

---

## Front-end requirements (ui-2)

Case-management console for caseworkers / learning leads. ui-2 ships with a
tabbed shell. Wire each tab:

- **Queue**: students whose latest term shows a struggling flag and no plan
  yet. Click a row to generate a plan inline.
- **Cases (Roster)**: every student, sortable + filterable. Shows latest plan
  date, plan count, complexity flags.
- **Workflow**: visualize plan-status transitions (draft → shared → archived).
  Simple counts are fine.
- **Analytics**: distribution by current_grade, complexity rate, subjects
  most often remediated vs accelerated, average outcomes per plan.
- **Settings**: voice id override, default audience, curriculum DB latency.

---

## ui-3 placeholder

Reserved. Likely candidates: a parent-facing portal (read-only, single
student, full plan + audio), or a teacher classroom-overlay heatmap that
spans every student in a class.

---

## Build order (40 minutes)

1. **0-5**: boot the placeholder, add the curriculum DB pool, confirm a
   trivial outcome lookup works.
2. **5-12**: `GET /api/students`, `GET /api/students/:id` wired and rendering
   in ui-1 left + centre top.
3. **12-22**: plan agent. Two-step pipeline. Confirm a single
   `POST /api/plans/:id` returns sections with outcomes from the curriculum
   DB (not invented).
4. **22-28**: ui-1 plan panel + render the returned plan.
5. **28-33**: TTS endpoint + inline audio player.
6. **33-40**: polish ui-2 Queue + Roster + Analytics.

If time runs short, drop audio and ui-2 entirely and ship ui-1 with the plan
flow only.

---

## Deployment to Render.com

- Type: Web Service. Branch: main.
- Root Directory: `challenge-3`.
- Build Command: `npm install`.
- Start Command: `node server-1/index.js`.
- Health Check: `/api/health`.
- Env vars: copy from local `.env` (DB_CONNECTION_STRING, VERTEX_*,
  OPENAI_API_KEY, ELEVENLABS_*, REFRESH_TOKEN). Add
  `CURRICULUM_DB_CONNECTION_STRING` with the curriculum DB URL.
- Optional: `ACTIVE_UI=ui-2` to land on the caseworker console at `/`.

Render sets `process.env.PORT`. The server binds to `0.0.0.0`.

---

## Acceptance criteria for the first working slice

- The student picker lists all 100 students with grade-band and complexity
  filters working.
- Selecting a student shows the dashboard with subject trends.
- "Generate plan" for a struggling student returns 3-6 outcomes per section
  whose codes match real curriculum_nodes in the curriculum DB (verify by
  spot-check).
- "Generate audio" produces a playable mp3 the user can scrub.
- ui-2 Queue lists every student with a struggling flag and no plan yet.

If all five work end-to-end against the deployed Render instance, ship it.
