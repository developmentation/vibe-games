// Concurrency test: ElevenLabs Flash v2.5 narration.
//
// Goal: prove the harness can sustain rapid concurrent TTS calls against
// eleven_flash_v2_5, persist each result into challenge_3.media_assets, and
// report per-call latency, p50/p95, throughput, wall time. Each row drops
// straight into the same gallery the UI reads from.
//
// By default this script SKIPS the OpenAI prose-writing step and uses a small
// rotating set of pre-written short narrations so the test isolates ElevenLabs
// throughput. Pass --include-prose to run the full two-step pipeline.
//
// Usage:
//   node challenge-3/server-1/tests/test-audio-concurrency.mjs
//   node challenge-3/server-1/tests/test-audio-concurrency.mjs --total 20 --concurrency 10
//   node challenge-3/server-1/tests/test-audio-concurrency.mjs --total 30 --concurrency 12 --voice-id <id>
//   node challenge-3/server-1/tests/test-audio-concurrency.mjs --include-prose
//   node challenge-3/server-1/tests/test-audio-concurrency.mjs --dry-run --total 5
//
// Flags:
//   --total N           number of jobs (default 20)
//   --concurrency C     parallel TTS calls (default 10)
//   --model name        ElevenLabs model (default eleven_flash_v2_5)
//   --voice-id <id>     override ELEVENLABS_VOICE_ID
//   --stability 0.5
//   --similarity 0.75
//   --include-prose     run OpenAI story-writer before TTS (slower; full path)
//   --label name        metadata.run_label
//   --dry-run           skip API; walk schedule only

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
const { jsonCompletion } = await import('../../../lib/openai.mjs');
const { argInt, argv, argFlag, pmap, retry } = await import('../../../lib/util.mjs');

const TOTAL = argInt('total', 20);
const CONCURRENCY = argInt('concurrency', 10);
const MODEL = argv('model', 'eleven_flash_v2_5');
const VOICE_ID = argv('voice-id', process.env.ELEVENLABS_VOICE_ID);
const STABILITY = Number(argv('stability', '0.5'));
const SIMILARITY = Number(argv('similarity', '0.75'));
const INCLUDE_PROSE = argFlag('include-prose');
const DRY_RUN = argFlag('dry-run');
const RUN_LABEL = argv('label', `concurrency-${TOTAL}-${CONCURRENCY}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`);
const OUT_DIR = path.resolve(challengeRoot, 'media/audio');

// Short prewritten prose. Roughly 90-120 words each so a 10-job run completes
// in seconds on Flash v2.5.
const SEEDS = [
  { subject: 'ELA', grade: '2', title: 'A walk after rain', text: 'Maya zipped her coat and stepped outside. The sidewalk was dark and shiny. She listened. Cars hummed in the distance. A robin pulled a worm from the wet grass. Maya counted four puddles before she reached the corner. At the corner she stopped, looked left and right, then crossed. The world after rain smelled like soil and warm bread from the bakery on Tenth. Maya thought a walk could be its own kind of reading. You notice things. You ask quiet questions. You bring the answers home in your pocket.' },
  { subject: 'MAT', grade: '4', title: 'Sharing twelve apples', text: 'There were twelve apples on the table and three friends in the kitchen. How could they share fairly? Aanya laid out three small plates. She placed one apple on each, then another, then another. After four rounds, every plate had four apples. Twelve divided into three equal groups is four. Aanya smiled. She had not used a calculator. She had used patience and a pattern. Later her dad asked, what if a fourth friend comes by? Aanya thought for a moment. Twelve into four groups is three. She set out a fourth plate, just in case.' },
  { subject: 'SCI', grade: '5', title: 'A simple circuit', text: 'Liam connected one wire to the battery and one to the bulb. The bulb stayed dark. He checked his diagram. Electricity needs a complete path. He added a second wire from the other side of the bulb back to the battery. The bulb glowed. A circuit is a loop. Break the loop, and the light goes out. Liam clipped one wire off and on, off and on. He thought about every switch he had ever used. They were not magic. They were tiny gates on a path.' },
  { subject: 'SOC', grade: '3', title: 'Neighbours', text: 'Mrs. Banerjee brought a tray of samosas to the new family across the hall. The new family, the Sokols, had moved from Ukraine three weeks ago. The little girl, Iryna, watched from the door. Mrs. Banerjee smiled and held out the tray. Iryna took one carefully with two hands. Her mom said, dyakuyu. Mrs. Banerjee said, you are welcome. Later, Iryna learned to say it back. Thank you. Neighbours are people who notice each other. Small kindnesses, repeated, make a hallway into a place.' },
  { subject: 'PHE', grade: '6', title: 'Three deep breaths', text: 'Before the big play, Ben stepped to the line and felt his heart racing. He remembered what his coach had said. Three deep breaths. In through the nose, out through the mouth. Slower than feels natural. By the third breath, his hands were steady. He looked up. The play unfolded. He did his job. Whether the result was a goal or a miss did not matter as much as the calm before. The breath is a small tool. It is always with you. It costs nothing. Use it.' },
  { subject: 'FNA', grade: '7', title: 'Two minutes of charcoal', text: 'Mr. Liu set a small timer on the table. Two minutes. He held up a kettle. The class drew. No erasing. No corrections. When the timer chimed, they stopped. Some drawings looked like kettles. Some did not. He smiled. The point is not the finished picture. The point is the eyes learning to look. Try ten of these in a row, and your hand begins to trust your eyes. Look first. Draw second. Forget the result. Begin again.' },
  { subject: 'CTF', grade: '6', title: 'A wobbly bridge', text: 'Priya and Mateo built a bridge from spaghetti and tape. It looked grand. Then Priya placed a single quarter on the deck. The bridge dipped. The middle bowed. The deck cracked. They laughed. Then they looked at the broken pieces and asked, where did it fail? In the middle, where nothing held it up. They added a small triangle of supports. The second bridge held two quarters, then three. Engineering is not about a perfect first try. It is about asking the wreckage a careful question.' },
  { subject: 'FLA', grade: '4', title: 'Une promenade', text: 'Apres l\'ecole, Eloise marche avec sa grand-mere. Le ciel est bleu. Les feuilles sont jaunes. Eloise compte les ecureuils. Un, deux, trois. Sa grand-mere sourit. Elles s\'arretent au parc. Eloise dit, j\'ai faim. Sa grand-mere ouvre son sac et donne une pomme. Eloise dit, merci. Elles s\'assoient sur un banc. Le vent est doux. Eloise ferme les yeux une seconde. Elle ecoute. Elle entend des oiseaux. Une promenade est un petit cadeau du jour.' },
];

const STORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'story'],
  properties: { title: { type: 'string' }, story: { type: 'string' } },
};

async function writeStory({ subjectName, gradeLabel, topic }) {
  const system = [
    'You are an experienced Alberta K-12 educator writing a brief narrated lesson story.',
    'Address the student in plain warm language. Short sentences. Calm mentor tone.',
    'No emoji. No headings. No bullet points. No stage directions. Canadian English spelling.',
    'Target length: about 110 words. Return JSON with title and story.',
  ].join(' ');
  const user = `Subject: ${subjectName}. Grade: ${gradeLabel}. Topic: ${topic}. Write the story now.`;
  return jsonCompletion({
    system,
    user,
    schema: STORY_SCHEMA,
    schemaName: 'narrated_story',
    maxTokens: 700,
    temperature: 0.6,
  });
}

async function synthesizeTTS({ text, voiceId, model }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  if (!voiceId) throw new Error('voice id missing');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: STABILITY, similarity_boost: SIMILARITY },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`ElevenLabs ${resp.status}: ${errText.slice(0, 400)}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

function estimateDurationSeconds(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / 150) * 60 * 100) / 100;
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

function buildJobs(total) {
  const jobs = [];
  for (let i = 0; i < total; i++) {
    const seed = SEEDS[i % SEEDS.length];
    jobs.push({ idx: i + 1, ...seed });
  }
  return jobs;
}

async function persistAsset({ job, prose, bytes, durationSeconds }) {
  const res = await q(
    `INSERT INTO challenge_3.media_assets
       (kind, subject_code, grade_level, audience, title, prompt, prose_markdown,
        model, voice_id, mime_type, duration_seconds, byte_size, content,
        outcome_node_ids, metadata)
     VALUES ('audio',$1,$2,'student',$3,$4,$5,$6,$7,'audio/mpeg',$8,$9,$10,'[]'::jsonb,$11::jsonb)
     RETURNING id`,
    [
      job.subject, job.grade, job.title,
      `Concurrency test job ${job.idx} (${job.subject} ${job.grade})`,
      prose, MODEL, VOICE_ID, durationSeconds, bytes.length, bytes,
      JSON.stringify({ run_label: RUN_LABEL, include_prose: INCLUDE_PROSE }),
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
    let prose = job.text;
    if (INCLUDE_PROSE) {
      const written = await retry(
        () => writeStory({
          subjectName: job.subject,
          gradeLabel: job.grade === 'K' ? 'Kindergarten' : `Grade ${job.grade}`,
          topic: job.title,
        }),
        { tries: 2, baseMs: 1500 }
      );
      prose = written.story;
    }
    const bytes = await retry(
      () => synthesizeTTS({ text: prose, voiceId: VOICE_ID, model: MODEL }),
      { tries: 2, baseMs: 1500 }
    );
    const durationSeconds = estimateDurationSeconds(prose);
    const id = await persistAsset({ job, prose, bytes, durationSeconds });
    const filename = `${String(id).padStart(6, '0')}-${slug(job.subject, job.grade, 'concurrency')}.mp3`;
    const onDisk = path.join(OUT_DIR, filename);
    await writeFile(onDisk, bytes).catch(() => {});
    return {
      idx: job.idx, ok: true, ms: Date.now() - started, id,
      label: `${job.subject} ${job.grade}`,
      duration: durationSeconds,
    };
  } catch (e) {
    return { idx: job.idx, ok: false, ms: Date.now() - started, error: String(e?.message || e), label: `${job.subject} ${job.grade}` };
  }
}

async function main() {
  if (!DRY_RUN) await mkdir(OUT_DIR, { recursive: true });
  const jobs = buildJobs(TOTAL);
  console.log(`[audio-concurrency] firing ${jobs.length} jobs, concurrency=${CONCURRENCY}, model=${MODEL}, voice=${VOICE_ID}, include_prose=${INCLUDE_PROSE}, dry=${DRY_RUN}`);
  console.log(`[audio-concurrency] run label: ${RUN_LABEL}`);
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
    const dur = r.duration ? `${r.duration}s` : '';
    console.log(`  [${tag}] #${String(r.idx).padStart(3, '0')}  ${String(r.label).padEnd(10)}  ${r.ms}ms  ${dur}  ${idStr}  ${r.error || ''}`);
  }

  console.log('\n[audio-concurrency] summary');
  console.log(`  total       : ${results.length}`);
  console.log(`  ok          : ${okResults.length}`);
  console.log(`  failed      : ${failResults.length}`);
  console.log(`  wall_ms     : ${wallMs}`);
  console.log(`  throughput  : ${(okResults.length / (wallMs / 1000)).toFixed(2)} clips/s`);
  if (latencies.length) {
    console.log(`  latency_ms  : min=${latencies[0]}  p50=${quantile(latencies, 0.5)}  p95=${quantile(latencies, 0.95)}  max=${latencies[latencies.length - 1]}`);
  }
  if (failResults.length) process.exitCode = 1;
}

try {
  await main();
} catch (e) {
  console.error('[audio-concurrency] fatal:', e?.stack || e?.message || e);
  process.exitCode = 1;
} finally {
  await close();
}
