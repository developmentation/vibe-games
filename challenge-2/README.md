# Challenge 2: Customer-support triage

Prep sandbox for the support-ticket triage challenge. Generates synthetic
customer support tickets for a fictional Alberta telco "Pronghorn Mobile",
stored in Postgres schema `challenge_2`.

## What this builds

- `challenge_2.customers`: synthetic customer profiles inferred from each
  ticket (email-keyed; the same customer can appear on multiple tickets if the
  generator emits a duplicate email).
- `challenge_2.tickets`: 200+ tickets covering seven categories (billing,
  technical, account, shipping, refund, feature_request, complaint), four
  channels (email, chat, phone, portal), four priority bands, six sentiment
  bands, and three expected-resolution paths (auto_resolve, human_required,
  escalation_required). About 1 in 10 tickets are in French.
- `challenge_2.ticket_messages`: empty conversation table the hackathon agent
  can populate as it triages, drafts responses, or escalates.

## Generation method

Tickets are produced via Vertex Claude (`claude-sonnet-4-6`) using tool-use
calls. The tool input schema is enforced both on the model side and via Zod
validation in Node before insert. This means every row that lands in the DB
satisfies the strict ticket schema.

## Scripts

```bash
node challenge-2/scripts/init-schema.mjs
node challenge-2/scripts/generate-tickets.mjs --count 200 --concurrency 4 --batch 10
```

`--count` tops up to that target; re-running is safe.
