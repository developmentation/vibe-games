-- Challenge 2: Customer-support triage sandbox.
-- Idempotent. Safe to re-run.
CREATE SCHEMA IF NOT EXISTS challenge_2;

CREATE TABLE IF NOT EXISTS challenge_2.customers (
  id              BIGSERIAL PRIMARY KEY,
  external_ref    TEXT UNIQUE NOT NULL,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  plan_tier       TEXT,
  account_status  TEXT NOT NULL DEFAULT 'active',
  signup_date     DATE,
  city            TEXT,
  province        TEXT DEFAULT 'AB',
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_email_idx ON challenge_2.customers (lower(email));
CREATE INDEX IF NOT EXISTS customers_plan_idx  ON challenge_2.customers (plan_tier);

CREATE TABLE IF NOT EXISTS challenge_2.tickets (
  id              BIGSERIAL PRIMARY KEY,
  external_ref    TEXT UNIQUE NOT NULL,
  customer_id     BIGINT REFERENCES challenge_2.customers(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL,                -- email, chat, phone, portal
  category        TEXT NOT NULL,                -- billing, technical, account, shipping, refund, feature_request, complaint
  subcategory     TEXT,
  priority        TEXT NOT NULL DEFAULT 'normal', -- low, normal, high, urgent
  status          TEXT NOT NULL DEFAULT 'open',   -- open, in_progress, resolved, escalated, closed
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,                -- markdown
  sentiment       TEXT,
  expected_resolution TEXT,                     -- auto_resolve, human_required, escalation_required
  language        TEXT NOT NULL DEFAULT 'en',
  tags            JSONB DEFAULT '[]'::jsonb,
  metadata        JSONB DEFAULT '{}'::jsonb,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_response_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_status_idx   ON challenge_2.tickets (status);
CREATE INDEX IF NOT EXISTS tickets_priority_idx ON challenge_2.tickets (priority);
CREATE INDEX IF NOT EXISTS tickets_category_idx ON challenge_2.tickets (category);
CREATE INDEX IF NOT EXISTS tickets_submitted_at_idx ON challenge_2.tickets (submitted_at DESC);
CREATE INDEX IF NOT EXISTS tickets_customer_idx ON challenge_2.tickets (customer_id);
CREATE INDEX IF NOT EXISTS tickets_channel_idx  ON challenge_2.tickets (channel);

CREATE TABLE IF NOT EXISTS challenge_2.ticket_messages (
  id              BIGSERIAL PRIMARY KEY,
  ticket_id       BIGINT NOT NULL REFERENCES challenge_2.tickets(id) ON DELETE CASCADE,
  author_role     TEXT NOT NULL,                -- customer, agent, system, ai
  body            TEXT NOT NULL,                -- markdown
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON challenge_2.ticket_messages (ticket_id, created_at);
