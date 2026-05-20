// Generate every asset the Watch presentation needs.
//
// Reads challenge-3/ui-2/commercial.script.json. For each scene, in parallel:
//   1) OpenAI image generation (gpt-image-1) using the scene image_prompt_hint
//      wrapped in the same house style as scripts/generate-images.mjs.
//   2) ElevenLabs TTS (eleven_flash_v2_5) on the scene narration.
// Persists both into challenge_3.media_assets with:
//   metadata.run_label = "commercial-v1"
//   metadata.scene_order = <N>
// Also writes a flat manifest at challenge-3/ui-2/commercial.json with the
// resolved IDs and bytes URLs, so the Watch page can ship without a DB join.
//
// Usage:
//   node challenge-3/scripts/generate-commercial.mjs
//   node challenge-3/scripts/generate-commercial.mjs --concurrency 4 --dry-run
//   node challenge-3/scripts/generate-commercial.mjs --only-audio
//   node challenge-3/scripts/generate-commercial.mjs --only-image
//   node challenge-3/scripts/generate-commercial.mjs --voice-id <override>
//
// Idempotent: re-running creates new rows (each with the same run_label) so you
// can iterate without manually clearing. The manifest always points at the
// most recent successful render per scene.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, close } from '../../lib/db.mjs';
import { generateImage } from '../../lib/openai.mjs';
import { argv, argInt, argFlag, pmap, retry } from '../../lib/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const challengeRoot = path.resolve(here, '..');
const SCRIPT_PATH = path.join(challengeRoot, 'ui-2', 'commercial.script.json');
const MANIFEST_PATH = path.join(challengeRoot, 'ui-2', 'commercial.json');
const IMG_OUT = path.join(challengeRoot, 'media', 'images');
const AUD_OUT = path.join(challengeRoot, 'media', 'audio');

const CONCURRENCY = argInt('concurrency', 3);
const DRY_RUN = argFlag('dry-run');
const ONLY_AUDIO = argFlag('only-audio');
const ONLY_IMAGE = argFlag('only-image');
const VOICE_ID = argv('voice-id', process.env.ELEVENLABS_VOICE_ID);
const TTS_MODEL = argv('model', 'eleven_flash_v2_5');
const STABILITY = Number(argv('stability', '0.45'));
const SIMILARITY = Number(argv('similarity', '0.80'));

const HOUSE_STYLE = [
  'editorial classroom illustration style',
  'flat vector with subtle gradients',
  'warm prairie palette of golden wheat, deep navy, soft cream, brick accent',
  'inclusive diverse Alberta students',
  'clear focal point and generous negative space',
  'no text, no signage, no logos, no watermarks, no school crests',
  'safe-for-school content',
].join(', ');

function buildImagePrompt(hint) {
  return `Alberta Learning commercial illustration. Scene: ${hint}. Style: ${HOUSE_STYLE}.`;
}

function slug(...parts) {
  return parts.filter(Boolean).join('-').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

async function synthesizeTTS({ text, voiceId, model }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  if (!voiceId) throw new Error('voice id missing');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: STABILITY, similarity_boost: SIMILARITY },
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

async function persistImage({ scene, prompt, bytes, sizeWH, runLabel }) {
  const [w, h] = sizeWH.split('x').map((n) => parseInt(n, 10));
  const res = await q(
    `INSERT INTO challenge_3.media_assets
       (kind, subject_code, grade_level, audience, title, prompt, model,
        mime_type, width, height, byte_size, content, outcome_node_ids, metadata)
     VALUES ('image',NULL,NULL,'commercial',$1,$2,$3,'image/png',$4,$5,$6,$7,'[]'::jsonb,$8::jsonb)
     RETURNING id`,
    [
      scene.title,
      prompt,
      process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      Number.isFinite(w) ? w : null,
      Number.isFinite(h) ? h : null,
      bytes.length, bytes,
      JSON.stringify({ run_label: runLabel, scene_order: scene.scene_order, scene_id: scene.id }),
    ]
  );
  return res.rows[0].id;
}

async function persistAudio({ scene, narration, bytes, durationSeconds, runLabel }) {
  const res = await q(
    `INSERT INTO challenge_3.media_assets
       (kind, subject_code, grade_level, audience, title, prompt, prose_markdown,
        model, voice_id, mime_type, duration_seconds, byte_size, content,
        outcome_node_ids, metadata)
     VALUES ('audio',NULL,NULL,'commercial',$1,$2,$3,$4,$5,'audio/mpeg',$6,$7,$8,'[]'::jsonb,$9::jsonb)
     RETURNING id`,
    [
      scene.title,
      `Commercial narration scene ${scene.scene_order} (${scene.id})`,
      narration,
      TTS_MODEL, VOICE_ID,
      durationSeconds, bytes.length, bytes,
      JSON.stringify({ run_label: runLabel, scene_order: scene.scene_order, scene_id: scene.id }),
    ]
  );
  return res.rows[0].id;
}

async function renderImageForScene({ scene, size, quality, runLabel }) {
  const prompt = buildImagePrompt(scene.image_prompt_hint);
  if (DRY_RUN) {
    console.log(`[dry][img] scene ${scene.scene_order} :: ${scene.title}`);
    console.log(`           ${prompt}`);
    return { ok: true, dry: true };
  }
  const bytes = await retry(() => generateImage({ prompt, size, quality }), { tries: 3, baseMs: 2000 });
  const id = await persistImage({ scene, prompt, bytes, sizeWH: size, runLabel });
  const file = path.join(IMG_OUT, `${String(id).padStart(6, '0')}-commercial-${slug(scene.id)}.png`);
  await writeFile(file, bytes).catch(() => {});
  return { ok: true, id, bytes_url: `/api/media/${id}/bytes`, file };
}

async function renderAudioForScene({ scene, runLabel }) {
  if (DRY_RUN) {
    console.log(`[dry][aud] scene ${scene.scene_order} :: ${scene.title}`);
    console.log(`           "${scene.narration.slice(0, 100)}..."`);
    return { ok: true, dry: true };
  }
  const bytes = await retry(
    () => synthesizeTTS({ text: scene.narration, voiceId: VOICE_ID, model: TTS_MODEL }),
    { tries: 3, baseMs: 2000 }
  );
  const durationSeconds = estimateDurationSeconds(scene.narration);
  const id = await persistAudio({ scene, narration: scene.narration, bytes, durationSeconds, runLabel });
  const file = path.join(AUD_OUT, `${String(id).padStart(6, '0')}-commercial-${slug(scene.id)}.mp3`);
  await writeFile(file, bytes).catch(() => {});
  return { ok: true, id, bytes_url: `/api/media/${id}/bytes`, duration_seconds: durationSeconds, file };
}

async function renderScene({ scene, size, quality, runLabel }) {
  const started = Date.now();
  const tasks = [];
  if (!ONLY_AUDIO) tasks.push(renderImageForScene({ scene, size, quality, runLabel }).catch((e) => ({ ok: false, kind: 'image', error: String(e?.message || e) })));
  else tasks.push(Promise.resolve({ ok: true, skipped: 'image' }));
  if (!ONLY_IMAGE) tasks.push(renderAudioForScene({ scene, runLabel }).catch((e) => ({ ok: false, kind: 'audio', error: String(e?.message || e) })));
  else tasks.push(Promise.resolve({ ok: true, skipped: 'audio' }));
  const [imageRes, audioRes] = await Promise.all(tasks);
  const ms = Date.now() - started;
  const imgTag = imageRes.id ? `#${imageRes.id}` : (imageRes.dry ? 'dry' : (imageRes.skipped ? `skip-${imageRes.skipped}` : 'FAIL'));
  const audTag = audioRes.id ? `#${audioRes.id}` : (audioRes.dry ? 'dry' : (audioRes.skipped ? `skip-${audioRes.skipped}` : 'FAIL'));
  console.log(`[scene ${scene.scene_order}] ${ms}ms  img=${imgTag}  aud=${audTag}  ${scene.title}`);
  if (imageRes.error) console.log(`  img error: ${imageRes.error}`);
  if (audioRes.error) console.log(`  aud error: ${audioRes.error}`);
  return { scene, imageRes, audioRes, ms };
}

async function main() {
  await mkdir(IMG_OUT, { recursive: true });
  await mkdir(AUD_OUT, { recursive: true });

  const scriptRaw = await readFile(SCRIPT_PATH, 'utf8');
  const script = JSON.parse(scriptRaw);
  const meta = script.meta || {};
  const runLabel = meta.run_label || 'commercial-v1';
  const size = meta.image_size || '1024x1024';
  const quality = meta.image_quality || 'medium';

  console.log(`[commercial] script: ${meta.title || '(untitled)'} (${script.scenes.length} scenes)`);
  console.log(`[commercial] run_label=${runLabel}  size=${size}  quality=${quality}  concurrency=${CONCURRENCY}  dry=${DRY_RUN}  audio_only=${ONLY_AUDIO}  image_only=${ONLY_IMAGE}`);

  const wallStart = Date.now();
  const results = await pmap(script.scenes, CONCURRENCY, (scene) => renderScene({ scene, size, quality, runLabel }));
  const wallMs = Date.now() - wallStart;

  if (DRY_RUN) {
    console.log(`\n[commercial] dry run complete in ${wallMs}ms.`);
    return;
  }

  const manifest = {
    meta: { ...meta, generated_at: new Date().toISOString(), wall_ms: wallMs },
    scenes: results.map(({ scene, imageRes, audioRes }) => ({
      scene_order: scene.scene_order,
      id: scene.id,
      title: scene.title,
      caption: scene.caption,
      narration: scene.narration,
      alt_text: scene.alt_text,
      image: imageRes.id ? { id: imageRes.id, bytes_url: imageRes.bytes_url } : null,
      audio: audioRes.id ? { id: audioRes.id, bytes_url: audioRes.bytes_url, duration_seconds: audioRes.duration_seconds } : null,
    })),
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n[commercial] wrote manifest: ${path.relative(challengeRoot, MANIFEST_PATH)}  (${wallMs}ms wall)`);
}

try {
  await main();
} catch (e) {
  console.error('[commercial] failed:', e?.stack || e?.message || e);
  process.exitCode = 1;
} finally {
  await close();
}
