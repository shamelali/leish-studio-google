/** Explicit, one-time import of the local JSON development store into an empty emulator. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'leish-local';
const collections = ['salons', 'bookings', 'reviews', 'users'] as const;
type Collection = typeof collections[number];
type RecordWithId = { id: string; [key: string]: unknown };

function requireRecords(value: unknown, collection: Collection): RecordWithId[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${collection} to be an array`);
  const ids = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid ${collection}[${index}]`);
    }
    const record = item as RecordWithId;
    if (typeof record.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(record.id) || ids.has(record.id)) {
      throw new Error(`Missing, duplicate, or invalid ID in ${collection}[${index}]`);
    }
    ids.add(record.id);
    return record;
  });
}

async function main() {
  // Check the destination BEFORE reading any data or initializing the Admin SDK.
  // No ADC, service account, or production project is ever used by this script.
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const [host, portText] = emulatorHost?.split(':') ?? [];
  const port = Number(portText);
  const isLoopbackEmulator = host === '127.0.0.1' && Number.isInteger(port) && port > 0 && port <= 65535;
  if (!isLoopbackEmulator || process.env.FIREBASE_PROJECT_ID !== PROJECT_ID) {
    throw new Error(`Refusing seed: set FIRESTORE_EMULATOR_HOST=127.0.0.1:<port> and FIREBASE_PROJECT_ID=${PROJECT_ID}`);
  }
  if (process.argv.length !== 2) throw new Error('Seed takes no arguments');

  const source = fileURLToPath(new URL('../db_store.json', import.meta.url));
  const raw: unknown = JSON.parse(await readFile(source, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid JSON store');
  const data = raw as Record<string, unknown>;
  const records = Object.fromEntries(collections.map(name => [name, requireRecords(data[name], name)])) as Record<Collection, RecordWithId[]>;
  if (!records.salons.length) throw new Error('Refusing empty catalog seed');

  // The adapter uses a hashed normalized-email claim for uniqueness/lookups.
  const claims = new Map<string, string>();
  for (const user of records.users) {
    if (typeof user.email !== 'string' || !user.email.trim() ||
        typeof user.password !== 'string' || !/^\$2[aby]\$\d{2}\$/.test(user.password)) {
      throw new Error(`User ${user.id} must have an email and a bcrypt password hash`);
    }
    const email = user.email.trim().toLowerCase();
    if (claims.has(email)) throw new Error(`Duplicate user email: ${email}`);
    claims.set(email, user.id);
    user.email = email;
  }

  const app = initializeApp({ projectId: PROJECT_ID }, `local-seed-${process.pid}`);
  try {
    const db = getFirestore(app);
    for (const name of [...collections, 'userEmails']) {
      if (!(await db.collection(name).limit(1).get()).empty) {
        throw new Error(`Refusing seed: ${name} is not empty. Start with a fresh emulator (no import).`);
      }
    }

    // A single atomic commit: either every entity and email claim is present or none are.
    const batch = db.batch();
    for (const name of collections) {
      for (const record of records[name]) batch.create(db.collection(name).doc(record.id), record);
    }
    for (const [email, userId] of claims) {
      const key = createHash('sha256').update(email).digest('hex');
      batch.create(db.collection('userEmails').doc(key), { userId });
    }
    await batch.commit();
    console.log(`Seeded ${collections.map(name => `${records[name].length} ${name}`).join(', ')} and ${claims.size} email claims into ${PROJECT_ID} emulator.`);
  } finally {
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
