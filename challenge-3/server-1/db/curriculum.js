// Read-only pool against the Alberta curriculum mirror DB (phase1/phase2).
// One pool, retried, never written to.
import pg from 'pg';

const { Pool } = pg;

let _pool = null;
export function curriculumPool() {
  if (_pool) return _pool;
  const cs = process.env.CURRICULUM_DB_CONNECTION_STRING;
  if (!cs) throw new Error('CURRICULUM_DB_CONNECTION_STRING not set');
  _pool = new Pool({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  return _pool;
}

const TRANSIENT = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']);
function isTransient(e) {
  if (!e) return false;
  if (TRANSIENT.has(e.code)) return true;
  const msg = String(e?.message || e);
  return /getaddrinfo|ENOTFOUND|EAI_AGAIN|connection terminated/i.test(msg);
}

export async function cq(sql, params = []) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await curriculumPool().query(sql, params);
    } catch (e) {
      if (attempt <= 4 && isTransient(e)) {
        await new Promise(r => setTimeout(r, 500 * 2 ** (attempt - 1)));
        continue;
      }
      throw e;
    }
  }
}

export async function curriculumPing() {
  try {
    const r = await cq('SELECT 1 AS ok');
    return r.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

// Map a challenge_3 subject_code + grade to the curriculum-DB subject + course codes.
// Returns an array of { subject, course } pairs. Empty array means "not mapped"
// — callers should treat that as "no outcomes available for this subject + grade".
export function courseCodesFor(subjectCode, grade) {
  const g = String(grade);
  switch (subjectCode) {
    case 'ELA':
      if (g === 'K') return [{ subject: 'LANENG', course: 'LANENGK' }];
      if (Number(g) <= 6) return [{ subject: 'LANENG', course: 'LANENG' + g }];
      if (Number(g) <= 9) return [{ subject: 'LANENG', course: 'ELA' + g }];
      if (g === '10') return [{ subject: 'LANENG', course: 'ELA1104' }, { subject: 'LANENG', course: 'ELA1105' }];
      if (g === '11') return [{ subject: 'LANENG', course: 'ELA2104' }, { subject: 'LANENG', course: 'ELA2105' }];
      if (g === '12') return [{ subject: 'LANENG', course: 'ELA3104' }, { subject: 'LANENG', course: 'ELA3105' }];
      return [];
    case 'MAT':
      if (g === 'K') return [{ subject: 'MAT', course: 'MATK' }];
      if (Number(g) <= 6) return [{ subject: 'MAT', course: 'MAT' + g }];
      if (Number(g) <= 9) return [{ subject: 'MAT', course: 'MATH' + g }];
      if (g === '10') return [{ subject: 'MAT', course: 'MAT1791' }, { subject: 'MAT', course: 'MAT1793' }];
      if (g === '11') return [{ subject: 'MAT', course: 'MAT2791' }, { subject: 'MAT', course: 'MAT2792' }, { subject: 'MAT', course: 'MAT2793' }];
      if (g === '12') return [{ subject: 'MAT', course: 'MAT3791' }, { subject: 'MAT', course: 'MAT3792' }, { subject: 'MAT', course: 'MAT3793' }, { subject: 'MAT', course: 'MAT3211' }];
      return [];
    case 'SCI':
      if (g === 'K') return [{ subject: 'SCI', course: 'SCIK' }];
      if (Number(g) <= 6) return [{ subject: 'SCI', course: 'SCI' + g }];
      if (Number(g) <= 9) return [{ subject: 'SCI', course: 'SCN' + g }];
      if (g === '10') return [{ subject: 'SCI', course: 'SCN1270' }, { subject: 'SCI', course: 'SCN1288' }];
      if (g === '11') return [{ subject: 'SCI', course: 'SCN2270' }, { subject: 'SCI', course: 'SCN2288' }];
      if (g === '12') return [{ subject: 'SCI', course: 'SCN3270' }];
      return [];
    case 'PHE':
      if (g === 'K') return [{ subject: 'PDE', course: 'PDEK' }];
      if (Number(g) <= 6) return [{ subject: 'PDE', course: 'PDE' + g }];
      if (Number(g) <= 9) return [{ subject: 'PDE', course: 'PED' + g }];
      if (g === '10') return [{ subject: 'PDE', course: 'PED1445' }];
      if (g === '11') return [{ subject: 'PDE', course: 'PED2445' }];
      if (g === '12') return [{ subject: 'PDE', course: 'PED3445' }];
      return [];
    case 'SOC':
      if (g === 'K') return [];
      if (Number(g) <= 6) return [{ subject: 'SSS', course: 'SSS' + g }];
      if (Number(g) <= 9) return [{ subject: 'SSN', course: 'SSN' + g }];
      if (g === '10') return [{ subject: 'SSN', course: 'SSN2185' }];
      if (g === '11') return [{ subject: 'SSN', course: 'SSN2186' }];
      if (g === '12') return [{ subject: 'SSN', course: 'SSN3185' }];
      return [];
    case 'FLA':
      if (g === 'K') return [{ subject: 'LANFRA', course: 'LANFRAK' }];
      if (Number(g) <= 12) return [{ subject: 'LANFRA', course: 'LANFRA' + g }];
      return [];
    default:
      return [];
  }
}

// Return up to `limit` outcome rows for a (challenge_3 subject_code, grade).
// Returns the richest leaf-level nodes first: KO (knowledge outcomes),
// LO (learning outcomes), then GQ / U / SP as fallback.
export async function outcomesForGrade(subjectCode, grade, limit = 25) {
  const mapped = courseCodesFor(subjectCode, grade);
  if (mapped.length === 0) return [];
  const subjects = [...new Set(mapped.map(m => m.subject))];
  const courses = [...new Set(mapped.map(m => m.course))];
  const r = await cq(`
    SELECT code, parent_code, subject_code, course_code, type_code, sort_order,
           COALESCE(content_en, content_en_html, '') AS content_en
      FROM phase1.curriculum_nodes
     WHERE subject_code = ANY($1::text[])
       AND course_code  = ANY($2::text[])
       AND COALESCE(content_en, content_en_html, '') <> ''
       AND type_code IN ('POS-OUTCOME','POS-TOPIC','POS-GO','LO','KO','U','SP','KUSP','GQ')
     ORDER BY
       CASE type_code
         WHEN 'POS-OUTCOME' THEN 1
         WHEN 'POS-GO'      THEN 2
         WHEN 'POS-TOPIC'   THEN 3
         WHEN 'LO'          THEN 4
         WHEN 'KO'          THEN 5
         WHEN 'U'           THEN 6
         WHEN 'GQ'          THEN 7
         ELSE 9 END,
       sort_order ASC, code ASC
     LIMIT $3
  `, [subjects, courses, limit]);
  return r.rows.map(stripHtml);
}

function stripHtml(row) {
  const t = (row.content_en || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { ...row, content_en: t };
}

// Search across the curriculum. Generic browser-facing search.
export async function searchOutcomes({ subject = null, course = null, grade = null, q = null, limit = 50, offset = 0 }) {
  const where = [`COALESCE(content_en, content_en_html, '') <> ''`];
  const params = [];
  if (subject) { params.push(subject); where.push(`subject_code = $${params.length}`); }
  if (course)  { params.push(course);  where.push(`course_code = $${params.length}`); }
  if (grade && !course) {
    // grade-only filtering: try to find a course code that contains the grade
    // letter/number. For Kindergarten match anything ending with K, otherwise digit.
    const gToken = grade === 'K' ? 'K' : grade;
    params.push(gToken);
    where.push(`course_code ~ ('(?:^|[A-Z])' || $${params.length} || '$')`);
  }
  if (q) {
    params.push('%' + q + '%');
    where.push(`(content_en ILIKE $${params.length} OR content_en_html ILIKE $${params.length})`);
  }
  params.push(limit, offset);
  const sql = `
    SELECT code, parent_code, subject_code, course_code, type_code, sort_order,
           COALESCE(content_en, content_en_html, '') AS content_en
      FROM phase1.curriculum_nodes
     WHERE ${where.join(' AND ')}
       AND type_code IN ('POS-OUTCOME','POS-TOPIC','POS-GO','LO','KO','U','SP','GQ')
     ORDER BY subject_code, course_code, sort_order, code
     LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const r = await cq(sql, params);
  return r.rows.map(stripHtml);
}

// List the curriculum-DB subjects with friendly names, for the public browser.
export async function listSubjects() {
  const r = await cq(`
    SELECT code, name_en, full_name_en, is_discipline, parent_code, subject_group
      FROM phase1.subjects
     WHERE COALESCE(is_discipline, false) = true
        OR parent_code IS NULL
     ORDER BY name_en
  `);
  return r.rows;
}

// Distinct course codes for a subject, with a friendly grade label inferred.
export async function listCoursesForSubject(subjectCode) {
  const r = await cq(`
    SELECT course_code, count(*)::int AS n_nodes
      FROM phase1.curriculum_nodes
     WHERE subject_code = $1
     GROUP BY course_code
     ORDER BY course_code
  `, [subjectCode]);
  return r.rows.map(row => ({
    course_code: row.course_code,
    n_nodes: row.n_nodes,
    grade_label: inferGradeLabel(row.course_code),
  }));
}

function inferGradeLabel(courseCode) {
  if (/K$/.test(courseCode)) return 'Kindergarten';
  const m = courseCode.match(/(\d{1,2})$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) return `Grade ${n}`;
  }
  return courseCode;
}
