#!/usr/bin/env node
// Static-analysis evaluator for apps/<slug>/. Validates against the canonical
// apps/_template/page.html structure (slim GoA shell, 6 split CSS bundles,
// goa-skiplinks, dialog-off-canvas wrapper). Rejects orphan inline scripts.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const slug = process.argv[2];
if (!slug) { console.error("usage: evaluate.mjs <slug>"); process.exit(2); }

const appDir = resolve("apps", slug);
if (!existsSync(appDir)) { console.error(`apps/${slug} does not exist`); process.exit(2); }
const indexPath = join(appDir, "index.html");
if (!existsSync(indexPath)) { console.error("index.html missing"); process.exit(2); }
const html = readFileSync(indexPath, "utf8");

const checks = [];
const add = (id, sev, label, pass, note = "") =>
  checks.push({ id, sev, label, status: pass ? "PASS" : sev, note });

// Structure — canonical template markers
add("S1",  "FAIL", "Has <!DOCTYPE html>",                       /<!doctype html>/i.test(html));
add("S2",  "FAIL", "<html lang=\"en\">",                        /<html\b[^>]*\blang=["']en["']/i.test(html));
add("S3",  "FAIL", "viewport meta",                             /<meta[^>]+name=["']viewport["']/i.test(html));
add("S4",  "FAIL", "Single <h1>",                               (html.match(/<h1\b/gi) || []).length === 1);
add("S5",  "FAIL", "Has <main id=\"main\" role=\"main\">",      /<main[^>]+id=["']main["'][^>]+role=["']main["']/i.test(html));
add("S6",  "FAIL", "goa-skiplinks present",                     /<div class=["']goa-skiplinks["'][^>]*>\s*<a[^>]+href=["']#main["']/i.test(html));
add("S7",  "FAIL", "dialog-off-canvas wrapper",                 /<div class=["']dialog-off-canvas-main-canvas["']/i.test(html));
add("S8",  "FAIL", "<header> present",                          /<header\b/i.test(html));
add("S9",  "FAIL", "goa-header block",                          /<div class=["']goa-header["']/i.test(html));
add("S10", "FAIL", "goa-logo with SVG wordmark",                /<div class=["']goa-logo["'][\s\S]*?<svg/i.test(html));
add("S11", "FAIL", "goa-breadcrumbs present",                   /<div class=["']goa-breadcrumbs goa-container["']/i.test(html));
add("S12", "FAIL", "goa-page-header block",                     /<div class=["'][^"']*\bgoa-page-header\b/i.test(html));
add("S13", "FAIL", "goa-footer block",                          /<footer class=["']goa-footer["']/i.test(html));
add("S14", "FAIL", "Heading order never skips",                 headingsAreOrdered(html));

// Design-system fidelity — must use the 6 split GoA bundles, no monolith, no live URLs
add("D1",  "FAIL", "Imports goa-base.css",                      /href=["']\/_shared\/vendor\/css\/goa-base\.css["']/i.test(html));
add("D2",  "FAIL", "Imports goa-layouts.css",                   /href=["']\/_shared\/vendor\/css\/goa-layouts\.css["']/i.test(html));
add("D3",  "FAIL", "Imports goa-components.css",                /href=["']\/_shared\/vendor\/css\/goa-components\.css["']/i.test(html));
add("D4",  "FAIL", "Imports print stylesheets",
  /goa-base\.print\.css/i.test(html) && /goa-layouts\.print\.css/i.test(html) && /goa-components\.print\.css/i.test(html));
add("D5",  "FAIL", "No live alberta.ca CSS bundle URL",         !/href=["']https:\/\/www\.alberta\.ca\/sites\/default\/files\/css\//i.test(html));
add("D6",  "FAIL", "No legacy /_shared/vendor/alberta.css",     !/\/_shared\/vendor\/alberta\.css/i.test(html));
add("D7",  "FAIL", "Forms use real GoA classes (.goa-field/.goa-form)",
  !/<form\b/i.test(html) || /class=["']goa-form["']|class=["']goa-field["']/i.test(html));
add("D7b", "FAIL", "Buttons use .goa-button",
  !/<button\b/i.test(html) || /<button[^>]+class=["'][^"']*\bgoa-button\b[^"']*["']/i.test(html));
add("D7c", "WARN", "No legacy form-item / form-required / form-text classes",
  !/class=["'][^"']*\b(form-item|form-required|form-text)\b/i.test(html));
// Bare <table> renders without borders/header styling unless wrapped in .goa-table.
// Walk through every <table> and check its nearest preceding element is a goa-table div.
const tableCheck = (() => {
  const tables = [...html.matchAll(/<table\b/gi)];
  if (tables.length === 0) return true;
  return tables.every((m) => /<div[^>]+class=["'][^"']*\bgoa-table\b[^"']*["'][^>]*>(?:(?!<\/div>).)*$/is.test(html.slice(0, m.index)));
})();
add("D7d", "WARN", "Every <table> is wrapped in <div class=\"goa-table\">", tableCheck);
add("D8",  "WARN", "No utility-CSS framework",                  !/(tailwind|bootstrap|bulma|foundation)/i.test(html));
add("D9",  "FAIL", "Vendored CSS exists on disk",
  ["goa-base.css","goa-layouts.css","goa-components.css","goa-base.print.css","goa-layouts.print.css","goa-components.print.css"]
    .every((f) => existsSync(resolve("apps/_shared/vendor/css", f))));

// JS hygiene — no orphan runtime calls that crash the page
add("J1",  "FAIL", "No goa.init / ab.init / abComponents.init", !/\b(?:goa|ab|abComponents)\.init\s*\(/.test(html));
add("J2",  "FAIL", "No Google Tag Manager",                     !/googletagmanager\.com/i.test(html));
add("J3",  "FAIL", "No drupal-settings-json blob",              !/data-drupal-selector=["']drupal-settings-json["']/i.test(html));
add("J4",  "WARN", "At most one app.js script tag",
  (html.match(/<script[^>]+src=["']\.\/app\.js["']/gi) || []).length <= 1);

// Accessibility heuristics
const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
add("A1",  "FAIL", "Every <img> has alt",                       imgs.every((t) => /\balt=/i.test(t)),
  imgs.length ? `${imgs.length} img tags` : "no img tags");
const inputs = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)].map((m) => m[0])
  .filter((t) => !/type=["'](hidden|submit|button|reset)["']/i.test(t));
const orphanInputs = inputs.filter((t) => {
  const id = (t.match(/\bid=["']([^"']+)["']/) || [])[1];
  if (!id) return true;
  return !new RegExp(`<label[^>]*for=["']${id}["']`, "i").test(html);
});
add("A2",  "FAIL", "Every form control has a <label>",          orphanInputs.length === 0,
  orphanInputs.length ? `${orphanInputs.length} unlabelled controls` : "");
add("A3",  "WARN", "Live region for form errors",
  !/<form\b/i.test(html) || /aria-live=/i.test(html));
add("A4",  "WARN", "noscript fallback present",
  !/<form\b/i.test(html) || /<noscript\b/i.test(html));

// Responsiveness
add("R1",  "FAIL", "viewport sets initial-scale=1",             /initial-scale=1/.test(html));

// Requirements crosswalk
const crosswalk = [];
const reqFile = join(appDir, "requirements.md");
if (existsSync(reqFile)) {
  const lines = readFileSync(reqFile, "utf8")
    .split("\n").map((l) => l.replace(/^[-*]\s+/, "").trim()).filter(Boolean);
  for (const r of lines) {
    const tokens = r.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3);
    const hits = tokens.filter((t) => html.toLowerCase().includes(t)).length;
    const status = hits >= Math.ceil(tokens.length / 2) ? "PASS" : "MISSING";
    crosswalk.push({ requirement: r, status, hits, total: tokens.length });
  }
}

const summary = {
  total: checks.length,
  pass: checks.filter((c) => c.status === "PASS").length,
  fail: checks.filter((c) => c.status === "FAIL").length,
  warn: checks.filter((c) => c.status === "WARN").length,
};

const md = [];
md.push(`# Evaluation: ${slug}`);
md.push("");
md.push(`Generated ${new Date().toISOString()}`);
md.push("");
md.push(`**${summary.pass}/${summary.total} pass** — ${summary.fail} fail, ${summary.warn} warn`);
md.push("");
md.push("## Checks");
md.push("");
md.push("| ID | Status | Check | Note |");
md.push("|---|---|---|---|");
for (const c of checks) md.push(`| ${c.id} | ${c.status} | ${c.label} | ${c.note || ""} |`);
if (crosswalk.length) {
  md.push("", "## Requirements crosswalk", "", "| Status | Requirement | Token hits |", "|---|---|---|");
  for (const c of crosswalk) md.push(`| ${c.status} | ${c.requirement} | ${c.hits}/${c.total} |`);
}
md.push("", "---", "");
md.push(summary.fail === 0
  ? "**Sign-off:** structural checks pass. Run human testing plan before deploy."
  : "**Sign-off blocked:** address FAIL rows above.");

const out = join(appDir, "evaluation.md");
writeFileSync(out, md.join("\n"));
console.log(`wrote ${out}`);
console.log(`${summary.pass}/${summary.total} pass · ${summary.fail} fail · ${summary.warn} warn`);
process.exit(summary.fail === 0 ? 0 : 1);

function headingsAreOrdered(html) {
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  let prev = 0;
  for (const lv of levels) { if (prev && lv > prev + 1) return false; prev = lv; }
  return true;
}
