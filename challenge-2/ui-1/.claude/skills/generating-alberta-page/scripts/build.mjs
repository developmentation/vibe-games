#!/usr/bin/env node
// Builds apps/<slug>/index.html by slot-filling apps/_template/page.html.
// Strict: any unfilled {{TOKEN}} is a hard error.
//
// Inputs:
//   apps/<slug>/page.config.json   title, lede, breadcrumbs, parent, meta, body_class
//   apps/<slug>/body.html          everything that goes inside <main> > .goa-container
//
// Output:
//   apps/<slug>/index.html

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const slug = process.argv[2];
if (!slug) { console.error("usage: build.mjs <slug>"); process.exit(2); }

const tplPath = resolve("apps/_template/page.html");
const cfgPath = resolve("apps", slug, "page.config.json");
const bodyPath = resolve("apps", slug, "body.html");
const outPath = resolve("apps", slug, "index.html");

for (const [p, label] of [[tplPath, "apps/_template/page.html"], [cfgPath, cfgPath], [bodyPath, bodyPath]]) {
  if (!existsSync(p)) { console.error(`missing ${label}`); process.exit(2); }
}

const tpl = readFileSync(tplPath, "utf8");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const body = readFileSync(bodyPath, "utf8");

const slugClass = slug.replace(/[^a-z0-9-]/g, "-");

const breadcrumbs_html = (cfg.breadcrumbs ?? []).map((c, i, arr) =>
  i === arr.length - 1
    ? `            <li><span>${esc(c.label)}</span></li>`
    : `            <li><a href="${escAttr(c.href)}">${esc(c.label)}</a></li>`
).join("\n");

const parent_html = cfg.parent?.label
  ? `          <div class="goa-previous-page">\n            Part of <a href="${escAttr(cfg.parent.href)}">${esc(cfg.parent.label)}</a>\n          </div>`
  : "";

// Page-header body has two flavours: a standard text-only headings block, or
// the alberta.ca hero-banner with a background image. Opt in via cfg.hero.
const hasHero = !!(cfg.hero && cfg.hero.image_url);
const heroBannerClass = hasHero ? " goa-hero-banner" : "";

let pageHeaderBody;
if (hasHero) {
  const position = cfg.hero.position || "center center";
  const imgUrl = escAttr(cfg.hero.image_url);
  const heroStyle =
    `background: linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.38), rgba(0, 0, 0, 0.75)), ` +
    `url('${imgUrl}') ${escAttr(position)}; background-size: cover; background-repeat: no-repeat;`;
  pageHeaderBody = [
    `    <div class="goa-hero" style="${heroStyle}">`,
    `      <div class="goa-container">`,
    `        <div class="goa-hero--header">`,
    `          <h1 class="goa-hero-large-title"><span>${esc(cfg.title ?? slug)}</span></h1>`,
    `          <p class="goa-hero-large-lede">${esc(cfg.lede ?? "")}</p>`,
    `        </div>`,
    `      </div>`,
    `    </div>`,
  ].join("\n");
} else {
  pageHeaderBody = [
    `        <div class="goa-page-headings goa-container">`,
    parent_html,
    `          <div class="goa-heading">`,
    `            <h1><span>${esc(cfg.title ?? slug)}</span></h1>`,
    `            <p class="goa-page-header--lede">${esc(cfg.lede ?? "")}</p>`,
    `          </div>`,
    `        </div>`,
  ].filter((s) => s !== "").join("\n");
}

const sidebar_html = cfg.sidebar?.links?.length
  ? renderSidebar(cfg.sidebar)
  : "";

function renderSidebar(s) {
  const items = s.links.map((l) => {
    const cls = l.current ? ' class="current"' : "";
    const inner = l.current
      ? `<span>${esc(l.label)}</span>`
      : `<a href="${escAttr(l.href)}">${esc(l.label)}</a>`;
    return `              <li${cls}>${inner}</li>`;
  }).join("\n");
  const headingHref = s.heading_href ? escAttr(s.heading_href) : "";
  const heading = headingHref
    ? `<a href="${headingHref}">${esc(s.heading ?? "")}</a>`
    : esc(s.heading ?? "");
  const eyebrow = esc(s.eyebrow ?? "Explore pages in:");
  return [
    `        <div class="goa-sidebar-content">`,
    `          <div class="goa-section--header">`,
    `            <span>${eyebrow}</span>`,
    `            <div class="goa-section--heading">${heading}</div>`,
    `          </div>`,
    `          <ul>`,
    items,
    `          </ul>`,
    `        </div>`,
  ].join("\n");
}

const fills = {
  TITLE: esc(cfg.title ?? slug),
  META_DESCRIPTION: escAttr(cfg.meta_description ?? cfg.description ?? ""),
  LEDE: esc(cfg.lede ?? ""),
  HTML_ID: escAttr(cfg.html_id ?? slugClass),
  HTML_CLASS: escAttr(cfg.html_class ?? "goa-stats goa-stats-template js goa-loader-reset"),
  BODY_CLASS: escAttr(cfg.body_class ?? `page-${slugClass} path-node`),
  BREADCRUMBS_HTML: breadcrumbs_html,
  HERO_BANNER_CLASS: heroBannerClass,
  PAGE_HEADER_BODY_HTML: pageHeaderBody,
  SIDEBAR_HTML: sidebar_html,
  MAIN_HTML: body,
  YEAR: String(new Date().getFullYear()),
};

let out = tpl;
for (const [k, v] of Object.entries(fills)) {
  out = out.split(`{{${k}}}`).join(v);
}

const leftovers = [...out.matchAll(/\{\{[A-Z0-9_]+\}\}/g)].map((m) => m[0]);
if (leftovers.length) {
  console.error(`UNFILLED SLOTS in ${outPath}: ${[...new Set(leftovers)].join(", ")}`);
  process.exit(1);
}

writeFileSync(outPath, out);
console.log(`wrote ${outPath} (${out.length} bytes)`);

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function escAttr(s = "") { return esc(s); }
