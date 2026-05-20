# Requirements — Alberta.ca harness explainer page

A single self-contained page describing how the Alberta.ca harness works, intended for new team members, web reviewers, and stakeholders who want to understand what the harness does before they trust its output.

- Explain in plain language what the harness produces and why it exists
- List the 4 required runtime assets so a fresh checkout knows what must be present
- Show the build pipeline (inputs → build.mjs → output)
- Document the 5 skills with their roles
- Walk through the single-page workflow step by step
- Walk through the multi-page program workflow step by step
- List the 34 evaluator checks grouped by category
- Document the POST /api/submit API contract and NDJSON record shape
- Show the real GoA component classes the vendored CSS styles
- Surface the known gotchas (callout variants, html_class, form classes)
- Cover Drupal deployment and clean-slate reset commands
- Use real GoA classes throughout — eat our own dog food
