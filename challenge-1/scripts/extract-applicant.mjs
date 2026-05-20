// AISH eligibility extraction agent.
//
// For each document image stored in challenge_1.documents for a given
// applicant, send the image to Vertex Claude with a flat tool that returns
// {path, value, confidence} triples. Merge each result into a running master
// JSON shaped like eligibility.schema.json. Track per-pass coverage delta and
// final completeness percent.
//
// Usage:
//   node challenge-1/scripts/extract-applicant.mjs --applicant-id 1
//   node challenge-1/scripts/extract-applicant.mjs --all [--limit 5] [--concurrency 2]
//   node challenge-1/scripts/extract-applicant.mjs --applicant-id 1 --model claude-opus-4-7
//
// Outputs:
//   - challenge_1.extraction_runs   one row per applicant run, master_json + completeness
//   - challenge_1.extraction_passes one row per (run, document), with cumulative %
//   - ./challenge-1/extracted/<applicant_id>/master.json
//   - ./challenge-1/extracted/<applicant_id>/passes.json
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { q, close } from '../../lib/db.mjs';
import { claudeRawPredict, extractToolUse } from '../../lib/vertex.mjs';
import { argv, argInt, argFlag, pmap, retry } from '../../lib/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(here, '..', 'eligibility.schema.json');
const TEMPLATE_PATH = path.resolve(here, '..', 'eligibility.template.json');
const OUT_DIR = path.resolve(here, '..', 'extracted');

const APPLICANT_ID = argInt('applicant-id', null);
const RUN_ALL = argFlag('all');
const LIMIT = argInt('limit', 0);
const CONCURRENCY = argInt('concurrency', 2);
const PASS_CONCURRENCY = argInt('pass-concurrency', 10);
const MODEL = argv('model', process.env.VERTEX_CLAUDE_SONNET_MODEL || 'claude-sonnet-4-6');
const VERBOSE = argFlag('verbose');

if (!APPLICANT_ID && !RUN_ALL) {
  console.error('error: pass --applicant-id N or --all');
  process.exit(1);
}

const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
const template = JSON.parse(await readFile(TEMPLATE_PATH, 'utf8'));

// --- schema walking ---------------------------------------------------------

function walkLeaves(node, prefix, out) {
  if (!node || typeof node !== 'object') return;
  if (node.properties) {
    for (const [k, v] of Object.entries(node.properties)) {
      walkLeaves(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return;
  }
  out.push({ path: prefix, node });
}

const allLeaves = [];
walkLeaves(schema, '', allLeaves);

// Required leaves used for the completeness measure: skip system, derived
// eligibility_assessment, metadata, conditional spouse fields, and optional
// expense receipts.
function isRequiredLeaf(leaf, partnered) {
  const n = leaf.node;
  if (n['x-system']) return false;
  if (leaf.path.startsWith('eligibility_assessment.')) return false;
  if (leaf.path.startsWith('_metadata.')) return false;
  if (n['x-optional']) return false;
  if (n['x-conditional'] === 'partnered' && !partnered) return false;
  return true;
}

// --- merge helpers ----------------------------------------------------------

function getAtPath(obj, p) {
  const segs = p.split('.');
  let cur = obj;
  for (const s of segs) {
    if (cur == null) return undefined;
    cur = cur[s];
  }
  return cur;
}

function setAtPath(obj, p, val) {
  const segs = p.split('.');
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (cur[s] == null || typeof cur[s] !== 'object') cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = val;
}

function isEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function mergeValue(existing, incoming, conf) {
  if (isEmpty(existing)) return { value: incoming, action: 'new' };
  if (isEmpty(incoming)) return { value: existing, action: 'kept' };
  // Arrays: union by JSON-stringified element.
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const seen = new Set(existing.map((x) => JSON.stringify(x)));
    const merged = existing.slice();
    let added = false;
    for (const item of incoming) {
      const key = JSON.stringify(item);
      if (!seen.has(key)) { merged.push(item); seen.add(key); added = true; }
    }
    return { value: merged, action: added ? 'upgraded' : 'kept' };
  }
  // Strings: keep the longer/more-detailed value.
  if (typeof existing === 'string' && typeof incoming === 'string') {
    if (incoming.length > existing.length * 1.1) return { value: incoming, action: 'upgraded' };
    return { value: existing, action: 'kept' };
  }
  // Booleans: keep existing unless incoming has higher confidence.
  if (typeof existing === 'boolean' && typeof incoming === 'boolean') {
    if (existing === incoming) return { value: existing, action: 'kept' };
    return { value: conf >= 0.8 ? incoming : existing, action: conf >= 0.8 ? 'upgraded' : 'kept' };
  }
  // Numbers: prefer non-zero, else existing.
  if (typeof existing === 'number' && typeof incoming === 'number') {
    if (existing === 0 && incoming !== 0) return { value: incoming, action: 'upgraded' };
    return { value: existing, action: 'kept' };
  }
  // Objects: shallow merge favouring incoming where existing key empty.
  if (typeof existing === 'object' && typeof incoming === 'object') {
    const merged = { ...existing };
    let upgraded = false;
    for (const [k, v] of Object.entries(incoming)) {
      if (isEmpty(merged[k])) { merged[k] = v; upgraded = true; }
    }
    return { value: merged, action: upgraded ? 'upgraded' : 'kept' };
  }
  // Mismatched types: keep existing.
  return { value: existing, action: 'kept' };
}

function completenessPct(master, partnered) {
  let total = 0, filled = 0;
  for (const leaf of allLeaves) {
    if (!isRequiredLeaf(leaf, partnered)) continue;
    total++;
    const v = getAtPath(master, leaf.path);
    if (!isEmpty(v)) filled++;
  }
  return total === 0 ? 0 : (filled / total) * 100;
}

// --- Vertex Claude call -----------------------------------------------------

const EXTRACT_TOOL = {
  name: 'record_extracted_fields',
  description: 'Records all eligibility fields the model can see in this single document image. Only include fields that are directly readable from the image; do not infer or guess.',
  input_schema: {
    type: 'object',
    required: ['fields'],
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'object',
          required: ['path', 'value'],
          properties: {
            path: { type: 'string', description: 'Dotted JSONPath into the eligibility schema (e.g. "applicant_identity.legal_first_name").' },
            value: { description: 'The extracted value. May be string, number, boolean, array, or object.' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            evidence_quote: { type: 'string', description: 'A short verbatim quote of the text on the document that supports this value, if applicable.' },
          },
        },
      },
    },
  },
};

const ALLOWED_PATHS = allLeaves.map((l) => l.path).filter((p) => !p.startsWith('eligibility_assessment.') && !p.startsWith('_metadata.') && p !== 'applicant_id');
const PATH_SET = new Set(ALLOWED_PATHS);

const SYSTEM = `You are an AISH (Alberta Assured Income for the Severely Handicapped) intake-document extraction agent.

You will be shown ONE synthetic supporting document at a time, along with a label describing the document type. Read the document image carefully and extract every eligibility field you can directly see. Do not infer or fabricate. If a field is not visible, omit it.

Use the record_extracted_fields tool to return the data. Each entry needs a dotted "path" matching the AISH eligibility schema, the extracted "value", a "confidence" in 0..1 based on how clearly the text was readable, and an "evidence_quote" of the text on the document.

Valid paths you may emit (use these exactly):
${ALLOWED_PATHS.map((p) => `  - ${p}`).join('\n')}

Common rules:
- legal_first_name and legal_last_name are split out from a "full name" on the document. Do not concatenate; emit each part.
- Dates must be in YYYY-MM-DD format.
- Currency values are in CAD; emit as a plain number (no symbols, no commas).
- Booleans: emit true/false.
- For arrays (secondary_diagnoses, current_medications, current_benefits, abnormal_lab_findings, specialists_consulted, proof_of_residency_documents): emit an array of the items visible on this single document.
- Do not emit eligibility_assessment.* or _metadata.* paths. The harness fills those in.
- Do not emit the applicant_id field; the harness sets it.

If the image is illegible or you cannot extract anything, return an empty fields array.`;

async function extractFromImage({ buf, label, model }) {
  const base64 = Buffer.from(buf).toString('base64');
  return retry(
    async () => {
      const resp = await claudeRawPredict({
        model,
        system: SYSTEM,
        maxTokens: 4096,
        temperature: 0,
        tools: [EXTRACT_TOOL],
        toolChoice: { type: 'tool', name: 'record_extracted_fields' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
              { type: 'text', text: `Document label: "${label}". Read the image and extract every eligibility field you can see. Call the record_extracted_fields tool with the array.` },
            ],
          },
        ],
      });
      const raw = extractToolUse(resp, 'record_extracted_fields');
      const fields = Array.isArray(raw.fields) ? raw.fields : [];
      // Drop unrecognized paths so a misnamed key never corrupts the master.
      return fields.filter((f) => PATH_SET.has(f.path));
    },
    { tries: 3, baseMs: 2500 }
  );
}

// --- per-applicant runner ---------------------------------------------------

async function extractForApplicant(applicantId) {
  const aRes = await q(
    `SELECT id, first_name, last_name, marital_status FROM challenge_1.applicants WHERE id = $1`,
    [applicantId]
  );
  if (aRes.rowCount === 0) {
    console.error(`applicant ${applicantId} not found`);
    return null;
  }
  const applicant = aRes.rows[0];
  const partnered = ['married', 'common_law', 'separated'].includes((applicant.marital_status || '').toLowerCase());

  const docs = await q(
    `SELECT id, document_label, content FROM challenge_1.documents
     WHERE applicant_id = $1 ORDER BY id ASC`,
    [applicantId]
  );
  if (docs.rowCount === 0) {
    console.error(`applicant ${applicantId} has no documents yet`);
    return null;
  }

  console.log(`\napplicant ${applicantId} (${applicant.first_name} ${applicant.last_name}, ${docs.rowCount} docs)`);

  const master = JSON.parse(JSON.stringify(template));
  master.applicant_id = applicantId;

  const runIns = await q(
    `INSERT INTO challenge_1.extraction_runs (applicant_id, master_json, model, started_at, documents_processed)
     VALUES ($1, $2::jsonb, $3, now(), 0)
     RETURNING id`,
    [applicantId, JSON.stringify(master), MODEL]
  );
  const runId = runIns.rows[0].id;

  const passes = [];
  let pass = 0;
  // Serialize merges in completion order so each pass sees a consistent master
  // and the cumulative_completeness_percent reflects the actual additive build.
  let mergeChain = Promise.resolve();

  await pmap(docs.rows, PASS_CONCURRENCY, async (d) => {
    const start = Date.now();
    let fields = [], errMsg = null;
    try {
      fields = await extractFromImage({ buf: d.content, label: d.document_label, model: MODEL });
    } catch (e) {
      errMsg = e?.message || String(e);
    }
    const durMs = Date.now() - start;

    mergeChain = mergeChain.then(async () => {
      pass++;
      let newCnt = 0, upCnt = 0, keptCnt = 0;
      for (const f of fields) {
        const existing = getAtPath(master, f.path);
        const { value, action } = mergeValue(existing, f.value, f.confidence ?? 0.6);
        setAtPath(master, f.path, value);
        if (action === 'new') newCnt++;
        else if (action === 'upgraded') upCnt++;
        else keptCnt++;
      }

      const cumPct = completenessPct(master, partnered);
      if (VERBOSE) console.log(`  pass ${pass.toString().padStart(2)}: ${d.document_label.padEnd(46)} fields=${fields.length} new=${newCnt} up=${upCnt} kept=${keptCnt} cum=${cumPct.toFixed(1)}% (${durMs}ms)`);
      else process.stdout.write(`  pass ${pass}/${docs.rowCount}: ${cumPct.toFixed(1)}%\r`);

      await q(
        `INSERT INTO challenge_1.extraction_passes
           (run_id, document_id, document_label, pass_index, fields_returned, fields_new, fields_upgraded,
            cumulative_completeness_percent, raw_fields, duration_ms, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
        [runId, d.id, d.document_label, pass, fields.length, newCnt, upCnt, cumPct, JSON.stringify(fields), durMs, errMsg]
      );

      passes.push({ pass, document_label: d.document_label, fields_returned: fields.length, fields_new: newCnt, fields_upgraded: upCnt, cumulative_pct: cumPct, ms: durMs, error: errMsg });
    });
    return mergeChain;
  });
  await mergeChain;

  // Fill derived eligibility checks now that primaries are populated.
  computeEligibilityAssessment(master);
  const finalPct = completenessPct(master, partnered);
  master._metadata = master._metadata || {};
  master._metadata.documents_processed = docs.rows.map((d) => d.document_label);
  master._metadata.completeness_percentage = Number(finalPct.toFixed(2));
  master._metadata.extraction_completed_at = new Date().toISOString();

  await q(
    `UPDATE challenge_1.extraction_runs
       SET master_json = $1::jsonb, completeness_percent = $2, documents_processed = $3, finished_at = now()
     WHERE id = $4`,
    [JSON.stringify(master), finalPct, docs.rowCount, runId]
  );

  const outDir = path.join(OUT_DIR, String(applicantId));
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'master.json'), JSON.stringify(master, null, 2));
  await writeFile(path.join(outDir, 'passes.json'), JSON.stringify(passes, null, 2));

  process.stdout.write('\n');
  console.log(`  done: completeness ${finalPct.toFixed(1)}%; written to extracted/${applicantId}/`);
  return { applicantId, runId, finalPct, passes };
}

function computeEligibilityAssessment(m) {
  const ea = m.eligibility_assessment;
  const id = m.applicant_identity;
  const res = m.residency_status;
  const med = m.medical;
  const fin = m.financial;

  if (id.date_of_birth && !id.age_years) {
    try {
      const dob = new Date(id.date_of_birth);
      const ageMs = Date.now() - dob.getTime();
      id.age_years = Math.floor(ageMs / (365.25 * 24 * 3600 * 1000));
    } catch { /* ignore */ }
  }
  if (id.age_years != null) ea.age_check_passed = id.age_years >= 18 && id.age_years < 65;
  if (res.current_address_province) {
    const p = (res.current_address_province + '').trim().toUpperCase();
    res.currently_in_alberta = p === 'AB' || p === 'ALBERTA' || p.startsWith('AB ');
    ea.residency_check_passed = !!res.currently_in_alberta;
  }
  if (res.citizenship_status) ea.citizenship_check_passed = true;
  if (med.is_permanent_condition === true) ea.medical_check_passed = true;
  if (fin.monthly_income_employment_cad != null) ea.income_check_passed = fin.monthly_income_employment_cad <= 2200;

  const cheq = fin.chequing_balance_cad || 0;
  const sav = fin.savings_balance_cad || 0;
  if (cheq || sav) {
    fin.total_liquid_assets_cad = cheq + sav;
    ea.assets_check_passed = (fin.total_liquid_assets_cad || 0) <= 100_000;
  }

  // Recommended action
  const checks = [ea.age_check_passed, ea.residency_check_passed, ea.citizenship_check_passed, ea.medical_check_passed, ea.income_check_passed, ea.assets_check_passed];
  if (checks.every((c) => c === true)) ea.recommended_action = 'approve';
  else if (checks.some((c) => c === false)) ea.recommended_action = 'request_more_info';
  else ea.recommended_action = 'request_more_info';
}

// --- driver ----------------------------------------------------------------

async function main() {
  if (APPLICANT_ID) {
    await extractForApplicant(APPLICANT_ID);
  } else {
    const sql = LIMIT > 0
      ? `SELECT a.id FROM challenge_1.applicants a
         WHERE EXISTS (SELECT 1 FROM challenge_1.documents d WHERE d.applicant_id = a.id)
         ORDER BY a.id LIMIT $1`
      : `SELECT a.id FROM challenge_1.applicants a
         WHERE EXISTS (SELECT 1 FROM challenge_1.documents d WHERE d.applicant_id = a.id)
         ORDER BY a.id`;
    const r = await q(sql, LIMIT > 0 ? [LIMIT] : []);
    const ids = r.rows.map((x) => x.id);
    console.log(`extracting for ${ids.length} applicants at concurrency ${CONCURRENCY}...`);
    await pmap(ids, CONCURRENCY, async (id) => {
      try { await extractForApplicant(id); }
      catch (e) { console.error(`applicant ${id} failed: ${e.message}`); }
    });
  }
}

await main();
await close();
