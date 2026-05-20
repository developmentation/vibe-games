// Learning plan endpoints. Generation, listing, retrieval.
import express from 'express';
import { q } from '../../../lib/db.mjs';
import { generatePlan } from '../services/plan-agent.js';

export const router = express.Router();

function toInt(v, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; }

router.post('/:student_id', async (req, res) => {
  try {
    const studentId = toInt(req.params.student_id, null);
    if (!studentId) return res.status(400).json({ error: 'bad student_id' });
    const {
      audience = 'teacher',
      subjects = null,
      horizon_weeks = 4,
    } = req.body || {};
    if (!['teacher','parent','student'].includes(audience)) return res.status(400).json({ error: 'bad audience' });

    const sres = await q(`SELECT id, asin, first_name, last_name, current_grade,
        school_name, school_division, has_complexity, complexity_profile,
        language_of_instruction
      FROM challenge_3.students WHERE id = $1`, [studentId]);
    const student = sres.rows[0];
    if (!student) return res.status(404).json({ error: 'student_not_found' });
    student.id = Number(student.id);

    // default subjects = those the student has any history for
    let subjectList = Array.isArray(subjects) && subjects.length ? subjects : null;
    if (!subjectList) {
      const distinct = await q(`SELECT DISTINCT subject_code FROM challenge_3.grade_history WHERE student_id = $1 ORDER BY subject_code`, [studentId]);
      subjectList = distinct.rows.map(r => r.subject_code);
    }
    if (!subjectList.length) return res.status(400).json({ error: 'no_subjects_to_plan' });

    const t0 = Date.now();
    const { signals, plan, model } = await generatePlan({
      student, audience, subjects: subjectList, horizon_weeks: Math.max(1, Math.min(12, Number(horizon_weeks) || 4)),
    });
    const elapsed_ms = Date.now() - t0;

    // Persist plan
    const insertedPlan = await q(`INSERT INTO challenge_3.learning_plans
      (student_id, audience, horizon_weeks, status, model, summary_markdown, signals_json, full_plan_json)
      VALUES ($1,$2,$3,'draft',$4,$5,$6::jsonb,$7::jsonb)
      RETURNING id, generated_at`,
      [
        studentId, audience, horizon_weeks, model || null,
        plan.summary_markdown || '',
        JSON.stringify(signals),
        JSON.stringify(plan),
      ]);
    const planId = Number(insertedPlan.rows[0].id);

    // Persist sections
    const sections = Array.isArray(plan.sections) ? plan.sections : [];
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const signal = signals.find(s => s.subject_code === sec.subject_code) || {};
      await q(`INSERT INTO challenge_3.plan_sections
        (plan_id, subject_code, current_grade, target_grade, direction,
         current_avg_percent, rationale_markdown, outcomes_json, activities_json, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)`,
        [
          planId, sec.subject_code,
          signal.current_grade || student.current_grade,
          sec.target_grade || signal.target_grade || student.current_grade,
          sec.direction || signal.direction || 'on_grade',
          signal.current_avg_percent ?? null,
          sec.rationale_markdown || '',
          JSON.stringify(sec.outcomes || []),
          JSON.stringify(sec.activities || []),
          i,
        ]);
    }

    res.json({
      plan_id: planId,
      generated_at: insertedPlan.rows[0].generated_at,
      audience,
      horizon_weeks,
      summary_markdown: plan.summary_markdown,
      sections: sections,
      signals,
      model,
      elapsed_ms,
    });
  } catch (e) {
    console.error('[plans.generate] failed:', e?.stack || e?.message || e);
    res.status(500).json({ error: 'plan_generation_failed', detail: String(e?.message || e) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: 'bad id' });
    const p = await q(`SELECT * FROM challenge_3.learning_plans WHERE id = $1`, [id]);
    const plan = p.rows[0];
    if (!plan) return res.status(404).json({ error: 'not_found' });
    plan.id = Number(plan.id);
    plan.student_id = Number(plan.student_id);
    const sections = await q(`SELECT * FROM challenge_3.plan_sections WHERE plan_id = $1 ORDER BY sort_order`, [id]);
    const media = await q(`SELECT id, kind, audience, subject_code, title, mime_type, byte_size,
        duration_seconds, width, height, generated_at FROM challenge_3.media_assets
        WHERE plan_id = $1 ORDER BY generated_at DESC`, [id]);
    res.json({
      plan,
      sections: sections.rows.map(s => ({ ...s, id: Number(s.id), plan_id: Number(s.plan_id) })),
      media: media.rows.map(m => ({ ...m, id: Number(m.id), bytes_url: `/api/media/${m.id}/bytes` })),
    });
  } catch (e) {
    res.status(500).json({ error: 'plan_get_failed', detail: String(e?.message || e) });
  }
});

router.get('/', async (req, res) => {
  try {
    const studentId = req.query.student_id ? toInt(req.query.student_id, null) : null;
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const where = [];
    const params = [];
    if (studentId) { params.push(studentId); where.push(`p.student_id = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);
    const rows = await q(`SELECT p.id, p.student_id, p.audience, p.horizon_weeks, p.status,
        p.model, p.summary_markdown, p.generated_at,
        s.first_name, s.last_name, s.current_grade
        FROM challenge_3.learning_plans p
        JOIN challenge_3.students s ON s.id = p.student_id
        ${whereSql}
        ORDER BY p.generated_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ items: rows.rows.map(r => ({ ...r, id: Number(r.id), student_id: Number(r.student_id) })), limit, offset });
  } catch (e) {
    res.status(500).json({ error: 'plans_list_failed', detail: String(e?.message || e) });
  }
});
