// What's actually in challenge_3 schema? Don't trust assumptions.
import { q, close } from '../../lib/db.mjs';

try {
  const tables = await q(`SELECT table_name FROM information_schema.tables
    WHERE table_schema='challenge_3' ORDER BY table_name`);
  console.log('challenge_3 tables:');
  for (const t of tables.rows) console.log('  ' + t.table_name);

  for (const t of tables.rows) {
    const cols = await q(`SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='challenge_3' AND table_name=$1 ORDER BY ordinal_position`, [t.table_name]);
    console.log(`\nchallenge_3.${t.table_name}:`);
    cols.rows.forEach(c => console.log('  ' + c.column_name.padEnd(28) + c.data_type));
  }
} finally {
  await close();
}
