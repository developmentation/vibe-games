// Concurrency test: OpenAI image generation.
//
// Goal: prove the harness can sustain 10-20 concurrent classroom-illustration
// requests against gpt-image-1, persist each result into challenge_3.media_assets,
// and report per-call latency, p50/p95, throughput, and wall time.
//
// Each successful call lands in the same table the UI reads from, so this
// script doubles as a way to populate the UI-1 / UI-2 sample-content gallery.
//
// Usage:
//   node challenge-3/server-1/tests/test-image-concurrency.mjs
//   node challenge-3/server-1/tests/test-image-concurrency.mjs --total 20 --concurrency 12
//   node challenge-3/server-1/tests/test-image-concurrency.mjs --total 40 --concurrency 16 --size 1024x1024 --quality medium
//   node challenge-3/server-1/tests/test-image-concurrency.mjs --dry-run --total 5
//
// Flags:
//   --total N         number of image jobs to fire (default 20)
//   --concurrency C   parallel API requests (default 12)
//   --size WxH        OpenAI size (default 1024x1024)
//   --quality medium  low|medium|high (gpt-image-1)
//   --label name      run label stored in media_assets.metadata.run_label
//   --dry-run         skip the API call; just walk the schedule

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const challengeRoot = path.resolve(here, '..', '..');
const repoRoot = path.resolve(challengeRoot, '..');
for (const candidate of [path.join(repoRoot, '.env'), path.join(challengeRoot, '.env')]) {
  if (existsSync(candidate)) dotenv.config({ path: candidate, override: false });
}

const { q, close } = await import('../../../lib/db.mjs');
const { generateImage } = await import('../../../lib/openai.mjs');
const { argInt, argv, argFlag, pmap, retry } = await import('../../../lib/util.mjs');

const TOTAL = argInt('total', 20);
const CONCURRENCY = argInt('concurrency', 12);
const SIZE = argv('size', '1024x1024');
const QUALITY = argv('quality', 'medium');
const RUN_LABEL = argv('label', `concurrency-${TOTAL}-${CONCURRENCY}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`);
const DRY_RUN = argFlag('dry-run');
const OUT_DIR = path.resolve(challengeRoot, 'media/images');

const HOUSE_STYLE = [
  'editorial classroom illustration style',
  'flat vector with subtle gradients',
  'warm prairie palette',
  'inclusive diverse Alberta students',
  'clear focal point and generous negative space',
  'no text, no logos, no watermarks',
  'safe-for-school content',
].join(', ');

const SEEDS = [
  { subject: 'ELA', grade: '2', scene: 'two students taking turns reading a picture book on a carpet circle' },
  { subject: 'ELA', grade: '5', scene: 'a small-group book discussion at a round table near a sunny window' },
  { subject: 'ELA', grade: '8', scene: 'a teen annotating a novel with colourful sticky notes' },
  { subject: 'MAT', grade: 'K', scene: 'children counting wooden blocks arranged into groups of ten' },
  { subject: 'MAT', grade: '3', scene: 'students measuring the perimeter of a rug with a metre stick' },
  { subject: 'MAT', grade: '7', scene: 'a teen graphing a linear function on grid paper at a wooden desk' },
  { subject: 'SCI', grade: '1', scene: 'kindergartners inspecting leaves with magnifying glasses outdoors' },
  { subject: 'SCI', grade: '4', scene: 'students testing a simple circuit with a battery and small bulb' },
  { subject: 'SCI', grade: '9', scene: 'students balancing a chemistry equation on a small whiteboard' },
  { subject: 'SOC', grade: '3', scene: 'a community-helpers mural with farmer, nurse, librarian, firefighter' },
  { subject: 'SOC', grade: '6', scene: 'students examining a topographic map of Alberta on a long desk' },
  { subject: 'PHE', grade: '2', scene: 'a yoga circle of young students stretching on mats in a gym' },
  { subject: 'PHE', grade: '8', scene: 'a co-ed volleyball rally with friendly faces in a school gym' },
  { subject: 'FNA', grade: '4', scene: 'a still-life arrangement of fruit being carefully sketched by students' },
  { subject: 'FNA', grade: '10', scene: 'a charcoal portrait study at a tilted easel in a high-school art room' },
  { subject: 'CTF', grade: '6', scene: 'students assembling a small robotics kit on a wooden table' },
  { subject: 'CTF', grade: '9', scene: 'students watching a 3D printer build a small prototype' },
  { subject: 'CTS', grade: '11', scene: 'a senior welding student in full PPE practising a tack weld with a mentor nearby' },
  { subject: 'FLA', grade: '3', scene: 'des enfants etiquetant des objets de la classe avec des post-its en francais' },
  { subject: 'FLA', grade: '7', scene: 'a teen practising French pronunciation with headphones in a language lab' },
];

function gradeLabel(g) { return g === 'K' ? 'Kindergarten' : `Grade ${g}`; }

function jobPrompt(seed) {
  const subjectNameByCode = {
    ELA: 'English Language Arts', MAT: 'Mathematics', SCI: 'Science', SOC: 'Social Studies',
    FLA: 'French Language Arts', PHE: 'Physical Education and Wellness', FNA: 'Fine Arts',
    CTF: 'Career and Technology Foundations', CTS: 'Career and Technology Studies',
  };
  return [
    `Alberta K-12 classroom illustration for ${subjectNameByCode[seed.subject] || seed.subject}, ${gradeLabel(seed.grade)}.`,
    `Scene: ${seed.scene}.`,
    `Style: ${HOUSE_STYLE}.`,
  ].join(' ');
}

function buildJobs(total) {
  const jobs = [];
  for (let i = 0; i < total; i++) {
    const seed = SEEDS[i % SEEDS.length];
    jobs.push({
      idx: i + 1,
      ...seed,
      title: `${seed.subject} ${seed.grade} #${i + 1}`,
      prompt: jobPrompt(seed),
    });
  }
  return jobs;
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[i];
}

function slug(...parts) {
  return parts.filter(Boolean).join('-').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

async function persistAsset({ job, bytes, sizeWH }) {
  const [w, h] = sizeWH.split('x').map((n) => parseInt(n, 10));
  const res = await q(
    `INSERT INTO challenge_3.media_assets
       (kind, subject_code, grade_level, audience, title, prompt, model,
        mime_type, width, height, byte_size, content, outcome_node_ids, metadata)
     VALUES ('image',$1,$2,'teacher',$3,$4,$5,'image/png',$6,$7,$8,$9,'[]'::jsonb,$10::jsonb)
     RETURNING id`,
    [
      job.subject, job.grade, job.title, job.prompt,
      process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      Number.isFinite(w) ? w : null,
      Number.isFinite(h) ? h : null,
      bytes.length, bytes,
      JSON.stringify({ run_label: RUN_LABEL, scene: job.scene }),
    ]
  );
  return res.rows[0].id;
}

async function runOne(job) {
  const started = Date.now();
  if (DRY_RUN) {
    return { idx: job.idx, ok: true, ms: 0, dry: true, label: `${job.subject} ${job.grade}` };
  }
  try {
    const bytes = await retry(
      () => generateImage({ prompt: job.prompt, size: SIZE, quality: QUALITY }),
      { tries: 2, baseMs: 1500 }
    );
    const id = await persistAsset({ job, bytes, sizeWH: SIZE });
    const filename = `${String(id).padStart(6, '0')}-${slug(job.subject, job.grade, 'concurrency')}.png`;
    const onDisk = path.join(OUT_DIR, filename);
    await writeFile(onDisk, bytes).catch(() => {});
    return { idx: job.idx, ok: true, ms: Date.now() - started, id, label: `${job.subject} ${job.grade}` };
  } catch (e) {
    return { idx: job.idx, ok: false, ms: Date.now() - started, error: String(e?.message || e), label: `${job.subject} ${job.grade}` };
  }
}

async function main() {
  if (!DRY_RUN) await mkdir(OUT_DIR, { recursive: true });
  const jobs = buildJobs(TOTAL);
  console.log(`[image-concurrency] firing ${jobs.length} jobs, concurrency=${CONCURRENCY}, size=${SIZE}, quality=${QUALITY}, dry=${DRY_RUN}`);
  console.log(`[image-concurrency] run label: ${RUN_LABEL}`);
  const wallStart = Date.now();
  const results = await pmap(jobs, CONCURRENCY, runOne);
  const wallMs = Date.now() - wallStart;

  const okResults = results.filter((r) => r && r.ok);
  const failResults = results.filter((r) => r && !r.ok);
  const latencies = okResults.map((r) => r.ms).sort((a, b) => a - b);

  for (const r of results) {
    if (!r) continue;
    const tag = r.ok ? 'ok' : 'FAIL';
    const idStr = r.id ? `#${r.id}` : '';
    console.log(`  [${tag}] #${String(r.idx).padStart(3, '0')}  ${String(r.label).padEnd(10)}  ${r.ms}ms  ${idStr}  ${r.error || ''}`);
  }

  console.log('\n[image-concurrency] summary');
  console.log(`  total       : ${results.length}`);
  console.log(`  ok          : ${okResults.length}`);
  console.log(`  failed      : ${failResults.length}`);
  console.log(`  wall_ms     : ${wallMs}`);
  console.log(`  throughput  : ${(okResults.length / (wallMs / 1000)).toFixed(2)} img/s`);
  if (latencies.length) {
    console.log(`  latency_ms  : min=${latencies[0]}  p50=${quantile(latencies, 0.5)}  p95=${quantile(latencies, 0.95)}  max=${latencies[latencies.length - 1]}`);
  }
  if (failResults.length) process.exitCode = 1;
}

try {
  await main();
} catch (e) {
  console.error('[image-concurrency] fatal:', e?.stack || e?.message || e);
  process.exitCode = 1;
} finally {
  await close();
}
