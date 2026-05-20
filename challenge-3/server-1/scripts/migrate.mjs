// Applies all challenge-3 SQL migrations. Idempotent — safe to re-run.
//
// Order matters: schema.sql (students/subjects/grade_history/iep_notes) ->
// media.sql (media_assets) -> plans.sql (learning_plans/plan_sections/ai_chats).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, close } from '../../../lib/db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(here, '..', '..', 'sql');

const files = ['schema.sql', 'media.sql', 'plans.sql'];

let ok = 0;
for (const f of files) {
  const p = path.join(sqlDir, f);
  const sql = await readFile(p, 'utf8');
  try {
    await q(sql);
    console.log(`[migrate] applied ${f}`);
    ok++;
  } catch (e) {
    console.error(`[migrate] FAILED ${f}: ${e.message}`);
    await close();
    process.exit(1);
  }
}

const counts = await q(`
  SELECT
    (SELECT count(*)::int FROM challenge_3.students) AS students,
    (SELECT count(*)::int FROM challenge_3.subjects) AS subjects,
    (SELECT count(*)::int FROM challenge_3.grade_history) AS grade_history,
    (SELECT count(*)::int FROM challenge_3.iep_notes) AS iep_notes,
    (SELECT count(*)::int FROM challenge_3.media_assets) AS media_assets,
    (SELECT count(*)::int FROM challenge_3.learning_plans) AS learning_plans,
    (SELECT count(*)::int FROM challenge_3.plan_sections) AS plan_sections,
    (SELECT count(*)::int FROM challenge_3.ai_chats) AS ai_chats
`);
console.log(`[migrate] ${ok}/${files.length} migrations ok. counts:`, counts.rows[0]);

await close();
