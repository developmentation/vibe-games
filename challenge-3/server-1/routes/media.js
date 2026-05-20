// Media generation routes.
//
// Exposes:
//   POST /api/media/images       generate + persist a classroom image
//   POST /api/media/audio        generate + persist a narrated prose mp3
//   GET  /api/media              list assets with simple filters
//   GET  /api/media/:id          single asset metadata (no binary)
//   GET  /api/media/:id/bytes    stream the binary content (image/png or audio/mpeg)
//
// Persists into challenge_3.media_assets. The generation scripts share the
// same table, so the catalogue built offline shows up here for free.

import express from 'express';
import { q } from '../../../lib/db.mjs';
import { generateImage, jsonCompletion } from '../../../lib/openai.mjs';

export const router = express.Router();

// --- Helpers -----------------------------------------------------------------

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

async function fetchAssetRow(id) {
  const res = await q(
    `SELECT id, kind, subject_code, grade_level, audience, title, prompt,
            prose_markdown, outcome_node_ids, model, voice_id, mime_type,
            width, height, duration_seconds, byte_size, student_id, plan_id,
            metadata, generated_at
       FROM challenge_3.media_assets
      WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

// --- Image generation --------------------------------------------------------

const HOUSE_STYLE = [
  'editorial classroom illustration style',
  'flat vector with subtle gradients',
  'warm prairie palette of golden wheat, deep navy, soft cream, brick accent',
  'inclusive diverse Alberta students',
  'clear focal point and generous negative space',
  'no text, no signage, no logos, no watermarks, no school crests',
  'safe-for-school content',
].join(', ');

function buildImagePrompt({ subjectName, gradeLabel, scene, extras }) {
  return [
    subjectName && gradeLabel ? `Alberta K-12 classroom illustration for ${subjectName}, ${gradeLabel}.` : null,
    scene ? `Scene: ${scene}.` : null,
    extras ? `${extras}.` : null,
    `Style: ${HOUSE_STYLE}.`,
  ].filter(Boolean).join(' ');
}

router.post('/images', async (req, res) => {
  try {
    const {
      subject_code = null,
      grade_level = null,
      audience = 'teacher',
      title,
      prompt,
      scene,
      extras,
      size = '1024x1024',
      quality = 'medium',
      student_id = null,
      plan_id = null,
      outcome_node_ids = [],
      metadata = {},
    } = req.body || {};

    let subjectName = null;
    if (subject_code) {
      const r = await q('SELECT name_en FROM challenge_3.subjects WHERE code = $1', [subject_code]);
      subjectName = r.rows[0]?.name_en || subject_code;
    }
    const gradeLabel = grade_level === 'K' ? 'Kindergarten' : (grade_level ? `Grade ${grade_level}` : null);

    const finalPrompt = prompt || buildImagePrompt({ subjectName, gradeLabel, scene, extras });
    if (!finalPrompt) {
      return res.status(400).json({ error: 'prompt or scene required' });
    }
    const finalTitle = title || `${subjectName || 'Classroom'} ${gradeLabel || ''}`.trim() || finalPrompt.slice(0, 80);

    const bytes = await generateImage({ prompt: finalPrompt, size, quality });
    const [w, h] = String(size).split('x').map((n) => parseInt(n, 10));

    const insert = await q(
      `INSERT INTO challenge_3.media_assets
         (kind, subject_code, grade_level, audience, title, prompt, model,
          mime_type, width, height, byte_size, content, student_id, plan_id,
          outcome_node_ids, metadata)
       VALUES ('image',$1,$2,$3,$4,$5,$6,'image/png',$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)
       RETURNING id, generated_at`,
      [
        subject_code,
        grade_level,
        audience,
        finalTitle,
        finalPrompt,
        process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        Number.isFinite(w) ? w : null,
        Number.isFinite(h) ? h : null,
        bytes.length,
        bytes,
        student_id,
        plan_id,
        JSON.stringify(outcome_node_ids),
        JSON.stringify(metadata),
      ]
    );
    const row = insert.rows[0];
    res.json({
      id: Number(row.id),
      kind: 'image',
      subject_code,
      grade_level,
      audience,
      title: finalTitle,
      prompt: finalPrompt,
      mime_type: 'image/png',
      width: Number.isFinite(w) ? w : null,
      height: Number.isFinite(h) ? h : null,
      byte_size: bytes.length,
      generated_at: row.generated_at,
      bytes_url: `/api/media/${row.id}/bytes`,
    });
  } catch (e) {
    console.error('[media.images] failed:', e?.stack || e?.message || e);
    res.status(500).json({ error: 'image_generation_failed', detail: String(e?.message || e) });
  }
});

// --- Audio generation --------------------------------------------------------

const STORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'story'],
  properties: {
    title: { type: 'string' },
    story: { type: 'string' },
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
    'Canadian English spelling.',
  ].join(' ');
}

async function writeStory({ subjectName, gradeLabel, audience, topic, outcomeText, words }) {
  const system = [
    'You are an experienced Alberta K-12 educator writing a brief narrated lesson story.',
    audienceVoice(audience),
    styleRules(),
    `Target length: about ${words} words.`,
    'Return JSON with fields: title, story.',
  ].join(' ');
  const user = [
    subjectName ? `Subject: ${subjectName}.` : null,
    gradeLabel ? `Grade: ${gradeLabel}.` : null,
    `Audience: ${audience}.`,
    `Topic: ${topic}.`,
    outcomeText ? `Curriculum outcome focus: ${outcomeText}.` : null,
    'Write the story now.',
  ].filter(Boolean).join(' ');
  return jsonCompletion({
    system,
    user,
    schema: STORY_SCHEMA,
    schemaName: 'narrated_story',
    maxTokens: 1200,
    temperature: 0.6,
  });
}

async function synthesizeTTS({ text, voiceId, model, stability, similarity }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  if (!voiceId) throw new Error('voice id missing');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability, similarity_boost: similarity },
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

router.post('/audio', async (req, res) => {
  try {
    const {
      subject_code = null,
      grade_level = null,
      audience = 'student',
      title = null,
      text = null,
      topic = null,
      outcome_text = null,
      story_words = 180,
      voice_id = process.env.ELEVENLABS_VOICE_ID,
      stability = 0.5,
      similarity = 0.75,
      model = 'eleven_flash_v2_5',
      student_id = null,
      plan_id = null,
      outcome_node_ids = [],
      metadata = {},
    } = req.body || {};

    if (!text && !topic) {
      return res.status(400).json({ error: 'either text or topic required' });
    }

    let subjectName = null;
    if (subject_code) {
      const r = await q('SELECT name_en FROM challenge_3.subjects WHERE code = $1', [subject_code]);
      subjectName = r.rows[0]?.name_en || subject_code;
    }
    const gradeLabel = grade_level === 'K' ? 'Kindergarten' : (grade_level ? `Grade ${grade_level}` : null);

    let finalTitle = title;
    let prose = text;
    let prompt = '[verbatim text]';
    if (!prose) {
      const written = await writeStory({
        subjectName: subjectName || 'General',
        gradeLabel: gradeLabel || 'Mixed grade',
        audience,
        topic,
        outcomeText: outcome_text,
        words: clamp(toInt(story_words, 180), 60, 600),
      });
      finalTitle = finalTitle || written.title;
      prose = written.story;
      prompt = `Subject: ${subjectName || 'General'}. Grade: ${gradeLabel || 'Mixed'}. Audience: ${audience}. Topic: ${topic}.`;
    }
    finalTitle = finalTitle || (prose.slice(0, 80));

    const bytes = await synthesizeTTS({
      text: prose,
      voiceId: voice_id,
      model,
      stability: Number(stability),
      similarity: Number(similarity),
    });
    const durationSeconds = estimateDurationSeconds(prose);

    const insert = await q(
      `INSERT INTO challenge_3.media_assets
         (kind, subject_code, grade_level, audience, title, prompt, prose_markdown,
          model, voice_id, mime_type, duration_seconds, byte_size, content,
          student_id, plan_id, outcome_node_ids, metadata)
       VALUES ('audio',$1,$2,$3,$4,$5,$6,$7,$8,'audio/mpeg',$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb)
       RETURNING id, generated_at`,
      [
        subject_code, grade_level, audience, finalTitle, prompt, prose,
        model, voice_id, durationSeconds, bytes.length, bytes,
        student_id, plan_id,
        JSON.stringify(outcome_node_ids),
        JSON.stringify(metadata),
      ]
    );
    const row = insert.rows[0];
    res.json({
      id: Number(row.id),
      kind: 'audio',
      subject_code,
      grade_level,
      audience,
      title: finalTitle,
      mime_type: 'audio/mpeg',
      voice_id,
      duration_seconds: durationSeconds,
      byte_size: bytes.length,
      prose_markdown: prose,
      generated_at: row.generated_at,
      bytes_url: `/api/media/${row.id}/bytes`,
    });
  } catch (e) {
    console.error('[media.audio] failed:', e?.stack || e?.message || e);
    res.status(500).json({ error: 'audio_generation_failed', detail: String(e?.message || e) });
  }
});

// --- List + fetch ------------------------------------------------------------

router.get('/', async (req, res) => {
  try {
    const kind = req.query.kind || null;
    const subject = req.query.subject || null;
    const grade = req.query.grade || null;
    const studentId = req.query.student_id ? toInt(req.query.student_id, null) : null;
    const planId = req.query.plan_id ? toInt(req.query.plan_id, null) : null;
    const limit = clamp(toInt(req.query.limit, 50), 1, 200);
    const offset = clamp(toInt(req.query.offset, 0), 0, 100000);

    const where = [];
    const params = [];
    if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
    if (subject) { params.push(subject); where.push(`subject_code = $${params.length}`); }
    if (grade) { params.push(grade); where.push(`grade_level = $${params.length}`); }
    if (studentId) { params.push(studentId); where.push(`student_id = $${params.length}`); }
    if (planId) { params.push(planId); where.push(`plan_id = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);
    const rows = await q(
      `SELECT id, kind, subject_code, grade_level, audience, title, mime_type,
              width, height, duration_seconds, byte_size, voice_id, model,
              student_id, plan_id, generated_at
         FROM challenge_3.media_assets
         ${whereSql}
        ORDER BY generated_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      items: rows.rows.map((r) => ({
        ...r,
        id: Number(r.id),
        bytes_url: `/api/media/${r.id}/bytes`,
      })),
      limit,
      offset,
    });
  } catch (e) {
    res.status(500).json({ error: 'media_list_failed', detail: String(e?.message || e) });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = toInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: 'bad id' });
    const row = await fetchAssetRow(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    delete row.content;
    res.json({ ...row, id: Number(row.id), bytes_url: `/api/media/${row.id}/bytes` });
  } catch (e) {
    res.status(500).json({ error: 'media_get_failed', detail: String(e?.message || e) });
  }
});

router.get('/:id/bytes', async (req, res) => {
  try {
    const id = toInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: 'bad id' });
    const r = await q(
      'SELECT mime_type, content FROM challenge_3.media_assets WHERE id = $1',
      [id]
    );
    const row = r.rows[0];
    if (!row || !row.content) return res.status(404).json({ error: 'not_found' });
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(row.content);
  } catch (e) {
    res.status(500).json({ error: 'media_bytes_failed', detail: String(e?.message || e) });
  }
});

export default router;
