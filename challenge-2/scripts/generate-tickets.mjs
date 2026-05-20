// Generate synthetic customer support tickets for "Pronghorn Mobile" (fictional
// telco + connected-home provider) using Vertex Claude (Sonnet 4.6) with a
// tool-enforced JSON schema, validated locally with Zod.
//
// Usage:
//   node challenge-2/scripts/generate-tickets.mjs --count 200 [--concurrency 4] [--batch 10]
//
// Idempotent: tops up to the target count.
import { z } from 'zod';
import { q, close } from '../../lib/db.mjs';
import { claudeRawPredict, extractToolUse } from '../../lib/vertex.mjs';
import { argInt, pmap, retry, pickName, phone, albertaCity } from '../../lib/util.mjs';

const TARGET = argInt('count', 200);
const CONCURRENCY = argInt('concurrency', 4);
const BATCH = argInt('batch', 10);

const COMPANY = 'Pronghorn Mobile';
const COMPANY_BLURB = `${COMPANY} is a fictional Alberta-based telecom + connected-home services provider. Plans: Basic, Family, Pro. Products: mobile lines, home internet (fibre/DSL), smart-home hub, security cameras. Customers contact support via email, chat, phone, and the customer portal.`;

const TicketSchema = z.object({
  channel: z.enum(['email', 'chat', 'phone', 'portal']),
  category: z.enum(['billing', 'technical', 'account', 'shipping', 'refund', 'feature_request', 'complaint']),
  subcategory: z.string().min(2),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  subject: z.string().min(4),
  body_markdown: z.string().min(40),
  customer_first_name: z.string().min(1),
  customer_last_name: z.string().min(1),
  customer_email: z.string().email(),
  plan_tier: z.enum(['Basic', 'Family', 'Pro']),
  sentiment: z.enum(['neutral', 'frustrated', 'angry', 'confused', 'polite', 'urgent']),
  expected_resolution: z.enum(['auto_resolve', 'human_required', 'escalation_required']),
  language: z.enum(['en', 'fr']),
  tags: z.array(z.string()).max(8),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const BatchSchema = z.object({ tickets: z.array(TicketSchema).min(1) });

const TOOL = {
  name: 'record_tickets',
  description: 'Records a batch of fictional customer support tickets.',
  input_schema: {
    type: 'object',
    required: ['tickets'],
    properties: {
      tickets: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'channel', 'category', 'subcategory', 'priority', 'subject', 'body_markdown',
            'customer_first_name', 'customer_last_name', 'customer_email', 'plan_tier',
            'sentiment', 'expected_resolution', 'language', 'tags'
          ],
          properties: {
            channel: { type: 'string', enum: ['email', 'chat', 'phone', 'portal'] },
            category: { type: 'string', enum: ['billing', 'technical', 'account', 'shipping', 'refund', 'feature_request', 'complaint'] },
            subcategory: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
            subject: { type: 'string' },
            body_markdown: { type: 'string' },
            customer_first_name: { type: 'string' },
            customer_last_name: { type: 'string' },
            customer_email: { type: 'string' },
            plan_tier: { type: 'string', enum: ['Basic', 'Family', 'Pro'] },
            sentiment: { type: 'string', enum: ['neutral', 'frustrated', 'angry', 'confused', 'polite', 'urgent'] },
            expected_resolution: { type: 'string', enum: ['auto_resolve', 'human_required', 'escalation_required'] },
            language: { type: 'string', enum: ['en', 'fr'] },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' },
          },
        },
      },
    },
  },
};

const SYSTEM = `You generate synthetic customer support tickets for ${COMPANY}, used to train and prototype an AI triage agent in a hackathon sandbox.

${COMPANY_BLURB}

Generate a realistic mix of issues across the seven categories. Include both quick-fix items (auto_resolve) and complex items (escalation_required). Vary tone, sentiment, and channel. The body_markdown should read as a real customer wrote it, including incomplete sentences when appropriate, with relevant facts (account number patterns like PMO-####, device names, error messages, dates). Keep each body between 60 and 500 words. No emoji. No marketing language.`;

const existing = await q('SELECT count(*)::int AS n FROM challenge_2.tickets');
const have = existing.rows[0].n;
const need = Math.max(0, TARGET - have);
console.log(`tickets: have=${have}, target=${TARGET}, need=${need}`);
if (need === 0) {
  console.log('nothing to do.');
  await close();
  process.exit(0);
}

const batches = [];
let remaining = need;
let idx = 0;
while (remaining > 0) {
  const take = Math.min(BATCH, remaining);
  batches.push({ idx: idx++, n: take });
  remaining -= take;
}
console.log(`requesting ${batches.length} batches at concurrency ${CONCURRENCY}...`);

async function generateBatch({ idx, n }) {
  return retry(async () => {
    const resp = await claudeRawPredict({
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Generate exactly ${n} synthetic ${COMPANY} support tickets for batch ${idx + 1}. Vary distribution across categories, channels, priorities, and sentiments. About 1 in 10 should be in French. Call the record_tickets tool with the array. Do not return text outside the tool call.`,
        },
      ],
      tools: [TOOL],
      toolChoice: { type: 'tool', name: 'record_tickets' },
      maxTokens: 8000,
      temperature: 0.9,
    });
    const raw = extractToolUse(resp, 'record_tickets');
    const parsed = BatchSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`zod validation failed: ${parsed.error.message.slice(0, 400)}`);
    return parsed.data.tickets;
  }, { tries: 3, baseMs: 2500 });
}

let inserted = 0;
let failed = 0;

const results = await pmap(batches, CONCURRENCY, async (b) => {
  try {
    return await generateBatch(b);
  } catch (e) {
    failed++;
    console.error(`batch ${b.idx} failed: ${e.message}`);
    return [];
  }
});

for (const tickets of results) {
  for (const t of tickets) {
    try {
      const custExt = `cust-${t.customer_email.toLowerCase()}`;
      const custRes = await q(
        `INSERT INTO challenge_2.customers
           (external_ref, full_name, email, phone, plan_tier, signup_date, city, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (external_ref) DO UPDATE SET plan_tier = EXCLUDED.plan_tier
         RETURNING id`,
        [
          custExt,
          `${t.customer_first_name} ${t.customer_last_name}`,
          t.customer_email,
          phone(),
          t.plan_tier,
          new Date(Date.now() - Math.floor(Math.random() * 3 * 365) * 86400_000),
          albertaCity(),
          JSON.stringify({ from_ticket: true }),
        ]
      );
      const customerId = custRes.rows[0].id;
      const ticketExt = `pmo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      const submittedAt = new Date(Date.now() - Math.floor(Math.random() * 30) * 86400_000);
      await q(
        `INSERT INTO challenge_2.tickets
           (external_ref, customer_id, channel, category, subcategory, priority, status,
            subject, body, sentiment, expected_resolution, language, tags, metadata,
            submitted_at, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (external_ref) DO NOTHING`,
        [
          ticketExt,
          customerId,
          t.channel,
          t.category,
          t.subcategory,
          t.priority,
          t.subject,
          t.body_markdown,
          t.sentiment,
          t.expected_resolution,
          t.language,
          JSON.stringify(t.tags || []),
          JSON.stringify(t.metadata || {}),
          submittedAt,
          JSON.stringify(t),
        ]
      );
      inserted++;
    } catch (e) {
      console.error(`insert failed: ${e.message}`);
    }
  }
}

const final = await q('SELECT count(*)::int AS n FROM challenge_2.tickets');
console.log(`tickets inserted=${inserted}, batch_failures=${failed}, total=${final.rows[0].n}`);
await close();
