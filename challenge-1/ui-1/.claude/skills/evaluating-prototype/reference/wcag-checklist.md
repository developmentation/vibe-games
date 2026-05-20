# WCAG 2.1 AA quick checklist

What `evaluate.mjs` checks for. Use this as the human-readable reference when interpreting the script output.

## Perceivable
- All non-text content has alt text (`<img alt>` present, even if empty for decorative)
- Form inputs have a visible `<label>` linked via `for=`
- Colour contrast ≥ 4.5:1 for body, 3:1 for large text and UI components
- Page has `lang` attribute on `<html>`

## Operable
- Skip-link as first focusable element
- Visible keyboard focus on every interactive control (`:focus-visible` styled)
- No keyboard traps
- Page does not auto-refresh or auto-play media

## Understandable
- Single `<h1>` per page
- Heading levels do not skip
- Error messages are programmatically associated with the input (`aria-describedby`)
- Form fields use `autocomplete` where applicable

## Robust
- Valid HTML (parser-safe, properly closed tags)
- ARIA used only where native semantics fail
- Custom widgets expose role, name, value, state
