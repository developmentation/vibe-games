// Generate narrated prose stories via ElevenLabs TTS and stash them in
// challenge_3.media_assets (BYTEA inline) plus on disk for quick playback.
//
// The pipeline is two-step:
//   1) OpenAI (gpt-4o-mini by default) writes a short clear-prose story tuned
//      to the subject, grade, and audience. No metaphors, no slang, no jargon.
//   2) ElevenLabs synthesizes the story to mp3 using ELEVENLABS_VOICE_ID
//      (or an override). Bytes are inserted into media_assets and written to
//      challenge-3/media/audio/.
//
// Skip step 1 by passing --text "..." to feed your own prose verbatim.
//
// Modes:
//   --mode catalogue   walk subject x grade-band and generate a baseline
//                      narration library.
//   --mode outcomes    pull top curriculum_nodes for --subject + --grade and
//                      narrate one story per outcome.
//   --mode student     per-student plan narration. --student-id <id> or
//                      --student-asin <asin>. Reads grade_history and writes
//                      one warm encouragement story per struggling subject.
//   --mode adhoc       one-off. Supply --text "..." OR (--subject --grade
//                      --topic "...").
//
// Common flags:
//   --audience teacher|parent|student   (default: student)
//   --voice-id <id>                     override ELEVENLABS_VOICE_ID
//   --stability 0.5                     ElevenLabs voice_settings.stability
//   --similarity 0.75                   ElevenLabs voice_settings.similarity_boost
//   --model eleven_multilingual_v2      ElevenLabs model_id
//   --story-words 180                   target word count for the prose
//   --concurrency 2                     parallel requests
//   --subjects ELA,MAT                  catalogue/outcome filter
//   --grades K,1,2                      catalogue/outcome filter
//   --out media/audio                   on-disk output dir (relative to challenge-3/)
//   --dry-run                           skip API calls, print prompts only
//
// Examples:
//   node challenge-3/scripts/generate-audio.mjs --mode catalogue --subjects ELA,SCI --grades 3,4
//   node challenge-3/scripts/generate-audio.mjs --mode outcomes --subject MAT --grade 5
//   node challenge-3/scripts/generate-audio.mjs --mode student --student-id 12 --audience parent
//   node challenge-3/scripts/generate-audio.mjs --mode adhoc --text "Once upon a time..." --title "Counting bears" --subject MAT --grade K

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, close } from '../../lib/db.mjs';
import { jsonCompletion } from '../../lib/openai.mjs';
import { argv, argInt, argFlag, pmap, retry } from '../../lib/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const challengeRoot = path.resolve(here, '..');

const MODE = argv('mode', 'catalogue');
const AUDIENCE = argv('audience', 'student');
const VOICE_ID = argv('voice-id', process.env.ELEVENLABS_VOICE_ID);
const STABILITY = Number(argv('stability', '0.5'));
const SIMILARITY = Number(argv('similarity', '0.75'));
const TTS_MODEL = argv('model', 'eleven_flash_v2_5');
const STORY_WORDS = argInt('story-words', 180);
const CONCURRENCY = argInt('concurrency', 2);
const OUT_DIR = path.resolve(challengeRoot, argv('out', 'media/audio'));
const DRY_RUN = argFlag('dry-run');

const REQUESTED_SUBJECTS = (argv('subjects', '') || '')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const REQUESTED_GRADES = (argv('grades', '') || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

// --- Prose generation --------------------------------------------------------

const STORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'story'],
  properties: {
    title: { type: 'string', description: 'Short, plain title. No emoji.' },
    story: { type: 'string', description: 'Continuous prose, no bullet points, no headings, no stage directions.' },
  },
};

function audienceVoice(audience) {
  switch (audience) {
    case 'teacher':
      return 'Address a classroom teacher. Use precise but unjargoned language. Reference the learning intent and one or two formative checks the teacher can listen for.';
    case 'parent':
      return 'Address a parent in plain warm language. Use the second person. Avoid diagnosis. Suggest one simple thing they can do at home.';
    case 'student':
    default:
      return 'Address the student directly in a friendly, encouraging voice. Use short sentences. Avoid sarcasm and slang. Speak as a calm mentor.';
  }
}

function styleRules() {
  return [
    'Plain declarative prose suitable for being read aloud.',
    'No emoji. No headings. No bullet points. No stage directions.',
    'Vary sentence length, but bias toward short, clear sentences.',
    'Do not use any of the following words: vibrant, robust, leverage, journey, dive, unleash, dynamic, comprehensive, ensure, simply, just.',
    'Do not start with "Imagine" or "Picture this".',
    'Do not include lists rendered as commas-with-and.',
    'No rhetorical questions back-to-back.',
    'Canadian English spelling.',
  ].join(' ');
}

async function writeStory({ subjectName, gradeLabel, audience, topic, outcomeText }) {
  const system = [
    'You are an experienced Alberta K-12 educator writing a brief narrated lesson story.',
    audienceVoice(audience),
    styleRules(),
    `Target length: about ${STORY_WORDS} words.`,
    'Return JSON with fields: title, story. The story is one or two paragraphs of continuous prose.',
  ].join(' ');
  const user = [
    `Subject: ${subjectName}.`,
    `Grade: ${gradeLabel}.`,
    `Audience: ${audience}.`,
    `Topic: ${topic}.`,
    outcomeText ? `Curriculum outcome focus: ${outcomeText}.` : null,
    `Write the story now.`,
  ].filter(Boolean).join(' ');
  const out = await jsonCompletion({
    system,
    user,
    schema: STORY_SCHEMA,
    schemaName: 'narrated_story',
    maxTokens: 1200,
    temperature: 0.6,
  });
  return out;
}

// --- ElevenLabs TTS ----------------------------------------------------------

async function synthesizeTTS({ text, voiceId }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  if (!voiceId) throw new Error('voice id missing (pass --voice-id or set ELEVENLABS_VOICE_ID)');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const body = {
    text,
    model_id: TTS_MODEL,
    voice_settings: {
      stability: STABILITY,
      similarity_boost: SIMILARITY,
    },
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`ElevenLabs ${resp.status}: ${errText.slice(0, 400)}`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  return buf;
}

// Heuristic duration estimate from the source text. ElevenLabs returns no
// duration header on the binary endpoint, and decoding the mp3 to get exact
// length would pull in a binary dep. For demo purposes a wpm estimate is fine.
function estimateDurationSeconds(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wpm = 150;
  return Math.round((words / wpm) * 60 * 100) / 100;
}

// --- Persistence -------------------------------------------------------------

async function ensureOutDir() {
  await mkdir(OUT_DIR, { recursive: true });
}

function slug(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function persistAsset({ subjectCode, gradeLevel, audience, title, prompt, prose, mimeType, durationSeconds, bytes, studentId, planId, outcomeNodeIds, metadata }) {
  const res = await q(
    `INSERT INTO challenge_3.media_assets
       (kind, subject_code, grade_level, audience, title, prompt, prose_markdown,
        model, voice_id, mime_type, duration_seconds, byte_size, content,
        student_id, plan_id, outcome_node_ids, metadata)
     VALUES ('audio',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb)
     RETURNING id`,
    [
      subjectCode, gradeLevel, audience, title, prompt, prose,
      TTS_MODEL, VOICE_ID, mimeType, durationSeconds, bytes.length, bytes,
      studentId || null, planId || null,
      JSON.stringify(outcomeNodeIds || []),
      JSON.stringify(metadata || {}),
    ]
  );
  return res.rows[0].id;
}

async function loadSubjects() {
  const res = await q('SELECT code, name_en FROM challenge_3.subjects ORDER BY code');
  return res.rows;
}

// --- Curriculum DB (mode=outcomes) -------------------------------------------

import pg from 'pg';
const { Pool } = pg;
let _curriculumPool = null;
function curriculumPool() {
  if (_curriculumPool) return _curriculumPool;
  const connectionString = process.env.CURRICULUM_DB_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      'CURRICULUM_DB_CONNECTION_STRING not set. Required for --mode outcomes.'
    );
  }
  _curriculumPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  return _curriculumPool;
}

async function fetchTopOutcomes({ subjectCode, gradeCode, limit = 6 }) {
  const sql = `
    SELECT id::text AS node_id, code, name_en, full_text_en
      FROM phase1.curriculum_nodes
     WHERE subject_code = $1
       AND grade_code   = $2
     ORDER BY sort_order NULLS LAST, id
     LIMIT $3`;
  const res = await curriculumPool().query(sql, [subjectCode, gradeCode, limit]);
  return res.rows;
}

// --- Single-asset render -----------------------------------------------------

async function renderOne({ subjectCode, gradeLevel, audience, topic, providedText, providedTitle, studentId, planId, outcomeNodeIds, outcomeText, metadata }) {
  const subjectName = subjectCode
    ? ((await q('SELECT name_en FROM challenge_3.subjects WHERE code = $1', [subjectCode])).rows[0]?.name_en || subjectCode)
    : 'General';
  const gradeLabel = gradeLevel === 'K' ? 'Kindergarten' : (gradeLevel ? `Grade ${gradeLevel}` : 'Mixed grade');

  let title, story, prompt;
  if (providedText) {
    title = providedTitle || `${subjectCode || 'Story'} ${gradeLevel || ''}`.trim();
    story = providedText;
    prompt = '[verbatim --text provided]';
  } else {
    if (DRY_RUN) {
      title = providedTitle || `${subjectName} - ${gradeLabel}`;
      story = `[dry] would generate ~${STORY_WORDS}-word ${audience} story on: ${topic}`;
      prompt = `Subject: ${subjectName}. Grade: ${gradeLabel}. Audience: ${audience}. Topic: ${topic}.`;
      console.log(`[dry] ${subjectCode || '-'} ${gradeLevel || '-'} :: ${title}`);
      console.log(`      ${story}`);
      return { ok: true, dry: true };
    }
    const written = await retry(
      () => writeStory({ subjectName, gradeLabel, audience, topic, outcomeText }),
      { tries: 3, baseMs: 1500 }
    );
    title = providedTitle || written.title;
    story = written.story;
    prompt = `Subject: ${subjectName}. Grade: ${gradeLabel}. Audience: ${audience}. Topic: ${topic}.`;
  }

  if (DRY_RUN) {
    console.log(`[dry] tts skipped. story: ${story.slice(0, 120)}...`);
    return { ok: true, dry: true };
  }

  const bytes = await retry(() => synthesizeTTS({ text: story, voiceId: VOICE_ID }), { tries: 3, baseMs: 2000 });
  const durationSeconds = estimateDurationSeconds(story);
  const id = await persistAsset({
    subjectCode,
    gradeLevel,
    audience,
    title,
    prompt,
    prose: story,
    mimeType: 'audio/mpeg',
    durationSeconds,
    bytes,
    studentId,
    planId,
    outcomeNodeIds,
    metadata,
  });
  const filename = `${String(id).padStart(6, '0')}-${slug(subjectCode, gradeLevel, audience, title)}.mp3`;
  const onDisk = path.join(OUT_DIR, filename);
  await writeFile(onDisk, bytes);
  console.log(`[ok] #${id}  ${subjectCode || '-'} ${gradeLevel || '-'}  ${audience}  ${durationSeconds}s  ${title}`);
  return { ok: true, id, onDisk };
}

// --- Modes -------------------------------------------------------------------

const GRADE_BANDS = [
  ['K-3', ['K', '1', '2', '3']],
  ['4-6', ['4', '5', '6']],
  ['7-9', ['7', '8', '9']],
  ['10-12', ['10', '11', '12']],
];

const CATALOGUE_TOPICS = {
  ELA: 'a short story that practises listening for the main idea',
  MAT: 'a story about a small everyday math problem the listener can solve along the way',
  SCI: 'a story about a careful observation of something in the natural world',
  SOC: 'a short story about a community helper or a moment in Alberta history',
  FLA: 'une courte histoire en francais avec quelques mots-cles repetes',
  PHE: 'a short story about a balanced day with movement, water, sleep, and friends',
  FNA: 'a short story about noticing colour, sound, or rhythm in everyday life',
  CTF: 'a short story about trying, failing, and trying again on a small build',
  CTS: 'a short story about a tradesperson explaining one careful step of their craft',
};

async function modeCatalogue() {
  const subjects = await loadSubjects();
  const jobs = [];
  for (const subject of subjects) {
    if (REQUESTED_SUBJECTS.length && !REQUESTED_SUBJECTS.includes(subject.code)) continue;
    const topic = CATALOGUE_TOPICS[subject.code] || 'a short instructional story';
    for (const [, members] of GRADE_BANDS) {
      for (const gradeLevel of members) {
        if (REQUESTED_GRADES.length && !REQUESTED_GRADES.includes(gradeLevel)) continue;
        jobs.push({
          subjectCode: subject.code,
          gradeLevel,
          audience: AUDIENCE,
          topic,
          metadata: { mode: 'catalogue' },
        });
      }
    }
  }
  if (!jobs.length) {
    console.log('No catalogue jobs to run (check --subjects / --grades filters).');
    return;
  }
  console.log(`Catalogue: ${jobs.length} narrations, audience=${AUDIENCE}, concurrency=${CONCURRENCY}.`);
  await pmap(jobs, CONCURRENCY, renderOne);
}

async function modeOutcomes() {
  const subjectCode = (argv('subject', '') || '').toUpperCase();
  const gradeCode = argv('grade', '');
  if (!subjectCode || !gradeCode) {
    throw new Error('--mode outcomes requires --subject <CODE> and --grade <K|1..12>');
  }
  const outcomes = await fetchTopOutcomes({ subjectCode, gradeCode, limit: argInt('count', 6) });
  if (!outcomes.length) {
    console.log(`No curriculum outcomes found for ${subjectCode} ${gradeCode}.`);
    return;
  }
  const jobs = outcomes.map((o) => ({
    subjectCode,
    gradeLevel: gradeCode,
    audience: AUDIENCE,
    topic: `a focused story that helps the listener understand: ${o.name_en}`,
    outcomeText: o.full_text_en || o.name_en,
    outcomeNodeIds: [o.node_id],
    providedTitle: `${subjectCode} ${gradeCode}: ${o.name_en}`.slice(0, 200),
    metadata: { mode: 'outcomes', outcome_code: o.code },
  }));
  console.log(`Outcomes: ${jobs.length} narrations for ${subjectCode} ${gradeCode}, audience=${AUDIENCE}.`);
  await pmap(jobs, CONCURRENCY, renderOne);
}

async function modeStudent() {
  const id = argInt('student-id', null);
  const asin = argv('student-asin', null);
  if (!id && !asin) {
    throw new Error('--mode student requires --student-id <id> or --student-asin <asin>');
  }
  const lookup = id
    ? await q('SELECT id, first_name, last_name, current_grade FROM challenge_3.students WHERE id = $1', [id])
    : await q('SELECT id, first_name, last_name, current_grade FROM challenge_3.students WHERE asin = $1', [asin]);
  if (!lookup.rows[0]) throw new Error('Student not found');
  const student = lookup.rows[0];
  const subjectRows = await q(
    `SELECT subject_code, AVG(mark_percent) AS avg_mark
       FROM challenge_3.grade_history
      WHERE student_id = $1
      GROUP BY subject_code
      HAVING AVG(mark_percent) IS NOT NULL
      ORDER BY AVG(mark_percent) ASC`,
    [student.id]
  );
  const focusSubjects = subjectRows.rows.slice(0, argInt('count', 3));
  const jobs = focusSubjects.map(({ subject_code, avg_mark }) => ({
    subjectCode: subject_code,
    gradeLevel: student.current_grade,
    audience: AUDIENCE,
    topic: `a warm encouragement story for ${student.first_name} who is finding ${subject_code} challenging this term`,
    studentId: student.id,
    metadata: { mode: 'student', avg_mark: Number(avg_mark).toFixed(1) },
  }));
  if (!jobs.length) {
    console.log('Student has no graded subjects yet.');
    return;
  }
  console.log(`Student #${student.id} (${student.first_name} ${student.last_name}): ${jobs.length} narrations.`);
  await pmap(jobs, CONCURRENCY, renderOne);
}

async function modeAdhoc() {
  const text = argv('text', null);
  const topic = argv('topic', null);
  if (!text && !topic) {
    throw new Error('--mode adhoc requires --text "..." OR --topic "..." (plus --subject --grade)');
  }
  const subjectCode = (argv('subject', '') || '').toUpperCase() || null;
  const gradeLevel = argv('grade', null);
  const title = argv('title', null);
  await renderOne({
    subjectCode,
    gradeLevel,
    audience: AUDIENCE,
    topic: topic || '(verbatim text supplied)',
    providedText: text,
    providedTitle: title,
    metadata: { mode: 'adhoc' },
  });
}

// --- Entrypoint --------------------------------------------------------------

async function main() {
  await ensureOutDir();
  switch (MODE) {
    case 'catalogue': await modeCatalogue(); break;
    case 'outcomes': await modeOutcomes(); break;
    case 'student': await modeStudent(); break;
    case 'adhoc': await modeAdhoc(); break;
    default: throw new Error(`Unknown --mode ${MODE}`);
  }
}

try {
  await main();
} catch (e) {
  console.error('[generate-audio] failed:', e?.stack || e?.message || e);
  process.exitCode = 1;
} finally {
  await close();
  if (_curriculumPool) await _curriculumPool.end();
}
