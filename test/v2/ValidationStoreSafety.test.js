const { expect } = require('chai');
const fs = require('node:fs');
const path = require('node:path');
const isolatedValidationStore = require('../helpers/validation-store.cjs');

describe('Validator storage trust boundaries', () => {
  const validator = `0x${'ab'.repeat(20)}`;
  const update = {
    approve: true,
    salt: `0x${'11'.repeat(32)}`,
    commitHash: `0x${'22'.repeat(32)}`,
  };
  let fixture;
  beforeEach(() => {
    fixture = isolatedValidationStore();
  });
  afterEach(() => fixture.cleanup());
  const recordFile = () => path.join(fixture.root, `1-${validator}.json`);

  it('preserves canonical filenames and arbitrary bounded JSON as inert data', () => {
    const metadata = {
      nested: {
        untrusted: '</script>";process.exit(42);//',
        list: [1, true, null],
      },
    };
    const record = fixture.store.updateCommitRecord(
      '1',
      validator.toUpperCase().replace('0X', '0x'),
      { ...update, metadata }
    );
    expect(fs.existsSync(recordFile())).to.equal(true);
    expect(fs.statSync(recordFile()).mode & 0o777).to.equal(0o600);
    expect(fs.statSync(fixture.root).mode & 0o777).to.equal(0o700);
    expect(fixture.store.loadCommitRecord(1, validator)).to.deep.equal(record);
    expect(record.metadata).to.deep.equal(metadata);
  });

  it('rejects noncanonical, oversized and traversal identities before creating state', () => {
    for (const id of [
      '../outside',
      '1/../../outside',
      '01',
      '-1',
      '1.5',
      '1e2',
      '1\0',
      (1n << 256n).toString(),
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() =>
        fixture.store.updateCommitRecord(id, validator, update)
      ).to.throw('VALIDATION_STORAGE_IDENTITY_INVALID');
      expect(() => fixture.store.loadCommitRecord(id, validator)).to.throw(
        'VALIDATION_STORAGE_IDENTITY_INVALID'
      );
    }
    for (const address of ['../outside', '0x123', `${validator}/../../outside`])
      expect(() =>
        fixture.store.updateCommitRecord('1', address, update)
      ).to.throw('VALIDATION_STORAGE_IDENTITY_INVALID');
    expect(fs.existsSync(fixture.root)).to.equal(false);
  });

  it('rejects a redirected or nonprivate state directory without changing its target', () => {
    const target = path.join(fixture.directory, 'outside');
    fs.mkdirSync(target, { mode: 0o700 });
    fs.symlinkSync(target, fixture.root, 'dir');
    expect(() =>
      fixture.store.updateCommitRecord('1', validator, update)
    ).to.throw();
    expect(fs.readdirSync(target)).to.deep.equal([]);
    fs.unlinkSync(fixture.root);
    fs.mkdirSync(fixture.root, { mode: 0o755 });
    expect(() =>
      fixture.store.updateCommitRecord('1', validator, update)
    ).to.throw('VALIDATION_STORAGE_UNSAFE_DIRECTORY');
    expect(fs.statSync(fixture.root).mode & 0o777).to.equal(0o755);
    expect(fs.readdirSync(fixture.root)).to.deep.equal([]);
  });

  it('rejects symlink records for reads, updates and deletes', () => {
    fixture.store.updateCommitRecord('1', validator, update);
    const target = path.join(fixture.directory, 'outside.json');
    fs.renameSync(recordFile(), target);
    const original = fs.readFileSync(target, 'utf8');
    fs.symlinkSync(target, recordFile());
    expect(() => fixture.store.loadCommitRecord('1', validator)).to.throw(
      'RECONCILIATION_REQUIRED'
    );
    expect(() =>
      fixture.store.updateCommitRecord('1', validator, {
        metadata: { changed: true },
      })
    ).to.throw('RECONCILIATION_REQUIRED');
    expect(() => fixture.store.deleteCommitRecord('1', validator)).to.throw(
      'RECONCILIATION_REQUIRED'
    );
    expect(fs.readFileSync(target, 'utf8')).to.equal(original);
  });

  it('rejects nonregular, hard-linked and nonprivate records', () => {
    fixture.store.updateCommitRecord('1', validator, update);
    fs.chmodSync(recordFile(), 0o644);
    expect(() => fixture.store.loadCommitRecord('1', validator)).to.throw(
      'RECONCILIATION_REQUIRED'
    );
    fs.chmodSync(recordFile(), 0o600);
    const linked = path.join(fixture.directory, 'alias.json');
    fs.linkSync(recordFile(), linked);
    expect(() => fixture.store.loadCommitRecord('1', validator)).to.throw(
      'RECONCILIATION_REQUIRED'
    );
    fs.unlinkSync(linked);
    fs.unlinkSync(recordFile());
    fs.mkdirSync(recordFile(), { mode: 0o700 });
    expect(() => fixture.store.loadCommitRecord('1', validator)).to.throw(
      'RECONCILIATION_REQUIRED'
    );
  });

  it('fails closed on unsafe ownership instead of changing permissions', () => {
    fixture.store.updateCommitRecord('1', validator, update);
    const original = fs.fstatSync;
    fs.fstatSync = (...args) => {
      const stat = original(...args);
      stat.uid =
        typeof process.getuid === 'function' ? process.getuid() + 1 : stat.uid;
      return stat;
    };
    try {
      if (typeof process.getuid === 'function') {
        expect(() => fixture.store.loadCommitRecord('1', validator)).to.throw(
          'RECONCILIATION_REQUIRED'
        );
        expect(() =>
          fixture.store.updateCommitRecord('1', validator, update)
        ).to.throw('VALIDATION_STORAGE_UNSAFE_DIRECTORY');
      }
    } finally {
      fs.fstatSync = original;
    }
  });

  it('rejects oversized and deeply nested JSON without replacing previous recovery evidence', () => {
    fixture.store.updateCommitRecord('1', validator, update);
    const original = fs.readFileSync(recordFile(), 'utf8');
    const nested = {};
    let current = nested;
    for (let depth = 0; depth < 40; depth++) current = current.child = {};
    const circular = {};
    circular.self = circular;
    for (const metadata of [
      { body: 'x'.repeat(1024 * 1024) },
      { sparse: new Array(16385) },
      nested,
      circular,
    ]) {
      expect(() =>
        fixture.store.updateCommitRecord('1', validator, { metadata })
      ).to.throw(/VALIDATION_STORAGE_RECORD_/);
      expect(fs.readFileSync(recordFile(), 'utf8')).to.equal(original);
      expect(fs.readdirSync(fixture.root)).to.deep.equal([
        path.basename(recordFile()),
      ]);
    }
    fs.writeFileSync(recordFile(), 'x'.repeat(1024 * 1024 + 1));
    expect(() => fixture.store.loadCommitRecord('1', validator)).to.throw(
      'RECONCILIATION_REQUIRED'
    );
  });

  it('rejects malformed UTF-8 instead of converting corrupt recovery evidence into text', () => {
    fixture.store.updateCommitRecord('1', validator, update);
    const valid = JSON.parse(fs.readFileSync(recordFile(), 'utf8'));
    const body = Buffer.from(
      JSON.stringify({ ...valid, metadata: { text: 'MARKER' } })
    );
    const offset = body.indexOf(Buffer.from('MARKER'));
    body[offset] = 0xff;
    fs.writeFileSync(recordFile(), body);
    expect(() => fixture.store.loadCommitRecord('1', validator)).to.throw(
      'RECONCILIATION_REQUIRED'
    );
  });

  it('requires an absolute configured storage location', () => {
    const modulePath = require.resolve('../../agent-gateway/validationStore');
    const cached = require.cache[modulePath];
    const prior = process.env.VALIDATION_STORAGE_DIR;
    try {
      process.env.VALIDATION_STORAGE_DIR = 'relative/state';
      delete require.cache[modulePath];
      expect(() => require(modulePath)).to.throw('must be an absolute path');
    } finally {
      if (cached) require.cache[modulePath] = cached;
      else delete require.cache[modulePath];
      if (prior === undefined) delete process.env.VALIDATION_STORAGE_DIR;
      else process.env.VALIDATION_STORAGE_DIR = prior;
    }
  });

  const roundScope = {
    chainId: '31337',
    validationModule: `0x${'cd'.repeat(20)}`,
    nonce: '1',
    commitDeadline: '1000',
    domain: `0x${'33'.repeat(32)}`,
    specHash: `0x${'44'.repeat(32)}`,
    blockNumber: 1,
    blockHash: `0x${'55'.repeat(32)}`,
  };
  const expected = { commitHash: update.commitHash, roundScope };

  it('durably claims one automatic reveal and rejects a competing claim with the same round scope', () => {
    fixture.store.beginCommitRecord(
      '1',
      validator,
      { ...update, roundScope },
      null
    );
    const intent = { metadata: { automaticRevealStatus: 'broadcast-intent' } };
    const guard = { ...expected, revealUnattempted: true };
    expect(() =>
      fixture.store.updateCommitRecord('1', validator, intent, expected)
    ).to.throw('RECONCILIATION_REQUIRED');
    expect(() =>
      fixture.store.updateCommitRecord(
        '1',
        validator,
        { metadata: { unrelated: true } },
        guard
      )
    ).to.throw('RECONCILIATION_REQUIRED');
    fixture.store.updateCommitRecord('1', validator, intent, guard);
    const persisted = fixture.store.loadCommitRecord('1', validator);
    expect(persisted.metadata.automaticRevealStatus).to.equal(
      'broadcast-intent'
    );
    expect(() =>
      fixture.store.updateCommitRecord('1', validator, intent, guard)
    ).to.throw('RECONCILIATION_REQUIRED');
    expect(fixture.store.loadCommitRecord('1', validator)).to.deep.equal(
      persisted
    );
    fixture.store.updateCommitRecord(
      '1',
      validator,
      {
        revealTx: `0x${'66'.repeat(32)}`,
        metadata: { automaticRevealStatus: 'broadcast' },
      },
      expected
    );
    expect(
      fixture.store.loadCommitRecord('1', validator).metadata
        .automaticRevealStatus
    ).to.equal('broadcast');
    fixture.store.updateCommitRecord(
      '1',
      validator,
      { metadata: { automaticRevealStatus: 'confirmed' } },
      expected
    );
    expect(() =>
      fixture.store.updateCommitRecord(
        '1',
        validator,
        { metadata: { automaticRevealStatus: 'broadcast' } },
        expected
      )
    ).to.throw('RECONCILIATION_REQUIRED');
    expect(
      fixture.store.loadCommitRecord('1', validator).metadata
        .automaticRevealStatus
    ).to.equal('confirmed');
  });

  it('rejects prior reveal evidence and unscoped or wrong-round reveal metadata changes', () => {
    const guard = { ...expected, revealUnattempted: true };
    let jobNumber = 2;
    for (const prior of [
      { revealTx: `0x${'66'.repeat(32)}` },
      { revealedAt: new Date().toISOString() },
      { metadata: { automaticRevealStatus: '' } },
    ]) {
      const jobId = String(jobNumber++);
      fixture.store.beginCommitRecord(
        jobId,
        validator,
        { ...update, roundScope, ...prior },
        null
      );
      expect(() =>
        fixture.store.updateCommitRecord(
          jobId,
          validator,
          { metadata: { automaticRevealStatus: 'broadcast-intent' } },
          guard
        )
      ).to.throw('RECONCILIATION_REQUIRED');
    }
    fixture.store.beginCommitRecord(
      '1',
      validator,
      { ...update, roundScope },
      null
    );
    fixture.store.updateCommitRecord(
      '1',
      validator,
      { metadata: { automaticRevealStatus: 'broadcast-intent' } },
      guard
    );
    const original = fixture.store.loadCommitRecord('1', validator);
    for (const automaticRevealStatus of [undefined, null, '', 'confirmed']) {
      const change = { metadata: { automaticRevealStatus } };
      expect(() =>
        fixture.store.updateCommitRecord('1', validator, change)
      ).to.throw('RECONCILIATION_REQUIRED');
      expect(() =>
        fixture.store.updateCommitRecord('1', validator, change, {
          ...expected,
          roundScope: { ...roundScope, commitDeadline: '2000' },
        })
      ).to.throw('RECONCILIATION_REQUIRED');
    }
    expect(fixture.store.loadCommitRecord('1', validator)).to.deep.equal(
      original
    );
    for (const automaticRevealStatus of [
      undefined,
      null,
      false,
      '',
      'invalid',
    ]) {
      expect(() =>
        fixture.store.updateCommitRecord(
          '1',
          validator,
          { metadata: { automaticRevealStatus } },
          expected
        )
      ).to.throw('RECONCILIATION_REQUIRED');
    }
    expect(fixture.store.loadCommitRecord('1', validator)).to.deep.equal(
      original
    );
    fixture.store.updateCommitRecord('1', validator, {
      metadata: { unrelated: 'preserved' },
    });
    expect(
      fixture.store.loadCommitRecord('1', validator).metadata
    ).to.deep.equal({
      automaticRevealStatus: 'broadcast-intent',
      unrelated: 'preserved',
    });
  });

  it('refuses deletion while another writer holds the record lock', () => {
    fixture.store.updateCommitRecord('1', validator, update);
    const lockfile = `${recordFile()}.lock`;
    const lock = fs.openSync(lockfile, 'wx', 0o600);
    try {
      expect(() => fixture.store.deleteCommitRecord('1', validator)).to.throw(
        'RECONCILIATION_REQUIRED'
      );
      expect(
        fixture.store.loadCommitRecord('1', validator).commitHash
      ).to.equal(update.commitHash);
    } finally {
      fs.closeSync(lock);
      fs.unlinkSync(lockfile);
    }
    fixture.store.deleteCommitRecord('1', validator);
    expect(fixture.store.loadCommitRecord('1', validator)).to.equal(null);
    expect(fs.existsSync(lockfile)).to.equal(false);
  });
});
