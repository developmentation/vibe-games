# Evaluation: ti-quality-testing

Generated 2026-05-13T20:02:14.475Z

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
| PASS | # Requirements — Testing Practices | 3/3 |
| PASS | Page states the minimum unit test coverage threshold of 80 percent for new or modified code | 8/10 |
| PASS | Page describes unit testing requirements including isolation, determinism, and behaviour-specification test naming | 9/12 |
| PASS | Integration testing section explains when integration tests are required and that they run against containerised dependencies | 12/13 |
| PASS | End-to-end testing section states E2E tests are required for all public-facing web applications | 7/8 |
| PASS | Accessibility testing section describes WCAG 2.1 Level AA requirement and lists both automated and manual testing steps | 10/13 |
| PASS | Accessibility failure callout states that WCAG violations on primary user journeys block production releases | 11/13 |
| PASS | Test-driven development section describes the red-green-refactor cycle and states TDD is required for bug fixes | 10/11 |
| PASS | Approved frameworks table lists testing tools for JavaScript, TypeScript, React, Python, dotNET, Java, and accessibility | 10/13 |
| PASS | CI pipeline test gates section lists all checks required before a merge to develop or main is permitted | 11/12 |
| PASS | Sidebar navigation lists all program pages with correct active state on Testing practices | 8/11 |

---

**Sign-off:** structural checks pass. Run human testing plan before deploy.