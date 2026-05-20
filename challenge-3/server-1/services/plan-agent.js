// Plan agent. Two-step pipeline:
//  1. Read the student's last-two-term averages per subject and derive a
//     direction + target grade. Pull candidate curriculum outcomes from the
//     read-only curriculum DB at that target grade.
//  2. Hand the candidate outcomes to Vertex Claude Sonnet. The LLM picks
//     3-6 outcomes per subject and proposes activities. The candidate pool
//     is the only source it may cite, so it can't invent outcome codes.
//
// Audience tunes language: teacher = clinical, parent = warm, student = direct.
import { q } from '../../../lib/db.mjs';
import { outcomesForGrade } from '../db/curriculum.js';
import { claudeRawPredict, extractToolUse } from '../../../lib/vertex.mjs';

const GRADES = ['K','1','2','3','4','5','6','7','8','9','10','11','12'];

function gradeIdx(g) { return GRADES.indexOf(String(g)); }
function gradeAt(i)  { return GRADES[Math.max(0, Math.min(GRADES.length - 1, i))]; }

function lastTwoTermAverage(history, subjectCode) {
  const rows = history
    .filter(h => h.subject_code === subjectCode)
    .sort((a, b) => {
      if (a.school_year !== b.school_year) return a.school_year < b.school_year ? 1 : -1;
      return Number(b.term) - Number(a.term);
    })
    .slice(0, 2)
    .map(h => Number(h.mark_percent))
    .filter(x => Number.isFinite(x));
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => a + b, 0) / rows.length;
}

function directionFor(avg) {
  if (avg == null) return { direction: 'on_grade', offset: 0 };
  if (avg < 60) return { direction: 'remediate', offset: avg < 50 ? -2 : -1 };
  if (avg >= 88) return { direction: 'accelerate', offset: +1 };
  return { direction: 'on_grade', offset: 0 };
}

// Derive signals + load candidate outcomes per subject. Pure read-only side
// effects (db.q for grade_history; cq for curriculum candidates).
export async function deriveSignals({ student, subjects }) {
  const gh = await q(`SELECT subject_code, school_year, term, mark_percent
    FROM challenge_3.grade_history WHERE student_id = $1
    ORDER BY school_year DESC, term DESC`, [student.id]);

  const out = [];
  for (const code of subjects) {
    const avg = lastTwoTermAverage(gh.rows, code);
    const { direction, offset } = directionFor(avg);
    const currentIdx = gradeIdx(student.current_grade);
    const targetGrade = gradeAt(currentIdx + offset);
    let candidates = [];
    try {
      candidates = await outcomesForGrade(code, targetGrade, 25);
    } catch (e) {
      candidates = [];
    }
    out.push({
      subject_code: code,
      current_grade: student.current_grade,
      target_grade: targetGrade,
      current_avg_percent: avg != null ? Math.round(avg * 10) / 10 : null,
      direction,
      candidates: candidates.map(c => ({ code: c.code, title: shorten(c.content_en, 280), type_code: c.type_code })),
    });
  }
  return out;
}

function shorten(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + '…';
}

function audienceGuidance(audience) {
  switch (audience) {
    case 'parent':
      return 'Address a parent in plain warm Canadian English. Use the second person. Avoid clinical jargon. Suggest things they can do at home in the rationale. Never imply a diagnosis.';
    case 'student':
      return 'Address the student directly in friendly, encouraging language. Use short sentences. Avoid sarcasm.';
    case 'teacher':
    default:
      return 'Address a classroom teacher. Use precise but unjargoned language. Mention what to listen for in formative checks.';
  }
}

const PLAN_TOOL = {
  name: 'record_plan',
  description: 'Persist the personalised learning plan. The outcomes you cite MUST be selected from the candidate set provided to you for each subject. Do not invent outcome codes.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary_markdown', 'sections'],
    properties: {
      summary_markdown: { type: 'string', description: '4-8 sentences. Audience-tuned. No headings, no emoji.' },
      sections: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['subject_code', 'direction', 'target_grade', 'rationale_markdown', 'outcomes', 'activities'],
          properties: {
            subject_code: { type: 'string' },
            direction: { type: 'string', enum: ['remediate', 'on_grade', 'accelerate'] },
            target_grade: { type: 'string' },
            rationale_markdown: { type: 'string' },
            outcomes: {
              type: 'array', minItems: 1,
              items: {
                type: 'object', additionalProperties: false,
                required: ['code', 'title', 'why'],
                properties: {
                  code: { type: 'string' },
                  title: { type: 'string' },
                  why: { type: 'string' }
                }
              }
            },
            activities: {
              type: 'array', minItems: 1,
              items: {
                type: 'object', additionalProperties: false,
                required: ['title', 'modality', 'minutes'],
                properties: {
                  title: { type: 'string' },
                  modality: { type: 'string', enum: ['read','watch','practice','project','discuss','quiz'] },
                  minutes: { type: 'integer' },
                  materials: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      }
    }
  }
};

export async function generatePlan({ student, audience = 'teacher', subjects, horizon_weeks = 4 }) {
  const signals = await deriveSignals({ student, subjects });

  const system = [
    'You are an Alberta K-12 personalised-learning planner.',
    audienceGuidance(audience),
    'You may only cite outcomes that appear in the candidate set for the corresponding subject in the user message. Do not invent or paraphrase outcome codes.',
    'Plain declarative prose. No emoji. No headings inside rationale fields. Canadian English spelling.',
    'Do not use any of the following: vibrant, robust, leverage, journey, dive, unleash, dynamic, comprehensive, ensure, simply, just.',
    'Pick 3-5 outcomes per subject. Propose 2-3 activities per subject. Activities should be ' + horizon_weeks + '-week appropriate.',
    'Reflect the student\'s complexity flags (if any) in the rationale where natural.',
    'Use the record_plan tool to return the plan. Do not reply in free text.',
  ].join(' ');

  const complexityLine = student.has_complexity
    ? `Complexity flags: ${(student.complexity_profile?.flags || []).join(', ') || 'none'}. Supports in place: ${(student.complexity_profile?.supports || []).join(', ') || 'none'}.`
    : 'No complexity flags on file.';

  const subjectBlocks = signals.map(sig => {
    const cand = sig.candidates.length
      ? sig.candidates.map(c => `  ${c.code} (${c.type_code}) — ${c.title}`).join('\n')
      : '  (no curriculum candidates available for this grade — pick activities only)';
    return `Subject ${sig.subject_code}\n` +
      `Current grade: ${sig.current_grade}; Target grade: ${sig.target_grade}; Direction: ${sig.direction}; Last-2-term avg: ${sig.current_avg_percent ?? 'n/a'}%\n` +
      `Candidate outcomes (cite codes verbatim from this list):\n${cand}`;
  }).join('\n\n');

  const user = [
    `Student: ${student.first_name} ${student.last_name}, Grade ${student.current_grade}.`,
    `Audience: ${audience}.`,
    `Horizon: ${horizon_weeks} weeks.`,
    complexityLine,
    '',
    subjectBlocks,
    '',
    'Generate the plan now using record_plan.',
  ].join('\n');

  const resp = await claudeRawPredict({
    model: process.env.VERTEX_CLAUDE_SONNET_MODEL || 'claude-sonnet-4-6',
    system,
    messages: [{ role: 'user', content: user }],
    tools: [PLAN_TOOL],
    toolChoice: { type: 'tool', name: 'record_plan' },
    maxTokens: 4096,
    temperature: 0.5,
  });

  const planJson = extractToolUse(resp, 'record_plan');
  return { signals, plan: planJson, model: resp.model || process.env.VERTEX_CLAUDE_SONNET_MODEL };
}
