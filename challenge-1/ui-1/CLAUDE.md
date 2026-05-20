# Alberta.ca harness — CLAUDE.md

You are working inside a custom Claude Code harness for building Alberta.ca-aligned prototypes that are ready to deploy into Drupal (`goa_core` theme). The harness is driven by five progressive-disclosure skills under `.claude/skills/` plus a hand-curated canonical page template.

## What this harness is for

When the user says any of these, this is the right harness:

- "Build me a tool / page / app / form for alberta.ca"
- "Make me an Alberta IP Office / AISH calculator / business license finder"
- "Build me a program for X" → **multi-page** (hub + topic pages + apply form)
- "Build me a tool for X" → **single-page** unless context says otherwise
- "Refresh the design system from alberta.ca"
- "Sign off / evaluate / test plan for this prototype"

## Reproduce from a one-sentence brief

Given a brief like *"Build me an Alberta Drone Registry program for hobbyists and commercial operators"*, the harness will:

1. **Recognise it as a program** (the word "program" + multiple audiences hints at multi-page).
2. Plan the page set: a hub, 2–4 topic pages, an apply form, contact info.
3. Scaffold each as its own `apps/<slug>/` folder, sharing one sidebar config.
4. Run `build.mjs` for each, evaluate, then launch `serve-multi.mjs` so the user can browse with real cross-links.
5. Generate a test plan covering the program-level navigation.

For a single-tool brief like *"Build me a red-tape reporting form"*, the harness does exactly one app — same flow, fewer pages.

## The five skills

| Skill | Purpose |
|---|---|
| `extracting-alberta-pages` | Refresh the vendored GoA CSS / shell. Run at setup or after a redesign. |
| `generating-alberta-page` | Turn a brief + config → `apps/<slug>/index.html`. Strict slot-filling. |
| `hosting-prototype` | Launch a local server — single-app (`serve.mjs`) or multi-app (`serve-multi.mjs`). |
| `evaluating-prototype` | WCAG + GoA-class + requirements crosswalk → `evaluation.md`. Sign-off gate. |
| `writing-test-plan` | Markdown checklist for a human tester → `test-plan.md`. |

Read the full `SKILL.md` for whichever skill is being invoked. Do not infer behaviour from this index.

## Required runtime assets (must exist before `build.mjs` runs)

These are *not* under `.claude/` — they are runtime dependencies in `apps/`:

```
apps/_template/page.html                 canonical master with {{SLOT}} placeholders
apps/_template/page.config.example.json  shape doc — copy into new apps
apps/_shared/vendor/css/                 6 pre-split GoA stylesheets (~826 KB)
  goa-base{,.print}.css                  resets, typography, tokens
  goa-layouts{,.print}.css               grid, containers, breakpoints
  goa-components{,.print}.css            forms, buttons, callouts, header, footer
```

If any of these are missing the build aborts. To rehydrate, source the GoA core export (the AISH/ADAP calculator's `WEB-TEMPLATE/resources/` is one canonical source) and copy the 6 CSS files into `apps/_shared/vendor/css/`. The template itself is hand-curated and committed.

## Single-app workflow

```
1. Write apps/<slug>/requirements.md   (bulleted; drives the evaluator crosswalk)
2. Write apps/<slug>/page.config.json  (title, lede, breadcrumbs, parent, body class)
3. Write apps/<slug>/body.html          (one or more <div class="goa-main-grid">…</div>)
4. Write apps/<slug>/styles.css         (page-namespaced rules only)
5. Write apps/<slug>/app.js             (plain script — see "app.js contract" in hosting-prototype SKILL)
6. node .claude/skills/generating-alberta-page/scripts/build.mjs <slug>
7. Copy serve.mjs into the app folder:
       node -e "require('node:fs').copyFileSync('.claude/skills/hosting-prototype/scripts/serve.mjs','apps/<slug>/serve.mjs')"
8. Launch: node apps/<slug>/serve.mjs --port 5179
9. node .claude/skills/evaluating-prototype/scripts/evaluate.mjs <slug>   (until 0 fail)
10. Write apps/<slug>/test-plan.md       (use writing-test-plan skill)
11. Tell the user: how to launch, what to test
```

For form submissions, see the **API contract: POST /api/submit** section in `hosting-prototype/SKILL.md` — the request shape, NDJSON record format, and slug-from-Referer routing are documented there.

## Multi-page program workflow

A program is N single-apps sharing one sidebar config.

```
1. Decide the page set. Common shape:
     <prog>                      — hub (overview, cards, CTAs)
     <prog>-<topic-a>            — topic page
     <prog>-<topic-b>            — topic page
     <prog>-<topic-c>            — topic page
     <prog>-apply                — intake form

2. Compose the SHARED sidebar config (write it once mentally):
     "sidebar": {
       "heading": "<Program name>",
       "heading_href": "/<prog>",
       "links": [
         { "label": "Overview",       "href": "/<prog>" },
         { "label": "<Topic A>",      "href": "/<prog>-<topic-a>" },
         { "label": "<Topic B>",      "href": "/<prog>-<topic-b>" },
         { "label": "<Topic C>",      "href": "/<prog>-<topic-c>" },
         { "label": "Apply",          "href": "/<prog>-apply" },
         { "label": "Contact",        "href": "https://www.alberta.ca/contact-government" }
       ]
     }

3. For each page, run the single-app workflow steps 1–6. In each page.config.json,
   include the sidebar config above, and flip `current: true` on the link matching
   that page's slug.

4. Launch ONE server for the whole program:
     node .claude/skills/hosting-prototype/scripts/serve-multi.mjs --port 5180

5. Evaluate every page (0 FAILs each). Generate ONE program-level test-plan.md
   that walks the user across pages and verifies the cross-navigation.
```

## Optional hero banner

Pages that play the role of a landing or topic page (hub, marketing, service-area overview) can opt into the alberta.ca hero-banner pattern by adding a `hero` block to `page.config.json`:

```json
"hero": {
  "image_url": "/system/files/styles/responsive_2080/private/banner.jpg",
  "position": "center center"
}
```

This replaces the standard text-only page header with a full-width hero: photo + dark gradient + large title + lede. Breadcrumbs stay above the photo. When `hero` is omitted, the page header is the standard text-only block (current default). Use a hero for landing/topic pages; skip it for service-detail pages, dense forms, and documentation.

## body.html shape (Drupal-paragraphs-ready)

`body.html` contains **only the content paragraphs**. The template provides `<main>`, `.goa-container`, optional sidebar. Wrap content in one or more `.goa-main-grid` blocks containing `.paragraph.goa-column-XX-XX-XX` children, matching how Drupal Paragraphs render:

```html
<div class="goa-main-grid">
  <div class="paragraph paragraph--type--text-block paragraph--view-mode--default goa-column-100-100-100">
    <h2>…</h2>
    <p>…</p>
  </div>
</div>

<div class="goa-main-grid">
  <div class="paragraph paragraph--type--text-block paragraph--view-mode--default goa-column-33-33-100">
    <div class="goa-card goa--open">…</div>
  </div>
  <!-- two more goa-column-33-33-100 paragraphs for a 3-up card row -->
</div>
```

Column variants available in `goa-layouts.css`: `goa-column-100`, `goa-column-50`, `goa-column-33`, `goa-column-66` plus breakpoint suffixes like `goa-column-50-50-100` (desktop-tablet-mobile percentages).

## Real GoA component classes — use these, not generic Drupal classes

The vendored CSS styles **these** classes. Generic Drupal classes (`.form-item`, `.form-required`, `.description`) render as browser defaults and look broken.

| Use | Not |
|---|---|
| `<div class="goa-form"><form>…</form></div>` | bare `<form>` |
| `<div class="goa-field"><label>…</label><input></div>` | `<div class="form-item">` |
| `<label for="x">Label</label>` (required is default) | inventing your own asterisk markup |
| `<label>Label <span class="optional">(optional)</span></label>` | omitting optional hint |
| `<div class="goa-option"><input type="checkbox"><label>…</label></div>` | bare checkboxes |
| `<button class="goa-button">Primary</button>` | `<button class="goa-btn">` |
| `<button class="goa-button goa--secondary">Secondary</button>` | bare `<button>` |
| `<div class="goa-field goa--error">` + `<div class="error-help">…</div>` for errors | custom error classes |
| `<div class="goa-callout">…</div>` with optional `goa--important`, `goa--success`, `goa--error`, `goa--emergency`, `goa--event` | custom callout class |
| `<div class="goa-card goa--open">` for non-truncated cards | `<div class="card">` |
| `<div class="goa-table"><table>…</table></div>` — wraps every table; gives you borders, header background, sticky headers | bare `<table>` (renders with no borders, no header styling) |
| `<details class="cop-faq-item">` (page-namespaced) for collapsible content — see `apps/cyber-ai-cop/styles.css` for the reference styling | bare `<details>` (triangle marker, no padding) or `.goa-accordion` (the GoA accordion needs JS this harness does not ship) |

**Before reaching for a native HTML element**, check whether GoA has a styled wrapper. Bare `<table>`, `<details>`, `<dl>`, `<code>` all render as unstyled browser defaults.

**Canonical class inventory:** `.claude/skills/generating-alberta-page/reference/goa-class-catalogue.md` lists all ~835 GoA classes across ~328 families plus every native HTML element the design system styles. Regenerate after vendored-CSS refresh:
```
node .claude/skills/generating-alberta-page/scripts/catalogue-classes.mjs
```

**Callout variants — pick the right one:**

The bare `<div class="goa-callout">` (no variant class) is intentionally a **large bold pull-quote** (24px font, weight 700, dark blue) for single-sentence emphasis statements. For ordinary multi-line body callouts, always use a variant: `.goa-callout.goa--important`, `goa--success`, `goa--error`, `goa--emergency`, or `goa--event`. If your "intro callout" duplicates the page-header lede, delete it — don't double up.

**Discovery rule:** before writing any new class, grep `apps/_shared/vendor/css/goa-components.css` first. If the class is in there, use it. If not, namespace yours with your page slug (`.rt-actions`, `.ip-service-card`).

## Invariants (the evaluator enforces these)

- Every prototype slot-fills `apps/_template/page.html`. No hand-written chrome.
- Every prototype imports the 6 GoA stylesheets at `/_shared/vendor/css/`.
- No inline `<script>` calling `goa.*`, `ab.*`, `drupalSettings`, or Google Tag Manager — those have no runtime here and crash the page.
- Forms use `.goa-field`/`.goa-form`. Buttons use `.goa-button`.
- Exactly one `<h1>`, heading levels never skip.
- Theme assets (favicon, etc.) are proxied to www.alberta.ca by the server, so missed paths do not 404.
- Submissions land in `apps/<slug>/submissions.ndjson` (append-only NDJSON).

## Repo layout

```
.claude/                                     harness — skills, hooks, settings
  README.md
  settings.json
  hooks/
  skills/
    extracting-alberta-pages/SKILL.md       + scripts/vendor.mjs, extract.mjs
    generating-alberta-page/SKILL.md        + scripts/build.mjs
    hosting-prototype/SKILL.md              + scripts/serve.mjs, serve-multi.mjs
    evaluating-prototype/SKILL.md           + scripts/evaluate.mjs, reference/wcag-checklist.md
    writing-test-plan/SKILL.md
CLAUDE.md                                    this file (canonical entrypoint)
apps/
  _template/page.html                        canonical master
  _template/page.config.example.json         config shape
  _shared/vendor/css/                        6 GoA stylesheets
  <slug>/                                    each prototype:
    requirements.md   page.config.json   body.html
    styles.css        app.js              index.html (generated)
    serve.mjs         submissions.ndjson  evaluation.md   test-plan.md
extractions/                                 audit-trail snapshots (optional)
urls.md                                      seed list for refresh
prompt.md                                    the original brief for this harness
```

## When in doubt

- Read the relevant `SKILL.md` — that's the authoritative spec.
- Grep `apps/_shared/vendor/css/goa-components.css` for real GoA class names.
- The submit API contract (request shape, NDJSON record format, `slug`-from-Referer routing) is documented in `hosting-prototype/SKILL.md`.

## Reference apps (optional — may or may not be present)

If the repo contains any of these prebuilt apps, they are working reference implementations you can read for guidance. **If they have been cleaned up, the docs above and the SKILL.md files are sufficient to build equivalent work from scratch.**

| Path (if present) | What it demonstrates |
|---|---|
| `apps/report-red-tape/` | Single-page tool with a complex validated form, NDJSON persistence |
| `apps/alberta-ip-office/` | Multi-page program hub: 3-card service grid, multiple `.goa-main-grid` rows, CTAs |
| `apps/alberta-ip-office-creation/` | Topic page: long-form content with mixed callouts |
| `apps/alberta-ip-office-commercialization/` | 2×2 sector card grid using `.goa-column-50-50-100` |
| `apps/alberta-ip-office-apply/` | Complex form: checkboxes (`.goa-option`), nested fieldsets, validator covering both `.goa-field` and `.goa-option` error rendering |

## Cleaning up to a fresh slate

To start from a clean repo while keeping the harness intact, delete everything under `apps/` **except** `_template/` and `_shared/`:

```bash
# Windows PowerShell or bash
ls apps | grep -v -E '^(_template|_shared)$' | xargs -I {} rm -rf apps/{}
# Also clear logs and audit-trail snapshots if you want
rm -rf .claude/logs extractions
```

The harness still builds: `apps/_template/page.html`, `apps/_template/page.config.example.json`, and `apps/_shared/vendor/css/*` are the only runtime dependencies.
