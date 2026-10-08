/** Local institutional state. SQLite serializes writers; no external effect occurs in a transaction. */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { canonicalize } from './integrity.mjs';

const GENESIS = 'sha256:' + '0'.repeat(64);
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const hash = (value) =>
  'sha256:' + createHash('sha256').update(canonicalize(value)).digest('hex');
const clone = (value) => JSON.parse(canonicalize(value));
const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};
export function initialInstitutionState() {
  return {
    version: 0,
    events: [],
    proofs: {},
    admissions: {},
    authorities: {},
    revocationEpochs: {},
    actions: {},
    budgets: {},
    incidents: [],
    knowledge: {},
    stopped: false,
  };
}

export function openStore(
  filename,
  { initialState = initialInstitutionState(), expectedCheckpoint } = {}
) {
  if (filename !== ':memory:')
    mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  if (filename !== ':memory:') {
    let stat;
    try {
      stat = lstatSync(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stat && (!stat.isFile() || stat.isSymbolicLink()))
      fail(
        'STORE_PATH_UNSAFE',
        'Institution state must be a regular operator-owned file, never a symlink.'
      );
  }
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;'
  );
  db.exec(`CREATE TABLE IF NOT EXISTS institution (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, head TEXT NOT NULL, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chronicle (version INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, previous TEXT NOT NULL, digest TEXT NOT NULL, entry TEXT NOT NULL);`);
  const genesisState = clone({ ...initialState, version: 0 });
  db.prepare('INSERT OR IGNORE INTO institution VALUES (1,0,?,?)').run(
    GENESIS,
    canonicalize(genesisState)
  );
  // Genesis is retained separately so a clean export can replay from the same state.
  db.exec(
    'CREATE TABLE IF NOT EXISTS genesis (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)'
  );
  db.prepare('INSERT OR IGNORE INTO genesis VALUES (1,?)').run(
    canonicalize(genesisState)
  );
  let busy = false;
  const head = () => {
    const row = db
      .prepare('SELECT version, head FROM institution WHERE id=1')
      .get();
    return { version: row.version, head: row.head };
  };
  const read = () =>
    JSON.parse(
      db.prepare('SELECT state FROM institution WHERE id=1').get().state
    );
  const entries = () =>
    db
      .prepare('SELECT entry FROM chronicle ORDER BY version')
      .all()
      .map((row) => JSON.parse(row.entry));
  function verify(checkpoint = expectedCheckpoint) {
    let state = JSON.parse(
      db.prepare('SELECT state FROM genesis WHERE id=1').get().state
    );
    let previous = GENESIS;
    let version = 0;
    for (const row of db
      .prepare('SELECT * FROM chronicle ORDER BY version')
      .all()) {
      const entry = JSON.parse(row.entry);
      if (
        row.version !== ++version ||
        entry.version !== version ||
        row.previous !== previous ||
        entry.previous !== previous ||
        row.event_id !== entry.eventId ||
        hash(entry) !== row.digest
      )
        fail(
          'CHRONICLE_TAMPERED',
          'Chronicle sequence, content or digest does not verify.'
        );
      if (
        entry.before !== hash(state) ||
        entry.after !== hash(entry.state) ||
        entry.state.version !== version
      )
        fail(
          'CHRONICLE_TAMPERED',
          'Chronicle state transition does not verify.'
        );
      state = entry.state;
      previous = row.digest;
    }
    const current = head();
    if (
      current.version !== version ||
      current.head !== previous ||
      hash(read()) !== hash(state)
    )
      fail(
        'CHRONICLE_TAMPERED',
        'Materialized state disagrees with Chronicle replay.'
      );
    if (
      checkpoint &&
      (checkpoint.version !== version || checkpoint.head !== previous)
    )
      fail(
        'CHECKPOINT_MISMATCH',
        'Stored Chronicle differs from the independently retained latest checkpoint. Reconcile before operating.'
      );
    return {
      valid: true,
      version,
      head: previous,
      state: clone(state),
      checkpointVerified: Boolean(checkpoint),
    };
  }
  function transact(
    mutator,
    {
      expectedVersion,
      eventId = randomUUID(),
      actor = 'local-operator',
      reason = 'institution transition',
    } = {}
  ) {
    if (busy)
      fail('TRANSACTION_REENTRANT', 'Nested transactions are not permitted.');
    if (typeof mutator !== 'function' || !eventId || !actor || !reason)
      fail(
        'SCHEMA_INVALID',
        'A mutation, actor, reason and event identifier are required.'
      );
    busy = true;
    try {
      db.exec('BEGIN IMMEDIATE');
      const current = head();
      if (
        expectedVersion !== undefined &&
        expectedVersion !== null &&
        expectedVersion !== current.version
      )
        fail(
          'VERSION_CONFLICT',
          'Reload current institution version before changing it.'
        );
      if (db.prepare('SELECT 1 FROM chronicle WHERE event_id=?').get(eventId))
        fail('EVENT_REPLAY', 'This event identifier was already committed.');
      const previous = read();
      const draft = clone(previous);
      const result = mutator(draft);
      if (result && typeof result.then === 'function')
        fail(
          'ASYNC_TRANSACTION',
          'Perform I/O outside the state transaction; reserve dispatch first.'
        );
      draft.version = current.version + 1;
      const serialized = canonicalize(draft);
      if (Buffer.byteLength(serialized) > MAX_STATE_BYTES)
        fail(
          'STATE_LIMIT',
          'Institution state exceeds the bounded local store limit; archive through a reviewed migration.'
        );
      const entry = {
        schemaVersion: 1,
        version: draft.version,
        eventId,
        actor,
        reason,
        recordedAt: new Date().toISOString(),
        previous: current.head,
        before: hash(previous),
        after: hash(draft),
        state: draft,
      };
      const digest = hash(entry);
      db.prepare('INSERT INTO chronicle VALUES (?,?,?,?,?)').run(
        draft.version,
        eventId,
        current.head,
        digest,
        canonicalize(entry)
      );
      db.prepare(
        'UPDATE institution SET version=?,head=?,state=? WHERE id=1'
      ).run(draft.version, digest, serialized);
      db.exec('COMMIT');
      return {
        state: clone(draft),
        result,
        version: draft.version,
        head: digest,
      };
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* BEGIN may itself have failed; never report success. */
      }
      throw error;
    } finally {
      busy = false;
    }
  }
  try {
    verify();
  } catch (error) {
    db.close();
    throw error;
  }
  return { read, head, entries, verify, transact, close: () => db.close() };
}

/** Knowledge admission is separate from storage; descendants query only admitted, in-scope entries. */
export function recordKnowledge(
  store,
  entry,
  { actor, role, eventId, expectedVersion } = {}
) {
  if (
    ![
      'proposed',
      'challenged',
      'admitted',
      'quarantined',
      'expired',
      'revoked',
    ].includes(entry?.status) ||
    typeof entry.id !== 'string' ||
    !entry.scope ||
    !entry.rights ||
    !Array.isArray(entry.sources)
  )
    fail(
      'SCHEMA_INVALID',
      'Knowledge needs an identifier, scoped rights, provenance and explicit admission state.'
    );
  if (
    entry.expiresAt !== undefined &&
    (typeof entry.expiresAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(entry.expiresAt) ||
      !Number.isFinite(Date.parse(entry.expiresAt)))
  )
    fail(
      'KNOWLEDGE_EXPIRY_INVALID',
      'Knowledge expiry must be a valid ISO timestamp.'
    );
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(entry.id))
    fail(
      'SCHEMA_INVALID',
      'Knowledge identifier must be a bounded simple identifier.'
    );
  if (
    entry.status === 'admitted' &&
    (role !== 'knowledge-custodian' || actor === entry.producer)
  )
    fail(
      'ROLE_CONFLICT',
      'An accountable custodian distinct from the producer must admit knowledge.'
    );
  return store.transact(
    (state) => {
      const prior = state.knowledge[entry.id];
      state.knowledge[entry.id] = {
        ...clone(entry),
        revision: (prior?.revision ?? 0) + 1,
        amendments: [
          ...(prior?.amendments ?? []),
          ...(prior
            ? [{ status: prior.status, revision: prior.revision }]
            : []),
        ],
      };
    },
    { actor, eventId, expectedVersion, reason: `knowledge:${entry.status}` }
  );
}
export function queryKnowledge(
  store,
  { scope, now = new Date().toISOString(), includeNegative = true } = {}
) {
  if (!Number.isFinite(Date.parse(now)))
    fail('CLOCK_INVALID', 'Knowledge lookup requires a valid timestamp.');
  return Object.values(store.read().knowledge).filter(
    (entry) =>
      entry.status === 'admitted' &&
      entry.scope === scope &&
      (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.parse(now)) &&
      (includeNegative || entry.kind !== 'negative-knowledge')
  );
}
