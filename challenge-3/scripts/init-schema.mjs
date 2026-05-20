import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { q, close } from '../../lib/db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(here, '..', 'sql', 'schema.sql');
const sql = await readFile(sqlPath, 'utf8');
await q(sql);

// Seed core subjects (codes mirror Alberta curriculum subject codes).
const SUBJECTS = [
  ['ELA', 'English Language Arts', true],
  ['MAT', 'Mathematics', true],
  ['SCI', 'Science', true],
  ['SOC', 'Social Studies', true],
  ['FLA', 'French Language Arts', false],
  ['PHE', 'Physical Education and Wellness', true],
  ['FNA', 'Fine Arts', false],
  ['CTF', 'Career and Technology Foundations', false],
  ['CTS', 'Career and Technology Studies', false],
];
for (const [code, name, core] of SUBJECTS) {
  await q(
    'INSERT INTO challenge_3.subjects (code, name_en, is_core) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING',
    [code, name, core]
  );
}

const counts = await q(`
  SELECT
    (SELECT count(*) FROM challenge_3.students) AS students,
    (SELECT count(*) FROM challenge_3.subjects) AS subjects,
    (SELECT count(*) FROM challenge_3.grade_history) AS grade_history,
    (SELECT count(*) FROM challenge_3.iep_notes) AS iep_notes
`);
console.log('challenge_3 schema applied. counts:', counts.rows[0]);
await close();
