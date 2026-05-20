# Evaluation: ti-quality-improvement

Generated 2026-05-13T20:02:14.619Z

**34/35 pass** — 0 fail, 1 warn

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
| D8 | WARN | No utility-CSS framework |  |
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
| PASS | # Requirements — Continuous Improvement | 2/3 |
| PASS | Retrospective section describes the what-went-well, what-could-be-better, and action-items format | 11/12 |
| PASS | Page states retrospective notes and action items must be stored in the project wiki or Confluence space | 11/12 |
| PASS | Quality metrics table lists four key indicators: defect density, test coverage, deployment frequency, and mean time to recovery with targets | 15/17 |
| PASS | Page states teams significantly outside metric targets will be engaged by the TI Quality team | 9/11 |
| PASS | Technical debt section states at least 20 percent of sprint capacity must be reserved for debt reduction | 11/12 |
| PASS | Technical debt callout states debt creating security risk must be treated with the same urgency as a security finding | 13/15 |
| PASS | Post-incident review section states blameless post-mortems must be completed within five business days of a production incident | 14/16 |
| PASS | Post-mortem structure list includes timeline, root cause, what worked well, what could be faster, and action items | 14/16 |
| PASS | Capability maturity self-assessment table lists practices across foundational, managed, advanced, and optimizing levels | 10/13 |
| PASS | Sidebar navigation lists all program pages with correct active state on Continuous improvement | 8/11 |

---

**Sign-off:** structural checks pass. Run human testing plan before deploy.