# Alberta.ca prototype harness

A Claude Code harness for **rapidly scaffolding Alberta.ca-aligned prototype pages** that look, feel, and behave like real production alberta.ca content — and are ready to drop into Drupal (`goa_core` theme) once approved.

You describe a page or program in one sentence. The harness slot-fills a canonical Alberta.ca template, wires in the real Government of Alberta (GoA) design system, serves it locally, accessibility-checks it, and writes a human test plan. No hand-rolled chrome, no look-alike CSS, no inline hacks.

---

## Why this exists

Building a clickable Alberta.ca prototype the traditional way means hand-copying header / footer / breadcrumb markup, guessing at GoA tokens, and inevitably drifting from the real design system. Reviewers then can't tell whether what they're looking at would survive deployment.

This harness fixes the drift by:

- **Vendoring the real GoA stylesheets** (six pre-split CSS files, ~826 KB) — not approximations.
- **Hand-curating one canonical master template** at `apps/_template/page.html`. Every page is a slot-fill of this template.
- **Proxying theme assets** (fonts, favicons, images) to www.alberta.ca so prototypes render exactly like production.
- **Enforcing invariants with a static evaluator** — real `.goa-field` / `.goa-button` / `.goa-form` classes, no orphan `goa.init` or GTM, no missed stylesheets, no skipped heading levels.

The result is a prototype a reviewer can mistake for a live alberta.ca page.

---

## What you can build

| Brief | Output |
|---|---|
| "Build me an AISH calculator" | One single-page tool under `apps/aish-calculator/` |
| "Build me a red-tape reporting form" | Single-page form with validation + NDJSON persistence |
| "Build me an Alberta Drone Registry **program**" | Multi-page program: hub + 2–4 topic pages + apply form, sharing one sidebar |
| "Refresh the design system from alberta.ca" | Re-vendors GoA CSS + updates the master template |
| "Sign off this prototype" | Runs the evaluator + writes a human test plan |

The harness recognises the word **"program"** plus multiple audiences as a multi-page signal. Everything else defaults to a single page.

---

## How it works

### Five progressive-disclosure skills

Each skill is a self-contained directory under `.claude/skills/` with its own `SKILL.md` (the authoritative spec) and the scripts it needs.

| Skill | Purpose | Run when |
|---|---|---|
| `extracting-alberta-pages` | Re-vendors the 6 GoA stylesheets + audits real alberta.ca pages | Setup, or after a GoA redesign |
| `generating-alberta-page` | Slot-fills `apps/_template/page.html` from your config + body | Every new page |
| `hosting-prototype` | Local Node server — single-app or whole-program with cross-links | After generation |
| `evaluating-prototype` | 34-check static analyzer (WCAG 2.1 AA + GoA-class + requirements crosswalk) | Sign-off gate |
| `writing-test-plan` | Markdown checklist for a human tester (keyboard, screen reader, mobile, golden path) | After eval passes |

You invoke them by describing what you want — Claude picks the right skill. Or trigger them directly with `/<skill-name>`.

### The build pipeline

```
requirements.md + page.config.json + body.html + styles.css + app.js
        │
        ▼ build.mjs            (generating-alberta-page)
apps/<slug>/index.html         ← slot-filled from apps/_template/page.html
        │
        ▼ serve.mjs            (hosting-prototype, single-app)
        ▼ serve-multi.mjs      (hosting-prototype, multi-page program)
http://localhost:<port>/
        │
        ▼ evaluate.mjs         (evaluating-prototype, must hit 0 fails)
apps/<slug>/evaluation.md
        │
        ▼ writing-test-plan
apps/<slug>/test-plan.md
```

---

## Single-page workflow

1. **Sketch the requirements** → `apps/<slug>/requirements.md` (bullets; the evaluator crosswalks them later).
2. **Configure the page** → `apps/<slug>/page.config.json` (title, lede, breadcrumbs, parent link, optional sidebar / hero).
3. **Write the body** → `apps/<slug>/body.html` — only the content paragraphs, wrapped in `.goa-main-grid` and `.paragraph` blocks (Drupal-Paragraphs-ready).
4. **Page styles** → `apps/<slug>/styles.css` (page-namespaced; never touch global GoA classes).
5. **Behaviour** → `apps/<slug>/app.js` (plain script — no framework runtime).
6. **Build** → `node .claude/skills/generating-alberta-page/scripts/build.mjs <slug>`.
7. **Serve** → copy `serve.mjs` into the app folder and run `node apps/<slug>/serve.mjs --port 5179`.
8. **Evaluate** until clean → `node .claude/skills/evaluating-prototype/scripts/evaluate.mjs <slug>`.
9. **Test plan** → invoke `writing-test-plan`.

## Multi-page program workflow

A program is N single-pages sharing one sidebar config. Common shape:

```
<prog>                  hub (overview, cards, CTAs)
<prog>-<topic-a>        topic page
<prog>-<topic-b>        topic page
<prog>-<topic-c>        topic page
<prog>-apply            intake form
```

Compose the shared sidebar once, flip `current: true` on the link matching each page, then run the single-page workflow for each. Launch the whole program with one server:

```
node .claude/skills/hosting-prototype/scripts/serve-multi.mjs --port 5180
```

Cross-page links resolve naturally because the multi-server serves every `apps/<slug>/` under `/<slug>/` and 301-redirects `/<slug>` to `/<slug>/` so relative `./styles.css` works.

---

## Real GoA components — use the right classes

The vendored CSS styles a specific set of classes. Generic Drupal classes (`.form-item`, `.form-required`, `.description`) render as browser defaults and look broken. The full inventory (~835 classes across ~328 families) is at `.claude/skills/generating-alberta-page/reference/goa-class-catalogue.md`.

Quick reference for the common ones:

| Use | Not |
|---|---|
| `<div class="goa-form"><form>…</form></div>` | bare `<form>` |
| `<div class="goa-field"><label>…</label><input></div>` | `<div class="form-item">` |
| `<div class="goa-option"><input type="checkbox"><label>…</label></div>` | bare checkboxes |
| `<button class="goa-button">` / `.goa-button.goa--secondary` | `<button class="goa-btn">` |
| `<div class="goa-callout goa--important">` (or `goa--success` / `goa--error` / `goa--emergency` / `goa--event`) | bare `<div class="goa-callout">` (that's a large bold pull-quote, not a neutral default) |
| `<div class="goa-card goa--open">` | `<div class="card">` |
| `<div class="goa-table"><table>…</table></div>` | bare `<table>` (no borders, no header styling) |

Before reaching for `<table>`, `<details>`, `<dl>`, `<code>`, grep `apps/_shared/vendor/css/goa-components.css` for a styled wrapper. The design system has ~50 components, not just forms.

---

## Repo layout

```
.claude/                                  harness — skills, hooks, settings
├── README.md                             dev notes for the harness internals
├── settings.json                         permissions + hooks
├── hooks/
│   ├── log-edit.mjs                      logs every Write/Edit
│   └── inject-context.mjs                surfaces harness invariants each turn
└── skills/
    ├── extracting-alberta-pages/         + scripts/vendor.mjs, extract.mjs
    ├── generating-alberta-page/          + scripts/build.mjs, reference/goa-class-catalogue.md
    ├── hosting-prototype/                + scripts/serve.mjs, serve-multi.mjs
    ├── evaluating-prototype/             + scripts/evaluate.mjs, reference/wcag-checklist.md
    └── writing-test-plan/

apps/
├── _template/page.html                   canonical master with {{SLOT}} placeholders
├── _template/page.config.example.json    config shape doc
├── _shared/vendor/css/                   6 GoA stylesheets (~826 KB)
│   ├── goa-base{,.print}.css             resets, typography, tokens
│   ├── goa-layouts{,.print}.css          grid, containers, breakpoints
│   └── goa-components{,.print}.css       forms, buttons, callouts, header, footer
└── <slug>/                               each prototype:
    requirements.md  page.config.json  body.html
    styles.css       app.js             index.html (generated)
    serve.mjs        submissions.ndjson evaluation.md  test-plan.md

CLAUDE.md                                 authoritative spec for Claude
README.md                                 this file
extractions/                              audit-trail snapshots from alberta.ca (optional)
urls.md                                   seed URLs for refresh runs
prompt.md                                 the original brief for this harness
```

---

## Invariants (the evaluator enforces these)

- Every prototype slot-fills `apps/_template/page.html`. No hand-written chrome.
- Every prototype imports the 6 GoA stylesheets from `/_shared/vendor/css/`.
- No inline `<script>` calling `goa.*`, `ab.*`, `drupalSettings`, or Google Tag Manager — those have no runtime here and crash the page.
- Forms use `.goa-field` / `.goa-form`. Buttons use `.goa-button`.
- Exactly one `<h1>`, heading levels never skip.
- Theme assets are proxied to www.alberta.ca by the server, so missed paths do not 404.
- Form submissions land in `apps/<slug>/submissions.ndjson` (append-only).

## Optional hero banner

Landing / topic / hub pages can opt into a full-width photo hero by adding `hero` to `page.config.json`:

```json
"hero": {
  "image_url": "/system/files/styles/responsive_2080/private/banner.jpg",
  "position": "center center"
}
```

Use it for landing pages; skip it for dense forms and service-detail pages.

---

## Refreshing the design system

When alberta.ca redesigns, ask Claude to *"refresh the design system from alberta.ca"*. That invokes `extracting-alberta-pages`, which re-vendors the 6 GoA stylesheets into `apps/_shared/vendor/css/` and rebuilds the class catalogue. The canonical template at `apps/_template/page.html` is hand-curated — only update it deliberately.

## Cleaning up to a fresh slate

Keep the harness, drop the prototypes:

```powershell
# Windows PowerShell — keep _template and _shared, delete every other app folder
Get-ChildItem apps -Directory | Where-Object { $_.Name -notin '_template','_shared' } | Remove-Item -Recurse -Force
Remove-Item -Recurse -Force .claude\logs, extractions -ErrorAction SilentlyContinue
```

The harness still builds because `apps/_template/page.html`, `apps/_template/page.config.example.json`, and `apps/_shared/vendor/css/*` are the only runtime dependencies.

---

## Where to read more

- **`CLAUDE.md`** — the authoritative spec for how Claude drives the harness. Read this if you're customising behaviour or debugging unexpected output.
- **`.claude/skills/<skill>/SKILL.md`** — the contract for each skill. Self-contained; read the one you're invoking.
- **`apps/_shared/vendor/css/goa-components.css`** — the source of truth for which GoA classes exist.
- **`.claude/skills/generating-alberta-page/reference/goa-class-catalogue.md`** — generated inventory of every class the design system styles.
