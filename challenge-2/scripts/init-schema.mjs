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
    (SELECT count(*) FROM challenge_2.customers) AS customers,
    (SELECT count(*) FROM challenge_2.tickets)   AS tickets,
    (SELECT count(*) FROM challenge_2.ticket_messages) AS ticket_messages
`);
console.log('challenge_2 schema applied. counts:', counts.rows[0]);
await close();
