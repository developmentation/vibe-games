// Conversational endpoint. Audience-aware. Wraps Vertex Claude Sonnet over a
// student record + latest plan summary.
import express from 'express';
import { q } from '../../../lib/db.mjs';
import { claudeRawPredict } from '../../../lib/vertex.mjs';

export const router = express.Router();

function audienceGuidance(audience) {
  switch (audience) {
    case 'parent':
      return 'You are speaking with a parent. Use plain warm Canadian English. The second person. No clinical jargon. Suggest concrete things they can do at home. Never imply a diagnosis.';
    case 'student':
      return 'You are speaking directly to the student. Friendly, encouraging, short sentences. No sarcasm. Speak as a calm mentor.';
    case 'teacher':
    default:
      return 'You are speaking with a classroom teacher. Precise, unjargoned, professional. Mention what to listen for in formative checks.';
  }
}

const STYLE = [
  'Plain declarative prose. No emoji. No bullet lists unless the user asks. Canadian English spelling.',
  'Do not use any of the following words: vibrant, robust, leverage, journey, dive, unleash, dynamic, comprehensive, ensure, simply, just.',
  'Do not start with "Imagine" or "Picture this".',
  'Keep replies under 200 words unless the user explicitly asks for more.',
].join(' ');

router.post('/chat', async (req, res) => {
  try {
    const { student_id, plan_id = null, message, audience = 'teacher' } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });

    let context = '';
    let studentId = null;
    if (student_id) {
      studentId = Number(student_id);
      const sres = await q(`SELECT id, first_name, last_name, current_grade, has_complexity, complexity_profile
        FROM challenge_3.students WHERE id = $1`, [studentId]);
      const s = sres.rows[0];
      if (s) {
        const flags = (s.complexity_profile?.flags || []).join(', ') || 'none';
        const supports = (s.complexity_profile?.supports || []).join(', ') || 'none';
        const sigs = await q(`SELECT subject_code, mark_percent, school_year, term
          FROM challenge_3.grade_history WHERE student_id = $1
          ORDER BY school_year DESC, term DESC LIMIT 18`, [studentId]);
        const recent = sigs.rows.map(r => `${r.subject_code} ${r.school_year} T${r.term}: ${r.mark_percent}%`).join('; ');
        context += `Student record: ${s.first_name} ${s.last_name}, Grade ${s.current_grade}. Complexity flags: ${flags}. Supports: ${supports}. Recent marks: ${recent}.\n`;
      }
    }
    if (plan_id) {
      const pres = await q(`SELECT summary_markdown, audience FROM challenge_3.learning_plans WHERE id = $1`, [Number(plan_id)]);
      const p = pres.rows[0];
      if (p) context += `Latest plan summary (audience=${p.audience}): ${p.summary_markdown}\n`;
    }

    const system = [
      audienceGuidance(audience),
      STYLE,
      context ? 'Use this background to answer the user. Do not repeat it back verbatim.' : 'No student context was attached. Answer generally.',
    ].join(' ');

    const userMsg = context + `User question: ${message}`;

    const resp = await claudeRawPredict({
      model: process.env.VERTEX_CLAUDE_SONNET_MODEL || 'claude-sonnet-4-6',
      system,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 600,
      temperature: 0.4,
    });

    const text = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const model = resp.model || process.env.VERTEX_CLAUDE_SONNET_MODEL;

    if (studentId) {
      await q(`INSERT INTO challenge_3.ai_chats (student_id, plan_id, audience, user_message, assistant_message, model)
        VALUES ($1,$2,$3,$4,$5,$6)`,
        [studentId, plan_id ? Number(plan_id) : null, audience, message, text, model]);
    }

    res.json({ reply: text, audience, model });
  } catch (e) {
    console.error('[ai.chat] failed:', e?.stack || e?.message || e);
    res.status(500).json({ error: 'chat_failed', detail: String(e?.message || e) });
  }
});
