// Challenge 1 deploy placeholder.
//
// Boots a permissive Express server, surfaces /api/health for Render's health
// check, and serves the active UI (ui-1 by default). The full feature build
// (case CRUD, multer upload, SSE stream, extraction service, FormKit panel)
// is specified in challenge-2/PROMPT.md and lands on top of this scaffold.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const challengeRoot = path.resolve(here, '..');
const repoRoot = path.resolve(challengeRoot, '..');

// Load env from repo root .env locally; on Render the env vars come from the
// service config and dotenv simply has nothing to do.
for (const candidate of [path.join(repoRoot, '.env'), path.join(challengeRoot, '.env')]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false });
  }
}

const startedAt = Date.now();
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '4mb' }));

// --- API ---------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'vibe-games-challenge-2',
    uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
    active_ui: process.env.ACTIVE_UI || 'ui-1',
    node_version: process.version,
  });
});

// Challenge 2 has no shared field schema; the ticket shape lives in challenge-2/sql/schema.sql.
// Keeping the route stubbed so the placeholder UIs hit a defined surface.
app.get('/api/schema', (_req, res) => {
  res.status(404).json({ error: 'no_schema_for_challenge_2' });
});

// --- Static UIs --------------------------------------------------------------

const activeUi = process.env.ACTIVE_UI || 'ui-1';

for (const ui of ['ui-1', 'ui-2', 'ui-3']) {
  const uiDir = path.join(challengeRoot, ui);
  if (existsSync(uiDir)) app.use(`/${ui}`, express.static(uiDir));
}

app.get('/', (_req, res) => res.redirect(`/${activeUi}/`));

// --- Boot --------------------------------------------------------------------

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`[challenge-2] listening on 0.0.0.0:${port}`);
  console.log(`[challenge-2] serving active UI: ${activeUi}`);
  console.log(`[challenge-2] health: GET /api/health`);
});
