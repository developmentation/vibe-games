// One-off probe: confirm the read-only Alberta curriculum DB schema is what
// PROMPT.md says it is. Safe to delete after the agent contract is wired.
import pg from 'pg';
const { Pool } = pg;

const URL = 'postgresql://alberta_curriculum_extraction_f1c24832_user:fak2nVuDfnFRWM4oIwlvvUxnSQpcCQN5@dpg-d7n3fcho3t8c73ef5eqg-b.replica-cyan.oregon-postgres.render.com/alberta_curriculum_extraction_f1c24832';

const pool = new Pool({ connectionString: URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20_000 });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;

try {
  const tables = await q(`SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_schema IN ('phase1','phase2') ORDER BY 1,2`);
  console.log('TABLES:');
  for (const t of tables) console.log('  ' + t.table_schema + '.' + t.table_name);

  const cols = async (schema, table) => q(`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [schema, table]);

  for (const [s, t] of [['phase1','subjects'],['phase1','grades'],['phase1','curriculum_nodes'],['phase2','curriculum_nodes_normalized']]) {
    const c = await cols(s, t);
    if (c.length === 0) { console.log(`\n(no table ${s}.${t})`); continue; }
    console.log(`\n${s}.${t}:`);
    c.forEach(x => console.log('  ' + x.column_name.padEnd(28) + x.data_type));
  }

  const subj = await q(`SELECT code, name_en FROM phase1.subjects ORDER BY code LIMIT 25`);
  console.log('\nphase1.subjects sample:');
  subj.forEach(s => console.log('  ' + s.code.padEnd(10) + s.name_en));

  const grades = await q(`SELECT code, name_en, sort_order FROM phase1.grades ORDER BY sort_order LIMIT 20`);
  console.log('\nphase1.grades:');
  grades.forEach(g => console.log('  ' + String(g.sort_order).padStart(2) + '  ' + g.code.padEnd(6) + g.name_en));

  const counts = await q(`SELECT count(*)::int AS n_nodes FROM phase1.curriculum_nodes`);
  console.log('\nphase1.curriculum_nodes count:', counts[0].n_nodes);

  const matSample = await q(`SELECT * FROM phase1.curriculum_nodes
    WHERE subject_code = 'MAT' LIMIT 3`);
  console.log('\nsample MAT rows:');
  matSample.forEach(r => console.log('  ' + JSON.stringify(r).slice(0, 600)));

  const distinctSubj = await q(`SELECT DISTINCT subject_code FROM phase1.curriculum_nodes ORDER BY 1`);
  console.log('\ndistinct subject_codes in curriculum_nodes:', distinctSubj.map(r => r.subject_code).join(', '));

  const courseSample = await q(`SELECT DISTINCT course_code FROM phase1.curriculum_nodes
    WHERE subject_code IN ('MAT','ELA','LANENG','SCI','SSCHIS','PDEPHY','HEALTH','PDE') ORDER BY 1`);
  console.log('distinct course_codes for core subjects:', courseSample.map(r => r.course_code).join(', '));

  const typeCounts = await q(`SELECT type_code, count(*)::int AS n FROM phase1.curriculum_nodes
    GROUP BY type_code ORDER BY n DESC`);
  console.log('\ntype_code histogram:'); typeCounts.forEach(t => console.log('  ' + t.type_code.padEnd(10) + t.n));

  const ela = await q(`SELECT code, course_code, type_code, content_en
    FROM phase1.curriculum_nodes
    WHERE subject_code = 'LANENG' AND course_code = 'LANENG4'
      AND content_en IS NOT NULL AND length(content_en) > 0
    ORDER BY sort_order LIMIT 5`);
  console.log('\nLANENG4 (Grade 4 ELA) samples:');
  ela.forEach(r => console.log('  ' + r.code.padEnd(40) + (r.type_code || '').padEnd(8) + (r.content_en || '').slice(0, 140)));

  const p2cnt = await q(`SELECT count(*)::int AS n FROM phase2.curriculum_nodes_normalized`);
  console.log('\nphase2.curriculum_nodes_normalized count:', p2cnt[0].n);
} catch (e) {
  console.error('PROBE FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
