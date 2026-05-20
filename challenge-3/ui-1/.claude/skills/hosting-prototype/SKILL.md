---
name: hosting-prototype
description: Scaffolds and launches a local Node.js server for one or more prototypes under apps/. Two modes — single-app (serve.mjs at the app root) for a single tool, or multi-app (serve-multi.mjs) for browsing a full program with real cross-page links. Both proxy /themes/, /sites/, /system/files/ to www.alberta.ca so theme assets do not 404. Use after generating-alberta-page, or when the user asks to "launch / serve / open" any prototype.
---

# Hosting a prototype locally

This skill ships two zero-dependency Node servers. Both boot in under a second on Node 20+ and both live-reload connected browsers when files change.

## Pick the right server

| Server | When | URL shape |
|---|---|---|
| `scripts/serve.mjs` | Single prototype, no cross-page links to other apps | `http://localhost:5179/` → that one app |
| `scripts/serve-multi.mjs` | Multi-page program (hub + topic pages + apply form) or you want every app browsable from one port | `http://localhost:5180/<slug>` → each app |

If in doubt, use `serve-multi.mjs` — it serves single apps just fine and gives you an index page at `/`.

## Single-app workflow

```
- [ ] 1. Copy serve.mjs into the app folder (Windows-safe — no symlinks):
         node -e "require('node:fs').copyFileSync('.claude/skills/hosting-prototype/scripts/serve.mjs','apps/<slug>/serve.mjs')"
- [ ] 2. Run: node apps/<slug>/serve.mjs --port 5179
- [ ] 3. Open http://localhost:5179
```

The page is served at `/`. Form submissions (`POST /api/submit`) land in `apps/<slug>/submissions.ndjson`.

## Multi-app workflow

```
- [ ] 1. Run: node .claude/skills/hosting-prototype/scripts/serve-multi.mjs --port 5180
- [ ] 2. Open http://localhost:5180/  for the auto-generated index
- [ ] 3. Each app lives at /<slug>
```

No per-app copy step — the multi-app server runs in place.

## URL routing (multi-app server)

```
GET  /                       auto-generated index of every apps/<slug>/ folder
GET  /<slug>                 apps/<slug>/index.html
GET  /<slug>/<file>          apps/<slug>/<file>
GET  /_shared/...            apps/_shared/...
POST /api/submit             reads Referer to identify <slug>;
                             appends body to apps/<slug>/submissions.ndjson
GET  /api/submissions?slug=  the submissions file for that slug
GET  /__reload               SSE live-reload stream
GET  /themes|/sites|/system/files|/misc/...  proxied to www.alberta.ca
```

The slug-from-Referer routing means apps can keep their `fetch("/api/submit", …)` calls portable — no per-app URL changes needed for multi-page programs.

## API contract: POST /api/submit

The submit endpoint exists in both servers. It accepts a JSON object of any shape and appends one NDJSON line per submission.

**Request:**

```
POST /api/submit
Content-Type: application/json

{ "any": "shape", "the": "form posts" }
```

**Response (success):**

```
HTTP 200
Content-Type: application/json

{ "ok": true, "id": "2026-05-12T05:14:51.257Z" }
```

The `id` is the ISO timestamp; it is also the `received_at` field saved to disk.

**Persisted record (one line, NDJSON):**

```json
{"received_at":"2026-05-12T05:14:51.257Z","slug":"alberta-ip-office-apply","applicant_name":"Smoke Test","contact_email":"smoke@example.com","stage":"protection"}
```

- `received_at` is always added by the server (UTC ISO timestamp).
- `slug` is added by the multi-app server (derived from Referer). The single-app server does not add it — the slug is implicit in the file path.
- Every other field is verbatim from the request JSON body.
- Bodies that fail to parse as JSON are still recorded under `{"raw": "<text>"}`.

**Reading back:** `GET /api/submissions` (single-app) or `GET /api/submissions?slug=<slug>` (multi-app) returns the NDJSON file as `text/plain`.

## app.js contract

`apps/<slug>/app.js` is loaded with `<script src="./app.js"></script>` at the bottom of `<body>`. It is a plain script (not an ES module), so:

- It runs in the global scope of the page; declare locals with `const`/`let` and don't pollute `window`.
- It can use modern syntax (Node 20+, evergreen browsers): `async/await`, template literals, optional chaining, etc.
- It cannot use `import`. If you need shared utilities, inline them or vendor them under `apps/_shared/`.
- For a form, the typical pattern is: attach a `submit` listener, build a payload, `await fetch("/api/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })`, render the success state.

Look at `apps/report-red-tape/app.js` or `apps/alberta-ip-office-apply/app.js` for full validators with `.goa-field.goa--error` + `.error-help` integration.

## What the servers do not do

- No auth — local prototypes only. Never expose to a network.
- No database — submissions are NDJSON files.
- No bundler — every prototype is plain HTML/CSS/JS.
- No HTTPS — `localhost` only.

## Drupal deployment

For Drupal deployment, the prototype's `body.html` is the content to paste into a Drupal Paragraph; `page.config.json` describes the chrome Drupal already provides through `goa_core`; `styles.css` and `app.js` attach as Drupal libraries. The submit URL changes — production points at a real Drupal webform endpoint, not `/api/submit`.
