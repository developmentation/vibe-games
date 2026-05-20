#!/usr/bin/env node
// Vendors a representative alberta.ca page's actual assets: downloads every CSS
// bundle and font referenced, rewrites URLs to local paths, and saves the full
// HTML so we can reuse the real header/footer markup verbatim.
//
// Output:
//   apps/_shared/vendor/alberta.css        (concatenated, with @font-face rewrites)
//   apps/_shared/vendor/fonts/<file>
//   apps/_shared/vendor/alberta-shell.html (the live page HTML with local asset paths)

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";

const REF_URL = process.argv[2] || "https://www.alberta.ca/aish";
const sharedDir = resolve("apps/_shared/vendor");
const fontsDir = resolve(sharedDir, "fonts");
const imgsDir = resolve(sharedDir, "images");
mkdirSync(sharedDir, { recursive: true });
mkdirSync(fontsDir, { recursive: true });
mkdirSync(imgsDir, { recursive: true });

const UA = "alberta-ca-harness/1.0 (vendor)";
const fetchedFonts = new Map(); // remote URL -> local path
const fetchedImages = new Map();

async function getText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}
async function getBuf(url) {
  const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function decode(s) { return s.replace(/&amp;/g, "&"); }
function abs(href, base) { try { return new URL(href, base).toString(); } catch { return href; } }

async function downloadFont(absUrl) {
  if (fetchedFonts.has(absUrl)) return fetchedFonts.get(absUrl);
  const ext = (extname(new URL(absUrl).pathname) || ".bin").toLowerCase();
  const name = `font-${fetchedFonts.size + 1}${ext}`;
  const localUrl = `fonts/${name}`;
  try {
    const buf = await getBuf(absUrl);
    writeFileSync(resolve(fontsDir, name), buf);
    fetchedFonts.set(absUrl, localUrl);
    console.log(`  font: ${absUrl.split("/").pop().slice(0, 60)} -> ${localUrl}`);
    return localUrl;
  } catch (err) {
    console.warn(`  font FAILED: ${absUrl} (${err.message})`);
    return absUrl;
  }
}
async function downloadImage(absUrl) {
  if (fetchedImages.has(absUrl)) return fetchedImages.get(absUrl);
  const ext = (extname(new URL(absUrl).pathname) || ".bin").toLowerCase();
  const name = `img-${fetchedImages.size + 1}${ext}`;
  const localUrl = `images/${name}`;
  try {
    const buf = await getBuf(absUrl);
    writeFileSync(resolve(imgsDir, name), buf);
    fetchedImages.set(absUrl, localUrl);
    return localUrl;
  } catch {
    return absUrl;
  }
}

async function rewriteCss(cssText, cssBaseUrl) {
  // Replace url(...) in CSS with downloaded copies. Handles @font-face and bg images.
  const matches = [...cssText.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)];
  const seen = new Map();
  for (const m of matches) {
    const raw = m[2];
    if (raw.startsWith("data:") || raw.startsWith("#")) continue;
    const absUrl = abs(raw, cssBaseUrl);
    if (seen.has(absUrl)) continue;
    seen.set(absUrl, true);
    const ext = extname(new URL(absUrl).pathname).toLowerCase();
    const local = /\.(woff2?|ttf|otf|eot)$/.test(ext)
      ? await downloadFont(absUrl)
      : await downloadImage(absUrl);
    cssText = cssText.split(raw).join(local);
  }
  return cssText;
}

async function main() {
  console.log(`vendor ${REF_URL}`);
  const html = await getText(REF_URL);

  // 1. Collect stylesheet hrefs
  const cssHrefs = [...html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)]
    .map((m) => (m[0].match(/href=["']([^"']+)/i) || [])[1])
    .filter(Boolean)
    .map((h) => abs(decode(h), REF_URL));

  // 2. Fetch + rewrite each
  const parts = [];
  for (const url of cssHrefs) {
    console.log(`css ${url.split("/").pop().slice(0, 80)}…`);
    const txt = await getText(url);
    const rewritten = await rewriteCss(txt, url);
    parts.push(`/* === ${url} === */\n${rewritten}`);
  }
  writeFileSync(resolve(sharedDir, "alberta.css"), parts.join("\n\n"));
  console.log(`wrote apps/_shared/vendor/alberta.css (${parts.length} bundles)`);

  // 3. Save the full page HTML with local CSS link
  let shell = html;
  for (const url of cssHrefs) {
    shell = shell.split(url).join("/_shared/vendor/alberta.css");
    shell = shell.split(decode(url)).join("/_shared/vendor/alberta.css");
  }
  // Deduplicate stylesheet links — they all point to the same local file now
  let first = true;
  shell = shell.replace(/<link[^>]+href=["']\/_shared\/vendor\/alberta\.css["'][^>]*>/gi, (tag) => {
    if (first) { first = false; return tag; }
    return "";
  });
  // Rewrite same-origin image/script asset paths to alberta.ca absolute URLs so they still load
  shell = shell.replace(/(src|href)=["'](\/sites\/[^"']+)["']/gi, (m, attr, p) => `${attr}="https://www.alberta.ca${p}"`);
  writeFileSync(resolve(sharedDir, "alberta-shell.html"), shell);
  console.log(`wrote apps/_shared/vendor/alberta-shell.html`);

  // 4. Index manifest
  writeFileSync(resolve(sharedDir, "manifest.json"), JSON.stringify({
    reference_url: REF_URL,
    fetched_at: new Date().toISOString(),
    css_bundles: cssHrefs,
    fonts: [...fetchedFonts.entries()].map(([from, to]) => ({ from, to })),
    images: [...fetchedImages.entries()].map(([from, to]) => ({ from, to })),
  }, null, 2));
  console.log(`done.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
