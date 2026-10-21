const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { ethers } = require('ethers');
const grpc = require('@grpc/grpc-js');

const root = path.resolve(__dirname, '../..');
const address = '0x1111111111111111111111111111111111111111';
const apiKey = 'synthetic-telemetry-test-key';
const policy = {
  energyScaling: 1,
  valueScaling: 1_000_000,
  epochDurationSec: 86400,
  deadlineBufferSec: 3600,
  role: 2,
};
const sample = (jobId = '42') => ({
  jobId,
  agent: address,
  cpuTimeMs: 2.4,
  gpuTimeMs: 3.2,
  energyEstimate: 7,
  efficiencyScore: 0.25,
  startedAt: '2026-10-21T00:00:00Z',
});

function loadTs(relative, dependencies = {}, options = {}) {
  const filename = path.join(root, relative);
  const source =
    fs.readFileSync(filename, 'utf8') +
    (options.expose ? `\nexport { ${options.expose.join(', ')} };` : '');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
    fileName: filename,
  });
  assert.equal(compiled.diagnostics.length, 0, 'TypeScript syntax diagnostics');
  const module = { exports: {} },
    originalRequire = createRequire(filename);
  const dependency = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('.')) throw new Error(`Unisolated dependency: ${name}`);
    return originalRequire(name);
  };
  const fixedProcess = { env: options.env ?? {}, cwd: () => root };
  class Clock extends Date {
    static now() {
      return Date.parse('2026-10-21T00:00:00Z');
    }
  }
  new Function(
    'require',
    'module',
    'exports',
    '__dirname',
    'process',
    'Date',
    'fetch',
    compiled.outputText
  )(
    dependency,
    module,
    module.exports,
    options.dirname ?? path.dirname(filename),
    fixedProcess,
    Clock,
    () => {
      throw new Error('Network forbidden in synthetic telemetry tests');
    }
  );
  return module.exports;
}

const validation = loadTs('agent-gateway/telemetrySample.ts');
const { TelemetryQueue } = loadTs('agent-gateway/telemetryQueue.ts', {
  './telemetrySample': validation,
});

function sandbox(t) {
  const errors = t.mock.method(console, 'error', () => {});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-telemetry-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    outbox: path.join(directory, 'telemetry-queue.json'),
    rejects: path.join(directory, 'telemetry-rejections.json'),
    queue: new TelemetryQueue(directory),
    errors,
  };
}
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const accept = async (samples) => ({
  processed: samples.length,
  success: true,
});

function operator() {
  const { EnergyOracleOperator } = loadTs(
    'agent-gateway/operator.ts',
    {
      './utils': { orchestratorWallet: null },
      './telemetrySample': validation,
      '../shared/logValue': { logValue: (value) => JSON.stringify(value) },
    },
    { expose: ['EnergyOracleOperator'] }
  );
  const instance = Object.create(EnergyOracleOperator.prototype);
  instance.config = policy;
  const submitted = [];
  instance.submitWithRetry = async (base) => {
    submitted.push(base);
  };
  return { instance, submitted };
}

test('supported numeric fields reject invalid types, nonfinite values and ABI range overflow', () => {
  const fields = [
    'durationMs',
    'runtimeMs',
    'cpuTimeMs',
    'gpuTimeMs',
    'cpuUserUs',
    'cpuSystemUs',
    'cpuTotalUs',
    'cpuCycles',
    'gpuCycles',
    'memoryRssBytes',
    'energyEstimate',
    'entropyEstimate',
    'rewardValue',
    'efficiencyScore',
    'anomalyScore',
    'gpuUtilization',
  ];
  for (const field of fields) {
    for (const value of [
      '2',
      true,
      null,
      [],
      {},
      NaN,
      Infinity,
      -Infinity,
      -1,
      2 ** 256,
    ]) {
      assert.throws(
        () => validation.validateEnergySample({ [field]: value }),
        validation.EnergySampleInputError,
        field
      );
    }
    for (const value of [undefined, 0, 0.5, 100])
      validation.validateEnergySample({ [field]: value });
  }
  for (const value of [null, [], 42, 'sample'])
    assert.throws(
      () => validation.validateEnergySample(value),
      validation.EnergySampleInputError
    );
});

test('validation checks aggregate and scaled contract bounds and metadata candidates', () => {
  assert.throws(
    () =>
      validation.validateEnergySample({
        cpuTimeMs: 2 ** 255,
        gpuTimeMs: 2 ** 255,
      }),
    /cpuTimeMs\+gpuTimeMs/
  );
  assert.throws(
    () => validation.validateEnergySample({ energyEstimate: 2 ** 255 }),
    /energyEstimate/
  );
  assert.throws(
    () =>
      validation.validateEnergySample(
        { energyEstimate: 2 },
        { energyScaling: Number.MAX_VALUE, valueScaling: 1 }
      ),
    /energyEstimate/
  );
  assert.throws(
    () =>
      validation.validateEnergySample({
        rewardValue: 1,
        energyEstimate: Number.MIN_VALUE,
      }),
    /efficiencyScore/
  );
  assert.throws(
    () =>
      validation.validateEnergySample(
        { efficiencyScore: 2 ** 255 },
        { energyScaling: 1, valueScaling: 2 }
      ),
    /efficiencyScore/
  );
  for (const field of ['degeneracy', 'runs', 'attempts']) {
    for (const value of [
      null,
      {},
      true,
      'bad',
      Infinity,
      -1,
      -0.1,
      '-0.1',
      2 ** 256,
    ])
      assert.throws(
        () => validation.validateEnergySample({ metadata: { [field]: value } }),
        validation.EnergySampleInputError
      );
    for (const value of [undefined, 0, 1, 1.5, '2', '0x02'])
      validation.validateEnergySample({ metadata: { [field]: value } });
  }
});

test('omitted fields retain zero/default conversions and valid samples retain attestation mapping', async () => {
  const { instance, submitted } = operator();
  assert.deepEqual(
    await instance.submit([
      { jobId: '42', agent: address },
      { ...sample('43'), metadata: { degeneracy: '2' } },
    ]),
    { processed: 2, success: true }
  );
  assert.deepEqual(
    [
      submitted[0].energy,
      submitted[0].uPre,
      submitted[0].uPost,
      submitted[0].value,
      submitted[0].degeneracy,
    ],
    [0n, 0n, 0n, 0n, 1n]
  );
  assert.deepEqual(
    [
      submitted[1].jobId,
      submitted[1].energy,
      submitted[1].uPre,
      submitted[1].uPost,
      submitted[1].value,
      submitted[1].degeneracy,
    ],
    [43n, 7n, 2n, 5n, 250000n, 2n]
  );
});

test('operator returns its acknowledged prefix and an explicit rejection after a malformed sample', async () => {
  const { instance, submitted } = operator();
  const result = await instance.submit([
    sample('1'),
    { ...sample('2'), cpuTimeMs: {} },
    sample('3'),
  ]);
  assert.equal(result.processed, 1);
  assert.equal(result.success, false);
  assert.equal(result.rejected.index, 1);
  assert.equal(result.rejected.error.code, 'INVALID_TELEMETRY_SAMPLE');
  assert.deepEqual(
    submitted.map((record) => record.jobId),
    [1n]
  );
});

test('unexpected conversion exceptions also preserve the acknowledged prefix', async () => {
  const { instance, submitted } = operator();
  const result = await instance.submit([
    sample('1'),
    { ...sample('2'), startedAt: { toString: 0 } },
    sample('3'),
  ]);
  assert.equal(result.processed, 1);
  assert.equal(result.rejected.index, 1);
  assert.equal(result.success, false);
  assert.deepEqual(
    submitted.map((record) => record.jobId),
    [1n]
  );
});

test('shared ingress rejects before creating storage and snapshots valid caller-owned data', async (t) => {
  const { directory, outbox, queue } = sandbox(t);
  const missing = path.join(directory, 'not-created');
  const empty = new TelemetryQueue(missing);
  await assert.rejects(empty.enqueue({ cpuTimeMs: 'invalid' }), /cpuTimeMs/);
  await assert.rejects(empty.enqueue({ metadata: { inertValue: 1n } }), /JSON/);
  assert.equal(fs.existsSync(missing), false);
  assert.equal(empty.length, 0);
  const input = { ...sample(), metadata: { runs: 2 } };
  await queue.enqueue(input);
  input.cpuTimeMs = Infinity;
  input.metadata.runs = 99;
  assert.equal(read(outbox)[0].metadata.runs, 2);
  await queue.flush(async (batch) => {
    assert.equal(batch[0].cpuTimeMs, 2.4);
    assert.equal(batch[0].metadata.runs, 2);
    return accept(batch);
  });
  assert.deepEqual(read(outbox), []);
});

test('restored primitive records and nonfinite JSON numbers retain rejection evidence', async (t) => {
  const { outbox, rejects, queue } = sandbox(t);
  fs.writeFileSync(
    outbox,
    `[null,[],42,"invalid",{"cpuTimeMs":1e400},${JSON.stringify(sample())}]`
  );
  let accepted = 0;
  await queue.flush(async (batch) => {
    accepted += batch.length;
    return accept(batch);
  });
  assert.equal(accepted, 1);
  const records = read(rejects).records;
  assert.equal(records.length, 5);
  assert.deepEqual(JSON.parse(records.at(-1).sampleJsonPrefix), {
    cpuTimeMs: { rejectedNumber: 'Infinity' },
  });
  assert.deepEqual(read(outbox), []);
});

test('invalid restored records are quarantined and later valid work proceeds across reloads', async (t) => {
  const { directory, outbox, rejects, queue, errors } = sandbox(t);
  const bad = { ...sample('1'), gpuTimeMs: 'invalid' };
  fs.writeFileSync(outbox, JSON.stringify([bad, sample('2')]));
  const submitted = [];
  await queue.flush(async (batch) => {
    submitted.push(...batch);
    return accept(batch);
  });
  assert.deepEqual(
    submitted.map((record) => record.jobId),
    ['2']
  );
  assert.deepEqual(read(outbox), []);
  const record = read(rejects).records[0];
  assert.deepEqual(JSON.parse(record.sampleJsonPrefix), bad);
  assert.equal(record.truncated, false);
  assert.equal(errors.mock.calls.length, 1);
  assert.equal(errors.mock.calls[0].arguments[1].sha256, record.sha256);
  assert.equal(
    record.sha256,
    crypto.createHash('sha256').update(JSON.stringify(bad)).digest('hex')
  );
  assert.equal(fs.statSync(rejects).mode & 0o777, 0o600);
  const restored = new TelemetryQueue(directory);
  await restored.flush(async () => {
    assert.fail('acknowledged sample must not be resubmitted');
  });
});

test('earlier successes remain acknowledged when a later restored rejection precedes a transport failure', async (t) => {
  const { directory, outbox, rejects, queue } = sandbox(t);
  fs.writeFileSync(
    outbox,
    JSON.stringify([
      sample('1'),
      { ...sample('2'), cpuTimeMs: {} },
      sample('3'),
    ])
  );
  const submitted = [];
  await assert.rejects(
    queue.flush(async (batch) => {
      if (batch[0].jobId === '3')
        return {
          processed: 0,
          success: false,
          error: new Error('synthetic transport failure'),
        };
      submitted.push(...batch.map((record) => record.jobId));
      return accept(batch);
    }),
    /synthetic transport/
  );
  assert.deepEqual(
    read(outbox).map((record) => record.jobId),
    ['3']
  );
  assert.equal(read(rejects).records.length, 1);
  await new TelemetryQueue(directory).flush(async (batch) => {
    submitted.push(...batch.map((record) => record.jobId));
    return accept(batch);
  });
  assert.deepEqual(submitted, ['1', '3']);
});

test('real conversion results drive quarantine without losing or resubmitting a successful prefix', async (t) => {
  const { outbox, rejects, queue } = sandbox(t);
  const { instance, submitted } = operator();
  fs.writeFileSync(
    outbox,
    JSON.stringify([
      sample('1'),
      { ...sample('2'), startedAt: { toString: 0 } },
      sample('3'),
    ])
  );
  await queue.flush((batch) => instance.submit(batch));
  assert.deepEqual(
    submitted.map((record) => record.jobId),
    [1n, 3n]
  );
  assert.deepEqual(read(outbox), []);
  assert.equal(
    read(rejects).records[0].reason,
    'Telemetry attestation conversion failed'
  );
});

test('transport failures preserve only the unacknowledged suffix and never become rejections', async (t) => {
  const { outbox, rejects, queue } = sandbox(t);
  fs.writeFileSync(outbox, JSON.stringify([sample('1'), sample('2')]));
  await assert.rejects(
    queue.flush(async () => ({
      processed: 1,
      success: false,
      error: new Error('synthetic outage'),
    })),
    /synthetic outage/
  );
  assert.deepEqual(
    read(outbox).map((record) => record.jobId),
    ['2']
  );
  assert.equal(fs.existsSync(rejects), false);
});

test('quarantine failure retains the bad record while earlier successes stay acknowledged', async (t) => {
  const { outbox, rejects, queue } = sandbox(t);
  fs.writeFileSync(
    outbox,
    JSON.stringify([
      sample('1'),
      { ...sample('2'), cpuTimeMs: null },
      sample('3'),
    ])
  );
  fs.writeFileSync(rejects, 'invalid journal');
  const submitted = [];
  const submit = async (batch) => {
    submitted.push(...batch.map((record) => record.jobId));
    return accept(batch);
  };
  await assert.rejects(queue.flush(submit));
  assert.deepEqual(submitted, ['1']);
  assert.deepEqual(
    read(outbox).map((record) => record.jobId),
    ['2', '3']
  );
  fs.unlinkSync(rejects);
  await queue.flush(submit);
  assert.deepEqual(submitted, ['1', '3']);
});

test('acknowledgement storage errors are retried before more submissions in the same process', async (t) => {
  const { outbox, queue } = sandbox(t);
  await queue.enqueue(sample('1'));
  const write = queue.writeAtomic.bind(queue);
  let fail = true;
  queue.writeAtomic = async (file, text) => {
    if (file === outbox && fail) {
      fail = false;
      throw new Error('synthetic disk failure');
    }
    return write(file, text);
  };
  let submitted = 0;
  const submit = async (batch) => {
    submitted += batch.length;
    return accept(batch);
  };
  await assert.rejects(queue.flush(submit), /synthetic disk/);
  assert.equal(queue.length, 0);
  await queue.flush(submit);
  assert.equal(submitted, 1);
  assert.deepEqual(read(outbox), []);
});

test('concurrent ingestion cannot overwrite a flush acknowledgement or lose newly appended work', async (t) => {
  const { directory, outbox, queue } = sandbox(t);
  await queue.enqueue(sample('1'));
  let begin, finish;
  const started = new Promise((resolve) => {
    begin = resolve;
  });
  const held = new Promise((resolve) => {
    finish = resolve;
  });
  const flushing = queue.flush(async (batch) => {
    begin();
    await held;
    return accept(batch);
  });
  await started;
  await Promise.all([queue.enqueue(sample('2')), queue.enqueue(sample('3'))]);
  await queue.flush(async () => {
    assert.fail('concurrent flush must not submit');
  });
  finish();
  await flushing;
  assert.deepEqual(
    read(outbox).map((record) => record.jobId),
    ['2', '3']
  );
  await new TelemetryQueue(directory).flush(accept);
  assert.deepEqual(read(outbox), []);
});

test('invalid outbox documents are reported and retained without overwriting them', async (t) => {
  const { outbox, queue } = sandbox(t);
  fs.writeFileSync(outbox, '{invalid');
  await assert.rejects(queue.enqueue(sample()));
  assert.equal(fs.readFileSync(outbox, 'utf8'), '{invalid');
  fs.writeFileSync(outbox, '{}');
  await assert.rejects(queue.flush(accept), /must be an array/);
  assert.equal(fs.readFileSync(outbox, 'utf8'), '{}');
});

test('quarantine retention is bounded, explicit about eviction and preserves oversized-record digests', async (t) => {
  const { outbox, rejects, queue } = sandbox(t);
  const large = {
    ...sample('large'),
    cpuTimeMs: null,
    metadata: { evidence: 'Ω'.repeat(40000) },
  };
  fs.writeFileSync(
    outbox,
    JSON.stringify([
      large,
      ...Array.from({ length: 129 }, (_, index) => ({
        ...sample(String(index)),
        cpuTimeMs: null,
      })),
      sample('valid'),
    ])
  );
  const observed = [];
  await queue.flush(async (batch) => {
    observed.push(...batch.map((record) => record.jobId));
    return accept(batch);
  });
  const journal = read(rejects);
  assert.equal(journal.records.length, 128);
  assert.equal(journal.evicted, 2);
  assert.ok(fs.statSync(rejects).size <= 1024 * 1024);
  assert.deepEqual(observed, ['valid']);
  fs.writeFileSync(outbox, JSON.stringify([large]));
  await new TelemetryQueue(path.dirname(outbox)).flush(accept);
  const retained = read(rejects).records.at(-1);
  assert.equal(retained.truncated, true);
  assert.equal(
    retained.originalBytes,
    Buffer.byteLength(JSON.stringify(large))
  );
  assert.equal(
    retained.sha256,
    crypto.createHash('sha256').update(JSON.stringify(large)).digest('hex')
  );
  assert.ok(Buffer.byteLength(retained.sampleJsonPrefix) <= 32 * 1024);
  assert.equal(retained.sampleJsonPrefix.includes('\ufffd'), false);
});

test('tampered retained rejection records fail closed without dropping the active record', async (t) => {
  const { directory, outbox, rejects, queue } = sandbox(t);
  const invalid = { cpuTimeMs: 'invalid' };
  fs.writeFileSync(outbox, JSON.stringify([invalid]));
  await queue.flush(accept);
  const journal = read(rejects);
  journal.records[0].sampleJsonPrefix = '{}';
  fs.writeFileSync(rejects, JSON.stringify(journal));
  fs.writeFileSync(outbox, JSON.stringify([invalid, sample()]));
  await assert.rejects(
    new TelemetryQueue(directory).flush(accept),
    /Invalid telemetry rejection journal/
  );
  assert.deepEqual(read(outbox), [invalid, sample()]);
});

test('truncated rejection prefixes are integrity checked before later work is removed', async (t) => {
  const { directory, outbox, rejects, queue } = sandbox(t);
  const large = { cpuTimeMs: null, metadata: { evidence: 'Ω'.repeat(40000) } };
  fs.writeFileSync(outbox, JSON.stringify([large]));
  await queue.flush(accept);
  const journal = read(rejects);
  const record = journal.records[0];
  assert.equal(record.truncated, true);
  assert.equal(
    record.prefixSha256,
    crypto.createHash('sha256').update(record.sampleJsonPrefix).digest('hex')
  );
  record.sampleJsonPrefix = 'x' + record.sampleJsonPrefix.slice(1);
  fs.writeFileSync(rejects, JSON.stringify(journal));
  const pending = [{ cpuTimeMs: null }, sample()];
  fs.writeFileSync(outbox, JSON.stringify(pending));
  await assert.rejects(
    new TelemetryQueue(directory).flush(accept),
    /Invalid telemetry rejection journal/
  );
  assert.deepEqual(read(outbox), pending);
});

test('queue replacements sync the directory and propagate a failed durability checkpoint', async (t) => {
  const { directory, outbox } = sandbox(t);
  const events = [];
  let failDirectorySync = false;
  const isolatedFs = {
    ...fs,
    promises: {
      ...fs.promises,
      open: async (file, ...args) => {
        const handle = await fs.promises.open(file, ...args);
        return {
          writeFile: (...values) => handle.writeFile(...values),
          close: () => handle.close(),
          sync: async () => {
            const kind =
              file === directory
                ? 'directory'
                : file.endsWith('.tmp')
                ? 'file'
                : 'ancestor';
            events.push('sync:' + kind);
            if (kind === 'directory' && failDirectorySync)
              throw new Error('synthetic directory sync failure');
            await handle.sync();
          },
        };
      },
      rename: async (...args) => {
        events.push('rename');
        await fs.promises.rename(...args);
      },
    },
  };
  const { TelemetryQueue: IsolatedQueue } = loadTs(
    'agent-gateway/telemetryQueue.ts',
    {
      fs: isolatedFs,
      './telemetrySample': validation,
    }
  );
  const queue = new IsolatedQueue(directory);
  await queue.enqueue(sample('first'));
  assert.equal(events[0], 'sync:ancestor');
  assert.deepEqual(
    events.filter((event) => event !== 'sync:ancestor'),
    ['sync:file', 'rename', 'sync:directory']
  );
  failDirectorySync = true;
  await assert.rejects(queue.flush(accept), /synthetic directory sync failure/);
  failDirectorySync = false;
  await queue.flush(() =>
    assert.fail(
      'successful prefix must be checkpointed before another submission'
    )
  );
  assert.deepEqual(read(outbox), []);
});

test('first nested queue creation checkpoints every containing parent before file effects', async (t) => {
  const { directory } = sandbox(t);
  const target = path.join(directory, 'new-parent', 'deeper', 'telemetry');
  const events = [];
  const isolatedFs = {
    ...fs,
    promises: {
      ...fs.promises,
      open: async (file, ...args) => {
        const handle = await fs.promises.open(file, ...args);
        return {
          writeFile: async (...values) => {
            events.push('write');
            await handle.writeFile(...values);
          },
          sync: async () => {
            events.push(file.endsWith('.tmp') ? 'file' : file);
            await handle.sync();
          },
          close: () => handle.close(),
        };
      },
      rename: async (...args) => {
        events.push('rename');
        await fs.promises.rename(...args);
      },
    },
  };
  const { TelemetryQueue: IsolatedQueue } = loadTs(
    'agent-gateway/telemetryQueue.ts',
    { fs: isolatedFs, './telemetrySample': validation }
  );
  const queue = new IsolatedQueue(target);
  assert.equal(fs.existsSync(target), false);
  await queue.enqueue(sample('nested'));
  const writeIndex = events.indexOf('write');
  for (const parent of [
    path.join(directory, 'new-parent', 'deeper'),
    path.join(directory, 'new-parent'),
    directory,
    path.parse(directory).root,
  ]) {
    assert.ok(
      events.indexOf(parent) >= 0 && events.indexOf(parent) < writeIndex,
      `parent entry not checkpointed before file write: ${parent}`
    );
  }
  assert.deepEqual(events.slice(writeIndex), [
    'write',
    'file',
    'rename',
    target,
  ]);
  assert.equal(queue.length, 1);
  assert.deepEqual(read(path.join(target, 'telemetry-queue.json')), [
    sample('nested'),
  ]);
});

test('failed parent barriers reject first enqueue and repeat across nested retries and restarts', async (t) => {
  const { directory } = sandbox(t);
  for (const restart of [false, true])
    for (const barrier of ['immediate', 'outer', 'root']) {
      const outer = path.join(directory, `${restart}-${barrier}`);
      const target = path.join(outer, 'nested', 'telemetry');
      const failedParent =
        barrier === 'immediate'
          ? path.dirname(target)
          : barrier === 'outer'
          ? directory
          : path.parse(directory).root;
      let fail = true,
        attempted = 0,
        closed = 0;
      const isolatedFs = {
        ...fs,
        promises: {
          ...fs.promises,
          open: async (file, ...args) => {
            const handle = await fs.promises.open(file, ...args);
            return {
              writeFile: (...values) => handle.writeFile(...values),
              sync: async () => {
                if (file === failedParent) {
                  attempted++;
                  if (fail)
                    throw new Error('synthetic parent durability failure');
                }
                await handle.sync();
              },
              close: async () => {
                if (file === failedParent) closed++;
                await handle.close();
              },
            };
          },
        },
      };
      const { TelemetryQueue: IsolatedQueue } = loadTs(
        'agent-gateway/telemetryQueue.ts',
        { fs: isolatedFs, './telemetrySample': validation }
      );
      let queue = new IsolatedQueue(target);
      await assert.rejects(
        queue.enqueue(sample('retry')),
        /synthetic parent durability failure/
      );
      assert.equal(queue.length, 0);
      assert.equal(fs.existsSync(target), true);
      const outbox = path.join(target, 'telemetry-queue.json');
      assert.equal(fs.existsSync(outbox), false);
      assert.deepEqual(fs.readdirSync(target), []);
      assert.equal(attempted, 1);
      assert.equal(closed, 1);
      fail = false;
      if (restart) queue = new IsolatedQueue(target);
      await queue.enqueue(sample('retry'));
      assert.equal(attempted, 2);
      assert.equal(closed, 2);
      assert.equal(queue.length, 1);
      assert.deepEqual(read(outbox), [sample('retry')]);
    }
});

test('public telemetry functions use the defensive durable queue with an isolated contract adapter', async (t) => {
  const { directory } = sandbox(t);
  const gateway = path.join(directory, 'agent-gateway');
  fs.mkdirSync(gateway);
  const submitted = [];
  const telemetry = loadTs(
    'agent-gateway/telemetry.ts',
    {
      './telemetryQueue': { TelemetryQueue },
      './utils': { orchestratorWallet: null, agents: new Map() },
      './operator': {
        isOracleContractConfigured: () => true,
        submitEnergyAttestations: async (batch) => {
          submitted.push(...batch);
          return accept(batch);
        },
      },
      './identity': {},
      './security': {},
      './auditAnchoring': {},
    },
    { dirname: gateway }
  );
  await assert.rejects(
    telemetry.publishEnergySample({ cpuTimeMs: {} }),
    /cpuTimeMs/
  );
  assert.equal(telemetry.telemetryQueueLength(), 0);
  await telemetry.publishEnergySample(sample());
  assert.equal(telemetry.telemetryQueueLength(), 1);
  await telemetry.flushTelemetry();
  assert.equal(telemetry.telemetryQueueLength(), 0);
  assert.equal(submitted.length, 1);
  assert.deepEqual(
    read(path.join(directory, 'storage/telemetry/telemetry-queue.json')),
    []
  );
});

function apiModules() {
  const records = [],
    published = [];
  const dependencies = {
    './utils': {
      GATEWAY_API_KEY: apiKey,
      AUTH_MESSAGE: 'Synthetic gateway auth',
      walletManager: {
        get: (value) => (value === address ? { address } : undefined),
      },
    },
    './telemetrySample': validation,
    './telemetry': {
      publishEnergySample: async (value) => {
        published.push(value);
      },
    },
    './deliverableStore': {
      recordTelemetryReport: (value) => {
        records.push(value);
        return {
          ...value,
          id: 'synthetic-record',
          recordedAt: '2026-10-21T00:00:00Z',
        };
      },
    },
    './apiHelpers': {
      normaliseMetadata: (value) => value,
      resolveAgentAddress: async (value) => value,
    },
    './requestBudget': loadTs('agent-gateway/requestBudget.ts'),
  };
  return { records, published, dependencies };
}
function routes() {
  const modules = apiModules();
  const dependencies = { ...modules.dependencies };
  for (const name of [
    './employer',
    './learning',
    './agentFactory',
    './security',
    './validator',
    '../shared/efficiencyMetrics',
    './auditAnchoring',
    './jobPlanner',
    './opportunities',
    './opportunityBacktest',
    '../shared/energyInsights',
    '../shared/energyTrends',
    './thermodynamics',
    './performanceDashboard',
    './systemHealth',
    './stakeCoordinator',
    './events',
    './agentActions',
    './jobSerialization',
    '../shared/logValue',
  ])
    dependencies[name] = {};
  const { default: app } = loadTs('agent-gateway/routes.ts', dependencies);
  const handlers = app._router.stack
    .find(
      (layer) =>
        layer.route?.path === '/jobs/:id/telemetry' && layer.route.methods.post
    )
    .route.stack.map((layer) => layer.handle);
  return {
    ...modules,
    async invoke(body, authorized = true) {
      const req = {
        body,
        params: { id: '42' },
        header: (name) =>
          authorized && name === 'x-api-key' ? apiKey : undefined,
      };
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(value) {
          this.body = value;
          return this;
        },
      };
      const step = async (index) => {
        if (handlers[index])
          await handlers[index](req, res, () => step(index + 1));
      };
      await step(0);
      return res;
    },
  };
}

test('HTTP preflights all sample aliases before either telemetry store changes', async () => {
  for (const field of ['samples', 'energySamples', 'sample', 'energySample']) {
    const api = routes();
    const bad = { cpuTimeMs: 'invalid' };
    const response = await api.invoke({
      address,
      samples: [sample()],
      [field]: field.endsWith('s') ? [sample(), bad] : bad,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'INVALID_TELEMETRY_SAMPLE');
    assert.deepEqual(api.records, []);
    assert.deepEqual(api.published, []);
  }
});

test('HTTP rejects malformed containers and preserves the authenticated valid/no-sample flows', async () => {
  const api = routes();
  for (const body of [{ samples: {} }, { sample: null }, { samples: [42] }])
    assert.equal((await api.invoke({ address, ...body })).statusCode, 400);
  assert.equal(
    (await api.invoke({ address, sample: sample() }, false)).statusCode,
    401
  );
  assert.deepEqual(api.records, []);
  assert.deepEqual(api.published, []);
  assert.equal(
    (await api.invoke({ address, payload: { status: 'ok' } })).body
      .energySamplesPublished,
    0
  );
  const response = await api.invoke({
    address,
    samples: [sample('untrusted')],
    energySample: { energyEstimate: 1 },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.energySamplesPublished, 2);
  assert.ok(
    api.published.every(
      (record) => record.jobId === '42' && record.agent === address
    )
  );
});

function rpc() {
  const modules = apiModules();
  const dependencies = { ...modules.dependencies };
  for (const name of [
    './agentActions',
    './stakeCoordinator',
    './events',
    './jobSerialization',
    '../shared/logValue',
  ])
    dependencies[name] = {};
  const { handleRecordTelemetry } = loadTs(
    'agent-gateway/grpc.ts',
    dependencies,
    { expose: ['handleRecordTelemetry'] }
  );
  return {
    ...modules,
    async invoke(samples, authorized = true) {
      const metadata = new grpc.Metadata();
      if (authorized) metadata.set('x-api-key', apiKey);
      let result;
      await handleRecordTelemetry(
        {
          metadata,
          getPeer: () => 'synthetic-peer',
          request: {
            job_id: '42',
            wallet_address: address,
            samples: samples.map((value) => ({
              payload_json: JSON.stringify(value),
            })),
          },
        },
        (error, value) => {
          result = { error, value };
        }
      );
      return result;
    },
  };
}

test('gRPC preflights the entire batch before side effects and preserves authorized valid ingestion', async () => {
  const api = rpc();
  const rejected = await api.invoke([sample(), { gpuTimeMs: 'invalid' }]);
  assert.equal(rejected.error.code, grpc.status.INVALID_ARGUMENT);
  assert.deepEqual(api.records, []);
  assert.deepEqual(api.published, []);
  assert.equal(
    (await api.invoke([sample()], false)).error.code,
    grpc.status.UNAUTHENTICATED
  );
  const accepted = await api.invoke([
    sample('untrusted'),
    { energyEstimate: 1 },
  ]);
  assert.equal(accepted.error, null);
  assert.equal(accepted.value.energy_samples_published, 2);
  assert.equal(api.records.length, 1);
  assert.ok(
    api.published.every(
      (record) => record.jobId === '42' && record.agent === address
    )
  );
});
