# Test plan — TI Quality Practices (5 pages)

Tester: ______________________   Date: __________   Browser: __________

Launch: `node apps/serve-multi.mjs --port 5180`
Start at: http://localhost:5180/ti-quality

---

## Smoke (all pages)

- [ ] `/ti-quality` loads with HTTP 200
- [ ] `/ti-quality-standards` loads with HTTP 200
- [ ] `/ti-quality-testing` loads with HTTP 200
- [ ] `/ti-quality-devsecops` loads with HTTP 200
- [ ] `/ti-quality-improvement` loads with HTTP 200
- [ ] No 4xx or 5xx errors in the browser network panel on any page
- [ ] No JS console errors on any page
- [ ] Alberta.ca favicon shows in the browser tab on every page

---

## Chrome consistency (check on every page)

- [ ] Alberta.ca wordmark appears in the slim header, identical on all 5 pages
- [ ] Sidebar heading reads "TI Quality Practices" and links to `/ti-quality`
- [ ] Sidebar lists exactly 6 entries: Overview · Standards & code review · Testing practices · DevSecOps & release · Continuous improvement · Contact
- [ ] Contact sidebar link points to `https://www.alberta.ca/contact-government`
- [ ] Footer is identical across all 5 pages
- [ ] GoA stylesheet loads (buttons are blue, headings use GoA typography, no unstyled text)

---

## Cross-page navigation

- [ ] Hub: all four service cards are visible and clickable
- [ ] Hub → "Standards & code review" card → lands on `/ti-quality-standards`
- [ ] Hub → "Testing practices" card → lands on `/ti-quality-testing`
- [ ] Hub → "DevSecOps & release management" card → lands on `/ti-quality-devsecops`
- [ ] Hub → "Continuous improvement" card → lands on `/ti-quality-improvement`
- [ ] Standards page: "Part of Quality practices…" link returns to hub
- [ ] Standards page: "Next: Testing practices" CTA link navigates to `/ti-quality-testing`
- [ ] Testing page: "Next: DevSecOps & release management" CTA link navigates to `/ti-quality-devsecops`
- [ ] DevSecOps page: "Next: Continuous improvement" CTA link navigates to `/ti-quality-improvement`
- [ ] Improvement page: "Back to overview" CTA link returns to `/ti-quality`
- [ ] Breadcrumb "Quality practices for technology and innovation" link on sub-pages returns to hub
- [ ] Browser back/forward navigates correctly between pages without errors

---

## Sidebar active states

Confirm the correct link is bolded (not a hyperlink) on each page:

- [ ] On `/ti-quality` — "Overview" is the active (bold, non-linked) item
- [ ] On `/ti-quality-standards` — "Standards & code review" is active
- [ ] On `/ti-quality-testing` — "Testing practices" is active
- [ ] On `/ti-quality-devsecops` — "DevSecOps & release" is active
- [ ] On `/ti-quality-improvement` — "Continuous improvement" is active

---

## Breadcrumbs

- [ ] Hub breadcrumb: Home > Technology and innovation > Quality practices for technology and innovation (no link on last item)
- [ ] Sub-page breadcrumbs: Home > Technology and innovation > Quality practices… > [page title] (no link on last item)

---

## Golden path — hub (ti-quality)

- [ ] Page h1 reads "Quality practices for technology and innovation"
- [ ] Lede under h1 is visible and readable
- [ ] "Mandatory for all TI-managed projects" callout is styled with blue-border important variant (not plain pull-quote)
- [ ] Four practice-area cards are displayed in a 2-column grid on desktop
- [ ] Each card has a title, description, and "Best for:" line
- [ ] "Read development standards" button is a solid blue primary CTA
- [ ] "Review testing requirements" is a secondary (outline) button
- [ ] Scope section lists four bullet points describing which projects must comply
- [ ] Contact section shows email `TI.Quality@gov.ab.ca` as a clickable mailto link
- [ ] Contact section shows phone number 780-427-2711

---

## Golden path — Standards & code review (ti-quality-standards)

- [ ] Naming conventions table renders with column borders and a coloured header row (not unstyled browser defaults)
- [ ] Table cells containing `code` elements (e.g. `getUserProfile`) show a light grey background and monospace font
- [ ] "Branch protection rules" callout uses the important (blue-border) variant
- [ ] "Turnaround expectation" callout uses the event (teal/green-border) variant
- [ ] Pull request checklist renders as an ordered list with 8 numbered items
- [ ] Documentation requirements bullet list shows all 5 required documents (README, CONTRIBUTING, CHANGELOG, ADRs, API docs)

---

## Golden path — Testing practices (ti-quality-testing)

- [ ] "Minimum coverage threshold" callout shows 80% figure and uses the important variant
- [ ] "Accessibility is a release gate" callout uses the important variant
- [ ] Approved frameworks table renders with borders and header background, showing 6 rows plus header
- [ ] TDD section shows the numbered red-green-refactor cycle
- [ ] CI pipeline gates section lists 5 bullet-point checks required before merge

---

## Golden path — DevSecOps & release (ti-quality-devsecops)

- [ ] CI/CD pipeline stages table renders with borders and header background, showing 10 rows
- [ ] "Security findings are not optional" callout uses the important variant
- [ ] SAST section lists SonarCloud, Semgrep, and GitHub Advanced Security as approved tools
- [ ] Dependency scan section states 5-business-day remediation for critical CVEs
- [ ] Release gate checklist renders as an ordered list with 7 numbered items

---

## Golden path — Continuous improvement (ti-quality-improvement)

- [ ] Quality metrics table renders with borders and header background, showing 4 metric rows
- [ ] Table targets column shows correct values (< 1.0, ≥ 80%, once per sprint, < 4 hours)
- [ ] "Security-related debt is critical" callout uses the important variant
- [ ] Capability maturity self-assessment table renders with 11 practice rows across four maturity levels
- [ ] Post-mortem section lists 5 required elements of every post-mortem document

---

## Callout variant spot-check (all pages)

- [ ] No bare `.goa-callout` (without a variant class) is used for multi-sentence body content — all body callouts use a variant (important, event, success, error, or emergency)
- [ ] Important callouts (blue left border) are visually distinct from the page background
- [ ] Event callouts (teal/green) are visually distinct from important callouts

---

## Keyboard navigation (repeat on each page)

- [ ] Tab visits every sidebar link, card link, and CTA button in a logical top-to-bottom order
- [ ] Focus ring is visible (orange #FFB500) on every focused interactive element
- [ ] Skip-link "Skip to main content" appears on the first Tab press and moves focus to `<main>`
- [ ] Sidebar links are reachable and activatable by keyboard alone

---

## Screen reader — NVDA + Firefox (spot-check on hub and one topic page)

- [ ] Page title is announced on load
- [ ] Heading navigation (NVDA H key) reveals: one h1, then h2s in reading order, no skipped levels
- [ ] Sidebar heading "TI Quality Practices" is announced
- [ ] Card titles are announced as links with descriptive text (not "click here")
- [ ] Table headers are announced when navigating table cells

---

## Responsive layout

On each page, test at:

- [ ] 320px width — content fits without horizontal scroll; cards stack to single column
- [ ] 768px width — sidebar wraps cleanly below or beside content
- [ ] 1280px width — content respects GoA max-width and is centred

---

## Sign-off

- [ ] All boxes above are checked or waived with a written reason
- [ ] Reviewer name: ____________________
- [ ] Date: ____________________
