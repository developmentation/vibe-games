import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { q, close } from '../../lib/db.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(here, '..', 'sql', 'schema.sql');

const sql = await readFile(sqlPath, 'utf8');
await q(sql);

const counts = await q(`
  SELECT
    (SELECT count(*) FROM challenge_1.applicants) AS applicants,
    (SELECT count(*) FROM challenge_1.documents)  AS documents,
    (SELECT count(*) FROM challenge_1.review_queue) AS review_queue
`);
console.log('challenge_1 schema applied. counts:', counts.rows[0]);
await close();
