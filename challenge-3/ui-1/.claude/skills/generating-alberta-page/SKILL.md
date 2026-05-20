---
name: generating-alberta-page
description: Scaffolds a new Alberta.ca-aligned prototype under apps/<slug>/ by slot-filling the canonical master template at apps/_template/page.html. Ships the real GoA chrome (slim header with SVG wordmark, breadcrumb, page header, footer, optional sidebar nav) and imports the 6 pre-split GoA stylesheets. Use when the user describes a service, form, dashboard, content page, or whole multi-page program they want built for alberta.ca — or asks to "build me a tool / page / app / program" in this harness.
---

# Generating an Alberta.ca page

This skill turns a brief into a working prototype by **slot-filling** the canonical master template. The template is hand-curated, ported from a known-good production page (GoA AISH/ADAP calculator), and never auto-baked from a live page.

## The architecture (read this first)

```
apps/_shared/vendor/css/   goa-base.css, goa-layouts.css, goa-components.css
                           + .print.css variants (6 files, ~826 KB total)
                                  │
apps/_template/page.html ─────────┤  canonical master with {{SLOT}} placeholders
apps/_template/page.config.example.json
                                  │
build.mjs                  ───────┤  fills slots, errors on anything unfilled
                                  ▼
apps/<slug>/index.html            generated, ~14–20 KB
```

Two and only two inputs change per page:
- `apps/<slug>/page.config.json` — chrome (title, lede, breadcrumbs, parent, sidebar, body class)
- `apps/<slug>/body.html` — page content (one or more `.goa-main-grid` blocks)

The template is invariant. No surgery, no overrides. If you want to change the chrome, edit `apps/_template/page.html`.

## Inputs per app

```
apps/<slug>/
├── page.config.json    (required)
├── body.html           (required)
├── styles.css          (optional — page-namespaced styles only)
├── app.js              (optional — page-namespaced JS, no globals)
└── requirements.md     (recommended — drives evaluation crosswalk)
```

## Single-page workflow

```
- [ ] 1. Pick a kebab-slug for the prototype (e.g. report-red-tape, business-license-finder)
- [ ] 2. Write apps/<slug>/requirements.md  (bulleted; drives the evaluator crosswalk)
- [ ] 3. Write apps/<slug>/page.config.json (copy + customise from apps/_template/page.config.example.json)
- [ ] 4. Write apps/<slug>/body.html         (one or more <div class="goa-main-grid">…</div> blocks)
- [ ] 5. Write apps/<slug>/styles.css        (page-namespaced rules only — no global resets)
- [ ] 6. Write apps/<slug>/app.js            (plain script, no ES imports, no globals — see "app.js contract" in hosting-prototype SKILL)
- [ ] 7. node .claude/skills/generating-alberta-page/scripts/build.mjs <slug>
- [ ] 8. Copy serve.mjs into the app, launch  (see hosting-prototype skill — single-app workflow)
- [ ] 9. node .claude/skills/evaluating-prototype/scripts/evaluate.mjs <slug>  (must hit 0 FAILs)
- [ ] 10. Hand off to writing-test-plan      (apps/<slug>/test-plan.md)
```

## Multi-page program workflow

A "program" is N single-pages that share one sidebar configuration. Typical shape:

```
<prog>                          hub: hero, callouts, service cards, CTAs
<prog>-<topic-a>                topic page (long-form content)
<prog>-<topic-b>                topic page
<prog>-<topic-c>                topic page
<prog>-apply                    intake form
```

**Page-set sizing — when the brief doesn't match exactly:**

| Brief implies | Page set |
|---|---|
| 1–2 distinct content areas | One single-page tool, no program |
| 3–5 distinct content areas + intake | Hub + (3–5) topic pages + apply |
| 6+ distinct content areas | Hub + topic pages, optional sub-grouping with `parent` field; consider separate programs |
| "Get help" or "Contact" implied | Use the sidebar Contact link (external to alberta.ca/contact-government) — do not build a standalone page unless the brief asks for one |
| "FAQ" implied | Single topic page using `<details>`/`<summary>` per question (or a Drupal Accordion paragraph in production). Do not wrap each Q+A in a bare `.goa-callout` — that renders as a pull-quote. |

**Hub page composition recipe:**

```
1. (first .goa-main-grid > .paragraph.goa-column-100-100-100)
   - Open with <h2> + plain <p>, not a callout. The page-header lede already
     introduces the program; do not duplicate it in a body callout.
   - If you need a heads-up notice (timely info, eligibility warning),
     use <div class="goa-callout goa--important"> AFTER the intro h2/p.
   - <h2>Service areas</h2> + one-line intro

2. (second .goa-main-grid with N x .paragraph.goa-column-33-33-100 or -50-50-100)
   - One .goa-card.goa--open per service area, each linking to a topic page
   - Each card: <h3 class="goa-card-title"><a>…</a></h3> + 2-line description + "Best for:" line

3. (third .goa-main-grid > .paragraph.goa-column-100-100-100)
   - <h2>Get started</h2> with .goa-button + .goa-button.goa--secondary CTAs
   - <h2>Eligibility at a glance</h2> + bulleted list
   - Optional .goa-callout.goa--event for upcoming events
   - <h2>Contact</h2> with email + phone
```

**Callout variant rule of thumb:**

- For multi-sentence body callouts (heads-ups, eligibility notes, deadlines, success messages): **always** use a variant — `.goa-callout.goa--important`, `goa--success`, `goa--error`, `goa--emergency`, or `goa--event`.
- The bare `.goa-callout` (no variant) is a **large bold pull-quote** designed for a one-line emphasis statement. It will render every child element (`h2`, `p`, `li`) as 24px / weight 700 / dark blue. Do not use it for ordinary intro or info content.
- If the page header already has a lede that covers the same ground as your proposed intro callout, just delete the callout — the lede is enough.

**Minimal complete example — copy as a starting point:**

`apps/<slug>/page.config.json`:
```json
{
  "title": "Example service",
  "meta_description": "A one-line description for search engines, under 160 chars.",
  "lede": "One-sentence lede that appears under the H1 in the page header.",
  "html_id": "example-service",
  "html_class": "js",
  "body_class": "page-example-service path-node",
  "breadcrumbs": [
    { "label": "Home",    "href": "https://www.alberta.ca/" },
    { "label": "Section", "href": "https://www.alberta.ca/section" },
    { "label": "Example service" }
  ]
}
```

`apps/<slug>/body.html`:
```html
<div class="goa-main-grid">
  <div class="paragraph paragraph--type--text-block paragraph--view-mode--default goa-column-100-100-100">
    <h2>Example heading</h2>
    <p>Plain paragraph copy goes here.</p>
    <div class="goa-callout goa--important">
      <h2>Heads up</h2>
      <p>Use GoA callout variants instead of inventing your own boxes.</p>
    </div>
  </div>
</div>
```

That config + body produces a complete `index.html` that passes the evaluator. Build it with `node .claude/skills/generating-alberta-page/scripts/build.mjs <slug>`.

## Breadcrumb path discovery

When the brief implies a new program but doesn't say where it lives on alberta.ca:

1. Check `urls.md` at the repo root — it lists alberta.ca pages the team has worked with.
2. Visit `https://www.alberta.ca/all-services` mentally — alberta.ca's IA roots most programs under one of: Technology and innovation, Business and economy, Family and social supports, Health, Education, Justice and law, Public safety and emergency services, Environment and natural resources.
3. If genuinely uncertain, use a placeholder breadcrumb like `[{ "label": "Section", "href": "https://www.alberta.ca/section" }]` and flag it for the user — Drupal editors will correct it before deployment.

## Writing good requirements.md bullets

The evaluator token-matches requirement lines against rendered HTML. To avoid trivially-passing bullets:

- **Use multi-word phrases** (3+ tokens of 4+ chars each). `"User can submit a description of the red tape they encountered"` is better than `"submit description"`.
- **Reference specific UI labels and field names** so the crosswalk binds to actual implementation, not just topic words.
- **Avoid generic bullets** like `"It must be accessible"` — the structural checks catch that already.

Execute the single-page workflow once per page, with one **shared sidebar config** copied into every page.config.json (changing only which link has `current: true`):

```json
"sidebar": {
  "eyebrow": "Explore pages in:",
  "heading": "Program name",
  "heading_href": "/<prog>",
  "links": [
    { "label": "Overview",   "href": "/<prog>",            "current": false },
    { "label": "<Topic A>",  "href": "/<prog>-<topic-a>",  "current": false },
    { "label": "<Topic B>",  "href": "/<prog>-<topic-b>",  "current": false },
    { "label": "<Topic C>",  "href": "/<prog>-<topic-c>",  "current": false },
    { "label": "Apply",      "href": "/<prog>-apply",      "current": false },
    { "label": "Contact",    "href": "https://www.alberta.ca/contact-government" }
  ]
}
```

Flip `current: true` on the link matching the page's own slug. Launch with `serve-multi.mjs` so cross-page links work.

## page.config.json shape

```json
{
  "title": "Page title",
  "meta_description": "Under 160 chars",
  "lede": "One-sentence lede under the H1.",
  "html_id": "page-slug-id",
  "html_class": "goa-stats goa-stats-template js goa-loader-reset",
  "body_class": "page-slug path-node",
  "breadcrumbs": [
    { "label": "Home",    "href": "https://www.alberta.ca/" },
    { "label": "Section", "href": "https://www.alberta.ca/section" },
    { "label": "This page" }
  ],
  "parent":  { "label": "Section name", "href": "https://www.alberta.ca/section" },
  "sidebar": { ... }
}
```

- The last breadcrumb has no `href` — renders as `<span>` for the current page.
- `parent` is optional. If set, renders the "Part of …" link in the page header.
- `sidebar` is optional. Omit for single-page tools; include and share across every page of a multi-page program.
- `html_class` should keep `js goa-loader-reset` so the loader CSS unhides content.

## body.html — what belongs here

Everything inside `<main>` > `.goa-container` (and inside `.goa-main-content` if no sidebar, otherwise alongside the sidebar). Provide one or more `.goa-main-grid` blocks containing `.paragraph.goa-column-XX-XX-XX` children. This matches how Drupal Paragraphs render the page, so `body.html` is **directly Drupal-deployable**.

**Single-column page (a form, a long-form article):**

```html
<div class="goa-main-grid">
  <div class="paragraph paragraph--type--text-block paragraph--view-mode--default goa-column-100-100-100">
    <h2>Heading</h2>
    <p>Content…</p>
  </div>
</div>
```

**Three-column card row (a hub page):**

```html
<div class="goa-main-grid">
  <div class="paragraph paragraph--type--text-block paragraph--view-mode--default goa-column-33-33-100">
    <div class="goa-card goa--open"><div class="goa-text"><h3 class="goa-card-title"><a href="/x">Card A</a></h3><p>…</p></div></div>
  </div>
  <div class="paragraph paragraph--type--text-block paragraph--view-mode--default goa-column-33-33-100">
    <div class="goa-card goa--open">…</div>
  </div>
  <div class="paragraph paragraph--type--text-block paragraph--view-mode--default goa-column-33-33-100">
    <div class="goa-card goa--open">…</div>
  </div>
</div>
```

Column variants (from `goa-layouts.css`): `goa-column-100`, `goa-column-50`, `goa-column-33`, `goa-column-66`, plus breakpoint suffixes like `goa-column-50-50-100` (desktop-tablet-mobile percentages).

## Real GoA component classes — use these

The vendored CSS styles these. Generic Drupal classes (`.form-item`, `.form-required`, `.description`) render as browser defaults and look broken.

| Use | Not |
|---|---|
| `<div class="goa-form"><form>…</form></div>` | bare `<form>` |
| `<div class="goa-field"><label>…</label><input></div>` | `<div class="form-item">…</div>` |
| `<label for="x">Label</label>` (required is default — no asterisks) | inventing your own asterisk markup |
| `<label>Label <span class="optional">(optional)</span></label>` | omitting the optional hint |
| `<div class="goa-option"><input type="checkbox"><label>…</label></div>` | bare checkboxes |
| `<button class="goa-button">Primary</button>` for form actions (submit, reset) | `<button class="goa-btn">` |
| `<button class="goa-button goa--secondary">Secondary</button>` | bare `<button>` |
| **For an anchor styled as a button** (cross-page CTA, "Apply now" link, "Back to overview"): `<a class="goa-cta" href="…">…</a>`. GoA's intended pattern for anchor CTAs. | `<a class="goa-button" href="…">` — renders blue text on a blue background at rest because `a:link` (specificity 0,1,1) beats `.goa-button` (0,1,0). Only visible on hover. |
| For a **secondary** anchor CTA, `<a class="goa-button goa--secondary" href="…">` is safe — the inherited `a:link` color (#006dcc) happens to match the intended secondary text color, so there is no collision. | inventing your own anchor-as-button class |
| `<div class="goa-field goa--error">` + `<div class="error-help">…</div>` | custom error classes |
| **`<div class="goa-callout goa--important">…</div>`** (also `goa--success` / `goa--error` / `goa--emergency` / `goa--event`) for normal multi-line callouts | custom callout class |
| `<div class="goa-callout">…</div>` **without a variant** ONLY for a single short pull-quote line (renders large bold dark blue) | bare `.goa-callout` for intro/body content — every child renders as oversized bold text |
| `<div class="goa-card goa--open">…</div>` | `<div class="card">` |
| `<div class="goa-table"><table>…</table></div>` | bare `<table>` (GoA does not style `<table>` without the wrapper — you get unstyled browser defaults: no borders, no header background). Note: `.goa-table` defaults to `max-height: 50rem` + scroll, intended for tall data tables. For short documentation tables, override page-locally: `.goa-table { max-height: none; overflow: visible; }` |
| For collapsible content: `<details class="cop-faq-item">` styled like cyber-ai-cop's FAQ (no JS, accessible by default) | The native GoA `<div class="goa-accordion">` works but requires button-toggling JS that prototypes do not ship |

**Discovery rules:**

1. **Before writing a new class**, search the complete inventory: [`reference/goa-class-catalogue.md`](reference/goa-class-catalogue.md). It auto-generates from the vendored CSS and lists every class (~835 across ~328 families) plus every native HTML element GoA styles. If the class you want is in there, use it; if not, namespace yours with your page slug (`.rt-actions`, `.ip-service-card`).
2. **Before reaching for a native HTML element** (`<table>`, `<details>`, `<dl>`, `<code>`, `<pre>`), check the **Native HTML elements styled by GoA** section at the top of the catalogue. Elements styled by GoA can be used bare; elements not listed there will render as browser defaults and may need page-local CSS.
3. **The catalogue is the source of truth.** When in doubt, grep it. Regenerate after every vendored-CSS refresh:
   ```bash
   node .claude/skills/generating-alberta-page/scripts/catalogue-classes.mjs
   ```

### Native HTML elements — what GoA does and does not style

| Element | GoA styling? | What to do |
|---|---|---|
| `<form>`, `<input>`, `<select>`, `<textarea>` | Only inside `.goa-form` + `.goa-field` | Always wrap (see above) |
| `<button>` | Yes, when classed `.goa-button` | Add the class |
| `<table>` | Yes, only inside `<div class="goa-table">` | Wrap every table |
| `<details>` / `<summary>` | No — render as browser defaults (`▶` triangle, no padding) | Add page-local styling (see `apps/cyber-ai-cop/styles.css` `.cop-faq-item` for a clean pattern) |
| `<a>` | Yes (blue, underlined on hover) | Just use it |
| `<h1>`–`<h6>`, `<p>`, `<ul>`, `<ol>`, `<li>` | Yes (typography from goa-base.css) | Just use them |
| `<code>`, `<kbd>`, `<pre>` | No — render as browser monospace, no background, no padding | Add page-local styling for inline code (light bg, monospace) and block code (pre with overflow handling) if your page has documentation content |
| `<dl>`, `<dt>`, `<dd>` | Browser defaults only | Style page-locally if you use them |
| `<blockquote>` | Yes (left border, indent) | Just use it; for emphasis quotes prefer `.goa-callout` |
| `<details>` / `<summary>` for FAQs | No — but cyber-ai-cop's `.cop-faq-item` is the reference pattern | Copy that pattern; don't roll your own |

## Anti-patterns

- Hand-writing `<header>` / `<footer>` — they live in `apps/_template/page.html` only
- Inline `<script>` calling `goa.*`, `ab.*`, `drupalSettings` — no such runtime here; crashes the page
- `<script src="https://www.googletagmanager.com/…">` — strip GTM, this is a prototype
- Hard-coding `#0081A2` / `#00aad2` — the GoA palette comes from the vendored CSS
- A standalone `<style>` block in the page — put rules in `apps/<slug>/styles.css`
- Tailwind / Bootstrap / Foundation — the GoA stylesheet is the design system
- Skipping the `.goa-main-grid` + `.paragraph` wrappers in body.html — they are Drupal-required and the GoA layout CSS targets them
