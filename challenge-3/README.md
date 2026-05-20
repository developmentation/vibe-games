# Challenge 3: K-12 personalized learning

Prep sandbox for the Alberta K-12 personalized-learning challenge. Generates
synthetic students (ASIN, K-12 grade level, ~1/3 with classroom-complexity
flags) and a three-year grade history per student, stored in Postgres schema
`challenge_3`.

## What this builds

- `challenge_3.students`: 100 students with synthetic 9-digit ASINs, grade
  levels distributed across K-12, school division and school name, complexity
  profile JSONB (flags + supports), guardian contact.
- `challenge_3.subjects`: seeded with the Alberta core + complementary subject
  codes (ELA, MAT, SCI, SOC, FLA, PHE, FNA, CTF, CTS).
- `challenge_3.grade_history`: per-term marks across three school years, with
  `struggling` and `excelling` flags computed from `mark_percent` bands so the
  hackathon agent can drop down or skip ahead from the official curriculum.
- `challenge_3.iep_notes`: short teacher commentary blocks (assessment, goals,
  recommendations) authored via OpenAI for each student.

## Curriculum anchor

The companion read-only curriculum database lives at
`alberta-curriculum-extraction` on Render. Phase 1 holds raw subjects, grades,
and curriculum_nodes; phase 2 holds normalized nodes + embeddings. The
hackathon agent should join `challenge_3.grade_history.subject_code` to
`phase1.subjects.code` to pull learning outcomes at the appropriate grade.

## Scripts

```bash
node challenge-3/scripts/init-schema.mjs
node challenge-3/scripts/generate-students.mjs --count 100 --years 3 --terms-per-year 3 --concurrency 4
```

Re-running tops up to `--count`. Grade history is only generated for newly
inserted students.
