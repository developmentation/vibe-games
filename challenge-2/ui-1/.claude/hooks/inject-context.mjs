#!/usr/bin/env node
// UserPromptSubmit hook: anything we write to stdout is added to Claude's
// context for this turn. We surface the harness invariants so they never
// fall out of working memory on long sessions.

const reminder = `
[Alberta.ca harness reminder]
- All generated pages must use the GoA design tokens in apps/_shared/goa.css
- Every page must pass the evaluating-prototype skill before being declared done
- Prefer editing .claude/skills/* over inlining instructions
- Prototypes live in apps/<kebab-name>/ and are launched via the hosting-prototype skill
`;
process.stdout.write(reminder);
process.exit(0);
