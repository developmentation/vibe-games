# Evaluation: harness

Generated 2026-05-12T13:00:26.535Z

**35/35 pass** — 0 fail, 0 warn

## Checks

| ID | Status | Check | Note |
|---|---|---|---|
| S1 | PASS | Has <!DOCTYPE html> |  |
| S2 | PASS | <html lang="en"> |  |
| S3 | PASS | viewport meta |  |
| S4 | PASS | Single <h1> |  |
| S5 | PASS | Has <main id="main" role="main"> |  |
| S6 | PASS | goa-skiplinks present |  |
| S7 | PASS | dialog-off-canvas wrapper |  |
| S8 | PASS | <header> present |  |
| S9 | PASS | goa-header block |  |
| S10 | PASS | goa-logo with SVG wordmark |  |
| S11 | PASS | goa-breadcrumbs present |  |
| S12 | PASS | goa-page-header block |  |
| S13 | PASS | goa-footer block |  |
| S14 | PASS | Heading order never skips |  |
| D1 | PASS | Imports goa-base.css |  |
| D2 | PASS | Imports goa-layouts.css |  |
| D3 | PASS | Imports goa-components.css |  |
| D4 | PASS | Imports print stylesheets |  |
| D5 | PASS | No live alberta.ca CSS bundle URL |  |
| D6 | PASS | No legacy /_shared/vendor/alberta.css |  |
| D7 | PASS | Forms use real GoA classes (.goa-field/.goa-form) |  |
| D7b | PASS | Buttons use .goa-button |  |
| D7c | PASS | No legacy form-item / form-required / form-text classes |  |
| D7d | PASS | Every <table> is wrapped in <div class="goa-table"> |  |
| D8 | PASS | No utility-CSS framework |  |
| D9 | PASS | Vendored CSS exists on disk |  |
| J1 | PASS | No goa.init / ab.init / abComponents.init |  |
| J2 | PASS | No Google Tag Manager |  |
| J3 | PASS | No drupal-settings-json blob |  |
| J4 | PASS | At most one app.js script tag |  |
| A1 | PASS | Every <img> has alt | no img tags |
| A2 | PASS | Every form control has a <label> |  |
| A3 | PASS | Live region for form errors |  |
| A4 | PASS | noscript fallback present |  |
| R1 | PASS | viewport sets initial-scale=1 |  |

## Requirements crosswalk

| Status | Requirement | Token hits |
|---|---|---|
| PASS | # Requirements — Alberta.ca harness explainer page | 4/5 |
| PASS | A single self-contained page describing how the Alberta.ca harness works, intended for new team members, web reviewers, and stakeholders who want to understand what the harness does before they trust its output. | 13/22 |
| PASS | Explain in plain language what the harness produces and why it exists | 4/7 |
| PASS | List the 4 required runtime assets so a fresh checkout knows what must be present | 8/10 |
| PASS | Show the build pipeline (inputs → build.mjs → output) | 5/6 |
| PASS | Document the 5 skills with their roles | 3/5 |
| PASS | Walk through the single-page workflow step by step | 7/7 |
| PASS | Walk through the multi-page program workflow step by step | 8/8 |
| PASS | List the 34 evaluator checks grouped by category | 3/5 |
| PASS | Document the POST /api/submit API contract and NDJSON record shape | 7/7 |
| PASS | Show the real GoA component classes the vendored CSS styles | 5/6 |
| PASS | Surface the known gotchas (callout variants, html_class, form classes) | 7/9 |
| PASS | Cover Drupal deployment and clean-slate reset commands | 7/7 |
| PASS | Use real GoA classes throughout — eat our own dog food | 2/4 |

---

**Sign-off:** structural checks pass. Run human testing plan before deploy.