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

const tables = ['leish_salons', 'leish_bookings', 'leish_reviews', 'leish_users'] as const;
type Table = (typeof tables)[number];

/** Table name → matching key in db_store.json (JSON keys are unprefixed). */
const jsonKey = (table: Table): string => {
  switch (table) {
    case 'leish_salons': return 'salons';
    case 'leish_bookings': return 'bookings';
    case 'leish_reviews': return 'reviews';
    case 'leish_users': return 'users';
  }
};

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
    tables.map(name => [name, requireRecords(data[jsonKey(name)], name)]),
  ) as Record<Table, RecordWithId[]>;
  if (!records.leish_users.length) throw new Error('Refusing seed: no users to bootstrap');

  const claims = new Map<string, string>();
  for (const user of records.leish_users) {
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
  for (const name of [...tables, 'leish_user_emails', 'leish_review_claims'] as const) {
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
  await insertAll('leish_salons', records.leish_salons.map(record => ({ id: record.id, data: record })));
  await insertAll(
    'leish_bookings',
    records.leish_bookings.map(record => ({
      id: record.id,
      salon_id: record.salonId,
      client_email: record.clientEmail,
      created_at: record.createdAt,
      staff_id: record.staffId,
      booking_date: record.date,
      status: record.status,
      starts_at: record.createdAt,
      ends_at: record.createdAt,
      data: record,
    })),
  );
  await insertAll(
    'leish_reviews',
    records.leish_reviews.map(record => ({ id: record.id, salon_id: record.salonId, date: record.createdAt, data: record })),
  );
  await insertAll(
    'leish_users',
    records.leish_users.map(record => ({ id: record.id, email: record.email, data: record })),
  );
  await insertAll(
    'leish_user_emails',
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
