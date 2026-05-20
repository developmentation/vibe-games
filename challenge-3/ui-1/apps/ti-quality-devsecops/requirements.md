# Requirements — DevSecOps and Release Management

- CI/CD pipeline stages table lists all required stages including build, unit test, lint, SAST, dependency scan, integration test, staging deploy, DAST, E2E, and production deploy
- SAST section names approved tools including SonarCloud, Semgrep, and GitHub Advanced Security CodeQL
- SAST section states critical and high severity findings must be resolved before merging to main
- DAST section names OWASP ZAP as the approved tool and states OWASP Top 10 medium findings block production deployment
- Dependency scanning section lists Dependabot, npm audit, and Snyk as approved tools
- Dependency scanning section states critical CVEs must be resolved within five business days
- Security findings callout states pipelines with unresolved critical or high severity findings will not proceed
- Release gate checklist contains at least seven items a release manager must confirm before production deployment
- Deployment strategies section describes blue-green, rolling, and feature flag deployment approaches
- Sidebar navigation lists all program pages with correct active state on DevSecOps and release
