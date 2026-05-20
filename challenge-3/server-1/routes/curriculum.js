// Public, read-only curriculum browsing endpoints. Powers UI-1 (parent-facing
// curriculum browser) and is the candidate-outcome source for the plan agent.
import express from 'express';
import { listSubjects, listCoursesForSubject, searchOutcomes, curriculumPing, outcomesForGrade } from '../db/curriculum.js';

export const router = express.Router();

router.get('/ping', async (_req, res) => {
  const ok = await curriculumPing();
  res.json({ ok, db: ok ? 'curriculum' : 'unreachable' });
});

router.get('/subjects', async (_req, res) => {
  try {
    const rows = await listSubjects();
    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: 'curriculum_subjects_failed', detail: String(e?.message || e) });
  }
});

router.get('/courses', async (req, res) => {
  try {
    const subject = String(req.query.subject || '').trim();
    if (!subject) return res.status(400).json({ error: 'subject query param required' });
    const rows = await listCoursesForSubject(subject);
    res.json({ subject, items: rows });
  } catch (e) {
    res.status(500).json({ error: 'curriculum_courses_failed', detail: String(e?.message || e) });
  }
});

router.get('/outcomes', async (req, res) => {
  try {
    const subject = req.query.subject ? String(req.query.subject) : null;
    const course = req.query.course ? String(req.query.course) : null;
    const grade = req.query.grade ? String(req.query.grade) : null;
    const q = req.query.q ? String(req.query.q) : null;
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const rows = await searchOutcomes({ subject, course, grade, q, limit, offset });
    res.json({ items: rows, limit, offset, filters: { subject, course, grade, q } });
  } catch (e) {
    res.status(500).json({ error: 'curriculum_outcomes_failed', detail: String(e?.message || e) });
  }
});

// Server-side helper used by ui-2 to preview the candidate outcomes a plan
// would draw from before triggering generation.
router.get('/candidates', async (req, res) => {
  try {
    const subject = String(req.query.subject || '').trim();
    const grade = String(req.query.grade || '').trim();
    if (!subject || !grade) return res.status(400).json({ error: 'subject and grade required' });
    const rows = await outcomesForGrade(subject, grade, Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20)));
    res.json({ subject, grade, items: rows });
  } catch (e) {
    res.status(500).json({ error: 'curriculum_candidates_failed', detail: String(e?.message || e) });
  }
});
