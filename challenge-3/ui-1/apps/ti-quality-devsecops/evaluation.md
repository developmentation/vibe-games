# Evaluation: ti-quality-devsecops

Generated 2026-05-13T20:02:14.551Z

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
| PASS | # Requirements — DevSecOps and Release Management | 4/4 |
| PASS | CI/CD pipeline stages table lists all required stages including build, unit test, lint, SAST, dependency scan, integration test, staging deploy, DAST, E2E, and production deploy | 19/21 |
| PASS | SAST section names approved tools including SonarCloud, Semgrep, and GitHub Advanced Security CodeQL | 10/12 |
| PASS | SAST section states critical and high severity findings must be resolved before merging to main | 10/12 |
| PASS | DAST section names OWASP ZAP as the approved tool and states OWASP Top 10 medium findings block production deployment | 11/13 |
| PASS | Dependency scanning section lists Dependabot, npm audit, and Snyk as approved tools | 8/9 |
| PASS | Dependency scanning section states critical CVEs must be resolved within five business days | 10/12 |
| PASS | Security findings callout states pipelines with unresolved critical or high severity findings will not proceed | 12/13 |
| PASS | Release gate checklist contains at least seven items a release manager must confirm before production deployment | 11/14 |
| PASS | Deployment strategies section describes blue-green, rolling, and feature flag deployment approaches | 9/11 |
| PASS | Sidebar navigation lists all program pages with correct active state on DevSecOps and release | 7/11 |

---

**Sign-off:** structural checks pass. Run human testing plan before deploy.