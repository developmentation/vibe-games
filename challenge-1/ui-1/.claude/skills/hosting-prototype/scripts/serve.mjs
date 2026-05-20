#!/usr/bin/env node
// Minimal static + tiny-API server for Alberta.ca prototypes.
// Boots with Node 20+, zero deps. Live-reloads via Server-Sent Events.

import { createServer } from "node:http";
import { readFile, stat, watch, appendFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf("--port") + 1]) || 5173;

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(appDir);
const sharedDir = resolve(repoRoot, "apps/_shared");
const slug = relative(resolve(repoRoot, "apps"), appDir).split(sep)[0];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
  ".txt":  "text/plain; charset=utf-8",
};

const sseClients = new Set();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === "/__reload") {
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

    if (url.pathname === "/api/submit" && req.method === "POST") {
      const body = await readBody(req);
      const record = { received_at: new Date().toISOString(), ...safeParse(body) };
      await appendFile(join(appDir, "submissions.ndjson"), JSON.stringify(record) + "\n");
      send(res, 200, JSON.stringify({ ok: true, id: record.received_at }), MIME[".json"]);
      console.log(`[submit] ${appDir}/submissions.ndjson <- ${Object.keys(record).join(",")}`);
      return;
    }

    if (url.pathname === "/api/submissions" && req.method === "GET") {
      const file = join(appDir, "submissions.ndjson");
      const txt = existsSync(file) ? await readFile(file, "utf8") : "";
      send(res, 200, txt, MIME[".txt"]);
      return;
    }

    const filePath = await resolveStatic(url.pathname);
    if (!filePath) {
      // Theme-asset fallback: proxy missed alberta.ca paths so the browser
      // never 404s on /themes/custom/goa_core/*, /sites/default/files/*, etc.
      if (/^\/(themes|sites|system\/files|misc)\//.test(url.pathname)) {
        try {
          const upstream = `https://www.alberta.ca${url.pathname}${url.search}`;
          const r = await fetch(upstream, { headers: { "user-agent": "alberta-ca-harness-proxy/1.0" } });
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            const type = r.headers.get("content-type") || MIME[extname(url.pathname).toLowerCase()] || "application/octet-stream";
            send(res, 200, buf, type);
            return;
          }
        } catch {}
      }
      send(res, 404, "Not found");
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

async function resolveStatic(pathname) {
  const candidates = [];
  if (pathname === "/" || pathname === "") {
    candidates.push(join(appDir, "index.html"));
  } else if (pathname.startsWith("/_shared/")) {
    candidates.push(join(sharedDir, pathname.replace("/_shared/", "")));
  } else if (pathname.startsWith("/../_shared/")) {
    // some templates use a relative ../_shared/ path that the browser normalises
    candidates.push(join(sharedDir, pathname.replace("/../_shared/", "")));
  } else {
    candidates.push(join(appDir, pathname));
    candidates.push(join(sharedDir, pathname.replace(/^\//, "")));
  }
  for (const c of candidates) {
    try { const s = await stat(c); if (s.isFile()) return c; } catch {}
  }
  return null;
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
  await mkdir(appDir, { recursive: true });
  watchDir(appDir);
  if (existsSync(sharedDir)) watchDir(sharedDir);
  server.listen(port, () => {
    console.log(`\n  Alberta.ca prototype: ${slug}`);
    console.log(`  Serving:  ${appDir}`);
    console.log(`  Shared:   ${sharedDir}`);
    console.log(`  Open:     http://localhost:${port}\n`);
  });
})();

function watchDir(dir) {
  watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (/submissions\.ndjson|\.swp$|~$/.test(filename)) return;
    for (const c of sseClients) c.write("data: reload\n\n");
  });
}
