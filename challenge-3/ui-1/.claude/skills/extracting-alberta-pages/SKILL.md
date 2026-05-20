---
name: extracting-alberta-pages
description: Maintains the vendored GoA assets under apps/_shared/vendor/ — the 6 pre-split GoA stylesheets (base, layouts, components × screen+print) and the canonical master template. Use only when the user wants to refresh the GoA design system snapshot (after a redesign), or wants to audit how alberta.ca renders specific pages.
---

# Maintaining the vendored GoA snapshot

The vendored stylesheets in `apps/_shared/vendor/css/` and the canonical master at `apps/_template/page.html` together define the look-and-feel of every prototype. This skill keeps them in sync with the upstream GoA design system.

## When to run

- After a visible alberta.ca redesign
- When a new GoA design system version ships
- When prototypes start looking out of date against live alberta.ca pages
- **Not when generating a new page** — that's `generating-alberta-page`

## What lives where

```
apps/_shared/vendor/css/
├── goa-base.css            ~10 KB  resets, typography, tokens
├── goa-base.print.css       ~1 KB
├── goa-layouts.css        ~272 KB  containers, grid, breakpoints
├── goa-layouts.print.css    ~5 KB
├── goa-components.css     ~533 KB  forms, buttons, callouts, headers, etc.
└── goa-components.print.css ~7 KB

apps/_template/page.html    canonical master with {{SLOT}} placeholders
apps/_template/page.config.example.json
```

## Refreshing the GoA CSS

The 6 split stylesheets are sourced from a GoA core theme reference (we use the AISH/ADAP calculator project's `WEB-TEMPLATE/resources/` directory as the canonical export). To refresh:

```
- [ ] 1. Locate the latest WEB-TEMPLATE export from GoA (or pull from the goa_core theme repo)
- [ ] 2. Copy goa-base{,.print}.css, goa-layouts{,.print}.css, goa-components{,.print}.css into apps/_shared/vendor/css/
- [ ] 3. Regenerate the class catalogue:
       node .claude/skills/generating-alberta-page/scripts/catalogue-classes.mjs
- [ ] 4. Diff the catalogue against the previous version — note any class additions/removals
- [ ] 5. Update apps/_template/page.html if header/footer markup changed
- [ ] 6. Rebuild every app under apps/<slug>/ via build.mjs to confirm none broke
- [ ] 7. Run evaluating-prototype on each rebuilt app
```

The catalogue at `.claude/skills/generating-alberta-page/reference/goa-class-catalogue.md` is the canonical "what classes exist" reference for the generating skill.

## Fallback: live alberta.ca extraction (vendor.mjs)

For pages where we have no curated split stylesheets, `scripts/vendor.mjs` can fetch the aggregated CSS bundles directly from www.alberta.ca. This is a fallback only — the split bundles produced by the GoA core team are cleaner and easier to debug.

```bash
node .claude/skills/extracting-alberta-pages/scripts/vendor.mjs https://www.alberta.ca/aish
```

## Audit-trail extraction (extract.mjs)

For diffing how alberta.ca renders different pages over time:

```bash
for url in $(grep -E '^https?://' urls.md); do
  node .claude/skills/extracting-alberta-pages/scripts/extract.mjs "$url"
done
```

Writes `extractions/<slug>/manifest.json` with landmarks, stylesheet URLs, scripts, breadcrumbs. Useful for tracking changes; not used by the generation pipeline.

## Anti-patterns

- Treating live alberta.ca aggregated CSS bundles as the source of truth — they are minified, hash-versioned, and change without warning
- Hand-editing `apps/_shared/vendor/css/*.css` to patch a bug — patch in `apps/<slug>/styles.css` instead; vendored files should be byte-identical to the upstream export
- Writing a custom CSS file that duplicates GoA component styles — grep the vendored CSS first
