/**
 * One-time seed of the Supabase backend from the local JSON store.
 * Refuses to run against non-empty tables. Reads the same db_store.json
 * the Firestore seed uses (reset it locally first for a pristine seed).
 * Passwords must already be bcrypt hashes (as stored); the adapter hashes
 * only plaintext passwords supplied at runtime, so pass records through.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const tables = ['salons', 'bookings', 'reviews', 'users'] as const;
type Table = (typeof tables)[number];

interface RecordWithId {
  id: string;
  [key: string]: unknown;
}

function requireRecords(value: unknown, table: Table): RecordWithId[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${table} to be an array`);
  const seen = new Set<string>();
  return value.map((record: unknown, index: number) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`Invalid ${table}[${index}]`);
    }
    const { id } = record as RecordWithId;
    if (typeof id !== 'string' || !id || seen.has(id)) {
      throw new Error(`Missing, duplicate, or invalid ID in ${table}[${index}]`);
    }
    seen.add(id);
    return record as RecordWithId;
  });
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Refusing seed: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const source = fileURLToPath(new URL('../db_store.json', import.meta.url));
  const raw: unknown = JSON.parse(await readFile(source, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid JSON store');
  const data = raw as Record<string, unknown>;
  const records = Object.fromEntries(
    tables.map(name => [name, requireRecords(data[name], name)]),
  ) as Record<Table, RecordWithId[]>;
  if (!records.salons.length) throw new Error('Refusing empty catalog seed');

  const claims = new Map<string, string>();
  for (const user of records.users) {
    if (
      typeof user.email !== 'string' || !user.email.trim() ||
      typeof user.password !== 'string' || !/^\$2[aby]\$\d{2}\$/.test(user.password)
    ) {
      throw new Error(`User ${user.id} must have an email and a bcrypt password hash`);
    }
    const email = user.email.trim().toLowerCase();
    if (claims.has(email)) throw new Error(`Duplicate user email: ${email}`);
    claims.set(email, user.id);
    user.email = email;
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const name of [...tables, 'user_emails', 'review_claims'] as const) {
    const probe = await db.from(name).select('*', { count: 'exact', head: true });
    if (probe.error) throw new Error(`Seed preflight failed on ${name}: ${probe.error.message}`);
    if ((probe.count ?? 0) > 0) {
      throw new Error(`Refusing seed: ${name} is not empty. Empty the tables first.`);
    }
  }

  const insertAll = async (table: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return;
    const { error } = await db.from(table).insert(rows);
    if (error) throw new Error(`Seed insert into ${table} failed: ${error.message}`);
  };
  await insertAll('salons', records.salons.map(record => ({ id: record.id, data: record })));
  await insertAll(
    'bookings',
    records.bookings.map(record => ({
      id: record.id,
      salon_id: record.salonId,
      client_email: record.clientEmail,
      data: record,
    })),
  );
  await insertAll(
    'reviews',
    records.reviews.map(record => ({ id: record.id, salon_id: record.salonId, data: record })),
  );
  await insertAll(
    'users',
    records.users.map(record => ({ id: record.id, email: record.email, data: record })),
  );
  await insertAll(
    'user_emails',
    [...claims].map(([email, userId]) => ({
      email_key: createHash('sha256').update(email).digest('hex'),
      user_id: userId,
    })),
  );
  console.log(
    `Seeded ${tables.map(name => `${records[name].length} ${name}`).join(', ')} and ${claims.size} email claims into Supabase.`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
