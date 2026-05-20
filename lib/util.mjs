export function argv(name, def = null) {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i >= 0 && i < process.argv.length - 1) return process.argv[i + 1];
  for (const a of process.argv) {
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return def;
}

export function argInt(name, def) {
  const v = argv(name);
  if (v == null) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export function argFlag(name) {
  return process.argv.includes(`--${name}`);
}

export async function pmap(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (e) {
        out[idx] = { __error: e?.message || String(e) };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export async function retry(fn, { tries = 3, baseMs = 1500 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt < tries) {
        const wait = baseMs * Math.pow(2, attempt - 1) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

const FIRST = ['Liam', 'Noah', 'Olivia', 'Emma', 'Ava', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia',
  'Harper', 'Evelyn', 'Abigail', 'Emily', 'Elizabeth', 'Sofia', 'Madison', 'Avery', 'Ella', 'Scarlett',
  'Grace', 'Chloe', 'Victoria', 'Riley', 'Aria', 'Lily', 'Aubrey', 'Zoey', 'Penelope', 'Lillian',
  'Mason', 'Jacob', 'William', 'Ethan', 'Michael', 'Alexander', 'James', 'Daniel', 'Henry', 'Logan',
  'Jayden', 'Carter', 'Sebastian', 'Mateo', 'Owen', 'Wyatt', 'Lincoln', 'Hudson', 'Levi', 'Asher',
  'Aaliyah', 'Layla', 'Nora', 'Hannah', 'Aurora', 'Savannah', 'Brooklyn', 'Bella', 'Claire', 'Skylar',
  'Diego', 'Santiago', 'Mateusz', 'Jin', 'Wei', 'Aanya', 'Priya', 'Arjun', 'Kaia', 'Nia',
  'Liam', 'Connor', 'Brayden', 'Tyler', 'Caleb', 'Hunter', 'Eli', 'Aaron', 'Charles', 'Andrew',
  'Joseph', 'Thomas', 'Ezra', 'Joshua', 'Christopher', 'Theodore', 'Anthony', 'Isaac', 'Grayson', 'Jack'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez',
  'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore',
  'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez',
  'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen',
  'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Singh', 'Patel', 'Kaur', 'Chen', 'Wang', 'Liu', 'Yang', 'Park',
  'Cardinal', 'Bear', 'Crowchild', 'Healy', 'Letendre', 'Cardinal', 'McMaster', 'Belcourt'];

export function pickName(rng = Math.random) {
  const f = FIRST[Math.floor(rng() * FIRST.length)];
  const l = LAST[Math.floor(rng() * LAST.length)];
  return { first: f, last: l, full: `${f} ${l}` };
}

export function albertaCity(rng = Math.random) {
  const cities = ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'St. Albert', 'Medicine Hat',
    'Grande Prairie', 'Airdrie', 'Spruce Grove', 'Okotoks', 'Cochrane', 'Camrose', 'Beaumont',
    'Stony Plain', 'Sylvan Lake', 'Fort McMurray', 'Lloydminster', 'Brooks', 'High River', 'Wetaskiwin'];
  return cities[Math.floor(rng() * cities.length)];
}

export function albertaPostal(rng = Math.random) {
  const letters = 'TGHJKLNPRSV';
  const L = () => letters[Math.floor(rng() * letters.length)];
  const D = () => Math.floor(rng() * 10);
  return `T${D()}${L()} ${D()}${L()}${D()}`;
}

export function phone(rng = Math.random) {
  const a = ['403', '587', '780', '825'][Math.floor(rng() * 4)];
  const b = String(Math.floor(rng() * 900) + 100);
  const c = String(Math.floor(rng() * 9000) + 1000);
  return `${a}-${b}-${c}`;
}

export function asinNumber(rng = Math.random) {
  let n = '';
  for (let i = 0; i < 9; i++) n += Math.floor(rng() * 10);
  return n;
}
