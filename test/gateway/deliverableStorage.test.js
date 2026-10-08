const { expect } = require('chai');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');

describe('gateway deliverable persistence boundary', function () {
  let directory;
  const agent = '0x1111111111111111111111111111111111111111';
  const input = () => ({
    jobId: '42',
    agent,
    resultUri: 'ipfs://reviewable-result',
  });
  beforeEach(function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-storage-'));
    fs.mkdirSync(path.join(directory, 'agent-gateway'));
  });
  afterEach(function () {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const root = () => path.join(directory, 'storage/deliverables');
  const journal = () => path.join(root(), 'deliverables.jsonl');
  const database = () => path.join(root(), 'deliverables.sqlite');
  function query(sql, ...params) {
    const db = new Database(database());
    try {
      return db.prepare(sql).all(...params);
    } finally {
      db.close();
    }
  }

  function loadStore(databaseFactory = Database) {
    const filename = path.resolve(
      __dirname,
      '../../agent-gateway/deliverableStore.ts'
    );
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    const module = { exports: {} };
    new Function(
      'require',
      'module',
      'exports',
      '__dirname',
      compiled.outputText
    )(
      (name) => (name === 'better-sqlite3' ? databaseFactory : require(name)),
      module,
      module.exports,
      path.join(directory, 'agent-gateway')
    );
    return module.exports;
  }

  it('persists parameterized inert JSON with unchanged record fields and private database bytes', function () {
    const store = loadStore();
    const metadata = {
      text: '<script>untrusted()</script>\nnext line',
      numeric: 42,
    };
    const record = store.recordDeliverable({
      ...input(),
      metadata,
      submissionMethod: 'finalizeJob',
    });
    metadata.numeric = 99;
    expect(store.listDeliverables()[0].metadata.numeric).to.equal(42);
    const text = query('SELECT body FROM records WHERE id = ?', record.id)[0]
      .body;
    expect(text.trim().split('\n')).to.have.length(1);
    expect(text).not.to.include('<script>');
    expect(JSON.parse(text).metadata.text).to.equal(metadata.text);
    expect(fs.statSync(database()).mode & 0o777).to.equal(0o600);
    expect(fs.existsSync(journal())).to.equal(false);
    expect(fs.statSync(root()).mode & 0o777).to.equal(0o700);
    expect(loadStore().getDeliverableById(record.id).submissionMethod).to.equal(
      'finalizeJob'
    );
  });

  it('stores large bounded telemetry privately and reads the original JSON value', function () {
    const store = loadStore();
    const payload = { detail: 'x'.repeat(10000) };
    const record = store.recordTelemetryReport({ jobId: '42', agent, payload });
    expect(record.payload.path).to.match(
      /^telemetry\/telemetry-report-[0-9]+-[0-9a-f-]+\.json$/
    );
    expect(store.loadStoredPayload(record.payload)).to.deep.equal(payload);
    expect(fs.existsSync(path.join(root(), record.payload.path))).to.equal(
      false
    );
    expect(
      query('SELECT body FROM payloads WHERE locator = ?', record.payload.path)
    ).to.have.length(1);
    expect(
      query('SELECT bytes FROM records WHERE id = ?', record.id)[0].bytes
    ).to.be.greaterThan(Buffer.byteLength(JSON.stringify(payload)));
    expect(loadStore().loadStoredPayload(record.payload)).to.deep.equal(
      payload
    );
  });

  it('keeps property names as inert data without modifying object or array prototypes', function () {
    const store = loadStore();
    const metadata = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"evidence","values":[{"toString":"data"}]}'
    );
    const result = store.recordDeliverable({ ...input(), metadata });
    expect(result.metadata).to.deep.equal(metadata);
    expect({}.polluted).to.equal(undefined);
    expect([].polluted).to.equal(undefined);
  });

  it('rolls back the record and payload together when SQLite rejects a payload write', function () {
    const store = loadStore();
    const db = new Database(database());
    db.exec(
      "CREATE TRIGGER fixture_failure BEFORE INSERT ON payloads BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END;"
    );
    db.close();
    expect(() =>
      store.recordDeliverable({
        ...input(),
        telemetry: { body: 'x'.repeat(10000) },
      })
    ).to.throw(/fixture write failure/);
    expect(store.listDeliverables()).to.deep.equal([]);
    expect(query('SELECT id FROM records')).to.deep.equal([]);
    expect(query('SELECT locator FROM payloads')).to.deep.equal([]);
  });

  it('rejects detectable SQLite page exhaustion before accepting a record', function () {
    function NearFullDatabase(...args) {
      const database = new Database(...args);
      return new Proxy(database, {
        get(target, key) {
          if (key === 'pragma')
            return (sql, options) => {
              if (sql === 'page_count') return 65535;
              if (sql === 'freelist_count') return 0;
              return target.pragma(sql, options);
            };
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }
    const store = loadStore(NearFullDatabase);
    expect(() => store.assertDeliverableStorageReady()).to.throw(
      /DATABASE_FULL/
    );
    expect(() => store.recordDeliverable(input())).to.throw(/DATABASE_FULL/);
    expect(query('SELECT id FROM records')).to.deep.equal([]);
    expect(store.listDeliverables()).to.deep.equal([]);
  });

  it('rejects unsafe SQLite database and sidecar links before touching their targets', function () {
    const store = loadStore();
    const outside = path.join(directory, 'outside.sqlite');
    fs.writeFileSync(outside, 'untouched', { mode: 0o600 });
    fs.symlinkSync(outside, `${database()}-journal`);
    expect(() => store.assertDeliverableStorageReady()).to.throw();
    fs.unlinkSync(`${database()}-journal`);
    fs.unlinkSync(database());
    fs.symlinkSync(outside, database());
    expect(() => store.assertDeliverableStorageReady()).to.throw();
    expect(fs.readFileSync(outside, 'utf8')).to.equal('untouched');
    expect(store.listDeliverables()).to.deep.equal([]);
  });

  it('retains legacy payload files and JSONL bytes while adding new SQLite records', function () {
    const store = loadStore();
    const locator =
      'telemetry/deliverable-123-11111111-1111-4111-8111-111111111111.json';
    const body = '{"legacy":true}';
    fs.writeFileSync(path.join(root(), locator), body, { mode: 0o600 });
    const legacy =
      JSON.stringify({ id: 'old', ...input(), telemetry: { path: locator } }) +
      '\n';
    fs.writeFileSync(journal(), legacy, { mode: 0o600 });
    const updated = loadStore();
    const created = updated.recordDeliverable({
      ...input(),
      metadata: { sql: "'); DROP TABLE records; --" },
    });
    expect(updated.getDeliverableById('old')).not.to.equal(null);
    expect(updated.loadStoredPayload({ path: locator })).to.deep.equal({
      legacy: true,
    });
    expect(loadStore().getDeliverableById(created.id).metadata.sql).to.equal(
      "'); DROP TABLE records; --"
    );
    expect(fs.readFileSync(journal(), 'utf8')).to.equal(legacy);
    expect(fs.readFileSync(path.join(root(), locator), 'utf8')).to.equal(body);
  });

  it('rejects unsafe JSON and oversized evidence before creating a record or payload', function () {
    const store = loadStore();
    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'secret', {
      enumerable: true,
      get() {
        getterCalls++;
        return 'secret';
      },
    });
    const circular = {};
    circular.self = circular;
    let deep = {};
    for (let i = 0; i < 35; i++) deep = { child: deep };
    for (const metadata of [
      accessor,
      circular,
      deep,
      { value: Infinity },
      { value: 1n },
      { callback() {} },
      new Date(),
      { text: 'x'.repeat(1024 * 1024) },
    ]) {
      expect(() =>
        store.recordDeliverable({
          ...input(),
          metadata,
          telemetry: { text: 'x'.repeat(9000) },
        })
      ).to.throw(store.DeliverableInputError);
    }
    expect(getterCalls).to.equal(0);
    expect(store.listDeliverables()).to.deep.equal([]);
    expect(fs.existsSync(journal())).to.equal(false);
    expect(fs.readdirSync(path.join(root(), 'telemetry'))).to.deep.equal([]);
  });

  it('reserves generated metadata space during pure preflight validation', function () {
    const store = loadStore();
    expect(() =>
      store.validateDeliverableInput({
        ...input(),
        metadata: { text: 'x'.repeat(960 * 1024) },
      })
    ).to.throw(store.DeliverableInputError);
    expect(fs.existsSync(journal())).to.equal(false);
    const accepted = store.validateDeliverableInput({
      ...input(),
      metadata: { text: 'x'.repeat(959 * 1024) },
    });
    const saved = store.recordDeliverable({
      ...accepted,
      txHash: '0x' + '1'.repeat(64),
      certificateMetadataUri: 'ipfs://' + 'a'.repeat(4096),
    });
    expect(store.getDeliverableById(saved.id).txHash).to.equal(saved.txHash);
  });

  it('rejects journal symlinks and hard links without publishing a phantom record', function () {
    const store = loadStore();
    const outside = path.join(directory, 'outside.json');
    fs.writeFileSync(outside, 'unchanged', { mode: 0o600 });
    fs.symlinkSync(outside, journal());
    expect(() => store.assertDeliverableStorageReady()).to.throw();
    expect(() => store.recordDeliverable(input())).to.throw();
    expect(store.listDeliverables()).to.deep.equal([]);
    fs.unlinkSync(journal());
    fs.linkSync(outside, journal());
    expect(() => store.recordDeliverable(input())).to.throw(/UNSAFE_FILE/);
    expect(fs.readFileSync(outside, 'utf8')).to.equal('unchanged');
    expect(store.listDeliverables()).to.deep.equal([]);
  });

  it('fails closed on unsafe storage permissions without chmod or publication', function () {
    const store = loadStore();
    fs.chmodSync(root(), 0o777);
    expect(() => store.recordDeliverable(input())).to.throw(/UNSAFE_DIRECTORY/);
    expect(fs.statSync(root()).mode & 0o777).to.equal(0o777);
    expect(store.listDeliverables()).to.deep.equal([]);
  });

  it('rejects unsafe historical files while preserving compatible private JSONL', function () {
    loadStore();
    fs.writeFileSync(
      journal(),
      JSON.stringify({ id: 'old', ...input(), metadata: { retained: true } }) +
        '\n',
      { mode: 0o600 }
    );
    expect(loadStore().getDeliverableById('old').metadata).to.deep.equal({
      retained: true,
    });
    fs.chmodSync(journal(), 0o644);
    expect(() => loadStore()).to.throw(/UNSAFE_FILE/);
    expect(fs.statSync(journal()).mode & 0o777).to.equal(0o644);
  });

  it('rejects path traversal and symlink payload reads', function () {
    const store = loadStore();
    const outside = path.join(directory, 'outside.json');
    fs.writeFileSync(outside, '"private"', { mode: 0o600 });
    expect(store.loadStoredPayload({ path: '../../outside.json' })).to.equal(
      null
    );
    const payloadPath =
      'telemetry/deliverable-123-11111111-1111-4111-8111-111111111111.json';
    fs.symlinkSync(outside, path.join(root(), payloadPath));
    expect(store.loadStoredPayload({ path: payloadPath })).to.equal(null);
  });

  it('caps journal growth and keeps failed appends out of the memory index', function () {
    const store = loadStore();
    const fd = fs.openSync(journal(), 'w', 0o600);
    fs.ftruncateSync(fd, 64 * 1024 * 1024);
    fs.closeSync(fd);
    expect(() => store.assertDeliverableStorageReady()).to.throw(
      /JOURNAL_FULL/
    );
    expect(() => store.recordDeliverable(input())).to.throw(/JOURNAL_FULL/);
    expect(store.listDeliverables()).to.deep.equal([]);
    expect(fs.statSync(journal()).size).to.equal(64 * 1024 * 1024);
  });
});
