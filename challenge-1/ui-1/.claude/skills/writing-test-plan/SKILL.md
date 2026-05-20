---
name: writing-test-plan
description: Generates a markdown checklist a human tester can walk through end-to-end for a prototype in apps/<slug>/. Output is apps/<slug>/test-plan.md — keyboard nav, screen reader, mobile, golden path, edge cases. For multi-page programs, also covers cross-page navigation. Use after evaluating-prototype passes, when the user is about to hand the prototype to a real reviewer.
---

# Writing a human test plan

Generates a checklist a human tester can run in a browser. The plan is opinionated about accessibility checks because the static evaluator cannot verify perceived experience. Two templates: single-page and multi-page-program.

## Workflow

```
- [ ] 1. Read apps/<slug>/index.html and (if present) requirements.md
- [ ] 2. Decide: single-page tool or multi-page program?
- [ ] 3. Identify primary user goals from the requirements
- [ ] 4. Write apps/<slug>/test-plan.md using the matching template
- [ ] 5. Tell the user it is ready and where to find it
```

## Single-page template

```markdown
# Test plan — {{TITLE}}

Tester: ______________________   Date: __________   Browser: __________

Launch: node apps/<slug>/serve.mjs --port 5179  →  http://localhost:5179

## Smoke
- [ ] Server starts on the printed port without errors
- [ ] http://localhost:<port> loads
- [ ] No 4xx/5xx in the network panel
- [ ] No errors in the JS console
- [ ] Favicon shows in the tab

## Golden path
- [ ] {{requirement 1 as a tester step}}
- [ ] {{requirement 2}}
- [ ] {{...}}
- [ ] Submission is appended to apps/<slug>/submissions.ndjson  (if applicable)

## Keyboard navigation
- [ ] Tab visits every interactive control in a logical order
- [ ] Focus ring is visible (orange #FFB500) on every focused element
- [ ] Skip-link appears on first Tab
- [ ] Enter / Space activate the focused button

## Screen reader (NVDA or VoiceOver)
- [ ] Page title is announced on load
- [ ] Heading navigation lists one h1, then h2s in order
- [ ] Every form field announces its label
- [ ] Validation errors are announced via aria-live

## Responsive
- [ ] 320px — content fits without horizontal scroll
- [ ] 768px — sidebar (if any) wraps cleanly
- [ ] 1280px — content respects GoA max-width and is centered

## Edge cases
- [ ] Submit empty form: each required field reports its own error
- [ ] Paste a long string into a textarea: handled cleanly
- [ ] Disconnect network and submit: clear error, no data lost
- [ ] Refresh after submit: no double-submit

## Sign-off
- [ ] All boxes above checked or waived with a written reason
- [ ] Reviewer name: ____________________
- [ ] Date: ____________________
```

## Multi-page program template

For a program with multiple linked pages, add these sections **before** the single-page sections. Place the program-level test-plan.md inside the hub app folder (e.g. `apps/<prog>/test-plan.md`) and reference the other apps by slug.

```markdown
# Test plan — {{PROGRAM NAME}} (N pages)

Launch: node .claude/skills/hosting-prototype/scripts/serve-multi.mjs --port 5180
Start at: http://localhost:5180/<prog>

## Smoke (all pages)
- [ ] /<prog> loads
- [ ] /<prog>-<topic-a> loads
- [ ] /<prog>-<topic-b> loads
- [ ] /<prog>-apply loads
- [ ] No 404s in the network tab on any page
- [ ] Favicon shows on every page

## Chrome consistency
On every page:
- [ ] Alberta.ca wordmark in the same place
- [ ] Breadcrumb starts at Home and ends at the current page name
- [ ] Sidebar shows the same N links in the same order
- [ ] The currently-displayed page is marked in the sidebar (bold, no link)
- [ ] Footer is identical

## Cross-page navigation
- [ ] From hub → click each service card → lands on the topic page
- [ ] From any topic page → "Part of <program>" link returns to hub
- [ ] Breadcrumb "<program>" link returns to hub from sub-pages
- [ ] Browser back/forward works without losing state
- [ ] Sidebar links navigate within the program

(then include all single-page sections, run once per page)
```

## Notes

- Keep the verbatim accessibility sections — they are the harness-wide floor for sign-off.
- Fill in `{{TITLE}}` / `{{PROGRAM NAME}}` and the golden-path bullets from `requirements.md`.
- Drop sections that are not applicable (e.g. "Submission appended to NDJSON" if the prototype has no form).
