// Apply challenge-3/sql/media.sql. Idempotent.
//
// Usage: node challenge-3/scripts/init-media.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { q, close } from '../../lib/db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(here, '..', 'sql', 'media.sql');
const sql = await readFile(sqlPath, 'utf8');
await q(sql);

const counts = await q(`
  SELECT
    (SELECT count(*) FROM challenge_3.media_assets) AS media_assets,
    (SELECT count(*) FROM challenge_3.media_assets WHERE kind = 'image') AS images,
    (SELECT count(*) FROM challenge_3.media_assets WHERE kind = 'audio') AS audio
`);
console.log('challenge_3 media schema applied. counts:', counts.rows[0]);
await close();
