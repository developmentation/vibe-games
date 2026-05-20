# Alberta.ca harness — `.claude/`

This directory is the skill / hook / settings half of the harness. The other half (canonical template + vendored GoA stylesheets) lives under `apps/_template/` and `apps/_shared/vendor/`.

## Layout

```
.claude/
├── settings.json              # permissions + hooks (PostToolUse logging, UserPromptSubmit context)
├── hooks/
│   ├── log-edit.mjs           # logs every Write/Edit to .claude/logs/edits.tsv
│   └── inject-context.mjs     # surfaces harness invariants each turn
└── skills/
    ├── extracting-alberta-pages/   refresh vendored CSS + shell
    │   └── scripts/{vendor.mjs, extract.mjs}
    ├── generating-alberta-page/    slot-fill build.mjs
    │   └── scripts/build.mjs
    ├── hosting-prototype/          local servers
    │   └── scripts/{serve.mjs, serve-multi.mjs}
    ├── evaluating-prototype/       34-check static analyzer
    │   ├── scripts/evaluate.mjs
    │   └── reference/wcag-checklist.md
    └── writing-test-plan/          markdown tester checklist
```

## Skill index

| Skill | When to invoke |
|---|---|
| `extracting-alberta-pages` | First setup; refresh after alberta.ca redesigns |
| `generating-alberta-page` | "Build me a page / tool / form / app for alberta.ca" |
| `hosting-prototype` | "Launch it / serve it / open the prototype" |
| `evaluating-prototype` | "Is it ready? / sign off / check accessibility" |
| `writing-test-plan` | "Write a tester checklist / human test plan" |

## Build flow

The canonical entrypoint is the root `CLAUDE.md` — read that for the full workflow. Short version:

```
requirements.md + page.config.json + body.html + styles.css + app.js
        │
        ▼ build.mjs
apps/<slug>/index.html
        │
        ▼ serve.mjs (single) or serve-multi.mjs (program)
http://localhost:<port>/
        │
        ▼ evaluate.mjs
apps/<slug>/evaluation.md
        │
        ▼ writing-test-plan
apps/<slug>/test-plan.md
```

## Required runtime assets (not in this directory)

`build.mjs` and the servers expect:

- `apps/_template/page.html` — canonical master (hand-curated; the source of truth for header / footer / breadcrumb chrome)
- `apps/_shared/vendor/css/` — the 6 GoA stylesheets (`goa-base.css`, `goa-layouts.css`, `goa-components.css` + their `.print.css` variants)

These are part of the harness but live under `apps/` because they are runtime assets, not skill code.
