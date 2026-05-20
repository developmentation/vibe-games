// Watch challenge-3/sql/*.sql and apply migrations whenever they change.
// Used by `npm run dev:all` alongside the nodemon server-watcher.
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(here, '..', '..', 'sql');
const migrateScript = path.resolve(here, 'migrate.mjs');

let running = false;
let queued = false;

function runMigrate(reason) {
  if (running) { queued = true; return; }
  running = true;
  const start = Date.now();
  console.log(`[migrate-on-change] applying migrations (${reason})`);
  const child = spawn(process.execPath, [migrateScript], { stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`[migrate-on-change] done in ${Date.now() - start}ms (exit ${code})`);
    running = false;
    if (queued) { queued = false; runMigrate('queued change'); }
  });
}

console.log(`[migrate-on-change] watching ${sqlDir}`);
runMigrate('initial');
watch(sqlDir, { persistent: true }, (_event, filename) => {
  if (!filename || !filename.endsWith('.sql')) return;
  runMigrate(`change: ${filename}`);
});
