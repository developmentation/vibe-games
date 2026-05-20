// Validate that the document catalogue in generate-documents.mjs covers at
// least 80% of the leaf fields in eligibility.schema.json.
//
// Walks the schema. For each leaf:
//   - x-system fields (e.g. applicant_id) are excluded from the headline measure.
//   - x-conditional: "partnered" fields are only counted when --partnered.
//   - x-optional fields are counted but allowed to be missing.
//   - x-sources fields are covered if any source intersects the document package.
//   - x-derived fields are covered when every upstream leaf is covered.
//
// Usage:
//   node challenge-1/scripts/validate-coverage.mjs
//   node challenge-1/scripts/validate-coverage.mjs --partnered
//
// Exits non-zero if primary coverage < 80%.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { argFlag } from '../../lib/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, '..', 'eligibility.schema.json');
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));

const PARTNERED = argFlag('partnered');

// Core 20 mirrors ALL_DOCS in generate-documents.mjs, in the order the
// catalogue is sliced.
const CORE_20 = [
  'Alberta Photo ID Card (front)',
  'Alberta Driver Licence (front)',
  'Canadian Birth Certificate',
  'AHCIP Card',
  'Citizenship or Immigration Document',
  'Utility Bill (electricity)',
  'Residential Lease Agreement (page 1)',
  'Bank Statement (chequing)',
  'Bank Statement (savings)',
  'CRA Notice of Assessment',
  'Pay Stub or Income Slip',
  'Direct Deposit Authorization Form',
  'AISH Medical Report Part A (Applicant)',
  'AISH Medical Report Part B (Physician)',
  'Specialist Consultation Report',
  'Pharmacy Prescription Record',
  'Lab Results Page',
  'CPP-D / EI Decision Letter',
  'Income Support Status Letter',
  'Signed AISH Consent and Authorization Form',
];

const PACKAGE = new Set(CORE_20);
if (PARTNERED) PACKAGE.add('Spouse/Partner Financial Declaration');

function walk(node, prefix, out) {
  if (!node || typeof node !== 'object') return;
  if (node.properties) {
    for (const [k, v] of Object.entries(node.properties)) {
      walk(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return;
  }
  out.push({ path: prefix, node });
}

const leaves = [];
walk(schema, '', leaves);
const byPath = new Map(leaves.map((l) => [l.path, l]));

function isCovered(leaf, visited = new Set()) {
  if (visited.has(leaf.path)) return false;
  visited.add(leaf.path);
  const sources = leaf.node['x-sources'];
  if (Array.isArray(sources) && sources.length > 0) {
    return sources.some((s) => PACKAGE.has(s));
  }
  const derived = leaf.node['x-derived'];
  if (Array.isArray(derived) && derived.length > 0) {
    return derived.every((p) => {
      const upstream = byPath.get(p);
      if (!upstream) return false;
      return isCovered(upstream, visited);
    });
  }
  return false;
}

function shouldInclude(leaf, bucket) {
  if (leaf.node['x-system']) return false;
  if (bucket === 'primary' && leaf.path.startsWith('eligibility_assessment.')) return false;
  if (bucket === 'primary' && leaf.path.startsWith('_metadata.')) return false;
  if (bucket === 'derived' && !leaf.path.startsWith('eligibility_assessment.')) return false;
  const cond = leaf.node['x-conditional'];
  if (cond === 'partnered' && !PARTNERED) return false;
  return true;
}

function score(bucket) {
  const subset = leaves.filter((l) => shouldInclude(l, bucket));
  const required = subset.filter((l) => !l.node['x-optional']);
  let covered = 0, optional_covered = 0;
  const missing = [], present = [], optional_missing = [];
  for (const leaf of subset) {
    const c = isCovered(leaf);
    if (leaf.node['x-optional']) {
      if (c) optional_covered++;
      else optional_missing.push(leaf.path);
      continue;
    }
    if (c) { covered++; present.push(leaf.path); } else missing.push(leaf.path);
  }
  return {
    total: required.length,
    covered,
    missing,
    optional_total: subset.length - required.length,
    optional_covered,
    optional_missing,
    pct: required.length ? (covered / required.length) * 100 : 100,
  };
}

const primary = score('primary');
const derived = score('derived');

console.log('AISH eligibility schema coverage report');
console.log('---------------------------------------');
console.log(`Document package contains: ${PACKAGE.size} document types${PARTNERED ? ' (partnered: +spouse declaration)' : ''}`);
console.log('');
console.log(`Primary fields (required):  ${primary.covered}/${primary.total} (${primary.pct.toFixed(1)}%)`);
console.log(`Primary fields (optional):  ${primary.optional_covered}/${primary.optional_total} covered`);
console.log(`Derived eligibility checks: ${derived.covered}/${derived.total} computable`);
console.log('');
if (primary.missing.length) {
  console.log('Required primary fields not covered:');
  for (const p of primary.missing) console.log(`  - ${p}`);
  console.log('');
}
if (primary.optional_missing.length) {
  console.log('Optional fields not covered (acceptable):');
  for (const p of primary.optional_missing) console.log(`  - ${p}`);
  console.log('');
}
if (derived.missing.length) {
  console.log('Derived checks whose upstreams are not all covered:');
  for (const p of derived.missing) console.log(`  - ${p}`);
  console.log('');
}

if (primary.pct < 80) {
  console.error(`FAIL: required-field coverage ${primary.pct.toFixed(1)}% < 80% target`);
  process.exit(1);
}
console.log(`PASS: required-field coverage ${primary.pct.toFixed(1)}% >= 80% target`);
