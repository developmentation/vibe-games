import 'dotenv/config';
import OpenAI from 'openai';

let _client = null;
export function openai() {
  if (_client) return _client;
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

const TEXT_MODEL_FALLBACKS = [
  process.env.OPENAI_TEXT_MODEL,
  'gpt-4o-mini',
  'gpt-4o',
].filter(Boolean);

const IMAGE_MODEL_FALLBACKS = [
  process.env.OPENAI_IMAGE_MODEL,
  'gpt-image-1',
].filter(Boolean);

async function tryEach(models, fn) {
  let lastErr = null;
  for (const m of models) {
    try {
      return await fn(m);
    } catch (e) {
      const msg = String(e?.message || e);
      if (/model_not_found|does not exist|not found/i.test(msg)) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('No working model in fallback list');
}

export async function jsonCompletion({ system, user, schema, schemaName = 'output', maxTokens = 4096, temperature = 0.7 }) {
  return tryEach(TEXT_MODEL_FALLBACKS, async (model) => {
    const resp = await openai().chat.completions.create({
      model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
      response_format: schema
        ? {
            type: 'json_schema',
            json_schema: { name: schemaName, strict: true, schema },
          }
        : { type: 'json_object' },
    });
    const text = resp.choices?.[0]?.message?.content || '{}';
    return JSON.parse(text);
  });
}

export async function generateImage({ prompt, size = '1024x1024', quality = 'medium' }) {
  return tryEach(IMAGE_MODEL_FALLBACKS, async (model) => {
    const resp = await openai().images.generate({
      model,
      prompt,
      size,
      n: 1,
      ...(model === 'gpt-image-1' ? { quality } : {}),
    });
    const item = resp.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
    if (item?.url) {
      const r = await fetch(item.url);
      if (!r.ok) throw new Error(`image fetch ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    }
    throw new Error('image response had no b64_json or url');
  });
}
