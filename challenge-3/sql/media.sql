-- Challenge 3: generated media assets (classroom imagery + narrated prose audio).
-- Idempotent. Safe to re-run.
--
-- One table holds both modalities; `kind` discriminates. Binary content lives in
-- BYTEA so the demo can stream straight from Postgres without depending on
-- object storage. For larger libraries, set `content` to NULL and use
-- `storage_url` instead.
CREATE SCHEMA IF NOT EXISTS challenge_3;

CREATE TABLE IF NOT EXISTS challenge_3.media_assets (
  id              BIGSERIAL PRIMARY KEY,
  kind            TEXT NOT NULL,                       -- image, audio
  subject_code    TEXT REFERENCES challenge_3.subjects(code),
  grade_level     TEXT,                                -- K, 1..12, or NULL for cross-grade
  audience        TEXT,                                -- teacher, parent, student
  title           TEXT NOT NULL,
  prompt          TEXT NOT NULL,                       -- prompt sent to OpenAI / story text fed to ElevenLabs
  prose_markdown  TEXT,                                -- for audio: the source narration script
  outcome_node_ids JSONB DEFAULT '[]'::jsonb,          -- curriculum_nodes ids this asset cites
  model           TEXT,                                -- gpt-image-1, eleven_multilingual_v2, etc.
  voice_id        TEXT,                                -- ElevenLabs voice id used (audio only)
  mime_type       TEXT NOT NULL,                       -- image/png, audio/mpeg
  width           INT,
  height          INT,
  duration_seconds NUMERIC(6,2),
  byte_size       INT NOT NULL DEFAULT 0,
  content         BYTEA,                               -- inline bytes; nullable when storage_url is set
  storage_url     TEXT,                                -- optional external URL
  student_id      BIGINT REFERENCES challenge_3.students(id) ON DELETE SET NULL,
  plan_id         BIGINT,                              -- learning_plans.id; soft FK to keep this migration independent
  metadata        JSONB DEFAULT '{}'::jsonb,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_kind_idx       ON challenge_3.media_assets (kind);
CREATE INDEX IF NOT EXISTS media_assets_subject_idx    ON challenge_3.media_assets (subject_code);
CREATE INDEX IF NOT EXISTS media_assets_grade_idx      ON challenge_3.media_assets (grade_level);
CREATE INDEX IF NOT EXISTS media_assets_student_idx    ON challenge_3.media_assets (student_id);
CREATE INDEX IF NOT EXISTS media_assets_plan_idx       ON challenge_3.media_assets (plan_id);
CREATE INDEX IF NOT EXISTS media_assets_generated_idx  ON challenge_3.media_assets (generated_at DESC);
