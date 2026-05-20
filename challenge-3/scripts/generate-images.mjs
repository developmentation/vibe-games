// Generate classroom illustration assets via OpenAI Images API and stash them
// in challenge_3.media_assets (BYTEA inline) plus on disk for quick browse.
//
// Modes:
//   --mode catalogue   (default) walk subject x grade-band x scene matrix and
//                      seed a baseline media library.
//   --mode student     generate per-student covers for the student's struggling
//                      subjects (uses challenge_3.grade_history). Requires
//                      --student-id <id> OR --student-asin <asin>.
//   --mode outcomes    pull top curriculum_nodes for a subject + grade from the
//                      read-only curriculum DB and generate one illustration
//                      per outcome. Requires --subject MAT --grade 4.
//   --mode adhoc       one-off. Pass --prompt "..." and optionally --subject /
//                      --grade / --title.
//
// Common flags:
//   --count N            target asset count per (subject, grade) pair (catalogue)
//   --subjects ELA,MAT   restrict to these subject codes
//   --grades K,1,2,3     restrict to these grades
//   --size 1024x1024     OpenAI image size (1024x1024 | 1024x1536 | 1536x1024 | auto)
//   --quality medium     low | medium | high (gpt-image-1)
//   --concurrency 3      parallel API requests
//   --out ./media/images output dir for PNG copies (relative to challenge-3/)
//   --dry-run            log prompts; do not call OpenAI
//
// Examples:
//   node challenge-3/scripts/generate-images.mjs --mode catalogue --count 2 --concurrency 2
//   node challenge-3/scripts/generate-images.mjs --mode outcomes --subject SCI --grade 5
//   node challenge-3/scripts/generate-images.mjs --mode student --student-id 17
//   node challenge-3/scripts/generate-images.mjs --mode adhoc --prompt "A grade 3 classroom poster about telling time on an analog clock" --subject MAT --grade 3 --title "Telling time poster"

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, close } from '../../lib/db.mjs';
import { generateImage } from '../../lib/openai.mjs';
import { argv, argInt, argFlag, pmap, retry } from '../../lib/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const challengeRoot = path.resolve(here, '..');

const MODE = argv('mode', 'catalogue');
const COUNT_PER_PAIR = argInt('count', 1);
const SIZE = argv('size', '1024x1024');
const QUALITY = argv('quality', 'medium');
const CONCURRENCY = argInt('concurrency', 2);
const OUT_DIR = path.resolve(challengeRoot, argv('out', 'media/images'));
const DRY_RUN = argFlag('dry-run');

const REQUESTED_SUBJECTS = (argv('subjects', '') || '')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const REQUESTED_GRADES = (argv('grades', '') || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

// --- Prompt building blocks --------------------------------------------------

// Visual house style. Avoids brand-locked terms; keeps imagery age-appropriate
// and easy to drop into a classroom slide deck.
const HOUSE_STYLE = [
  'editorial classroom illustration style',
  'flat vector with subtle gradients',
  'warm prairie palette of golden wheat, deep navy, soft cream, brick accent',
  'inclusive diverse Alberta students',
  'clear focal point and generous negative space',
  'no text, no signage, no logos, no watermarks, no school crests',
  'safe-for-school content',
].join(', ');

// Grade-band scene seeds. Catalogue mode draws from these when no explicit
// scenes are supplied. Each seed is intentionally short so Claude or a human
// editor can refine it later.
const SCENE_SEEDS = {
  ELA: {
    'K-3': [
      'a teacher reading a picture book aloud on a carpet circle',
      'children arranging magnetic alphabet letters into simple words',
      'a quiet reading nook with cushions and a small bookshelf',
    ],
    '4-6': [
      'a student writing a story in a notebook beside a window',
      'a small-group book discussion at a round table',
      'a classroom anchor chart concept showing narrative structure',
    ],
    '7-9': [
      'a teen annotating a novel with sticky notes',
      'students collaborating on a podcast script with headphones',
      'a writer at a laptop drafting an essay with a coffee mug nearby',
    ],
    '10-12': [
      'a senior student researching at a public library',
      'a small literature seminar around a long wooden table',
      'a journalist-style interview between two students in a school hallway',
    ],
  },
  MAT: {
    'K-3': [
      'children counting wooden blocks in groups of ten',
      'a young student tracing numbers with a finger in sand',
      'pattern-block tiles forming a colourful tessellation',
    ],
    '4-6': [
      'students measuring the perimeter of a rug with a metre stick',
      'fraction circles arranged on a desk to show one half plus one quarter',
      'a number line painted on the gym floor with sneakered feet on integers',
    ],
    '7-9': [
      'a teen graphing a linear function on grid paper',
      'students using algebra tiles to solve a one-step equation',
      'a protractor and compass laid out for a geometry construction',
    ],
    '10-12': [
      'a calculus tangent line over a smooth curve on a whiteboard',
      'a statistics dot plot taped to a classroom window',
      'a student modelling a quadratic with a graphing tool on a laptop',
    ],
  },
  SCI: {
    'K-3': [
      'children inspecting leaves with magnifying glasses outdoors',
      'a kindergarten weather chart with sun, cloud, and snow symbols',
      'a butterfly life-cycle diorama on a classroom table',
    ],
    '4-6': [
      'students testing simple circuits with batteries and small bulbs',
      'a classroom water-cycle terrarium in a clear plastic bin',
      'a rock collection sorted by sedimentary, igneous, metamorphic',
    ],
    '7-9': [
      'a teen examining pond water under a microscope',
      'students balancing a chemistry equation on a small whiteboard',
      'a classroom model of the solar system suspended from the ceiling',
    ],
    '10-12': [
      'a chemistry titration set-up with a burette over an Erlenmeyer flask',
      'a physics lab with a ramp, cart, and motion sensor',
      'a biology cell-respiration concept sketch on a whiteboard',
    ],
  },
  SOC: {
    'K-3': [
      'a community-helpers mural with firefighter, nurse, farmer, librarian',
      'a classroom Canada map with sticky-note flags on each province',
      'children sharing family-tradition show-and-tell objects',
    ],
    '4-6': [
      'students examining a topographic map of Alberta on a long desk',
      'a timeline of Alberta history taped along a classroom wall',
      'a cultural-exchange day with foods, flags, and crafts on tables',
    ],
    '7-9': [
      'a model UN-style classroom debate with placards',
      'students mapping trade routes on a world map with yarn and pins',
      'a current-events board with newspaper clippings and post-it notes',
    ],
    '10-12': [
      'a senior civics class debating a policy proposal at desks in a horseshoe',
      'a Canadian Charter of Rights and Freedoms study group',
      'students presenting an economics infographic on a digital screen',
    ],
  },
  FLA: {
    'K-3': [
      'des enfants chantant une comptine en francais autour d\'un tapis colore',
      'a French-immersion word-wall with friendly cartoon animals',
      'children labelling everyday classroom objects with French sticky notes',
    ],
    '4-6': [
      'students performing a short French skit with simple cardboard props',
      'a francophone storybook shared at a small group table',
      'students writing a class newsletter in French on tablets',
    ],
    '7-9': [
      'a teen practising French pronunciation with headphones in a language lab',
      'a francophone-culture poster collage with maps and food photos',
      'a class film viewing of a francophone short with subtitles on a screen',
    ],
    '10-12': [
      'a senior student delivering a French oral presentation',
      'a francophone-literature seminar at a long wooden table',
      'students editing a French podcast on a laptop',
    ],
  },
  PHE: {
    'K-3': [
      'children skipping rope on a gym floor with painted hopscotch in the corner',
      'a yoga circle of young students stretching on mats',
      'a gentle obstacle course with cones, hoops, and balance beams',
    ],
    '4-6': [
      'a friendly dodgeball game in a school gym',
      'students learning to lay up a basketball at a low hoop',
      'a classroom heart-rate activity with hands on chest and a wall clock',
    ],
    '7-9': [
      'a co-ed volleyball rally in a school gym',
      'a wellness lesson with food-group posters on the wall',
      'students stretching in formation before a fitness circuit',
    ],
    '10-12': [
      'a teen running on a Canadian outdoor track in spring',
      'a leadership-team huddle before an intramural game',
      'a wellness journal open on a desk beside a water bottle and an apple',
    ],
  },
  FNA: {
    'K-3': [
      'children painting at easels with bright tempera colours',
      'a small drum and shaker collection on a music-room rug',
      'a paper-bag puppet show in front of a simple curtain',
    ],
    '4-6': [
      'a still-life arrangement of fruit being sketched by students',
      'a recorder ensemble seated in a semicircle',
      'a clay-handbuilding station with simple pinch pots and slip',
    ],
    '7-9': [
      'a charcoal portrait study at a tilted easel',
      'a jazz-band rehearsal in a school music room',
      'a drama-class warm-up circle on a small stage',
    ],
    '10-12': [
      'a senior visual-arts critique with works pinned to a wall',
      'a senior choir on risers in a school auditorium',
      'a senior drama scene-study with two students in neutral costume',
    ],
  },
  CTF: {
    'K-3': [
      'children building a small cardboard ramp for a toy car',
      'a maker-station with safety scissors, tape, and recycled materials',
      'students sorting tools into labelled bins',
    ],
    '4-6': [
      'a small robotics kit being assembled at a table',
      'a coding-block lesson on tablets at a U-shaped desk',
      'a basic woodworking station with sandpaper and a soft wood block',
    ],
    '7-9': [
      'students 3D-printing a small prototype while watching the print bed',
      'a foods-class kitchen with students measuring ingredients',
      'a fashion-studies pattern-making layout on a long table',
    ],
    '10-12': [
      'a senior automotive class with a car hood up in a shop bay',
      'a senior digital-media class editing video on dual monitors',
      'a senior construction class framing a small project wall',
    ],
  },
  CTS: {
    'K-3': [],
    '4-6': [],
    '7-9': [
      'a teen welding student in PPE practising a tack weld with a mentor nearby',
      'a hairstyling station with mannequin heads and styling tools',
      'a culinary-arts plate-up with a chef-style garnish',
    ],
    '10-12': [
      'a senior cosmetology student practising on a mannequin head',
      'a senior agriculture class at a small greenhouse with leafy greens',
      'a senior IT student running a cable through a server-rack mock-up',
    ],
  },
};

const GRADE_BANDS = [
  ['K-3', ['K', '1', '2', '3']],
  ['4-6', ['4', '5', '6']],
  ['7-9', ['7', '8', '9']],
  ['10-12', ['10', '11', '12']],
];

function bandForGrade(grade) {
  for (const [band, members] of GRADE_BANDS) {
    if (members.includes(grade)) return band;
  }
  return null;
}

function buildPrompt({ subjectName, gradeLabel, scene }) {
  return [
    `Alberta K-12 classroom illustration for ${subjectName}, ${gradeLabel}.`,
    `Scene: ${scene}.`,
    `Style: ${HOUSE_STYLE}.`,
  ].join(' ');
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

// --- Persistence -------------------------------------------------------------

async function ensureOutDir() {
  await mkdir(OUT_DIR, { recursive: true });
}

async function persistAsset({ kind, subjectCode, gradeLevel, audience, title, prompt, model, mimeType, width, height, bytes, studentId, planId, outcomeNodeIds, metadata }) {
  const res = await q(
    `INSERT INTO challenge_3.media_assets
       (kind, subject_code, grade_level, audience, title, prompt, model, mime_type,
        width, height, byte_size, content, student_id, plan_id,
        outcome_node_ids, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb)
     RETURNING id`,
    [
      kind, subjectCode, gradeLevel, audience, title, prompt, model, mimeType,
      width, height, bytes.length, bytes, studentId || null, planId || null,
      JSON.stringify(outcomeNodeIds || []),
      JSON.stringify(metadata || {}),
    ]
  );
  return res.rows[0].id;
}

async function loadSubjects() {
  const res = await q('SELECT code, name_en, is_core FROM challenge_3.subjects ORDER BY code');
  return res.rows;
}

// --- Curriculum DB (optional, mode=outcomes) ---------------------------------

import pg from 'pg';
const { Pool } = pg;
let _curriculumPool = null;
function curriculumPool() {
  if (_curriculumPool) return _curriculumPool;
  const connectionString = process.env.CURRICULUM_DB_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      'CURRICULUM_DB_CONNECTION_STRING not set. Required for --mode outcomes. ' +
      'See challenge-3/PROMPT.md for the read-only Alberta curriculum URL.'
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

// --- Single-image render -----------------------------------------------------

async function renderOne({ subjectCode, gradeLevel, audience, title, prompt, studentId, planId, outcomeNodeIds, metadata }) {
  if (DRY_RUN) {
    console.log(`[dry] ${subjectCode || '-'} ${gradeLevel || '-'} :: ${title}`);
    console.log(`      ${prompt}`);
    return { ok: true, dry: true };
  }
  const bytes = await retry(() => generateImage({ prompt, size: SIZE, quality: QUALITY }), { tries: 3, baseMs: 1500 });
  const [w, h] = SIZE.split('x').map((n) => parseInt(n, 10));
  const id = await persistAsset({
    kind: 'image',
    subjectCode,
    gradeLevel,
    audience: audience || null,
    title,
    prompt,
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    mimeType: 'image/png',
    width: Number.isFinite(w) ? w : null,
    height: Number.isFinite(h) ? h : null,
    bytes,
    studentId,
    planId,
    outcomeNodeIds,
    metadata,
  });
  const filename = `${String(id).padStart(6, '0')}-${slug(subjectCode, gradeLevel, title)}.png`;
  const onDisk = path.join(OUT_DIR, filename);
  await writeFile(onDisk, bytes);
  console.log(`[ok] #${id}  ${subjectCode || '-'} ${gradeLevel || '-'}  ${title}  -> ${path.relative(challengeRoot, onDisk)}`);
  return { ok: true, id, onDisk };
}

// --- Modes -------------------------------------------------------------------

async function modeCatalogue() {
  const subjects = await loadSubjects();
  const jobs = [];
  for (const subject of subjects) {
    if (REQUESTED_SUBJECTS.length && !REQUESTED_SUBJECTS.includes(subject.code)) continue;
    const sceneByBand = SCENE_SEEDS[subject.code] || {};
    for (const [band, members] of GRADE_BANDS) {
      const scenes = sceneByBand[band] || [];
      if (!scenes.length) continue;
      for (const gradeLevel of members) {
        if (REQUESTED_GRADES.length && !REQUESTED_GRADES.includes(gradeLevel)) continue;
        const gradeLabel = gradeLevel === 'K' ? 'Kindergarten' : `Grade ${gradeLevel}`;
        const pick = scenes.slice(0, COUNT_PER_PAIR);
        for (const scene of pick) {
          jobs.push({
            subjectCode: subject.code,
            gradeLevel,
            audience: 'teacher',
            title: `${subject.name_en} - ${gradeLabel}`,
            prompt: buildPrompt({ subjectName: subject.name_en, gradeLabel, scene }),
            outcomeNodeIds: [],
            metadata: { mode: 'catalogue', band, scene },
          });
        }
      }
    }
  }
  if (!jobs.length) {
    console.log('No catalogue jobs to run (check --subjects / --grades filters).');
    return;
  }
  console.log(`Catalogue: ${jobs.length} images at ${SIZE} (${QUALITY}), concurrency ${CONCURRENCY}.`);
  await pmap(jobs, CONCURRENCY, renderOne);
}

async function modeOutcomes() {
  const subjectCode = (argv('subject', '') || '').toUpperCase();
  const gradeCode = argv('grade', '');
  if (!subjectCode || !gradeCode) {
    throw new Error('--mode outcomes requires --subject <CODE> and --grade <K|1..12>');
  }
  const subjectRow = (await q('SELECT name_en FROM challenge_3.subjects WHERE code = $1', [subjectCode])).rows[0];
  if (!subjectRow) throw new Error(`Unknown subject code: ${subjectCode}`);
  const outcomes = await fetchTopOutcomes({ subjectCode, gradeCode, limit: argInt('count', 6) });
  if (!outcomes.length) {
    console.log(`No curriculum outcomes found for ${subjectCode} ${gradeCode}.`);
    return;
  }
  const gradeLabel = gradeCode === 'K' ? 'Kindergarten' : `Grade ${gradeCode}`;
  const jobs = outcomes.map((o) => {
    const focus = o.full_text_en || o.name_en;
    const scene = `a learning activity that helps students with: ${focus}`;
    return {
      subjectCode,
      gradeLevel: gradeCode,
      audience: 'teacher',
      title: `${subjectCode} ${gradeCode}: ${o.name_en}`.slice(0, 200),
      prompt: buildPrompt({ subjectName: subjectRow.name_en, gradeLabel, scene }),
      outcomeNodeIds: [o.node_id],
      metadata: { mode: 'outcomes', outcome_code: o.code, outcome_name: o.name_en },
    };
  });
  console.log(`Outcomes: ${jobs.length} images for ${subjectCode} ${gradeCode}.`);
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
  const subjectsLookup = Object.fromEntries((await loadSubjects()).map((s) => [s.code, s.name_en]));
  const gradeLevel = student.current_grade;
  const gradeLabel = gradeLevel === 'K' ? 'Kindergarten' : `Grade ${gradeLevel}`;
  const band = bandForGrade(gradeLevel);
  const focusSubjects = subjectRows.rows.slice(0, argInt('count', 3));
  const jobs = focusSubjects.map(({ subject_code, avg_mark }) => {
    const scenes = (SCENE_SEEDS[subject_code] || {})[band] || [];
    const scene = scenes[0] || `a supportive ${gradeLabel} lesson moment`;
    const subjectName = subjectsLookup[subject_code] || subject_code;
    return {
      subjectCode: subject_code,
      gradeLevel,
      audience: 'student',
      title: `${student.first_name} ${student.last_name} - ${subjectName} encouragement card`,
      prompt: buildPrompt({
        subjectName,
        gradeLabel,
        scene: `${scene}; tone is supportive and encouraging for a student building confidence`,
      }),
      studentId: student.id,
      outcomeNodeIds: [],
      metadata: { mode: 'student', avg_mark: Number(avg_mark).toFixed(1) },
    };
  });
  if (!jobs.length) {
    console.log('Student has no graded subjects yet.');
    return;
  }
  console.log(`Student #${student.id} (${student.first_name} ${student.last_name}, ${gradeLabel}): ${jobs.length} images.`);
  await pmap(jobs, CONCURRENCY, renderOne);
}

async function modeAdhoc() {
  const prompt = argv('prompt', '');
  if (!prompt) throw new Error('--mode adhoc requires --prompt "..."');
  const subjectCode = (argv('subject', '') || '').toUpperCase() || null;
  const gradeLevel = argv('grade', null);
  const title = argv('title', null) || prompt.slice(0, 80);
  await renderOne({
    subjectCode,
    gradeLevel,
    audience: argv('audience', 'teacher'),
    title,
    prompt,
    outcomeNodeIds: [],
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
  console.error('[generate-images] failed:', e?.stack || e?.message || e);
  process.exitCode = 1;
} finally {
  await close();
  if (_curriculumPool) await _curriculumPool.end();
}
