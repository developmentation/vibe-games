# Evaluation: ti-quality

Generated 2026-05-13T20:02:14.342Z

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
| PASS | # Requirements — TI Quality Practices hub | 3/3 |
| PASS | Program hub displays four topic area cards linking to standards, testing, DevSecOps, and continuous improvement sections | 7/13 |
| PASS | Hub page includes a clear program description explaining quality practices for Government of Alberta TI teams | 8/11 |
| MISSING | Service area cards show clear labels and brief descriptions for each quality practice area | 5/12 |
| PASS | Hub page provides a primary call-to-action linking to the development standards page | 6/9 |
| PASS | Hub page lists the four main quality practice areas as navigable cards | 6/9 |
| PASS | Breadcrumb shows Home > Technology and innovation > Quality practices for technology and innovation | 8/9 |
| PASS | Sidebar navigation lists all program pages with correct active state on Overview | 8/10 |
| PASS | Scope section lists which project types must follow TI quality practices | 7/10 |
| PASS | Page includes contact information for the TI Quality team including email and phone number | 7/10 |

---

**Sign-off:** structural checks pass. Run human testing plan before deploy.