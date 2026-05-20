import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

// Load .env regardless of cwd. Search upward from this file's directory; the
// first .env we find wins. Makes scripts run from challenge-N/ pick up the
// repo-root .env without juggling cwd.
(function loadEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const cand = path.join(dir, '.env');
    if (existsSync(cand)) {
      dotenv.config({ path: cand, override: false });
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const cwdEnv = path.join(process.cwd(), '.env');
  if (existsSync(cwdEnv)) dotenv.config({ path: cwdEnv, override: false });
})();

let _pool = null;
export function pool() {
  if (_pool) return _pool;
  const connectionString = process.env.DB_CONNECTION_STRING;
  if (!connectionString) throw new Error('DB_CONNECTION_STRING not set in .env');
  _pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  return _pool;
}

const TRANSIENT_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']);
function isTransient(e) {
  if (!e) return false;
  if (TRANSIENT_CODES.has(e.code)) return true;
  if (TRANSIENT_CODES.has(e?.errors?.[0]?.code)) return true;
  const msg = String(e?.message || e);
  return /getaddrinfo|ENOTFOUND|EAI_AGAIN|connection terminated|server closed the connection/i.test(msg);
}

export async function q(sql, params = []) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await pool().query(sql, params);
    } catch (e) {
      if (attempt <= 5 && isTransient(e)) {
        const wait = 500 * 2 ** (attempt - 1) + Math.random() * 250;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
}

export async function withClient(fn) {
  const client = await pool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function close() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
