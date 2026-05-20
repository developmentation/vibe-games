// Student roster + detail endpoints. Used by ui-2 (internal portal).
import express from 'express';
import { q } from '../../../lib/db.mjs';

export const router = express.Router();

function toInt(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

router.get('/', async (req, res) => {
  try {
    const grade = req.query.grade ? String(req.query.grade) : null;
    const complexity = req.query.complexity != null ? String(req.query.complexity) : null;
    const division = req.query.division ? String(req.query.division) : null;
    const search = req.query.q ? String(req.query.q) : null;
    const struggling = req.query.struggling != null ? String(req.query.struggling) : null;
    const limit = clamp(toInt(req.query.limit, 100), 1, 500);
    const offset = clamp(toInt(req.query.offset, 0), 0, 100000);

    const where = [];
    const params = [];
    if (grade) { params.push(grade); where.push(`s.current_grade = $${params.length}`); }
    if (complexity === 'true') where.push(`s.has_complexity = true`);
    if (complexity === 'false') where.push(`s.has_complexity = false`);
    if (division) { params.push('%' + division + '%'); where.push(`s.school_division ILIKE $${params.length}`); }
    if (search) {
      params.push('%' + search + '%');
      where.push(`(s.first_name ILIKE $${params.length} OR s.last_name ILIKE $${params.length} OR s.asin ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    params.push(limit, offset);
    const baseSql = `
      SELECT s.id, s.asin, s.first_name, s.last_name, s.current_grade,
             s.school_name, s.school_division, s.city, s.has_complexity,
             s.complexity_profile, s.language_of_instruction,
             (SELECT count(*)::int FROM challenge_3.grade_history gh
                WHERE gh.student_id = s.id AND gh.struggling = true) AS struggling_terms,
             (SELECT count(*)::int FROM challenge_3.grade_history gh
                WHERE gh.student_id = s.id AND gh.excelling = true) AS excelling_terms,
             (SELECT count(*)::int FROM challenge_3.learning_plans p
                WHERE p.student_id = s.id) AS plan_count,
             (SELECT max(generated_at) FROM challenge_3.learning_plans p
                WHERE p.student_id = s.id) AS last_plan_at
        FROM challenge_3.students s
        ${whereSql}
       ORDER BY
         CASE WHEN s.current_grade='K' THEN 0 ELSE s.current_grade::int END,
         s.last_name, s.first_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = await q(baseSql, params);

    // total count for paging
    const countParams = params.slice(0, params.length - 2);
    const totalRes = await q(`SELECT count(*)::int AS n FROM challenge_3.students s ${whereSql}`, countParams);

    let items = rows.rows.map(r => ({ ...r, id: Number(r.id) }));
    if (struggling === 'true') items = items.filter(r => r.struggling_terms > 0);

    res.json({ items, total: totalRes.rows[0].n, limit, offset });
  } catch (e) {
    res.status(500).json({ error: 'students_list_failed', detail: String(e?.message || e) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: 'bad id' });
    const s = await q(`SELECT id, asin, first_name, last_name, date_of_birth, current_grade,
        school_name, school_division, city, province, language_of_instruction,
        has_complexity, complexity_profile, guardian_name, guardian_email,
        guardian_phone, enrolled_at, created_at
      FROM challenge_3.students WHERE id = $1`, [id]);
    const student = s.rows[0];
    if (!student) return res.status(404).json({ error: 'not_found' });
    student.id = Number(student.id);

    const gh = await q(`SELECT subject_code, school_year, grade_level, term,
        mark_percent, letter_grade, performance, struggling, excelling, teacher_comment
        FROM challenge_3.grade_history WHERE student_id = $1
        ORDER BY school_year DESC, term DESC, subject_code`, [id]);

    // group grade_history by subject and compute the last-two-term average per subject
    const subjectStats = {};
    for (const row of gh.rows) {
      const k = row.subject_code;
      if (!subjectStats[k]) subjectStats[k] = { subject_code: k, terms: [], last_two_avg: null, status: 'on_grade' };
      subjectStats[k].terms.push(row);
    }
    for (const k of Object.keys(subjectStats)) {
      const ts = subjectStats[k].terms;
      const recent = ts.slice(0, 2).map(t => Number(t.mark_percent)).filter(x => Number.isFinite(x));
      const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
      subjectStats[k].last_two_avg = avg != null ? Math.round(avg * 10) / 10 : null;
      if (avg == null) subjectStats[k].status = 'unknown';
      else if (avg < 60) subjectStats[k].status = 'struggling';
      else if (avg < 70) subjectStats[k].status = 'approaching';
      else if (avg < 88) subjectStats[k].status = 'at_grade';
      else subjectStats[k].status = 'excelling';
    }

    const notes = await q(`SELECT id, note_type, body_markdown, author_role, created_at
      FROM challenge_3.iep_notes WHERE student_id = $1 ORDER BY created_at DESC, note_type`, [id]);

    const plans = await q(`SELECT id, audience, horizon_weeks, status, model,
        summary_markdown, generated_at FROM challenge_3.learning_plans
        WHERE student_id = $1 ORDER BY generated_at DESC LIMIT 25`, [id]);

    res.json({
      student,
      grade_history: gh.rows,
      subject_stats: Object.values(subjectStats),
      iep_notes: notes.rows.map(n => ({ ...n, id: Number(n.id) })),
      plans: plans.rows.map(p => ({ ...p, id: Number(p.id) })),
    });
  } catch (e) {
    res.status(500).json({ error: 'student_detail_failed', detail: String(e?.message || e) });
  }
});
