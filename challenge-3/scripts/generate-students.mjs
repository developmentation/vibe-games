// Generate synthetic Alberta K-12 students with grade history. About 1/3 carry
// classroom-complexity flags (ESL, IPP, behavioural, medical, sensory).
//
// Usage:
//   node challenge-3/scripts/generate-students.mjs --count 100 [--terms-per-year 3] [--years 3] [--concurrency 4]
//
// Idempotent: only generates students until total reaches --count. Grade history
// fills for any student that does not yet have any history rows.
import { q, close } from '../../lib/db.mjs';
import { jsonCompletion } from '../../lib/openai.mjs';
import { argInt, pmap, retry, pickName, albertaCity, asinNumber, phone } from '../../lib/util.mjs';

const TARGET = argInt('count', 100);
const TERMS_PER_YEAR = argInt('terms-per-year', 3);
const YEARS = argInt('years', 3);
const CONCURRENCY = argInt('concurrency', 4);

const DIVISIONS = [
  'Calgary Board of Education', 'Calgary Catholic School District',
  'Edmonton Public Schools', 'Edmonton Catholic Schools',
  'Rocky View Schools', 'Red Deer Public Schools', 'Foothills School Division',
  'Elk Island Public Schools', 'Black Gold School Division',
  'Conseil scolaire FrancoSud', 'Conseil scolaire Centre-Nord',
];
const SCHOOL_SUFFIXES = ['Elementary School', 'Junior High', 'High School', 'Academy', 'School'];
const COMPLEXITY_FLAGS = [
  'english-language-learner',
  'ipp-individualized-program-plan',
  'gifted-and-talented',
  'mild-moderate-learning-disability',
  'attention-regulation',
  'autism-spectrum',
  'behavioural-support',
  'medical-condition',
  'sensory-hearing',
  'sensory-vision',
  'mental-health-anxiety',
  'mental-health-depression',
  'newcomer-refugee',
  'fnmi-cultural-supports',
];
const SUPPORTS = [
  'small-group-instruction', 'reading-intervention', 'math-tutoring', 'ea-support',
  'counsellor-checkin', 'speech-language-pathology', 'occupational-therapy',
  'esl-pullout', 'modified-curriculum', 'assistive-technology',
];

const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function gradeForAge(age) {
  if (age <= 5) return 'K';
  const g = age - 5;
  if (g < 1) return 'K';
  if (g > 12) return '12';
  return String(g);
}

function pickGrade() {
  const r = Math.random();
  if (r < 0.10) return 'K';
  if (r < 0.50) return GRADES[1 + Math.floor(Math.random() * 6)]; // 1..6
  if (r < 0.80) return GRADES[7 + Math.floor(Math.random() * 3)]; // 7..9
  return GRADES[10 + Math.floor(Math.random() * 3)];               // 10..12
}

function dobForGrade(grade) {
  let age;
  if (grade === 'K') age = 5;
  else age = parseInt(grade, 10) + 5;
  age += (Math.random() < 0.15 ? -1 : 0) + (Math.random() < 0.05 ? 1 : 0);
  const today = new Date();
  const birthYear = today.getFullYear() - age;
  const month = Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return new Date(birthYear, month, day).toISOString().slice(0, 10);
}

function pickSchool() {
  const div = DIVISIONS[Math.floor(Math.random() * DIVISIONS.length)];
  const last = pickName().last;
  const suffix = SCHOOL_SUFFIXES[Math.floor(Math.random() * SCHOOL_SUFFIXES.length)];
  return { division: div, name: `${last} ${suffix}` };
}

async function existingCount() {
  const r = await q('SELECT count(*)::int AS n FROM challenge_3.students');
  return r.rows[0].n;
}

async function uniqueAsin() {
  for (let i = 0; i < 25; i++) {
    const a = asinNumber();
    const r = await q('SELECT 1 FROM challenge_3.students WHERE asin = $1', [a]);
    if (r.rowCount === 0) return a;
  }
  throw new Error('could not allocate unique ASIN after 25 tries');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function complexityProfile() {
  const flagCount = 1 + Math.floor(Math.random() * 2);
  const flags = shuffle(COMPLEXITY_FLAGS).slice(0, flagCount);
  const supports = shuffle(SUPPORTS).slice(0, 1 + Math.floor(Math.random() * 3));
  return { flags, supports };
}

// Generate a teacher comment via OpenAI for each student (one call per student).
async function teacherCommentary(student, history) {
  const summary = history
    .reduce((acc, h) => {
      const k = h.subject_code;
      acc[k] = acc[k] || [];
      acc[k].push(h.mark_percent);
      return acc;
    }, {});
  const lines = Object.entries(summary).map(([s, marks]) => {
    const avg = marks.reduce((a, b) => a + b, 0) / marks.length;
    return `${s}: avg ${avg.toFixed(1)}`;
  }).join('; ');
  const SYSTEM = `You write brief, professional Alberta K-12 teacher commentary for a synthetic student record. Plain language. No emoji. No marketing tone. Reflect the data given. 80-150 words.`;
  const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['assessment', 'goals', 'recommendations'],
    properties: {
      assessment: { type: 'string' },
      goals: { type: 'string' },
      recommendations: { type: 'string' },
    },
  };
  try {
    return await retry(
      () => jsonCompletion({
        system: SYSTEM,
        user: `Student: ${student.first_name} ${student.last_name}, Grade ${student.current_grade}, ${student.school_division}. Complexity flags: ${student.complexity_profile.flags?.join(', ') || 'none'}. Recent term averages: ${lines}. Write three short sections.`,
        schema: SCHEMA,
        schemaName: 'teacher_commentary',
        temperature: 0.7,
        maxTokens: 700,
      }),
      { tries: 2 }
    );
  } catch (e) {
    return null;
  }
}

function generateHistory(student) {
  const rows = [];
  const currentGradeIdx = GRADES.indexOf(student.current_grade);
  const startGradeIdx = Math.max(0, currentGradeIdx - (YEARS - 1));
  const years = [];
  const currentYearStart = 2026;
  for (let y = 0; y < YEARS; y++) {
    years.push({
      year: `${currentYearStart - (YEARS - 1 - y)}-${currentYearStart - (YEARS - 1 - y) + 1}`,
      gradeIdx: startGradeIdx + y,
    });
  }
  const allSubjects = ['ELA', 'MAT', 'SCI', 'SOC', 'PHE'];
  if (Math.random() < 0.4) allSubjects.push('FLA');
  if (Math.random() < 0.5) allSubjects.push('FNA');
  if (currentGradeIdx >= 6) allSubjects.push('CTF');
  if (currentGradeIdx >= 10) allSubjects.push('CTS');

  // Pick struggle/excel signature per subject.
  const subjectBaseline = {};
  for (const s of allSubjects) {
    const r = Math.random();
    let base, drift;
    if (r < 0.25) { base = 50 + Math.random() * 12; drift = -1.5; }       // struggling
    else if (r > 0.85) { base = 86 + Math.random() * 10; drift = 1.0; }   // excelling
    else { base = 68 + Math.random() * 14; drift = 0; }                   // typical
    subjectBaseline[s] = { base, drift };
  }

  // Complexity makes scores more variable + slightly lower on average.
  const complexityShift = student.has_complexity ? -4 : 0;

  for (const { year, gradeIdx } of years) {
    if (gradeIdx < 0 || gradeIdx >= GRADES.length) continue;
    const gradeLevel = GRADES[gradeIdx];
    for (const subj of allSubjects) {
      const { base, drift } = subjectBaseline[subj];
      for (let term = 1; term <= TERMS_PER_YEAR; term++) {
        let mark = base + drift * term + (Math.random() - 0.5) * 8 + complexityShift;
        mark = Math.max(20, Math.min(100, mark));
        const struggling = mark < 60;
        const excelling = mark >= 90;
        let perf;
        if (mark < 55) perf = 'below_grade';
        else if (mark < 70) perf = 'approaching';
        else if (mark < 88) perf = 'at_grade';
        else perf = 'above_grade';
        rows.push({
          school_year: year,
          grade_level: gradeLevel,
          subject_code: subj,
          term,
          mark_percent: Number(mark.toFixed(1)),
          letter_grade: mark >= 90 ? 'A' : mark >= 80 ? 'B' : mark >= 70 ? 'C' : mark >= 55 ? 'D' : 'F',
          performance: perf,
          struggling,
          excelling,
        });
      }
    }
  }
  return rows;
}

async function generateStudent(i) {
  const grade = pickGrade();
  const { first, last } = pickName();
  const dob = dobForGrade(grade);
  const school = pickSchool();
  const hasComplexity = Math.random() < 0.34;
  const profile = hasComplexity ? complexityProfile() : { flags: [], supports: [] };
  const guardian = pickName();
  const asin = await uniqueAsin();
  const langOfInstr = school.division.startsWith('Conseil') ? 'fr' : 'en';

  const student = {
    asin,
    first_name: first,
    last_name: last,
    date_of_birth: dob,
    current_grade: grade,
    school_name: school.name,
    school_division: school.division,
    city: albertaCity(),
    language_of_instruction: langOfInstr,
    has_complexity: hasComplexity,
    complexity_profile: profile,
    guardian_name: `${guardian.first} ${last}`,
    guardian_email: `${guardian.first}.${last}.${Math.floor(Math.random() * 999)}@example.ab.ca`.toLowerCase(),
    guardian_phone: phone(),
    enrolled_at: new Date(Date.now() - Math.floor(Math.random() * 5 * 365) * 86400_000).toISOString().slice(0, 10),
  };

  const ins = await q(
    `INSERT INTO challenge_3.students
       (asin, first_name, last_name, date_of_birth, current_grade, school_name, school_division,
        city, province, language_of_instruction, has_complexity, complexity_profile,
        guardian_name, guardian_email, guardian_phone, enrolled_at, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'AB',$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (asin) DO NOTHING
     RETURNING id`,
    [
      student.asin, student.first_name, student.last_name, student.date_of_birth,
      student.current_grade, student.school_name, student.school_division,
      student.city, student.language_of_instruction, student.has_complexity,
      JSON.stringify(student.complexity_profile),
      student.guardian_name, student.guardian_email, student.guardian_phone,
      student.enrolled_at, JSON.stringify(student),
    ]
  );
  if (ins.rowCount === 0) return null;
  const studentId = ins.rows[0].id;

  const history = generateHistory(student);
  for (const h of history) {
    await q(
      `INSERT INTO challenge_3.grade_history
         (student_id, school_year, grade_level, subject_code, term, mark_percent,
          letter_grade, performance, struggling, excelling, teacher_comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL)
       ON CONFLICT DO NOTHING`,
      [
        studentId, h.school_year, h.grade_level, h.subject_code, h.term,
        h.mark_percent, h.letter_grade, h.performance, h.struggling, h.excelling,
      ]
    );
  }

  const commentary = await teacherCommentary(student, history.slice(-12));
  if (commentary) {
    for (const [type, body] of [
      ['assessment', commentary.assessment],
      ['goal', commentary.goals],
      ['intervention', commentary.recommendations],
    ]) {
      if (!body) continue;
      await q(
        `INSERT INTO challenge_3.iep_notes (student_id, note_type, body_markdown, author_role)
         VALUES ($1,$2,$3,'teacher')`,
        [studentId, type, body]
      );
    }
  }

  return studentId;
}

const have = await existingCount();
const need = Math.max(0, TARGET - have);
console.log(`students: have=${have}, target=${TARGET}, need=${need}`);

if (need > 0) {
  const indices = Array.from({ length: need }, (_, i) => i);
  let done = 0;
  const start = Date.now();
  await pmap(indices, CONCURRENCY, async (i) => {
    try {
      await generateStudent(i);
    } catch (e) {
      console.error(`student ${i} failed: ${e.message}`);
    }
    done++;
    process.stdout.write(`\r[${done}/${need}] elapsed=${((Date.now() - start) / 1000).toFixed(1)}s   `);
  });
  process.stdout.write('\n');
}

const final = await q(`
  SELECT (SELECT count(*) FROM challenge_3.students) AS students,
         (SELECT count(*) FROM challenge_3.grade_history) AS grades,
         (SELECT count(*) FROM challenge_3.iep_notes) AS notes,
         (SELECT count(*) FROM challenge_3.students WHERE has_complexity) AS complex_students
`);
console.log('final counts:', final.rows[0]);
await close();
