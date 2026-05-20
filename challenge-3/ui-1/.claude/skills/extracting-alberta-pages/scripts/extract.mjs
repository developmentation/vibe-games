#!/usr/bin/env node
// Fetches an alberta.ca URL and writes a cleansed snapshot to extractions/<slug>/.
// Pure-stdlib: no html parser dep. Uses tolerant regexes — good enough for asset
// inventory and landmark detection, which is all downstream skills need.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: extract.mjs <url>");
  process.exit(2);
}

const slug = url
  .replace(/^https?:\/\//, "")
  .replace(/[^a-z0-9]+/gi, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase();

const outDir = resolve("extractions", slug);
const indexDir = resolve("extractions", "_index");
mkdirSync(outDir, { recursive: true });
mkdirSync(indexDir, { recursive: true });

async function main() {
  let html;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "alberta-ca-harness/1.0 (extraction)" },
      redirect: "follow",
    });
    html = await res.text();
  } catch (err) {
    logError(`fetch failed for ${url}: ${err.message}`);
    process.exit(0);
  }

  writeFileSync(resolve(outDir, "page.html"), html);

  const stylesheets = unique(
    [...html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)]
      .map((m) => attr(m[0], "href"))
      .filter(Boolean)
      .map((h) => absolute(h, url))
  );
  const scripts = unique(
    [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)]
      .map((m) => m[1])
      .filter((s) => !/google-?(analytics|tagmanager)|gtm|gtag|onetrust|cookiebot/i.test(s))
      .map((h) => absolute(h, url))
  );
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const bodyClass = (html.match(/<body[^>]*\bclass=["']([^"']+)["']/i) || [])[1] || "";
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || "";
  const breadcrumbs = extractBreadcrumbs(html);
  const landmarks = extractLandmarks(html);
  const clientRendered =
    /id=["']root["']/.test(html) ||
    /id=["']__next["']/.test(html) ||
    /<noscript>[^<]*enable javascript/i.test(html);

  const skeleton = stripBody(html);
  writeFileSync(resolve(outDir, "skeleton.html"), skeleton);

  const manifest = {
    url,
    slug,
    title,
    fetched_at: new Date().toISOString(),
    body_class: bodyClass,
    client_rendered: clientRendered,
    stylesheets,
    scripts,
    meta_count: metas.length,
    landmarks,
    breadcrumbs,
  };
  writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  appendTokens(html, slug);
  appendIndex(manifest);
  console.log(`extracted ${slug}: ${stylesheets.length} css, ${scripts.length} js, landmarks=${landmarks.join(",")}`);
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  return m ? m[1] : "";
}
function unique(arr) {
  return [...new Set(arr)];
}
function absolute(href, base) {
  try { return new URL(href, base).toString(); } catch { return href; }
}
function extractBreadcrumbs(html) {
  const region = html.match(/<(?:nav|ol|ul)[^>]*breadcrumb[^>]*>([\s\S]*?)<\/(?:nav|ol|ul)>/i);
  if (!region) return [];
  return [...region[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)].map((m) => m[1].trim());
}
function extractLandmarks(html) {
  const found = new Set();
  for (const tag of ["header", "nav", "main", "aside", "footer", "form"]) {
    if (new RegExp(`<${tag}\\b`, "i").test(html)) found.add(tag);
  }
  return [...found];
}
function stripBody(html) {
  // Keep only landmark scaffolding so downstream skills see structure, not noise.
  const body = (html.match(/<body[\s\S]*?<\/body>/i) || [""])[0];
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+\n/g, "\n");
}
function appendTokens(html, slug) {
  const tokensPath = resolve(indexDir, "tokens.json");
  const prior = existsSync(tokensPath)
    ? JSON.parse(readFileSync(tokensPath, "utf8"))
    : seedTokens();
  // Mine declared CSS variables from inline styles (works only for pages that ship them).
  const vars = [...html.matchAll(/--goa-[a-z0-9-]+:\s*([^;"']+)/gi)].map((m) => m[0]);
  if (vars.length) {
    prior.observed_vars ??= {};
    prior.observed_vars[slug] = vars.slice(0, 50);
  }
  writeFileSync(tokensPath, JSON.stringify(prior, null, 2));
}
function seedTokens() {
  // Sensible GoA-aligned defaults — used when alberta.ca did not ship tokens
  // inline. Hand-validated against published GoA brand guidelines.
  return {
    colors: {
      primary: "#0081A2",
      primary_dark: "#005776",
      accent: "#C8102E",
      ink: "#333333",
      ink_muted: "#5C5C5C",
      surface: "#FFFFFF",
      surface_alt: "#F1F1F1",
      border: "#DCDCDC",
      focus: "#FEBA35",
      success: "#006F4C",
      danger: "#B10E1E",
    },
    typography: {
      family: "'acumin-pro', 'Segoe UI', Roboto, system-ui, sans-serif",
      base_size: "18px",
      scale: { h1: "2.25rem", h2: "1.75rem", h3: "1.375rem", body: "1rem", small: "0.875rem" },
      line_height: 1.55,
    },
    spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "40px", xxl: "64px" },
    radii: { sm: "4px", md: "8px", pill: "999px" },
    shadow: "0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.06)",
  };
}
function appendIndex(manifest) {
  const idxPath = resolve(indexDir, "index.json");
  const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, "utf8")) : { pages: [] };
  idx.pages = idx.pages.filter((p) => p.slug !== manifest.slug);
  idx.pages.push({ slug: manifest.slug, url: manifest.url, title: manifest.title, fetched_at: manifest.fetched_at });
  writeFileSync(idxPath, JSON.stringify(idx, null, 2));
}
function logError(msg) {
  mkdirSync(indexDir, { recursive: true });
  const line = `${new Date().toISOString()}\t${msg}\n`;
  const path = resolve(indexDir, "errors.log");
  if (existsSync(path)) writeFileSync(path, readFileSync(path, "utf8") + line);
  else writeFileSync(path, line);
}

main();
