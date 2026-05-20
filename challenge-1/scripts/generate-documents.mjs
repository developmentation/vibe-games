// Generate 20 AISH-application document images per applicant.
//
// The catalogue mirrors what Alberta AISH (alberta.ca/aish-eligibility) actually
// asks for in a complete intake package: identity, residency, financial, medical
// (including the AISH Medical Report Part A + Part B), and supporting forms.
//
// For each applicant we pre-compute a coherent set of synthetic "facts" (Alberta
// ID number, driver licence number, AHCIP number, SIN, account masks) and inject
// them into every document prompt so the rendered text is consistent across the
// full document set for one person. The facts are stored alongside the image in
// `document_facts` as ground truth for the hackathon agent to validate against
// after OCR.
//
// Usage:
//   node challenge-1/scripts/generate-documents.mjs [--per-applicant 20] [--concurrency 8] [--limit 100]
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { q, close } from '../../lib/db.mjs';
import { generateImage } from '../../lib/openai.mjs';
import { argInt, argFlag, pmap, retry } from '../../lib/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, '..', 'generated');
const SKIP_DISK = argFlag('no-disk');

function safeLabel(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const PER_APPLICANT = argInt('per-applicant', 20);
const CONCURRENCY = argInt('concurrency', 8);
const LIMIT_APPS = argInt('limit', 0); // 0 = all

// ----- synthetic-fact helpers ------------------------------------------------

function rngFor(seed) {
  // Deterministic PRNG so re-runs of the same applicant produce the same facts.
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000; // already unsigned via >>>; no need for & 0xffffffff (which sign-extends in JS)
  };
}
const digits = (rng, n) => Array.from({ length: n }, () => Math.floor(rng() * 10)).join('');
const pickFrom = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function albertaIdNumber(rng) {
  // 9 digits, no dashes (common synthetic format)
  return digits(rng, 9);
}
function dlNumber(rng) {
  // 6 digits dash 6 digits
  return `${digits(rng, 6)}-${digits(rng, 6)}`;
}
function ahcipNumber(rng) {
  // 9 digits, hyphenated XXXXX-XXXX
  return `${digits(rng, 5)}-${digits(rng, 4)}`;
}
function sinNumber(rng) {
  return `${digits(rng, 3)}-${digits(rng, 3)}-${digits(rng, 3)}`;
}
function bankAccount(rng) {
  return `****${digits(rng, 4)}`;
}
function transitNumber(rng) {
  return digits(rng, 5);
}
function passportNumber(rng) {
  const letter = String.fromCharCode(65 + Math.floor(rng() * 26));
  return `${letter}${digits(rng, 7)}`;
}
function rcmpFileNo(rng) {
  return `RCMP-${digits(rng, 7)}`;
}
function caseFileNumber(rng) {
  return `AISH-${digits(rng, 6)}`;
}
function citizenshipStatus(rng) {
  return pickFrom(rng, ['Canadian Citizen', 'Permanent Resident', 'Protected Person (Convention Refugee)']);
}
function physicianName(rng) {
  const firsts = ['Anne', 'Brian', 'Catherine', 'David', 'Emily', 'Farouk', 'Grace', 'Hari', 'Isha', 'Jonas',
    'Kathleen', 'Lucas', 'Maya', 'Nadia', 'Owen', 'Priya', 'Quentin', 'Reema', 'Sara', 'Tarek'];
  const lasts = ['Patel', 'Singh', 'Larsen', 'Wong', 'Mackenzie', 'Hutton', 'Cardinal', 'Khan', 'O\'Connor', 'Tremblay'];
  return `Dr. ${pickFrom(rng, firsts)} ${pickFrom(rng, lasts)}, MD`;
}
function pharmacyName(rng) {
  return pickFrom(rng, ['Rockyview Pharmacy', 'Foothills Drug Mart', 'Northgate Apothecary',
    'Prairie Sky Pharmacy', 'Bow River Rx', 'Chinook Family Pharmacy']);
}
function hospitalName(rng) {
  return pickFrom(rng, ['Rockyview General Hospital', 'Foothills Medical Centre', 'Royal Alexandra Hospital',
    'Misericordia Community Hospital', 'Red Deer Regional Hospital', 'Peter Lougheed Centre']);
}
function bankName(rng) {
  return pickFrom(rng, ['Maple Trust Canada', 'Northern Plains Credit Union', 'Pronghorn Savings & Loan',
    'Buffalo Hills Credit Union', 'Heartland Bank of Canada']);
}
function utilityName(rng) {
  return pickFrom(rng, ['Northstar Power Co-op', 'Prairie Energy Services', 'Chinook Utilities Ltd.',
    'Foothills Electric Co.', 'Rocky Mountain Power']);
}
function landlordName(rng) {
  const firsts = ['Michael', 'Susan', 'David', 'Linda', 'Robert', 'Karen', 'James', 'Patricia'];
  const lasts = ['Thompson', 'Reid', 'McLeod', 'Beaulieu', 'Andersen', 'Krishnan'];
  return `${pickFrom(rng, firsts)} ${pickFrom(rng, lasts)}`;
}

function facts(applicant) {
  const seed = `aish-${applicant.id}-${applicant.first_name}-${applicant.last_name}`;
  const rng = rngFor(seed);
  const balanceChequing = Math.max(20, Math.round((applicant.liquid_assets_cents ?? 0) / 100 * 0.6));
  const balanceSavings = Math.max(0, Math.round((applicant.liquid_assets_cents ?? 0) / 100 * 0.4));
  const monthlyIncomeCAD = Math.round((applicant.monthly_income_cents ?? 0) / 100);
  return {
    full_name: `${applicant.first_name} ${applicant.last_name}`.toUpperCase(),
    full_name_titled: `${applicant.first_name} ${applicant.last_name}`,
    dob: applicant.date_of_birth ? new Date(applicant.date_of_birth).toISOString().slice(0, 10) : null,
    address_line_1: applicant.street_address || '123 Sample Street',
    address_line_2: `${applicant.city || 'Calgary'}, AB ${applicant.postal_code || 'T0A 0A0'}`,
    city: applicant.city || 'Calgary',
    postal_code: applicant.postal_code || 'T0A 0A0',
    phone: applicant.phone || '403-555-0100',
    email: applicant.email,
    alberta_id_number: albertaIdNumber(rng),
    driver_licence_number: dlNumber(rng),
    ahcip_number: ahcipNumber(rng),
    sin_number: sinNumber(rng),
    passport_number: passportNumber(rng),
    citizenship_status: citizenshipStatus(rng),
    case_file_number: caseFileNumber(rng),
    bank_name: bankName(rng),
    bank_chequing_mask: bankAccount(rng),
    bank_savings_mask: bankAccount(rng),
    bank_transit: transitNumber(rng),
    balance_chequing_cad: balanceChequing,
    balance_savings_cad: balanceSavings,
    monthly_income_cad: monthlyIncomeCAD,
    monthly_rent_cad: 800 + Math.floor(rng() * 900),
    utility_account_no: digits(rng, 10),
    utility_provider: utilityName(rng),
    landlord_name: landlordName(rng),
    pharmacy_name: pharmacyName(rng),
    physician_name: physicianName(rng),
    hospital_name: hospitalName(rng),
    medical_condition: applicant.primary_medical_condition || 'Chronic pain syndrome',
    secondary_conditions: (() => { try { return JSON.parse(applicant.secondary_conditions_raw || '[]'); } catch { return []; } })(),
    marital_status: applicant.marital_status || 'single',
    household_size: applicant.household_size ?? 1,
    funct_limits: applicant.functional_limitations || 'Limited mobility and stamina.',
  };
}

// ----- document catalogue ---------------------------------------------------

// Order matters: the first PER_APPLICANT entries that pass the `condition`
// filter for an applicant become that applicant's package. The catalogue is
// ordered so the 20-doc default covers every mandatory AISH input plus the
// signed consent form. Receipts and the spouse declaration sit below 20 and
// only appear when --per-applicant > 20 or when the applicant is partnered.
const ALL_DOCS = [
  // Identity (5)
  { type: 'identity', label: 'Alberta Photo ID Card (front)', condition: 'always',
    fields: ['full_name', 'dob', 'address_line_1', 'address_line_2', 'alberta_id_number'],
    promptFn: (f) => `Synthetic mock Alberta photo identification card, front side, flat top-down scan. Government-of-Alberta colour palette and layout. Photo placeholder is a neutral grey silhouette (no real face). Watermark: "SAMPLE - NOT VALID" diagonally. The card MUST clearly display these exact fields:
- Name: ${f.full_name}
- DOB: ${f.dob}
- Address: ${f.address_line_1}, ${f.address_line_2}
- ID #: ${f.alberta_id_number}
- Expires: 2029-12-31
Crisp printed text, no decorative typography.` },

  { type: 'identity', label: 'Alberta Driver Licence (front)', condition: 'always',
    fields: ['full_name', 'dob', 'driver_licence_number', 'address_line_1', 'address_line_2'],
    promptFn: (f) => `Synthetic mock Alberta driver licence card, front side, flat scan. Alberta Registries visual style. Big diagonal watermark "SPECIMEN". Photo silhouette only. The card MUST show these exact fields, legibly printed:
- Name: ${f.full_name_titled}
- DOB: ${f.dob}
- Licence #: ${f.driver_licence_number}
- Address: ${f.address_line_1}, ${f.address_line_2}
- Class: 5
- Expires: 2028-04-30` },

  { type: 'identity', label: 'Canadian Birth Certificate', condition: 'always',
    fields: ['full_name', 'dob'],
    promptFn: (f) => `Synthetic mock Canadian provincial birth certificate (paper format), flat scan. Big diagonal watermark "SAMPLE". Visible fields:
- Name at birth: ${f.full_name_titled}
- Date of birth: ${f.dob}
- Place of birth: Alberta, Canada
- Registration number: ${digits(rngFor('br-' + f.alberta_id_number), 9)}
- Date of issue: 2024-08-12` },

  { type: 'identity', label: 'AHCIP Card', condition: 'always',
    fields: ['full_name', 'ahcip_number', 'dob'],
    promptFn: (f) => `Synthetic mock Alberta Health Care Insurance Plan (AHCIP) card, flat scan. Plain card stock with the AHCIP wording. Watermark "SAMPLE - NOT VALID". Visible fields:
- Name: ${f.full_name_titled}
- Personal Health Number: ${f.ahcip_number}
- Date of Birth: ${f.dob}` },

  { type: 'identity', label: 'Citizenship or Immigration Document', condition: 'always',
    fields: ['full_name', 'dob', 'citizenship_status'],
    promptFn: (f) => `Synthetic mock Canadian citizenship or immigration document page (depending on status). Government of Canada style with prominent "SAMPLE - SYNTHETIC" banner. Visible fields:
- Name: ${f.full_name_titled}
- Date of birth: ${f.dob}
- Status: ${f.citizenship_status}
- Document number: ${f.passport_number}
- Date of issue: 2022-06-15` },

  // Residency (2)
  { type: 'residency', label: 'Utility Bill (electricity)', condition: 'always',
    fields: ['full_name', 'address_line_1', 'address_line_2', 'utility_account_no', 'utility_provider'],
    promptFn: (f) => `Scanned residential electricity utility bill, one page. Provider letterhead: "${f.utility_provider}". Visible printed fields:
- Account holder: ${f.full_name_titled}
- Service address: ${f.address_line_1}, ${f.address_line_2}
- Account number: ${f.utility_account_no}
- Billing period: 2026-03-15 to 2026-04-14
- Total due: $${(120 + Math.floor(Math.random() * 80)).toFixed(2)}
Realistic typewritten layout. Clearly fictional company.` },

  { type: 'residency', label: 'Residential Lease Agreement (page 1)', condition: 'always',
    fields: ['full_name', 'address_line_1', 'address_line_2', 'landlord_name', 'monthly_rent_cad'],
    promptFn: (f) => `Scanned first page of a residential lease agreement (Alberta tenancy). Plain letterhead. Visible printed fields:
- Tenant: ${f.full_name_titled}
- Landlord: ${f.landlord_name}
- Premises: ${f.address_line_1}, ${f.address_line_2}
- Monthly rent: $${f.monthly_rent_cad}.00 CAD
- Start date: 2025-09-01
- End date: 2026-08-31
Standard tenancy clauses partially visible below. Clearly a sample document.` },

  // Financial (4-5)
  { type: 'financial', label: 'Bank Statement (chequing)', condition: 'always',
    fields: ['full_name', 'bank_name', 'bank_chequing_mask', 'balance_chequing_cad'],
    promptFn: (f) => `Scanned monthly bank statement, single page, chequing account. Bank letterhead: "${f.bank_name}". Visible printed fields:
- Account holder: ${f.full_name_titled}
- Account number: ${f.bank_chequing_mask}
- Transit: ${f.bank_transit}
- Statement period: 2026-04-01 to 2026-04-30
- Opening balance: $${(f.balance_chequing_cad - 250).toFixed(2)}
- Closing balance: $${f.balance_chequing_cad.toFixed(2)}
A short tabular list of 6-10 transactions, small amounts.` },

  { type: 'financial', label: 'Bank Statement (savings)', condition: 'always',
    fields: ['full_name', 'bank_name', 'bank_savings_mask', 'balance_savings_cad'],
    promptFn: (f) => `Scanned monthly bank statement, savings account. Bank letterhead: "${f.bank_name}". Visible printed fields:
- Account holder: ${f.full_name_titled}
- Account number: ${f.bank_savings_mask}
- Statement period: 2026-04-01 to 2026-04-30
- Closing balance: $${f.balance_savings_cad.toFixed(2)}
Minimal activity, two or three interest credits.` },

  { type: 'financial', label: 'CRA Notice of Assessment', condition: 'always',
    fields: ['full_name', 'sin_number', 'monthly_income_cad'],
    promptFn: (f) => `Synthetic Canada Revenue Agency Notice of Assessment for tax year 2025. CRA-style header but with a "SAMPLE - SYNTHETIC" banner across the page. Visible printed fields:
- Name: ${f.full_name_titled}
- SIN: ${f.sin_number}
- Tax year: 2025
- Total income: $${(f.monthly_income_cad * 12).toFixed(2)}
- Tax payable: $${(f.monthly_income_cad * 12 * 0.05).toFixed(2)}
- Refund or balance: $0.00
One page summary, plain.` },

  { type: 'financial', label: 'Pay Stub or Income Slip', condition: 'always',
    fields: ['full_name', 'monthly_income_cad'],
    promptFn: (f) => `Synthetic bi-weekly pay stub from an Alberta employer "Riverbend Services Ltd." (fictional). Visible printed fields:
- Employee name: ${f.full_name_titled}
- Pay period: 2026-04-14 to 2026-04-27
- Hours: ${(Math.random() * 40 + 10).toFixed(2)}
- Gross pay: $${(f.monthly_income_cad / 2).toFixed(2)}
- Net pay: $${(f.monthly_income_cad / 2 * 0.85).toFixed(2)}
- YTD income: $${(f.monthly_income_cad * 4).toFixed(2)}
Plain tabular layout. Clearly a sample.` },

  { type: 'financial', label: 'Direct Deposit Authorization Form', condition: 'always',
    fields: ['full_name', 'bank_name', 'bank_chequing_mask', 'bank_transit'],
    promptFn: (f) => `Synthetic blank direct-deposit authorization form filled in by hand and by typed fields. Government-of-Alberta form layout with "SAMPLE - SYNTHETIC" banner. Visible fields:
- Account holder: ${f.full_name_titled}
- Financial institution: ${f.bank_name}
- Transit number: ${f.bank_transit}
- Institution number: 005
- Account number: ${f.bank_chequing_mask}
- Signature: scripted placeholder above the printed name.` },

  // Medical (6)
  { type: 'medical', label: 'AISH Medical Report Part A (Applicant)', condition: 'always',
    fields: ['full_name', 'dob', 'medical_condition', 'funct_limits'],
    promptFn: (f) => `Synthetic AISH Medical Report Part A (the applicant section), one page. Government of Alberta form style with "SAMPLE - SYNTHETIC" banner. Filled in by hand. Visible fields:
- Applicant name: ${f.full_name_titled}
- Date of birth: ${f.dob}
- Primary condition: ${f.medical_condition}
- Functional limitations described: ${f.funct_limits}
- Signature placeholder at the bottom.` },

  { type: 'medical', label: 'AISH Medical Report Part B (Physician)', condition: 'always',
    fields: ['full_name', 'dob', 'medical_condition', 'physician_name'],
    promptFn: (f) => `Synthetic AISH Medical Report Part B (the physician section), one page. Government of Alberta form style with "SAMPLE - SYNTHETIC" banner. Visible fields:
- Patient name: ${f.full_name_titled}
- Date of birth: ${f.dob}
- Primary medical condition: ${f.medical_condition}
- Prognosis: chronic, permanent.
- Physician name: ${f.physician_name}
- College of Physicians and Surgeons of Alberta ID: ${digits(rngFor(f.physician_name), 5)}
- Date signed: 2026-04-22` },

  { type: 'medical', label: 'Specialist Consultation Report', condition: 'always',
    fields: ['full_name', 'medical_condition', 'physician_name'],
    promptFn: (f) => `Synthetic specialist consultation report on plain letterhead. Sections labelled: HISTORY, EXAMINATION, IMPRESSION, RECOMMENDATIONS. Patient: ${f.full_name_titled}. Condition referenced throughout: ${f.medical_condition}. Consultant: ${f.physician_name}. Faint "SAMPLE" in header. One page.` },

  { type: 'medical', label: 'Pharmacy Prescription Record', condition: 'always',
    fields: ['full_name', 'pharmacy_name', 'medical_condition'],
    promptFn: (f) => `Synthetic pharmacy prescription record from "${f.pharmacy_name}", showing dispensed medications over the last 90 days. Patient: ${f.full_name_titled}. Three medications listed with dosage and prescriber. Medications consistent with the condition: ${f.medical_condition}. Plain tabular layout. Sample watermark faint.` },

  { type: 'medical', label: 'Lab Results Page', condition: 'always',
    fields: ['full_name', 'medical_condition'],
    promptFn: (f) => `Synthetic laboratory blood work results, one page, Canadian lab format. Patient: ${f.full_name_titled}. Standard CBC + biochemistry panel, 12-15 rows with values and reference ranges. Several values flagged abnormal in a way consistent with ${f.medical_condition}. Sample watermark.` },

  // Benefits and supports (2)
  { type: 'benefits', label: 'CPP-D / EI Decision Letter', condition: 'always',
    fields: ['full_name', 'case_file_number'],
    promptFn: (f) => `Synthetic decision letter from Service Canada (Canada Pension Plan Disability), one page, formal letterhead. Addressed to ${f.full_name_titled} at the applicant address. Case file: ${f.case_file_number}. Outcome paragraph indicates either approval or denial; if denial, lists appeal process. Prominent "SAMPLE - SYNTHETIC".` },

  { type: 'benefits', label: 'Income Support Status Letter', condition: 'always',
    fields: ['full_name', 'case_file_number'],
    promptFn: (f) => `Synthetic letter from Alberta Income and Employment Supports outlining current Income Support benefit status for ${f.full_name_titled}. Case file: ${f.case_file_number}. Government-of-Alberta letterhead with "SAMPLE - SYNTHETIC" banner across it. One page.` },

  // Consent — mandatory for AISH intake, kept in the core 20.
  { type: 'consent', label: 'Signed AISH Consent and Authorization Form', condition: 'always',
    fields: ['full_name', 'dob', 'case_file_number'],
    promptFn: (f) => `Synthetic signed AISH Consent and Authorization Form. Government-of-Alberta style with "SAMPLE - SYNTHETIC" banner. Filled fields:
- Applicant name: ${f.full_name_titled}
- Date of birth: ${f.dob}
- Case file: ${f.case_file_number}
- Signature: scripted placeholder line above the printed name.
- Date signed: 2026-04-25.` },

  // Optional expense receipts (positions 21+, only generated when per-applicant > 20).
  { type: 'expenses', label: 'Receipt for Medication', condition: 'always',
    fields: ['full_name', 'pharmacy_name'],
    promptFn: (f) => `Synthetic pharmacy receipt (thermal paper look) from "${f.pharmacy_name}" for an out-of-pocket prescription. Customer: ${f.full_name_titled}. Single drug line + total in CAD. Small receipt aspect ratio.` },

  { type: 'expenses', label: 'Receipt for Assistive Device', condition: 'always',
    fields: ['full_name'],
    promptFn: (f) => `Synthetic retail receipt from "Western Mobility Supply" (fictional) for an assistive device (mobility aid, hearing aid, or glasses). Customer: ${f.full_name_titled}. Itemized lines, GST line, total in CAD. Clearly a sample.` },

  // Spousal (conditional)
  { type: 'spousal', label: 'Spouse/Partner Financial Declaration', condition: 'partnered',
    fields: ['full_name', 'marital_status'],
    promptFn: (f) => `Synthetic Spouse/Partner Financial Declaration form (Government of Alberta style, "SAMPLE - SYNTHETIC" banner). Header references the applicant ${f.full_name_titled} (marital status: ${f.marital_status}). Spouse name, SIN, employer, and income filled in. Filled by typewriter, signature placeholder at the bottom.` },
];

function pickCatalogueFor(applicant) {
  const partnered = ['married', 'common_law', 'separated'].includes((applicant.marital_status || '').toLowerCase());
  const eligible = ALL_DOCS.filter((d) => {
    if (d.condition === 'always') return true;
    if (d.condition === 'partnered') return partnered;
    return true;
  });
  return eligible.slice(0, PER_APPLICANT);
}

// ----- runner ---------------------------------------------------------------

const applicantsRes = await q(
  LIMIT_APPS > 0
    ? `SELECT id, first_name, last_name, city, postal_code, street_address, phone, email,
              date_of_birth, marital_status, household_size,
              monthly_income_cents, liquid_assets_cents,
              primary_medical_condition,
              secondary_conditions::text AS secondary_conditions_raw,
              functional_limitations
       FROM challenge_1.applicants ORDER BY id LIMIT $1`
    : `SELECT id, first_name, last_name, city, postal_code, street_address, phone, email,
              date_of_birth, marital_status, household_size,
              monthly_income_cents, liquid_assets_cents,
              primary_medical_condition,
              secondary_conditions::text AS secondary_conditions_raw,
              functional_limitations
       FROM challenge_1.applicants ORDER BY id`,
  LIMIT_APPS > 0 ? [LIMIT_APPS] : []
);
const applicants = applicantsRes.rows;
console.log(`applicants in scope: ${applicants.length}`);

const existingRes = await q('SELECT applicant_id, document_label FROM challenge_1.documents');
const have = new Set(existingRes.rows.map((r) => `${r.applicant_id}::${r.document_label}`));

const work = [];
for (const a of applicants) {
  const catalogue = pickCatalogueFor(a);
  const f = facts(a);
  for (const d of catalogue) {
    const key = `${a.id}::${d.label}`;
    if (have.has(key)) continue;
    work.push({ applicant: a, doc: d, factsFor: f });
  }
}
console.log(`work units to generate: ${work.length} (skipping ${applicants.length * PER_APPLICANT - work.length} already present)`);

let done = 0;
let failed = 0;
const start = Date.now();
const log = () => {
  const elapsed = (Date.now() - start) / 1000;
  const rate = (done / Math.max(1, elapsed)).toFixed(2);
  const eta = ((work.length - done) / (done / Math.max(1, elapsed) || 1)).toFixed(0);
  process.stdout.write(`\r[${done}/${work.length}] failed=${failed} rate=${rate}/s eta=${eta}s   `);
};

await pmap(work, CONCURRENCY, async (unit) => {
  try {
    const prompt = unit.doc.promptFn(unit.factsFor);
    const fullPrompt = `${prompt}

Output style: top-down flat scan of a document. Plain printed text rendered clearly so the fields above are legible. No photographic faces, no emoji, no decorative typography. The document is for a synthetic AISH application sandbox; "SAMPLE" or "SAMPLE - SYNTHETIC" should appear somewhere visible. No real-person likenesses.`;
    const buf = await retry(
      () => generateImage({ prompt: fullPrompt, size: '1024x1024', quality: 'low' }),
      { tries: 3, baseMs: 2000 }
    );
    const factsSlice = {};
    for (const k of unit.doc.fields || []) factsSlice[k] = unit.factsFor[k];
    if (!SKIP_DISK) {
      const appDir = path.join(OUT_DIR, String(unit.applicant.id));
      await mkdir(appDir, { recursive: true });
      const file = path.join(appDir, `${safeLabel(unit.doc.label)}.png`);
      await writeFile(file, buf);
    }
    await q(
      `INSERT INTO challenge_1.documents
         (applicant_id, document_type, document_label, mime_type, byte_size, content,
          generation_prompt, generation_model, document_facts, status)
       VALUES ($1,$2,$3,'image/png',$4,$5,$6,$7,$8,'received')
       ON CONFLICT (applicant_id, document_label) DO NOTHING`,
      [
        unit.applicant.id,
        unit.doc.type,
        unit.doc.label,
        buf.length,
        buf,
        fullPrompt.slice(0, 4000),
        process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        JSON.stringify(factsSlice),
      ]
    );
    done++;
    log();
  } catch (e) {
    failed++;
    done++;
    process.stdout.write(`\n[error applicant=${unit.applicant.id} label="${unit.doc.label}"] ${e.message}\n`);
    log();
  }
});

process.stdout.write('\n');
const final = await q(`SELECT count(*)::int AS n, sum(byte_size)::bigint AS bytes FROM challenge_1.documents`);
console.log(`documents total=${final.rows[0].n}, bytes=${final.rows[0].bytes}`);
await close();
