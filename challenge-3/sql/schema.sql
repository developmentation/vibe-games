-- Challenge 3: K-12 personalized learning sandbox.
-- Idempotent. Safe to re-run.
CREATE SCHEMA IF NOT EXISTS challenge_3;

CREATE TABLE IF NOT EXISTS challenge_3.students (
  id              BIGSERIAL PRIMARY KEY,
  asin            CHAR(9) UNIQUE NOT NULL,           -- Alberta Student Identification Number (synthetic)
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  date_of_birth   DATE NOT NULL,
  current_grade   TEXT NOT NULL,                     -- K, 1..12
  school_name     TEXT,
  school_division TEXT,
  city            TEXT,
  province        TEXT DEFAULT 'AB',
  language_of_instruction TEXT NOT NULL DEFAULT 'en',
  has_complexity  BOOLEAN NOT NULL DEFAULT false,
  complexity_profile JSONB DEFAULT '{}'::jsonb,      -- {flags:[...], supports:[...], notes:""}
  guardian_name   TEXT,
  guardian_email  TEXT,
  guardian_phone  TEXT,
  enrolled_at     DATE,
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS students_grade_idx        ON challenge_3.students (current_grade);
CREATE INDEX IF NOT EXISTS students_complexity_idx   ON challenge_3.students (has_complexity);
CREATE INDEX IF NOT EXISTS students_division_idx     ON challenge_3.students (school_division);
CREATE INDEX IF NOT EXISTS students_last_name_idx    ON challenge_3.students (last_name);

CREATE TABLE IF NOT EXISTS challenge_3.subjects (
  code          TEXT PRIMARY KEY,
  name_en       TEXT NOT NULL,
  is_core       BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS challenge_3.grade_history (
  id              BIGSERIAL PRIMARY KEY,
  student_id      BIGINT NOT NULL REFERENCES challenge_3.students(id) ON DELETE CASCADE,
  school_year     TEXT NOT NULL,                   -- e.g. 2024-2025
  grade_level     TEXT NOT NULL,                   -- K, 1..12
  subject_code    TEXT NOT NULL REFERENCES challenge_3.subjects(code),
  term            INT NOT NULL,                    -- 1, 2, 3
  mark_percent    NUMERIC(5,2),
  letter_grade    TEXT,
  performance     TEXT,                            -- below_grade, approaching, at_grade, above_grade
  struggling      BOOLEAN NOT NULL DEFAULT false,
  excelling       BOOLEAN NOT NULL DEFAULT false,
  teacher_comment TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS grade_history_unique_idx
  ON challenge_3.grade_history (student_id, school_year, subject_code, term);
CREATE INDEX IF NOT EXISTS grade_history_student_idx ON challenge_3.grade_history (student_id);
CREATE INDEX IF NOT EXISTS grade_history_subject_idx ON challenge_3.grade_history (subject_code);
CREATE INDEX IF NOT EXISTS grade_history_struggling_idx ON challenge_3.grade_history (struggling) WHERE struggling = true;
CREATE INDEX IF NOT EXISTS grade_history_excelling_idx ON challenge_3.grade_history (excelling) WHERE excelling = true;

CREATE TABLE IF NOT EXISTS challenge_3.iep_notes (
  id              BIGSERIAL PRIMARY KEY,
  student_id      BIGINT NOT NULL REFERENCES challenge_3.students(id) ON DELETE CASCADE,
  note_type       TEXT NOT NULL,                -- assessment, accommodation, goal, intervention
  body_markdown   TEXT NOT NULL,
  author_role     TEXT NOT NULL DEFAULT 'teacher',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iep_notes_student_idx ON challenge_3.iep_notes (student_id);
