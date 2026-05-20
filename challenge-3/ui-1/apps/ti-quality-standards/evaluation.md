# Evaluation: ti-quality-standards

Generated 2026-05-13T20:02:14.403Z

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
| PASS | # Requirements — Development Standards and Code Review | 5/5 |
| PASS | Page explains GoA coding standards for supported programming languages including naming conventions and file structure | 8/12 |
| PASS | Naming conventions table lists conventions for variables, classes, constants, files, and database elements | 10/11 |
| PASS | Page describes the branching strategy for Government of Alberta repositories including main, develop, feature, hotfix, and release branches | 12/14 |
| PASS | Branch protection rules callout explains that direct pushes to main and develop are blocked | 10/11 |
| PASS | Pull request checklist contains at least eight items covering code quality, tests, documentation, and security | 10/13 |
| PASS | Code review process section explains reviewer responsibilities including checking logic errors, security vulnerabilities, and architecture alignment | 12/15 |
| PASS | Turnaround expectation callout states reviewers should complete reviews within one business day | 9/10 |
| PASS | Documentation requirements section lists README, CONTRIBUTING, CHANGELOG, architecture decision records, and API documentation | 11/11 |
| PASS | Sidebar navigation lists all program pages with correct active state on Standards and code review | 10/12 |

---

**Sign-off:** structural checks pass. Run human testing plan before deploy.