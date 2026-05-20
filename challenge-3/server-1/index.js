// Challenge 3 Node backend. Serves ui-1 (public Alberta.ca curriculum browser)
// and ui-2 (internal Teacher/Parent/Student portal) as static, plus the API
// surface that powers personalised learning plan generation, ElevenLabs
// narration, OpenAI illustrations, and conversational Claude.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { router as mediaRouter } from './routes/media.js';
import { router as curriculumRouter } from './routes/curriculum.js';
import { router as studentsRouter } from './routes/students.js';
import { router as plansRouter } from './routes/plans.js';
import { router as aiRouter } from './routes/ai.js';
import { curriculumPing } from './db/curriculum.js';
import { q as localQ } from '../../lib/db.mjs';

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

app.get('/api/health', async (_req, res) => {
  const out = {
    status: 'ok',
    service: 'vibe-games-challenge-3',
    uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
    active_ui: process.env.ACTIVE_UI || 'ui-1',
    node_version: process.version,
    db_local: 'unknown',
    db_curriculum: 'unknown',
  };
  try {
    await localQ('SELECT 1');
    out.db_local = 'ok';
  } catch (e) { out.db_local = 'down'; }
  try {
    out.db_curriculum = (await curriculumPing()) ? 'ok' : 'down';
  } catch (e) { out.db_curriculum = 'down'; }
  if (out.db_local !== 'ok') out.status = 'degraded';
  res.json(out);
});

// Challenge 3 has no shared field schema; student + grade-history shapes live in challenge-3/sql/schema.sql.
app.get('/api/schema', (_req, res) => {
  res.status(404).json({ error: 'no_schema_for_challenge_3' });
});

app.use('/api/media', mediaRouter);
app.use('/api/curriculum', curriculumRouter);
app.use('/api/students', studentsRouter);
app.use('/api/plans', plansRouter);
app.use('/api/ai', aiRouter);

// --- Static UIs --------------------------------------------------------------

const activeUi = process.env.ACTIVE_UI || 'ui-1';

for (const ui of ['ui-1', 'ui-2', 'ui-3']) {
  const uiDir = path.join(challengeRoot, ui);
  if (existsSync(uiDir)) app.use(`/${ui}`, express.static(uiDir));
}

// Landing page at /. Drives to either portal.
app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alberta personalised learning</title>
<style>
  :root { font-family: ui-sans-serif, system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg,#0b3b5e 0%,#0070b8 60%,#00aad2 100%); color: #fff; }
  main { max-width: 920px; padding: 48px 24px; text-align: center; }
  h1 { font-size: 40px; margin: 0 0 12px; letter-spacing: -0.5px; }
  p.lede { font-size: 17px; line-height: 1.55; opacity: 0.9; max-width: 640px; margin: 0 auto 36px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
  a.card { display: block; padding: 28px; border-radius: 12px; background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.18); color: #fff; text-decoration: none; backdrop-filter: blur(4px); transition: transform .12s ease, background .12s ease; }
  a.card:hover { transform: translateY(-2px); background: rgba(255,255,255,0.16); }
  a.card h2 { margin: 0 0 8px; font-size: 22px; }
  a.card .role { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.75; margin-bottom: 14px; }
  a.card p { margin: 0; font-size: 14px; opacity: 0.9; line-height: 1.5; }
  footer { margin-top: 36px; font-size: 12px; opacity: 0.65; }
  footer code { background: rgba(0,0,0,0.25); padding: 2px 6px; border-radius: 3px; }
</style>
</head>
<body>
<main>
  <div class="role" style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8;">The Vibe Games &middot; Challenge 3</div>
  <h1>Alberta personalised learning</h1>
  <p class="lede">A platform that turns each student's grade history into a personalised learning plan, sourced from real LearnAlberta.ca curriculum and delivered as text, narrated audio and illustration.</p>
  <div class="grid">
    <a class="card" href="/ui-1/">
      <div class="role">Public</div>
      <h2>Public portal</h2>
      <p>Browse the K-12 curriculum, see how the platform works, and check the per-pack cost of generated content. For parents and students.</p>
    </a>
    <a class="card" href="/ui-2/">
      <div class="role">Internal</div>
      <h2>Teacher portal</h2>
      <p>Pick a student, see grades and learning needs, then generate a personalised course pack with plan, narrated audio and illustrations.</p>
    </a>
  </div>
  <footer>
    Backend health: <a href="/api/health" style="color:#fff;">/api/health</a> &middot; node + express &middot; postgres &middot; vertex claude &middot; openai &middot; elevenlabs
  </footer>
</main>
</body>
</html>`);
});

// --- Boot --------------------------------------------------------------------

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`[challenge-3] listening on 0.0.0.0:${port}`);
  console.log(`[challenge-3] serving active UI: ${activeUi}`);
  console.log(`[challenge-3] health: GET /api/health`);
});
