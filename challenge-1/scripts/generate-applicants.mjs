// Generate AISH-eligible synthetic applicants.
//
// Usage:
//   node challenge-1/scripts/generate-applicants.mjs --count 100 [--concurrency 6]
//
// Idempotent on external_ref; re-running tops up to the target count.
import { q, close } from '../../lib/db.mjs';
import { jsonCompletion } from '../../lib/openai.mjs';
import { argInt, pmap, retry, pickName, albertaCity, albertaPostal, phone } from '../../lib/util.mjs';

const TARGET = argInt('count', 100);
const CONCURRENCY = argInt('concurrency', 6);

const existing = await q('SELECT count(*)::int AS n FROM challenge_1.applicants');
const have = existing.rows[0].n;
const need = Math.max(0, TARGET - have);
console.log(`applicants: have=${have}, target=${TARGET}, need=${need}`);
if (need === 0) {
  console.log('nothing to do.');
  await close();
  process.exit(0);
}

const SYSTEM = `You generate synthetic AISH (Assured Income for the Severely Handicapped, Government of Alberta) applicant profiles for a hackathon sandbox.

These profiles are fictional and used for prototyping an intake-triage agent. Eligibility hinges on Alberta residency, age 18 to 64, a permanent medical condition that substantially limits the ability to earn a living, and modest income and assets. Generate a mix: roughly 60 percent clearly eligible, 25 percent borderline (one missing element or close to thresholds), 15 percent clearly ineligible (over income, under 18, missing AB residency, non-permanent condition). Reflect the demographic spread of Alberta. Use realistic medical conditions a working-age adult might have (mental illness, chronic pain, neurological, developmental, sensory, autoimmune). Income and assets are in CAD. Be specific and concrete; no decoration.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['applicants'],
  properties: {
    applicants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'first_name', 'last_name', 'date_of_birth', 'marital_status', 'household_size',
          'monthly_income_cad', 'liquid_assets_cad', 'primary_medical_condition',
          'secondary_conditions', 'functional_limitations', 'treatment_summary',
          'eligibility_classification', 'eligibility_notes'
        ],
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          date_of_birth: { type: 'string', description: 'YYYY-MM-DD' },
          marital_status: { type: 'string', enum: ['single', 'married', 'common_law', 'divorced', 'widowed', 'separated'] },
          household_size: { type: 'integer', minimum: 1, maximum: 8 },
          monthly_income_cad: { type: 'number', minimum: 0 },
          liquid_assets_cad: { type: 'number', minimum: 0 },
          primary_medical_condition: { type: 'string' },
          secondary_conditions: { type: 'array', items: { type: 'string' } },
          functional_limitations: { type: 'string' },
          treatment_summary: { type: 'string' },
          eligibility_classification: { type: 'string', enum: ['eligible', 'borderline', 'ineligible'] },
          eligibility_notes: { type: 'string' }
        }
      }
    }
  }
};

const BATCH = 10;

async function generateBatch(batchIndex, n) {
  return retry(async () => {
    const out = await jsonCompletion({
      system: SYSTEM,
      user: `Generate ${n} synthetic AISH applicant profiles. Batch ${batchIndex + 1}. Vary names, ages (18 to 64), cities across Alberta is fine but you do not need to include city here, conditions, and household composition. Avoid duplicating common names within the batch.`,
      schema: SCHEMA,
      schemaName: 'aish_applicant_batch',
      temperature: 0.95,
      maxTokens: 6000,
    });
    if (!out.applicants?.length) throw new Error('no applicants in response');
    return out.applicants;
  }, { tries: 3 });
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

let inserted = 0;
let failed = 0;

const results = await pmap(batches, CONCURRENCY, async (b) => {
  try {
    return { idx: b.idx, applicants: await generateBatch(b.idx, b.n) };
  } catch (e) {
    failed++;
    console.error(`batch ${b.idx} failed: ${e.message}`);
    return { idx: b.idx, applicants: [] };
  }
});

for (const r of results) {
  for (const a of r.applicants) {
    const ext = `aish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const street = `${Math.floor(Math.random() * 9000) + 100} ${pickName().last} ${['Street', 'Avenue', 'Way', 'Drive', 'Crescent'][Math.floor(Math.random() * 5)]}`;
    try {
      await q(
        `INSERT INTO challenge_1.applicants
          (external_ref, first_name, last_name, date_of_birth, email, phone,
           street_address, city, province, postal_code, marital_status, household_size,
           monthly_income_cents, liquid_assets_cents, primary_medical_condition,
           secondary_conditions, functional_limitations, treatment_summary,
           application_status, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'AB',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (external_ref) DO NOTHING`,
        [
          ext,
          a.first_name,
          a.last_name,
          a.date_of_birth,
          `${a.first_name}.${a.last_name}.${Math.floor(Math.random() * 999)}@example.ab.ca`.toLowerCase().replace(/\s+/g, ''),
          phone(),
          street,
          albertaCity(),
          albertaPostal(),
          a.marital_status,
          a.household_size,
          Math.round((a.monthly_income_cad || 0) * 100),
          Math.round((a.liquid_assets_cad || 0) * 100),
          a.primary_medical_condition,
          JSON.stringify(a.secondary_conditions || []),
          a.functional_limitations,
          a.treatment_summary,
          a.eligibility_classification === 'ineligible' ? 'flagged' : 'submitted',
          JSON.stringify(a),
        ]
      );
      inserted++;
    } catch (e) {
      console.error(`insert failed for ${a.first_name} ${a.last_name}: ${e.message}`);
    }
  }
}

const final = await q('SELECT count(*)::int AS n FROM challenge_1.applicants');
console.log(`inserted=${inserted}, batch_failures=${failed}, total=${final.rows[0].n}`);
await close();
