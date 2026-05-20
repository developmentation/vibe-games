#!/usr/bin/env node
// Serves the whole apps/ tree from a single port so a multi-page program
// (e.g. /alberta-ip-office and its sub-pages) is browsable with real cross-
// links. URL → file mapping:
//
//   GET /                    -> index listing all apps
//   GET /<slug>              -> apps/<slug>/index.html
//   GET /<slug>/<file>       -> apps/<slug>/<file>
//   GET /_shared/...         -> apps/_shared/...
//   POST /api/submit         -> apps/<slug>/submissions.ndjson  (slug from Referer)
//   GET  /api/submissions    -> the submissions file for the slug
//   GET  /__reload           -> SSE live-reload stream
//   GET  /themes|/sites|/system/files|/misc/...  -> proxy to www.alberta.ca
//
// Run: node .claude/skills/hosting-prototype/scripts/serve-multi.mjs --port 5180

import { createServer } from "node:http";
import { readFile, stat, watch, appendFile, mkdir, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf("--port") + 1]) || 5180;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(scriptDir);
const appsDir = resolve(repoRoot, "apps");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
  ".woff": "font/woff",
  ".ttf":  "font/ttf",
  ".txt":  "text/plain; charset=utf-8",
};

const sseClients = new Set();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    const path = url.pathname;

    if (path === "/__reload") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("retry: 1000\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (path === "/api/submit" && req.method === "POST") {
      const body = await readBody(req);
      const slug = slugFromReferer(req.headers.referer) || "_unrouted";
      const target = join(appsDir, slug, "submissions.ndjson");
      const record = { received_at: new Date().toISOString(), slug, ...safeParse(body) };
      await mkdir(dirname(target), { recursive: true });
      await appendFile(target, JSON.stringify(record) + "\n");
      send(res, 200, JSON.stringify({ ok: true, id: record.received_at }), MIME[".json"]);
      console.log(`[submit] ${slug} <- ${Object.keys(record).join(",")}`);
      return;
    }

    if (path === "/api/submissions" && req.method === "GET") {
      const slug = url.searchParams.get("slug");
      if (!slug) { send(res, 400, "Missing ?slug=<app>"); return; }
      const file = join(appsDir, slug, "submissions.ndjson");
      send(res, 200, existsSync(file) ? await readFile(file, "utf8") : "", MIME[".txt"]);
      return;
    }

    if (path === "/" || path === "") {
      send(res, 200, await renderIndex(), MIME[".html"]);
      return;
    }

    // 301 /<slug> -> /<slug>/  so the browser's base URL ends with "/"
    // and ./styles.css resolves to /<slug>/styles.css instead of /styles.css.
    // Without this, every page-local stylesheet and script 404s silently.
    if (!path.endsWith("/") && !/\.[a-z0-9]{1,8}$/i.test(path)) {
      const segs = path.split("/").filter(Boolean);
      if (segs.length === 1) {
        const slugDir = join(appsDir, segs[0]);
        if (await isDir(slugDir)) {
          res.writeHead(301, { location: path + "/" + (url.search || "") });
          res.end();
          return;
        }
      }
    }

    const filePath = await resolveStatic(path);
    if (!filePath) {
      // Theme-asset proxy fallback
      if (/^\/(themes|sites|system\/files|misc)\//.test(path)) {
        try {
          const upstream = `https://www.alberta.ca${path}${url.search}`;
          const r = await fetch(upstream, { headers: { "user-agent": "alberta-ca-harness-proxy/1.0" } });
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            const type = r.headers.get("content-type") || MIME[extname(path).toLowerCase()] || "application/octet-stream";
            send(res, 200, buf, type);
            return;
          }
        } catch {}
      }
      send(res, 404, `Not found: ${path}`);
      return;
    }

    let body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    if (type.startsWith("text/html")) {
      body = Buffer.from(body.toString("utf8") + LIVE_RELOAD_SNIPPET, "utf8");
    }
    send(res, 200, body, type);
  } catch (err) {
    console.error(err);
    send(res, 500, "Server error");
  }
});

async function resolveStatic(path) {
  // /_shared/...  -> apps/_shared/...
  if (path.startsWith("/_shared/")) {
    const f = join(appsDir, "_shared", path.slice("/_shared/".length));
    if (await isFile(f)) return f;
    return null;
  }
  // /<slug>/ or /<slug>  -> apps/<slug>/index.html
  // (the trailing-slash case is what the browser uses as the base URL when
  // resolving ./styles.css and ./app.js — the no-trailing-slash case is
  // upgraded with a 301 redirect by the handler above.)
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) return null;
  const slug = segs[0];
  const slugDir = join(appsDir, slug);
  if (!await isDir(slugDir)) return null;
  if (segs.length === 1) {
    const idx = join(slugDir, "index.html");
    return (await isFile(idx)) ? idx : null;
  }
  // /<slug>/<file>
  const file = join(slugDir, segs.slice(1).join("/"));
  return (await isFile(file)) ? file : null;
}

async function renderIndex() {
  const entries = await readdir(appsDir, { withFileTypes: true });
  const apps = entries
    .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();

  const groups = new Map();
  for (const slug of apps) {
    const prefix = slug.split("-").slice(0, 2).join("-");
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(slug);
  }

  const items = apps.map((slug) => {
    const cfgPath = join(appsDir, slug, "page.config.json");
    let title = slug, lede = "";
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      title = cfg.title ?? slug;
      lede = cfg.lede ?? "";
    } catch {}
    return `<li><a href="/${slug}"><strong>${escapeHtml(title)}</strong></a><br><small>/${slug}</small><br>${escapeHtml(lede)}</li>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Alberta.ca harness — apps</title>
<style>
  body { font-family: -apple-system,Segoe UI,Roboto,sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #222; }
  h1 { color: #006dcc; }
  ul { list-style: none; padding: 0; }
  li { padding: 1rem 0; border-bottom: 1px solid #ddd; }
  small { color: #666; font-family: ui-monospace, monospace; }
  a { color: #006dcc; }
</style></head>
<body>
  <h1>Alberta.ca harness</h1>
  <p>${apps.length} apps available. Pick one to view:</p>
  <ul>${items}</ul>
</body></html>`;
}

function slugFromReferer(ref) {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    return seg || null;
  } catch { return null; }
}
function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => res(b));
  });
}
function safeParse(s) { try { return JSON.parse(s); } catch { return { raw: s }; } }
function findRepoRoot(start) {
  let d = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(d, ".claude"))) return d;
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return start;
}
async function isFile(p) { try { return (await stat(p)).isFile(); } catch { return false; } }
async function isDir(p)  { try { return (await stat(p)).isDirectory(); } catch { return false; } }
function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const LIVE_RELOAD_SNIPPET = `
<script>
(function(){
  try {
    var es = new EventSource('/__reload');
    es.onmessage = function(e){ if (e.data === 'reload') location.reload(); };
  } catch(e) {}
})();
</script>`;

(async () => {
  watch(appsDir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const f = String(filename);
    if (/submissions\.ndjson|\.swp$|~$|\.tmp$/.test(f)) return;
    for (const c of sseClients) c.write("data: reload\n\n");
  });
  server.listen(port, () => {
    console.log(`\n  Alberta.ca harness — multi-app server`);
    console.log(`  Serving:  ${appsDir}`);
    console.log(`  Index:    http://localhost:${port}/`);
    console.log(`  Examples: http://localhost:${port}/alberta-ip-office`);
    console.log(`            http://localhost:${port}/report-red-tape\n`);
  });
})();
