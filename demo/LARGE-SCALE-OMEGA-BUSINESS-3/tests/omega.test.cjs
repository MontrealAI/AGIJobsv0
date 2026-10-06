'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const s = require('../lib/scenario.cjs');
const { run, parseArgs, economics } = require('../lib/mission.cjs');
const { verifyReport } = require('../lib/verify.cjs');
const { runPhase } = require('../lib/processes.cjs');
const { createCandidate } = require('../computer-work/creator.cjs');
const {
  checkCandidate,
  validateInput,
} = require('../computer-work/checker.cjs');
const { createServer, parse: parseServer } = require('../ui/server.cjs');
const { definitions, available, supervise } = require('../ui/stack.cjs');
const mainnet = require('../lib/mainnet.cjs');
const scenario = require('../config/omega.simulation.json');
const workloads = require('../computer-work/workloads.json');
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function options(t, args = []) {
  return parseArgs(['--out', path.join(temp(t), 'run'), ...args], {});
}
const clone = (value) => structuredClone(value);
function rewrite(directory, relative, value) {
  fs.writeFileSync(path.join(directory, relative), s.json(value));
}
function reseal(directory, report) {
  for (const a of report.artifacts) {
    const bytes = fs.readFileSync(path.join(directory, a.path));
    Object.assign(a, {
      bytes: bytes.length,
      sha256: s.sha256(bytes),
      cid: s.cid(bytes),
    });
  }
  rewrite(directory, 'report.json', report);
}
test('scenario retains all three nations and validates precise budgets', () => {
  s.validateScenario(scenario);
  assert.equal(scenario.nations.length, 3);
  assert.equal(s.usdc('9007199254740993.000001'), 9007199254740993000001n);
  assert.equal(s.formatUsdc(-1n), '-0.000001');
});
test('rejects malformed currency, deadlines, duplicate identities, unsafe labels and production mode', () => {
  for (const value of [
    1,
    '1e6',
    'NaN',
    '-1',
    '0.0000001',
    '01',
    '1.',
    ' 1',
    String(s.MAX_RAW),
  ])
    assert.throws(() => s.usdc(value));
  for (const mutate of [
    (x) => (x.nations[0].deadlineHours = 1.1),
    (x) => (x.nations[0].rewardTokens = '-1'),
    (x) => (x.nations[0].wallet = '../escape'),
    (x) => (x.nations[1].wallet = 'SOLARIS'),
    (x) => (x.nations[1].agentEns = x.nations[0].agentEns),
    (x) => (x.ipfsGateway = 'http://ipfs.io/ipfs/'),
    (x) => (x.mode = 'live'),
    (x) => (x.businessPolicy.platformFeeBps = 10001),
    (x) => (x.validators[0].validatorEns = x.nations[0].agentEns),
  ]) {
    const copy = clone(scenario);
    mutate(copy);
    assert.throws(() => s.validateScenario(copy));
  }
});
test('CLI rejects unknown options, invalid capacities, ports and network labels', () => {
  for (const args of [
    ['--typo'],
    ['--scope'],
    ['--review-capacity', '-1'],
    ['--timeout-ms', 'NaN'],
    ['--network', '../mainnet'],
    ['--origin', 'https://example.com'],
    ['--origin', 'http://127.0.0.1:99999'],
  ])
    assert.throws(() => parseArgs(args, {}));
  for (const args of [
    ['--port', '0'],
    ['--port', '65536'],
    ['--port', '3.1'],
    ['--what'],
  ])
    assert.throws(() => parseServer(args, {}));
  assert.equal(s.sanitizeScope('../demo'), '..-demo');
  assert.equal(s.sanitizeScope('..'), 'mission');
});
test('economic accounting rounds exact micro-units up and does not pay', () => {
  const n = {
    budgetUsdc: '0.000003',
    modeledWorkerCostUsdc: '0.000001',
    estimatedReviewMinutes: 1,
  };
  const e = economics(n, {
    reviewRateUsdcPerHour: '0.000001',
    platformFeeBps: 1,
  });
  assert.equal(e.reviewCostMicros, '1');
  assert.equal(e.feeMicros, '1');
  assert.equal(e.remainingMicros, '0');
  assert.equal(e.actualPaidMicros, '0');
});
for (const [key, input] of Object.entries(workloads))
  test(`${key}: independent checker accepts complete arithmetic and rejects tampering`, () => {
    const result = createCandidate(input);
    assert.equal(checkCandidate(s.json(input), s.json(result)).accepted, true);
    for (const mutate of [
      (x) => x.rows.pop(),
      (x) => (x.rows[1] = x.rows[0]),
      (x) => (x.sourceSha256 = '0'.repeat(64)),
      (x) => (x.settlementApproved = true),
      (x) => (x.summary = {}),
      (x) => (x.rows[0].extra = 'wrong'),
    ]) {
      const bad = clone(result);
      mutate(bad);
      assert.equal(checkCandidate(s.json(input), s.json(bad)).accepted, false);
    }
    assert.equal(
      checkCandidate(s.json(input) + ' ', s.json(result)).accepted,
      false
    );
  });
test('supplier winner excludes cheap late bids; deterministic ties and no eligible bids', () => {
  const input = clone(workloads.silkroad);
  assert.equal(createCandidate(input).summary.recommended, 'stellar');
  input.rows = [
    {
      id: 'a-1',
      unitPriceMicros: '9007199254740993',
      shippingMicros: '1',
      deliveryDays: 2,
    },
    {
      id: 'a01',
      unitPriceMicros: '9007199254740993',
      shippingMicros: '1',
      deliveryDays: 2,
    },
  ];
  const candidate = createCandidate(input);
  assert.equal(candidate.summary.recommended, 'a-1');
  assert.equal(checkCandidate(s.json(input), s.json(candidate)).accepted, true);
  input.maxDeliveryDays = 1;
  assert.equal(createCandidate(input).summary.recommended, null);
});
test('workload bounds and malformed candidates fail closed', () => {
  const input = clone(workloads.solaris);
  input.rows[0].generatedKwh = 12500;
  assert.throws(() => validateInput(input));
  assert.equal(checkCandidate('{}', '{').accepted, false);
  assert.equal(
    checkCandidate(s.json(workloads.solaris), ' '.repeat(131073)).accepted,
    false
  );
});
test('complete offline mission binds inputs, tasks, results and independent checks', async (t) => {
  const result = await run(options(t));
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.review.reservedMinutes, 37);
  assert.equal(result.report.totals.fixtureAccepted, 3);
  assert.equal(result.report.totals.actualPayoutMicros, '0');
  assert.equal(verifyReport(result.out).report.runId, result.report.runId);
  await assert.rejects(
    run({ ...options(t), out: result.out }),
    /already exists/
  );
});
test('handoffs reject oversized valid workloads and include all instruction overhead', () => {
  const { taskFor } = require('../lib/mission.cjs');
  const input = clone(workloads.solaris),
    nation = scenario.nations[0];
  input.rows = Array.from({ length: 1000 }, (_, index) => ({
    id: `row-${index}`,
    generatedKwh: '1',
    consumedKwh: '0',
  }));
  validateInput(input);
  assert.throws(() => taskFor(nation, input), /input text exceeds 32000/);
  const boundary = { ...clone(workloads.solaris), padding: '' };
  boundary.padding = 'x'.repeat(
    32000 - taskFor(nation, boundary).inputText.length
  );
  assert.equal(taskFor(nation, boundary).inputText.length, 32000);
  boundary.padding += 'x';
  assert.throws(() => taskFor(nation, boundary), /input text exceeds 32000/);
});
test('a real mission rejects oversized handoffs even when all jobs are deferred', (t) => {
  const dir = temp(t),
    demo = path.join(dir, 'demo', 'LARGE-SCALE-OMEGA-BUSINESS-3');
  fs.cpSync(s.DEMO, demo, { recursive: true });
  const changed = clone(workloads);
  changed.solaris.rows = Array.from({ length: 1000 }, (_, index) => ({
    id: `row-${index}`,
    generatedKwh: '1',
    consumedKwh: '0',
  }));
  rewrite(demo, 'computer-work/workloads.json', changed);
  const out = path.join(dir, 'run');
  const result = spawnSync(
    process.execPath,
    [
      path.join(demo, 'lib/mission.cjs'),
      '--out',
      out,
      '--review-capacity',
      '0',
    ],
    { encoding: 'utf8', timeout: 5000 }
  );
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /input text exceeds 32000/);
  const report = path.join(out, 'report.json');
  if (fs.existsSync(report))
    assert.equal(JSON.parse(fs.readFileSync(report)).successful, false);
  assert.equal(fs.existsSync(path.join(out, 'solaris/task.json')), false);
});
for (const capacity of ['0', '100'])
  test(`subset scenarios export verifiable workloads with review capacity ${capacity}`, async (t) => {
    const dir = temp(t),
      selected = clone(scenario);
    selected.nations = [selected.nations[1]];
    rewrite(dir, 'scenario.json', selected);
    const result = await run(
      options(t, [
        '--scenario',
        path.join(dir, 'scenario.json'),
        '--review-capacity',
        capacity,
      ])
    );
    assert.equal(result.exitCode, 0);
    const saved = JSON.parse(
      fs.readFileSync(path.join(result.out, 'workloads.json'))
    );
    assert.deepEqual(Object.keys(saved), [selected.nations[0].wallet]);
    assert.equal(verifyReport(result.out).report.jobs.length, 1);
    assert.equal(result.report.totals.deferred, capacity === '0' ? 1 : 0);
  });
test('admission reserves review capacity before starting work', async (t) => {
  const result = await run(options(t, ['--review-capacity', '10']));
  assert.equal(result.report.totals.admitted, 1);
  assert.equal(result.report.totals.deferred, 2);
  assert.equal(result.report.review.reservedMinutes, 10);
  assert.equal(
    fs.existsSync(path.join(result.out, 'arctic/candidate.json')),
    false
  );
  verifyReport(result.out);
});
test('over-budget jobs are deferred even with review capacity', async (t) => {
  const dir = temp(t),
    copy = clone(scenario);
  copy.nations[0].budgetUsdc = '1';
  const file = path.join(dir, 'scenario.json');
  rewrite(dir, 'scenario.json', copy);
  const result = await run(options(t, ['--scenario', file]));
  assert.equal(result.report.jobs[0].status, 'deferred');
  assert.match(result.report.jobs[0].admission.reason, /costs/);
  verifyReport(result.out);
});
test('verification validates deferred inputs even after all related artifacts are resealed', async (t) => {
  const result = await run(options(t, ['--review-capacity', '0']));
  const changed = clone(workloads),
    report = clone(result.report);
  changed.solaris.rows[0].generatedKwh = 'not-a-number';
  rewrite(result.out, 'workloads.json', changed);
  report.workloadSha256 = s.sha256(
    fs.readFileSync(path.join(result.out, 'workloads.json'))
  );
  const job = report.jobs.find((entry) => entry.key === 'solaris');
  rewrite(result.out, job.files.input, changed.solaris);
  const { taskFor } = require('../lib/mission.cjs');
  rewrite(
    result.out,
    job.files.task,
    taskFor(
      scenario.nations.find((nation) => nation.wallet === job.key),
      changed.solaris,
      report.workerOrigin
    )
  );
  reseal(result.out, report);
  assert.throws(() => verifyReport(result.out));
});
test('workload goals obey the live adapter contract, including deferred evidence', async (t) => {
  for (const goal of [undefined, null, false, 7, '', '  \n ', 'x'.repeat(2001)])
    assert.throws(() => validateInput({ ...workloads.solaris, goal }), /goal/);
  validateInput({ ...workloads.solaris, goal: 'x'.repeat(2000) });
  const result = await run(options(t, ['--review-capacity', '0']));
  const changed = clone(workloads),
    report = clone(result.report);
  delete changed.solaris.goal;
  rewrite(result.out, 'workloads.json', changed);
  report.workloadSha256 = s.sha256(
    fs.readFileSync(path.join(result.out, 'workloads.json'))
  );
  const job = report.jobs.find((entry) => entry.key === 'solaris');
  rewrite(result.out, job.files.input, changed.solaris);
  const { taskFor } = require('../lib/mission.cjs');
  rewrite(
    result.out,
    job.files.task,
    taskFor(
      scenario.nations.find((nation) => nation.wallet === job.key),
      changed.solaris,
      report.workerOrigin
    )
  );
  reseal(result.out, report);
  assert.throws(() => verifyReport(result.out), /goal/);
});
test('rejected candidates produce retained evidence and exit failure', async (t) => {
  const result = await run(options(t, ['--inject-error']));
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.jobs[0].status, 'rejected');
  assert.equal(result.report.totals.fixtureAccepted, 2);
  verifyReport(result.out);
});
test('verification rejects artifact edits and resealed lies about input or accounting', async (t) => {
  const result = await run(options(t));
  const file = path.join(result.out, 'solaris/input.json'),
    original = fs.readFileSync(file);
  fs.appendFileSync(file, ' ');
  assert.throws(() => verifyReport(result.out), /Hash mismatch|Expected/);
  fs.writeFileSync(file, original);
  const report = clone(result.report);
  report.jobs[0].economics.budgetMicros = '999';
  rewrite(result.out, 'report.json', report);
  assert.throws(() => verifyReport(result.out));
  rewrite(result.out, 'report.json', result.report);
  const input = JSON.parse(original);
  input.rows[0].generatedKwh = '999999';
  rewrite(result.out, 'solaris/input.json', input);
  reseal(result.out, result.report);
  assert.throws(() => verifyReport(result.out));
});
test('verification rejects symlink and traversal evidence', async (t) => {
  const result = await run(options(t)),
    outside = path.join(temp(t), 'outside.json');
  fs.writeFileSync(outside, '{}');
  fs.unlinkSync(path.join(result.out, 'solaris/input.json'));
  fs.symlinkSync(outside, path.join(result.out, 'solaris/input.json'));
  assert.throws(() => verifyReport(result.out), /escapes/);
});
test('full phase failure is retained and stops subsequent commands', async (t) => {
  const seen = [];
  const result = await run(options(t, ['--full']), {
    runPhase: async (def, opts) => {
      seen.push(def);
      assert.equal(opts.env.HARDHAT_NETWORK, 'hardhat');
      return {
        id: def.id,
        label: def.label,
        status: 'failed',
        exitCode: 2,
        error: 'Fixture phase failed',
      };
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(seen.length, 1);
  assert.equal(result.report.phases[0].status, 'failed');
  verifyReport(result.out);
});
test('successful phases must actually create their declared output', async (t) => {
  const result = await run(options(t, ['--full']), {
    runPhase: async (def) => ({
      id: def.id,
      label: def.label,
      status: 'success',
      exitCode: 0,
    }),
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.report.phases[0].error, /ENOENT|Missing/);
  verifyReport(result.out);
});
test('full phases read the saved scenario when the original changes', async (t) => {
  const dir = temp(t),
    input = path.join(dir, 'mutable-scenario.json');
  fs.writeFileSync(input, s.json(scenario));
  const opts = options(t, ['--full', '--scenario', input]);
  let phases = 0;
  const result = await run(opts, {
    runPhase: async (def, context) => {
      phases++;
      fs.writeFileSync(input, '{"changed":"after initial review"}');
      assert.equal(
        context.env.OMEGA_SCENARIO_FILE,
        path.join(opts.out, 'scenario.json')
      );
      assert.deepEqual(
        JSON.parse(fs.readFileSync(context.env.OMEGA_SCENARIO_FILE)),
        scenario
      );
      if (def.id === 'omega-simulation')
        return {
          id: def.id,
          label: def.label,
          status: 'failed',
          exitCode: 2,
          error: 'Fixture stops before contract execution',
        };
      fs.writeFileSync(
        path.join(opts.out, def.file),
        def.file.endsWith('.json') ? '{}' : 'Fixture owner report'
      );
      return { id: def.id, label: def.label, status: 'success', exitCode: 0 };
    },
  });
  assert.equal(phases, 5);
  assert.equal(result.exitCode, 1);
  verifyReport(result.out);
});
test('external phases report spawn errors and timeouts', async () => {
  const missing = await runPhase(
    { id: 'missing', command: '/omega-command-does-not-exist', args: [] },
    { timeoutMs: 200 }
  );
  assert.equal(missing.status, 'failed');
  const timed = await runPhase(
    {
      id: 'timeout',
      command: process.execPath,
      args: ['-e', 'setInterval(()=>{},1000)'],
    },
    { timeoutMs: 120 }
  );
  assert.equal(timed.timedOut, true);
  assert.equal(timed.status, 'failed');
  assert.ok(timed.durationMs < 3000);
});
test(
  'timeout terminates descendant process group',
  { skip: process.platform === 'win32' },
  async (t) => {
    const file = path.join(temp(t), 'child.pid');
    const program = `const {spawn}=require('node:child_process');const fs=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(
      file
    )},String(c.pid));setInterval(()=>{},1000);`;
    const phase = await runPhase(
      { id: 'tree', command: process.execPath, args: ['-e', program] },
      { timeoutMs: 350 }
    );
    assert.equal(phase.timedOut, true);
    const pid = Number(fs.readFileSync(file));
    let running = true;
    for (let i = 0; i < 40 && running; i++) {
      try {
        process.kill(pid, 0);
        if (process.platform === 'linux') {
          try {
            running = !/\) Z /.test(
              fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
            );
          } catch (error) {
            if (error.code === 'ENOENT') running = false;
            else throw error;
          }
        }
      } catch (error) {
        if (error.code === 'ESRCH') running = false;
        else throw error;
      }
      if (running) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(running, false, 'descendant must terminate');
  }
);
function request(port, url, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: url, method, headers },
      (res) => {
        let body = '';
        res.on('data', (x) => (body += x));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}
test('dashboard serves only verified artifacts and loopback read requests', async (t) => {
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const result = await run(
    options(t, ['--origin', `http://127.0.0.1:${port}`])
  );
  assert.throws(
    () => createServer(result.out, port === 4186 ? 4187 : 4186),
    /Report worker origin/
  );
  const server = createServer(result.out, port);
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const home = await request(port, '/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-security-policy'], /default-src 'none'/);
  assert.equal((await request(port, '/api/report')).status, 200);
  for (const url of [
    '/download/../scenario.json',
    '/download/%2e%2e/secret',
    '/download/nonexistent.json',
    '/api/report?unsafe=1',
  ])
    assert.equal((await request(port, url)).status, 404);
  assert.equal(
    (await request(port, '/', { Host: 'attacker.example' })).status,
    403
  );
  assert.equal(
    (await request(port, '/', { Origin: 'https://attacker.example' })).status,
    403
  );
  assert.equal((await request(port, '/', {}, 'POST')).status, 405);
  assert.equal(
    (await request(port, '/download/solaris/task.json')).status,
    200
  );
  fs.appendFileSync(path.join(result.out, 'solaris/task.json'), ' ');
  assert.equal(
    (await request(port, '/download/solaris/task.json')).status,
    409
  );
});
test('advanced app ports are explicit and duplicate or occupied ports fail', async (t) => {
  const defs = definitions({});
  assert.ok(defs[0].args.includes('--strictPort'));
  assert.ok(defs[1].args.includes('--hostname'));
  assert.throws(() => definitions({ OWNER_CONSOLE_PORT: '3001' }));
  assert.throws(() => definitions({ OWNER_CONSOLE_PORT: '0' }));
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  await assert.rejects(available(server.address().port), /occupied/);
});
test(
  'advanced supervisor cleans up after failed readiness',
  { skip: process.platform === 'win32' },
  async () => {
    const probe = http.createServer();
    await new Promise((r) => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    await assert.rejects(
      supervise(
        [
          {
            id: 'no-server',
            port,
            command: process.execPath,
            args: ['-e', 'setInterval(()=>{},1000)'],
          },
        ],
        { timeoutMs: 150 }
      ),
      /timed out/
    );
  }
);
test('mainnet default is an inert plan and refuses unreviewed execution', () => {
  assert.equal(mainnet.parse([]).execute, false);
  assert.throws(() => mainnet.parse(['--yes']));
  assert.throws(() => mainnet.parse(['--execute']));
  const r = spawnSync(
    process.execPath,
    [path.join(s.DEMO, 'lib/mainnet.cjs')],
    { encoding: 'utf8' }
  );
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no commands executed/);
});
test('mainnet config hash, governance and fresh output are mandatory', (t) => {
  const dir = temp(t),
    config = path.join(dir, 'deploy.json'),
    env = path.join(dir, 'operator.env'),
    ticket = path.join(dir, 'ticket.md');
  fs.writeFileSync(env, '# no secrets\n');
  const value = {
    network: 'mainnet',
    governance: '0x' + '1'.repeat(40),
    econ: { treasury: '0x' + '2'.repeat(40) },
    output: path.join(dir, 'addresses.json'),
  };
  rewrite(dir, 'deploy.json', value);
  const args = [
    '--execute',
    '--config',
    config,
    '--config-sha256',
    s.sha256(fs.readFileSync(config)),
    '--env',
    env,
    '--ticket',
    ticket,
  ];
  assert.equal(mainnet.parse(args).execute, true);
  assert.throws(
    () => mainnet.parse([...args, '--env', config]),
    /must be distinct files/
  );
  const hardlink = path.join(dir, 'config-hardlink.env');
  fs.linkSync(config, hardlink);
  assert.throws(
    () => mainnet.parse([...args, '--env', hardlink]),
    /must be distinct files/
  );
  assert.throws(
    () => mainnet.parse([...args, '--ticket', value.output]),
    /must be distinct/
  );
  assert.throws(
    () =>
      mainnet.parse([
        ...args,
        '--ticket',
        path.join(dir, 'unused', '..', 'addresses.json'),
      ]),
    /must be distinct/
  );
  if (process.platform !== 'win32') {
    const alias = path.join(dir, 'alias');
    fs.symlinkSync(dir, alias, 'dir');
    assert.throws(
      () => mainnet.parse([...args, '--env', path.join(alias, 'deploy.json')]),
      /must be distinct files/
    );
    assert.throws(
      () =>
        mainnet.parse([
          ...args,
          '--ticket',
          path.join(alias, 'addresses.json'),
        ]),
      /must be distinct/
    );
  }
  fs.appendFileSync(config, ' ');
  assert.throws(() => mainnet.parse(args), /digest/);
});
test('mainnet validates the selected config economics before accepting execution', (t) => {
  const dir = temp(t),
    config = path.join(dir, 'deploy.json'),
    env = path.join(dir, 'operator.env');
  fs.writeFileSync(env, '# fixture');
  const base = {
    network: 'mainnet',
    governance: '0x' + '1'.repeat(40),
    econ: { treasury: '0x' + '2'.repeat(40) },
    output: path.join(dir, 'addresses.json'),
  };
  const check = (value) => {
    rewrite(dir, 'deploy.json', value);
    return mainnet.parse([
      '--execute',
      '--config',
      config,
      '--config-sha256',
      s.sha256(fs.readFileSync(config)),
      '--env',
      env,
      '--ticket',
      path.join(dir, 'ticket.md'),
    ]);
  };
  const valid = clone(base);
  Object.assign(valid.econ, {
    feePct: 100,
    burnPct: 0,
    minStake: '0.000000000000000001',
    jobStake: '500',
    commitWindow: '1d',
    revealWindow: '1h 30m',
    disputeWindow: 0,
    employerSlashPct: 10,
    treasurySlashPct: 80,
    validatorSlashRewardPct: 10,
  });
  valid.secureDefaults = {
    pauseOnLaunch: true,
    maxJobRewardAgia: 25,
    maxJobDurationSeconds: 86400,
    validatorCommitWindowSeconds: 60,
    validatorRevealWindowSeconds: 60,
  };
  assert.equal(check(valid).execute, true);
  for (const [section, key, value] of [
    ['econ', 'feePct', 101],
    ['econ', 'feePtc', 5],
    ['econ', 'minPlatfromStake', '1000'],
    ['econ', 'feePct', 0.5],
    ['econ', 'burnPct', -1],
    ['econ', 'feePct', '5'],
    ['econ', 'minStake', '-1'],
    ['econ', 'appealFee', '1e3'],
    ['econ', 'minPlatformStake', true],
    ['econ', 'minStake', '0.0000000000000000001'],
    ['econ', 'jobStake', '79228162515'],
    ['econ', 'appealFee', '9'.repeat(80)],
    ['econ', 'commitWindow', '-1d'],
    ['econ', 'revealWindow', '1d junk'],
    ['econ', 'disputeWindow', '0.1s'],
    ['econ', 'commitWindow', '100000000000000000000'],
    ['econ', 'commitWindow', '100000000000000000000s'],
    ['econ', 'commitWindow', 0],
    ['econ', 'disputeWindow', Number.MAX_SAFE_INTEGER + 1],
    ['econ', 'employerSlashPct', 1],
    ['econ', 'validatorSlashRewardPct', 1],
    ['secureDefaults', 'pauseOnLaunch', 'false'],
    ['secureDefaults', 'validatorCommitWindowSeconds', 0],
    ['secureDefaults', 'maxJobDurationSeconds', '1d'],
    ['secureDefaults', 'maxJobRewardAgia', -1],
    ['secureDefaults', 'maxJobRewardAgia', true],
    ['secureDefaults', 'unknown', 1],
  ]) {
    const valueConfig = clone(base);
    valueConfig[section] = { ...valueConfig[section], [key]: value };
    assert.throws(
      () => check(valueConfig),
      undefined,
      `${section}.${key}=${value}`
    );
  }
  assert.equal(fs.existsSync(base.output), false);
});
test('change-ticket publication never overwrites competing evidence', (t) => {
  const output = path.join(temp(t), 'ticket.md');
  let staged;
  assert.throws(
    () =>
      mainnet.publishChangeTicket(output, (file) => {
        staged = file;
        fs.writeFileSync(file, 'new ticket');
        fs.writeFileSync(output, 'competing evidence');
      }),
    /publication failed/
  );
  t.after(() =>
    fs.rmSync(path.dirname(staged), { recursive: true, force: true })
  );
  assert.equal(fs.readFileSync(output, 'utf8'), 'competing evidence');
  assert.equal(fs.readFileSync(staged, 'utf8'), 'new ticket');
  const fresh = path.join(temp(t), 'nested', 'fresh.md');
  let successDir;
  mainnet.publishChangeTicket(fresh, (file) => {
    successDir = path.dirname(file);
    fs.writeFileSync(file, 'reviewed ticket');
  });
  assert.equal(fs.readFileSync(fresh, 'utf8'), 'reviewed ticket');
  assert.equal(fs.existsSync(successDir), false);
});
test('mainnet addressbook reservation rejects competing output and retains receipts', (t) => {
  const {
    reserveDeploymentOutput,
  } = require('../../../scripts/v2/lib/reserved-output.cjs');
  const dir = temp(t),
    output = path.join(dir, 'addresses.json'),
    source = path.join(dir, 'source.json');
  fs.writeFileSync(source, '{"deployed":"fixture"}');
  fs.writeFileSync(output, 'earlier run');
  assert.throws(() => reserveDeploymentOutput(output), /EEXIST/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'earlier run');
  fs.unlinkSync(output);
  const reservation = reserveDeploymentOutput(output);
  try {
    assert.throws(
      () => fs.writeFileSync(output, 'competing run', { flag: 'wx' }),
      /EEXIST/
    );
    reservation.copyFrom(source);
    assert.equal(
      fs.readFileSync(output, 'utf8'),
      fs.readFileSync(source, 'utf8')
    );
  } finally {
    reservation.close();
  }
  assert.equal(fs.existsSync(output), true);
});
test('replaced addressbook is never overwritten and failed reservation stays visible', (t) => {
  const {
    reserveDeploymentOutput,
  } = require('../../../scripts/v2/lib/reserved-output.cjs');
  const dir = temp(t),
    output = path.join(dir, 'addresses.json'),
    source = path.join(dir, 'source.json');
  fs.writeFileSync(source, '{"retained":"receipts"}');
  const reservation = reserveDeploymentOutput(output);
  try {
    fs.unlinkSync(output);
    fs.writeFileSync(output, 'another run');
    assert.throws(() => reservation.copyFrom(source), /replaced/);
    assert.equal(fs.readFileSync(output, 'utf8'), 'another run');
    assert.equal(fs.readFileSync(source, 'utf8'), '{"retained":"receipts"}');
  } finally {
    reservation.close();
  }
  const failed = path.join(dir, 'failed.json');
  reserveDeploymentOutput(failed).close();
  assert.equal(fs.statSync(failed).size, 0);
  assert.throws(() => reserveDeploymentOutput(failed), /EEXIST/);
});
test('deployment source files are isolated between concurrent outputs', (t) => {
  const {
    prepareDeploymentSource,
  } = require('../../../scripts/v2/lib/reserved-output.cjs');
  const dir = temp(t),
    first = prepareDeploymentSource(path.join(dir, 'first.json')),
    second = prepareDeploymentSource(path.join(dir, 'second.json'));
  assert.notEqual(path.dirname(first.file), path.dirname(second.file));
  assert.equal(fs.statSync(path.dirname(first.file)).mode & 0o777, 0o700);
  fs.writeFileSync(first.file, '{"deployed":"first"}', {
    flag: 'wx',
    mode: 0o400,
  });
  fs.writeFileSync(second.file, '{"deployed":"second"}', {
    flag: 'wx',
    mode: 0o400,
  });
  assert.equal(fs.readFileSync(first.file, 'utf8'), '{"deployed":"first"}');
  assert.equal(fs.readFileSync(second.file, 'utf8'), '{"deployed":"second"}');
  first.complete();
  assert.equal(fs.existsSync(path.dirname(first.file)), false);
  assert.equal(fs.readFileSync(second.file, 'utf8'), '{"deployed":"second"}');
  second.complete();
});
test('addressbook consumers use protected produced bytes through replacement and failure', async (t) => {
  const {
    reserveDeploymentOutput,
    withAddressbookSnapshot,
  } = require('../../../scripts/v2/lib/reserved-output.cjs');
  const dir = temp(t),
    output = path.join(dir, 'addresses.json'),
    source = path.join(dir, 'source.json');
  fs.writeFileSync(source, '{"deployed":"original"}');
  const reservation = reserveDeploymentOutput(output);
  let snapshot;
  try {
    const bytes = reservation.copyFrom(source);
    await assert.rejects(
      withAddressbookSnapshot(bytes, async (file) => {
        snapshot = file;
        assert.equal(fs.statSync(file).mode & 0o777, 0o400);
        assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o500);
        fs.writeFileSync(output, '{"deployed":"changed"}');
        assert.throws(() => reservation.verify(), /contents changed/);
        fs.unlinkSync(output);
        fs.writeFileSync(output, '{"deployed":"replaced"}');
        assert.throws(() => reservation.verify(), /replaced/);
        await Promise.resolve();
        assert.equal(fs.readFileSync(file, 'utf8'), '{"deployed":"original"}');
        throw new Error('consumer failed');
      }),
      /consumer failed/
    );
  } finally {
    reservation.close();
  }
  assert.equal(fs.existsSync(path.dirname(snapshot)), false);
  assert.equal(fs.readFileSync(output, 'utf8'), '{"deployed":"replaced"}');
});
test('mainnet wizard and child keep reviewed bytes when the original config changes', (t) => {
  const config = path.join(temp(t), 'config.json'),
    reviewed = '{"network":"mainnet"}';
  fs.writeFileSync(config, reviewed);
  let snapshot;
  mainnet.withReviewedConfig(config, s.sha256(reviewed), (file) => {
    snapshot = file;
    assert.notEqual(file, config);
    assert.equal(fs.statSync(file).mode & 0o777, 0o400);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o500);
    assert.equal(fs.readFileSync(file, 'utf8'), reviewed);
    fs.writeFileSync(config, '{"network":"changed-during-confirmation"}');
    assert.equal(fs.readFileSync(file, 'utf8'), reviewed);
  });
  assert.equal(fs.existsSync(path.dirname(snapshot)), false);
  assert.throws(
    () =>
      mainnet.withReviewedConfig(config, s.sha256(reviewed), () =>
        assert.fail('must not launch')
      ),
    /changed during preflight/
  );
});
test('reviewed snapshot is cleaned up after wizard failure', (t) => {
  const config = path.join(temp(t), 'config.json');
  fs.writeFileSync(config, '{}');
  let snapshot;
  assert.throws(
    () =>
      mainnet.withReviewedConfig(config, s.sha256('{}'), (file) => {
        snapshot = file;
        throw new Error('wizard stopped');
      }),
    /wizard stopped/
  );
  assert.equal(fs.existsSync(path.dirname(snapshot)), false);
});
test('all shell launchers resolve the root from an unrelated working directory', (t) => {
  const cwd = temp(t);
  for (const script of [
    'omega-business.sh',
    'omega-ui.sh',
    'omega-mainnet.sh',
  ]) {
    const r = spawnSync('bash', [path.join(s.DEMO, 'bin', script), '--help'], {
      cwd,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.length > 20);
  }
});
test('original flowchart and scenario personas stay present', () => {
  const readme = fs.readFileSync(path.join(s.DEMO, 'README.md'), 'utf8');
  assert.match(readme, /Operators\(\(Mission Owners\)\)/);
  for (const nation of scenario.nations)
    assert.ok(readme.includes(nation.name));
});

test('excessive subprocess output fails within the configured bound', async () => {
  const result = await runPhase(
    {
      id: 'noisy',
      command: process.execPath,
      args: ['-e', "setInterval(()=>process.stdout.write('x'.repeat(4096)),1)"],
    },
    { timeoutMs: 3000, maxOutputBytes: 2048 }
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'Phase output exceeded limit');
  assert.equal(result.timedOut, false);
});
test('unexpected phase exceptions retain failed report evidence', async (t) => {
  const result = await run(options(t, ['--full']), {
    runPhase: async () => {
      throw new Error('fixture unexpected transport failure');
    },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.report.phases[0].error, /unexpected transport/);
  verifyReport(result.out);
});
test('raw CID matches the known empty-file SHA-256 identifier', () => {
  assert.equal(
    s.cid(Buffer.alloc(0)),
    'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
  );
});
