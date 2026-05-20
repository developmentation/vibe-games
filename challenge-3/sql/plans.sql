-- Challenge 3: learning plans + sections.
-- Idempotent. Safe to re-run.
--
-- The plan agent writes one row per generated plan, with N sections (one per
-- subject). outcomes_json carries the curriculum citations the LLM was allowed
-- to choose from; activities_json carries the LLM's proposed activities.
-- Audio and image assets reference plan_id via challenge_3.media_assets.plan_id
-- (soft FK so this migration stays independent of media_assets ordering).
CREATE SCHEMA IF NOT EXISTS challenge_3;

CREATE TABLE IF NOT EXISTS challenge_3.learning_plans (
  id                  BIGSERIAL PRIMARY KEY,
  student_id          BIGINT NOT NULL REFERENCES challenge_3.students(id) ON DELETE CASCADE,
  audience            TEXT NOT NULL DEFAULT 'teacher',     -- teacher, parent, student
  horizon_weeks       INT NOT NULL DEFAULT 4,
  status              TEXT NOT NULL DEFAULT 'draft',       -- draft, shared, archived
  model               TEXT,                                -- the LLM model that produced it
  summary_markdown    TEXT,
  signals_json        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {subjects:[{code,avg,direction,target_grade}]}
  full_plan_json      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- raw record_plan tool output
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_plans_student_idx
  ON challenge_3.learning_plans (student_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS learning_plans_audience_idx
  ON challenge_3.learning_plans (audience);
CREATE INDEX IF NOT EXISTS learning_plans_status_idx
  ON challenge_3.learning_plans (status);

CREATE TABLE IF NOT EXISTS challenge_3.plan_sections (
  id                  BIGSERIAL PRIMARY KEY,
  plan_id             BIGINT NOT NULL REFERENCES challenge_3.learning_plans(id) ON DELETE CASCADE,
  subject_code        TEXT NOT NULL REFERENCES challenge_3.subjects(code),
  current_grade       TEXT NOT NULL,
  target_grade        TEXT NOT NULL,
  direction           TEXT NOT NULL,                       -- remediate, on_grade, accelerate
  current_avg_percent NUMERIC(5,2),
  rationale_markdown  TEXT,
  outcomes_json       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{code,title,why}]
  activities_json     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{title,modality,minutes,materials[]}]
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_sections_plan_idx
  ON challenge_3.plan_sections (plan_id, sort_order);
CREATE INDEX IF NOT EXISTS plan_sections_subject_idx
  ON challenge_3.plan_sections (subject_code);
CREATE INDEX IF NOT EXISTS plan_sections_direction_idx
  ON challenge_3.plan_sections (direction);

CREATE TABLE IF NOT EXISTS challenge_3.ai_chats (
  id                  BIGSERIAL PRIMARY KEY,
  student_id          BIGINT REFERENCES challenge_3.students(id) ON DELETE SET NULL,
  plan_id             BIGINT REFERENCES challenge_3.learning_plans(id) ON DELETE SET NULL,
  audience            TEXT NOT NULL DEFAULT 'teacher',
  user_message        TEXT NOT NULL,
  assistant_message   TEXT NOT NULL,
  model               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_chats_student_idx
  ON challenge_3.ai_chats (student_id, created_at DESC);
