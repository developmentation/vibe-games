# Challenge 1: AISH application intake

Prep sandbox for the Alberta AISH (Assured Income for the Severely Handicapped)
intake-triage challenge. Generates synthetic applicants and supporting document
images, stored in Postgres schema `challenge_1`.

## What this builds

- `challenge_1.applicants`: 100 synthetic applicants with realistic eligibility
  spread (eligible / borderline / ineligible), income and assets in cents,
  medical condition fields, raw payload as JSONB.
- `challenge_1.documents`: 20 supporting documents per applicant, generated as
  PNG images via OpenAI image generation and stored as `bytea`. Catalogue
  includes Alberta ID, driver licence, utility bill, lease, bank statements,
  CRA Notice of Assessment, physician letter, AISH Medical Report Part B,
  pharmacy records, lab results, consent forms.
- `challenge_1.review_queue`: an empty queue table the hackathon agent can
  populate when routing applications to reviewers.

## Scripts

All scripts are idempotent and accept a `--count` flag to top up.

```bash
# 1. Create schema + indexes
node challenge-1/scripts/init-schema.mjs

# 2. Generate applicants (default 100; pass --count 250 to top up)
node challenge-1/scripts/generate-applicants.mjs --count 100 --concurrency 6

# 3. Generate documents (20 per applicant, 8 parallel workers)
node challenge-1/scripts/generate-documents.mjs --per-applicant 20 --concurrency 8

# Smoke-test against a small subset first:
node challenge-1/scripts/generate-documents.mjs --per-applicant 3 --limit 2 --concurrency 4
```

Re-running any script picks up where the previous run left off. Documents use a
unique `(applicant_id, document_label)` index, so partial runs are safe.

## Eligibility extraction

`eligibility.schema.json` is the per-applicant eligibility profile the
extraction agent populates. It carries ~65 leaf fields across identity,
residency, household, financial, medical, expenses, banking, consent, and a
derived eligibility_assessment block. Each leaf declares the documents that
can supply its value (`x-sources`) or the upstream fields it is computed from
(`x-derived`). Coverage validator confirms the 20-doc package covers 100% of
required leaves.

`eligibility.template.json` is the empty starting shape. `extract-applicant.mjs`
clones the template, then walks each document image for an applicant, sends
the image through Vertex Claude with a `record_extracted_fields` tool, and
merges `{path, value, confidence}` triples into the master JSON. Each pass
adds to coverage; collisions resolve in favour of the longer/more-specific
value. After 20 passes the script computes derived eligibility checks and
writes the master to `extracted/<applicant_id>/master.json`, plus per-pass
detail in `passes.json`, plus a row in `challenge_1.extraction_runs`.

```bash
# Extract one applicant (20 sequential Vertex Claude vision calls)
node challenge-1/scripts/extract-applicant.mjs --applicant-id 34 --verbose

# Extract all applicants who have documents (use a low concurrency on Vertex)
node challenge-1/scripts/extract-applicant.mjs --all --concurrency 2 --limit 5

# Validate the catalogue against the schema (no API calls)
node challenge-1/scripts/validate-coverage.mjs
node challenge-1/scripts/validate-coverage.mjs --partnered
```

A 20-doc smoke run on applicant 34 climbs from 17.9% (pass 1: driver licence)
to 80.4% (pass 20 plus derived checks). The per-pass log shows which document
contributed which fields, and where the merge upgraded a prior value.
