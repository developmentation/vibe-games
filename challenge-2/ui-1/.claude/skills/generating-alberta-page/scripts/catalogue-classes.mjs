#!/usr/bin/env node
// Walks every CSS file under apps/_shared/vendor/css/ and emits a complete
// catalogue of class names + the element selectors they style.
//
// Output: .claude/skills/generating-alberta-page/reference/goa-class-catalogue.md
//
// The catalogue is the canonical reference for "what classes does the GoA design
// system actually ship." It groups classes by their component prefix
// (.goa-accordion-*, .goa-card-*, .goa-callout-*, ...) so authors can scan one
// section to see everything that family supports.
//
// Run this whenever the vendored CSS is refreshed.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";

const cssDir = resolve("apps/_shared/vendor/css");
const outPath = resolve(".claude/skills/generating-alberta-page/reference/goa-class-catalogue.md");
mkdirSync(resolve(".claude/skills/generating-alberta-page/reference"), { recursive: true });

const files = readdirSync(cssDir).filter((f) => f.endsWith(".css")).sort();
if (files.length === 0) { console.error(`no CSS in ${cssDir}`); process.exit(2); }

// Map: className -> { files: Set, elements: Set, sampleSelector: string }
const classes = new Map();
// Map: tagName -> Set of files where that element selector appears
const elementSelectors = new Map();

for (const file of files) {
  const path = resolve(cssDir, file);
  const raw = readFileSync(path, "utf8");
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, ""); // remove comments
  // Find every selector list (text before each `{` that opens a rule)
  // Skip @-rules (e.g. @media, @keyframes) — but their inner selectors still get matched
  // because we scan the whole stripped text.
  const ruleRegex = /([^{}]+)\{[^{}]*\}/g;
  let m;
  while ((m = ruleRegex.exec(stripped)) !== null) {
    const selectorList = m[1];
    if (!selectorList || /^[\s@]/.test(selectorList.trim()) === false) {
      // Selector lists may include @media wrappers; split on commas and process each
      for (const raw of selectorList.split(",")) {
        processSelector(raw.trim(), file);
      }
    }
  }
}

function processSelector(sel, file) {
  if (!sel || sel.startsWith("@") || sel.startsWith("from") || sel.startsWith("to") || /^\d/.test(sel)) return;

  // Extract every class name (with hyphens, no underscores per GoA convention)
  for (const cm of sel.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) {
    const cls = cm[1];
    if (!classes.has(cls)) classes.set(cls, { files: new Set(), elements: new Set(), sample: sel });
    const entry = classes.get(cls);
    entry.files.add(file);
    // Find any element name attached to this class (e.g. "div.goa-callout")
    const before = sel.slice(0, cm.index).match(/([a-z][a-z0-9]*)$/i);
    if (before) entry.elements.add(before[1].toLowerCase());
    if (entry.sample.length > sel.length) entry.sample = sel;
  }

  // Track bare element selectors (no class, no id) — these tell us which native
  // HTML elements GoA styles globally.
  // Strip pseudo-classes for the element check
  const cleaned = sel.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim();
  const isPureElement = /^[a-z][a-z0-9]*(\s+[a-z][a-z0-9]*)*$/i.test(cleaned)
    && !/[.#\[]/.test(cleaned);
  if (isPureElement && cleaned.length > 0) {
    for (const tag of cleaned.split(/\s+/)) {
      if (!elementSelectors.has(tag)) elementSelectors.set(tag, new Set());
      elementSelectors.get(tag).add(file);
    }
  }
}

// Group classes by prefix family. A "family" is the first 2 hyphen-separated
// segments (e.g. "goa-card", "goa-callout"). Standalone words become their own family.
function familyOf(cls) {
  const parts = cls.split("-");
  if (cls.startsWith("goa--") || /^goa--/.test(cls)) return "goa-modifiers";
  if (cls === "goa") return "goa-core";
  if (parts[0] === "goa") return parts.slice(0, 2).join("-");
  return parts[0];
}

const families = new Map();
for (const [cls, info] of classes) {
  const fam = familyOf(cls);
  if (!families.has(fam)) families.set(fam, []);
  families.get(fam).push({ cls, ...info });
}

// Sort families: goa-* first alphabetically, then everything else alphabetically.
const sortedFamilies = [...families.keys()].sort((a, b) => {
  const ag = a.startsWith("goa");
  const bg = b.startsWith("goa");
  if (ag !== bg) return ag ? -1 : 1;
  return a.localeCompare(b);
});

// Render markdown
const lines = [];
lines.push(`# GoA class catalogue`);
lines.push("");
lines.push(`Generated ${new Date().toISOString()} from ${files.length} files in \`apps/_shared/vendor/css/\`.`);
lines.push("");
lines.push(`**Total unique classes: ${classes.size}** across ${sortedFamilies.length} families.`);
lines.push("");
lines.push(`Each row shows the class, which CSS file declares it, and the most-specific element prefix observed in selectors. "*" in the element column means the class is used standalone (e.g. \`.foo\`, not \`div.foo\`).`);
lines.push("");

// Native element styling section first
lines.push(`## Native HTML elements styled by GoA`);
lines.push("");
lines.push("Bare elements styled without a class. Use these directly; for elements not listed here, the design system does not style them and prototypes need page-local CSS.");
lines.push("");
lines.push("| Element | Files |");
lines.push("|---|---|");
const sortedElements = [...elementSelectors.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [tag, fileSet] of sortedElements) {
  // Skip uninteresting single-char or generic ones unless they really are styled
  lines.push(`| \`<${tag}>\` | ${[...fileSet].join(", ")} |`);
}
lines.push("");

// Class families
lines.push(`## Classes by family`);
lines.push("");

for (const fam of sortedFamilies) {
  const items = families.get(fam).sort((a, b) => a.cls.localeCompare(b.cls));
  lines.push(`### \`${fam}-*\`  (${items.length} ${items.length === 1 ? "class" : "classes"})`);
  lines.push("");
  lines.push("| Class | Element prefix | File(s) |");
  lines.push("|---|---|---|");
  for (const it of items) {
    const elem = it.elements.size ? [...it.elements].sort().map((e) => `\`${e}\``).join(", ") : "*";
    const fileLabels = [...it.files].map((f) => basename(f).replace(/\.css$/, "")).join(", ");
    lines.push(`| \`.${it.cls}\` | ${elem} | ${fileLabels} |`);
  }
  lines.push("");
}

writeFileSync(outPath, lines.join("\n"));
console.log(`wrote ${outPath}`);
console.log(`${classes.size} classes across ${sortedFamilies.length} families; ${sortedElements.length} native element selectors`);
