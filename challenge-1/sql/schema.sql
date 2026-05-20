-- Challenge 1: AISH application intake sandbox.
-- Idempotent. Safe to re-run.
CREATE SCHEMA IF NOT EXISTS challenge_1;

CREATE TABLE IF NOT EXISTS challenge_1.applicants (
  id              BIGSERIAL PRIMARY KEY,
  external_ref    TEXT UNIQUE NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  date_of_birth   DATE NOT NULL,
  email           TEXT,
  phone           TEXT,
  street_address  TEXT,
  city            TEXT,
  province        TEXT DEFAULT 'AB',
  postal_code     TEXT,
  marital_status  TEXT,
  household_size  INT,
  monthly_income_cents BIGINT,
  liquid_assets_cents  BIGINT,
  primary_medical_condition TEXT,
  secondary_conditions JSONB DEFAULT '[]'::jsonb,
  functional_limitations TEXT,
  treatment_summary TEXT,
  application_status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applicants_status_idx ON challenge_1.applicants (application_status);
CREATE INDEX IF NOT EXISTS applicants_city_idx ON challenge_1.applicants (city);
CREATE INDEX IF NOT EXISTS applicants_submitted_at_idx ON challenge_1.applicants (submitted_at DESC);
CREATE INDEX IF NOT EXISTS applicants_last_name_idx ON challenge_1.applicants (last_name);

CREATE TABLE IF NOT EXISTS challenge_1.documents (
  id              BIGSERIAL PRIMARY KEY,
  applicant_id    BIGINT NOT NULL REFERENCES challenge_1.applicants(id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL,
  document_label  TEXT NOT NULL,
  mime_type       TEXT NOT NULL DEFAULT 'image/png',
  byte_size       INT NOT NULL,
  content         BYTEA NOT NULL,
  generation_prompt TEXT,
  generation_model TEXT,
  document_facts  JSONB DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'received',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE challenge_1.documents ADD COLUMN IF NOT EXISTS document_facts JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS documents_applicant_idx ON challenge_1.documents (applicant_id);
CREATE INDEX IF NOT EXISTS documents_type_idx ON challenge_1.documents (document_type);
CREATE INDEX IF NOT EXISTS documents_status_idx ON challenge_1.documents (status);
CREATE UNIQUE INDEX IF NOT EXISTS documents_applicant_label_uq
  ON challenge_1.documents (applicant_id, document_label);

CREATE TABLE IF NOT EXISTS challenge_1.extraction_runs (
  id              BIGSERIAL PRIMARY KEY,
  applicant_id    BIGINT NOT NULL REFERENCES challenge_1.applicants(id) ON DELETE CASCADE,
  master_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  completeness_percent NUMERIC(5,2),
  documents_processed INT NOT NULL DEFAULT 0,
  model           TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extraction_runs_applicant_idx ON challenge_1.extraction_runs (applicant_id);
CREATE INDEX IF NOT EXISTS extraction_runs_started_at_idx ON challenge_1.extraction_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS challenge_1.extraction_passes (
  id              BIGSERIAL PRIMARY KEY,
  run_id          BIGINT NOT NULL REFERENCES challenge_1.extraction_runs(id) ON DELETE CASCADE,
  document_id     BIGINT NOT NULL REFERENCES challenge_1.documents(id) ON DELETE CASCADE,
  document_label  TEXT NOT NULL,
  pass_index      INT NOT NULL,
  fields_returned INT NOT NULL DEFAULT 0,
  fields_new      INT NOT NULL DEFAULT 0,
  fields_upgraded INT NOT NULL DEFAULT 0,
  cumulative_completeness_percent NUMERIC(5,2),
  raw_fields      JSONB,
  duration_ms     INT,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extraction_passes_run_idx ON challenge_1.extraction_passes (run_id, pass_index);

CREATE TABLE IF NOT EXISTS challenge_1.review_queue (
  id              BIGSERIAL PRIMARY KEY,
  applicant_id    BIGINT NOT NULL REFERENCES challenge_1.applicants(id) ON DELETE CASCADE,
  reviewer_role   TEXT,
  priority        TEXT NOT NULL DEFAULT 'normal',
  gap_summary     TEXT,
  routed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_queue_applicant_idx ON challenge_1.review_queue (applicant_id);
CREATE INDEX IF NOT EXISTS review_queue_priority_idx ON challenge_1.review_queue (priority);
