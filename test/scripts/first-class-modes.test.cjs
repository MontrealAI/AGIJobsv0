// Source/inert-only regression tests. No real launcher, package manager, RPC,
// deployment, dotenv, Docker or signing process is invoked.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const sourceFile = path.join(root, 'scripts/v2/agiOsFirstClassDemo.ts');
const source = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;
const execute = [
  '--mode',
  'execute',
  '--network',
  'localhost',
  '--yes',
  '--no-compose',
];
const safeCases = [
  [],
  ['--help'],
  ['-h'],
  ['-?'],
  ['--mode', 'plan'],
  ['--dry-run'],
  ['--network', 'sepolia'],
  ['--yes'],
  ['--non-interactive'],
  ['--mode', 'plan', '--network', 'localhost', '--yes', '--compose'],
];
const invalidCases = [
  [...execute, '--unknown'],
  [...execute, '--auto-yes'],
  [...execute, '--dry-run=false'],
  [...execute, '--help'],
  ['--help', '--mode', 'execute'],
  ['--help', '--unknown'],
  ['--mode'],
  ['--mode', ''],
  ['--mode', 'typo'],
  ['--mode=execute'],
  ['--mode', 'plan', '--mode', 'execute'],
  ['--mode', 'plan', '--dry-run'],
  ['--dry-run', '--mode', 'execute'],
  ['--dry-run', '--dry-run'],
  ['--dry-run=true'],
  ['--dry-run=false'],
  ['--dry-run', 'false'],
  ['--network'],
  ['--network', ''],
  ['--network', '--yes'],
  ['--network=localhost'],
  ['--network', 'mainnet'],
  ['--network', 'toString'],
  ['--network', 'https://example.invalid'],
  ['--network', 'localhost', '--network', 'sepolia'],
  ['--yes', '--yes'],
  ['--non-interactive', '--non-interactive'],
  ['--compose', '--compose'],
  ['--no-compose', '--no-compose'],
  ['--skip-deploy', '--skip-deploy'],
  ['--compose', '--no-compose'],
  ['--compose', '--skip-deploy'],
  ['--yes=false'],
  ['--yes', 'false'],
  ['--unknown'],
  ['--stage', 'commit-reveal'],
  ['--auto'],
  ['--auto-yes'],
  ['interactive'],
  ['--'],
  ['stray'],
  ['--mode', 'execute'],
  ['--mode', 'execute', '--yes', '--no-compose'],
  ['--mode', 'execute', '--network', 'localhost', '--yes'],
  [
    '--mode',
    'execute',
    '--network',
    'localhost',
    '--non-interactive',
    '--no-compose',
  ],
  ['--mode', 'execute', '--network', 'sepolia', '--no-compose'],
];

function loadSource({
  docker = true,
  failCommand,
  signalCommand,
  inherited = {},
  failManifestWrite = false,
} = {}) {
  const effects = [];
  const commands = [];
  const output = [];
  const files = new Map();
  let historyCounter = 0;
  const base = path.join(root, 'reports/agi-os');
  const summary = { total: 0, ready: 0, needsConfig: 0, missingSurface: 0 };
  files.set(path.join(root, 'deployment-config/oneclick.env'), 'fixture only');
  files.set(path.join(base, 'grand-summary.md'), '# Hardhat fixture only');
  files.set(
    path.join(base, 'first-class/owner-control-map.mmd'),
    'graph TD; fixture-->owner'
  );
  files.set(
    path.join(base, 'grand-summary.json'),
    JSON.stringify({ control: { modules: [], summary } })
  );
  files.set(
    path.join(base, 'owner-control-matrix.json'),
    JSON.stringify({ modules: [], summary })
  );
  const fsStub = {
    existsSync(file) {
      effects.push(['exists', file]);
      return files.has(file);
    },
    promises: {
      async mkdir(file) {
        effects.push(['mkdir', file]);
      },
      async mkdtemp(prefix) {
        effects.push(['mkdtemp', prefix]);
        return `${prefix}${++historyCounter}`;
      },
      async rename(from, to) {
        effects.push(['rename', from, to]);
        assert.ok(files.has(from), `Unexpected rename: ${from}`);
        files.set(to, files.get(from));
        files.delete(from);
      },
      async rm(file) {
        effects.push(['rm', file]);
        files.delete(file);
      },
      async access(file) {
        effects.push(['access', file]);
        if (!files.has(file) && file !== path.join(root, 'node_modules'))
          throw Object.assign(new Error('fixture missing'), { code: 'ENOENT' });
      },
      async readFile(file, encoding) {
        effects.push(['read', file]);
        assert.ok(files.has(file), `Unexpected fixture read: ${file}`);
        return encoding
          ? String(files.get(file))
          : Buffer.from(files.get(file));
      },
      async writeFile(file, value) {
        effects.push(['write', file]);
        if (
          failManifestWrite &&
          file.endsWith('first-class-manifest.json.pending')
        ) {
          files.set(file, '{"partial":');
          throw new Error('inert partial manifest write failure');
        }
        files.set(file, value);
      },
      async copyFile() {
        throw new Error('Unexpected environment template copy');
      },
    },
  };
  const childProcess = {
    spawn(command, args, options) {
      effects.push(['spawn', command, ...args]);
      commands.push({ command, args: [...args], options });
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        if (command === 'git' && args[0] === 'status')
          child.stdout.emit('data', Buffer.from(''));
        else child.stdout.emit('data', Buffer.from('inert fixture output'));
        child.emit(
          'exit',
          signalCommand?.(command, args)
            ? null
            : (!docker && command === 'docker') || failCommand?.(command, args)
            ? 91
            : 0
        );
      });
      return child;
    },
  };
  const fakeProcess = {
    argv: ['node', sourceFile],
    env: { CI: 'true', ASTRAL_OS_AUTO: 'true', ...inherited },
    stdin: { isTTY: false },
    stdout: {
      write(value) {
        output.push(String(value));
      },
    },
    version: process.version,
  };
  const module = { exports: {} };
  const allowed = {
    child_process: childProcess,
    crypto: require('node:crypto'),
    fs: fsStub,
    os: { hostname: () => 'inert-host' },
    path,
  };
  function requireStub(name) {
    assert.ok(
      Object.hasOwn(allowed, name),
      `Unexpected dependency or dotenv load: ${name}`
    );
    return allowed[name];
  }
  const context = {
    module,
    exports: module.exports,
    require: requireStub,
    process: fakeProcess,
    __dirname: path.dirname(sourceFile),
    Buffer,
    console: {
      log: (...values) => output.push(values.join(' ')),
      error: (...values) => output.push(values.join(' ')),
    },
  };
  vm.runInNewContext(source, context, { filename: sourceFile });
  return {
    api: module.exports,
    effects,
    commands,
    files,
    output,
    process: fakeProcess,
  };
}

test('TypeScript default/help/plan/dry-run touch no configuration, filesystem or subprocess, even in hostile automation env', async () => {
  for (const args of safeCases) {
    const f = loadSource();
    await f.api.main(args);
    assert.deepEqual(f.effects, [], JSON.stringify(args));
    assert.match(f.output.join('\n'), /plan/i);
  }
});

test('TypeScript rejects every malformed or unapproved invocation before effects', async () => {
  for (const args of invalidCases) {
    const f = loadSource();
    await assert.rejects(f.api.main(args), undefined, JSON.stringify(args));
    assert.deepEqual(f.effects, [], JSON.stringify(args));
  }
});

test('only explicit --yes is consent; environment and non-interactive are never consent', () => {
  const f = loadSource();
  for (const args of [
    {},
    { 'non-interactive': true },
    { yes: 'true' },
    { yes: false },
  ])
    assert.equal(f.api.shouldAutoAccept(args), false);
  assert.equal(f.api.shouldAutoAccept({ yes: true }), true);
});

for (const network of ['localhost', 'sepolia']) {
  test(`explicit ${network} execution preserves exact target while pinning separate fixture to hardhat`, async () => {
    const f = loadSource({
      inherited: {
        HARDHAT_NETWORK: 'mainnet',
        ASI_TAKEOFF_PLAN_PATH: '/reviewed/mission-plan.json',
      },
    });
    await f.api.main([
      '--mode',
      'execute',
      '--network',
      network,
      '--yes',
      '--no-compose',
    ]);
    assert.equal(f.process.exitCode, undefined, f.output.join('\n'));
    const npm = f.commands.filter((entry) => entry.command === 'npm');
    assert.deepEqual(
      npm.map((entry) => [...entry.args]),
      [
        [
          'run',
          'deploy:oneclick:wizard',
          '--',
          '--config',
          path.join(
            root,
            `deployment-config/${
              network === 'localhost' ? 'deployer.sample' : network
            }.json`
          ),
          '--network',
          network,
          '--env',
          path.join(root, 'deployment-config/oneclick.env'),
          '--yes',
          '--no-compose',
        ],
        ['run', 'demo:agi-os'],
        ['run', 'owner:diagram'],
        ['run', 'owner:verify-control'],
      ]
    );
    assert.equal(npm[1].options.env.HARDHAT_NETWORK, 'hardhat');
    assert.equal(
      npm[1].options.env.ASI_TAKEOFF_PLAN_PATH,
      '/reviewed/mission-plan.json'
    );
    assert.equal(npm[2].options.env.HARDHAT_NETWORK, network);
    assert.equal(npm[3].options.env.HARDHAT_NETWORK, network);
    for (const name of ['first-class-run.json', 'first-class-manifest.json']) {
      const report = JSON.parse(
        f.files.get(path.join(root, 'reports/agi-os/first-class', name))
      );
      assert.equal(report.network, network);
      assert.equal(report.evidenceBoundary.deploymentAndOwnerChecks, network);
      assert.equal(report.evidenceBoundary.bundledRehearsal, 'hardhat');
      assert.match(report.evidenceBoundary.limitation, /do not verify/);
    }
    assert.match(
      f.output.join('\n'),
      /does not establish operational qualification/
    );
  });
}

test('missing Docker fails requested compose and never turns execution into a skipped-success fallback', async () => {
  const f = loadSource({ docker: false });
  await f.api.main([...execute.slice(0, -1), '--compose']);
  assert.equal(f.process.exitCode, 1);
  assert.equal(f.commands.filter((entry) => entry.command === 'npm').length, 0);
  assert.match(f.output.join('\n'), /failed/);
});

test('no-compose does not assume a local RPC is missing when Docker is absent', async () => {
  const f = loadSource({ docker: false });
  await f.api.main(execute);
  assert.ok(
    f.commands.some((entry) => entry.args[1] === 'deploy:oneclick:wizard')
  );
  assert.ok(
    f.commands.some((entry) => entry.args[1] === 'owner:verify-control')
  );
});

test('skip-deploy skips only wizard, preserving explicit selected-network checks', async () => {
  const f = loadSource();
  await f.api.main([...execute, '--skip-deploy']);
  assert.deepEqual(
    f.commands
      .filter((entry) => entry.command === 'npm')
      .map((entry) => entry.args[1]),
    ['demo:agi-os', 'owner:diagram', 'owner:verify-control']
  );
});

test('failure in selected-network deployment stops every later stage', async () => {
  const f = loadSource({
    failCommand: (_, args) => args[1] === 'deploy:oneclick:wizard',
  });
  await f.api.main(execute);
  assert.equal(f.process.exitCode, 1);
  assert.deepEqual(
    f.commands
      .filter((entry) => entry.command === 'npm')
      .map((entry) => entry.args[1]),
    ['deploy:oneclick:wizard']
  );
});

test('signal termination cannot be treated as successful execution', async () => {
  const f = loadSource({
    signalCommand: (_, args) => args[1] === 'deploy:oneclick:wizard',
  });
  await f.api.main(execute);
  assert.equal(f.process.exitCode, 1);
  assert.deepEqual(
    f.commands
      .filter((entry) => entry.command === 'npm')
      .map((entry) => entry.args[1]),
    ['deploy:oneclick:wizard']
  );
});

const runPath = path.join(
  root,
  'reports/agi-os/first-class/first-class-run.json'
);
const manifestPath = path.join(
  root,
  'reports/agi-os/first-class/first-class-manifest.json'
);
function assertCurrentRunHash(f) {
  const manifest = JSON.parse(f.files.get(manifestPath));
  const entry = manifest.entries.find(
    (item) => item.path === path.relative(root, runPath)
  );
  assert.ok(entry, 'current run must be present in the finalized manifest');
  assert.equal(
    entry.sha256,
    require('node:crypto')
      .createHash('sha256')
      .update(f.files.get(runPath))
      .digest('hex')
  );
  assert.ok(
    !manifest.entries.some(
      (item) => item.path === path.relative(root, manifestPath)
    ),
    'manifest excludes itself'
  );
}

test('stale run/report are preserved as history; only final current run bytes are hashed on repeated runs', async () => {
  const f = loadSource();
  const oldRun = JSON.stringify({
    network: 'stale-network',
    steps: [{ status: 'success' }],
  });
  const oldManifest = JSON.stringify({ entries: [{ sha256: 'stale' }] });
  f.files.set(runPath, oldRun);
  f.files.set(manifestPath, oldManifest);
  await f.api.main(execute);
  assertCurrentRunHash(f);
  assert.equal(
    f.files.get(
      path.join(path.dirname(runPath), 'previous-run-1/first-class-run.json')
    ),
    oldRun
  );
  assert.equal(
    f.files.get(
      path.join(
        path.dirname(runPath),
        'previous-run-1/first-class-manifest.json'
      )
    ),
    oldManifest
  );
  const firstRun = f.files.get(runPath);
  const firstManifest = f.files.get(manifestPath);
  await f.api.main([
    '--mode',
    'execute',
    '--network',
    'sepolia',
    '--yes',
    '--no-compose',
  ]);
  assertCurrentRunHash(f);
  assert.equal(JSON.parse(f.files.get(runPath)).network, 'sepolia');
  assert.equal(
    f.files.get(
      path.join(path.dirname(runPath), 'previous-run-2/first-class-run.json')
    ),
    firstRun
  );
  assert.equal(
    f.files.get(
      path.join(
        path.dirname(runPath),
        'previous-run-2/first-class-manifest.json'
      )
    ),
    firstManifest
  );
});

test('a failed stage never leaves stale successful metadata at the current paths', async () => {
  const f = loadSource({
    failCommand: (_, args) => args[1] === 'deploy:oneclick:wizard',
  });
  f.files.set(runPath, '{"success":true,"stale":true}');
  f.files.set(manifestPath, '{"success":true,"stale":true}');
  await f.api.main(execute);
  assert.equal(f.process.exitCode, 1);
  assert.equal(f.files.has(manifestPath), false);
  const report = JSON.parse(f.files.get(runPath));
  assert.equal(report.stale, undefined);
  assert.equal(report.steps.at(-1).status, 'failed');
  assert.equal(report.manifestRequiredForCompleteBundle, true);
  assert.doesNotMatch(f.output.join('\n'), /Selected steps completed/);
});

test('partial manifest writes cannot publish current success or stale manifest', async () => {
  const f = loadSource({ failManifestWrite: true });
  f.files.set(manifestPath, '{"success":true,"stale":true}');
  await f.api.main(execute);
  assert.equal(f.process.exitCode, 1);
  assert.equal(f.files.has(manifestPath), false);
  assert.equal(f.files.get(manifestPath + '.pending'), '{"partial":');
  assert.equal(JSON.parse(f.files.get(runPath)).steps.at(-1).status, 'failed');
  assert.doesNotMatch(f.output.join('\n'), /Selected steps completed/);
});

test('missing required evidence is a failure, not a skipped-success bundle', async () => {
  const f = loadSource();
  f.files.delete(path.join(root, 'reports/agi-os/owner-control-matrix.json'));
  await f.api.main(execute);
  assert.equal(f.process.exitCode, 1);
  assert.equal(f.files.has(manifestPath), false);
});

const callers = [
  ['imperatrix-celestia-operating-system/bin/launch.sh', 'first-class'],
  [
    'astral-omnidominion-operating-system/bin/astral-omnidominion.sh',
    'first-class',
  ],
  ['cosmic-omniversal-grand-symphony/bin/grand-symphony.sh', 'first-class'],
  ['omni-sovereign-ascension-operating-system/bin/launch.sh', 'first-class'],
  ['meta-agentic-alpha-agi/bin/launch.sh', 'meta-agentic'],
  ['alpha-meta/bin/launch.sh', 'alpha-meta'],
];
function shellFixture(
  t,
  caller,
  { failScript = '', dependencies = true, missionConfig } = {}
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-class-inert-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'repository with spaces');
  const file = path.join(repo, 'demo', caller);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(path.join(root, 'demo', caller), file);
  fs.mkdirSync(path.join(repo, 'scripts/lib'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'scripts/lib/agi-os-first-class-launcher.sh'),
    path.join(repo, 'scripts/lib/agi-os-first-class-launcher.sh')
  );
  if (dependencies) fs.mkdirSync(path.join(repo, 'node_modules'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(dir, 'commands.jsonl');
  // Only stubs are reachable through PATH. These record exact argv, cwd and
  // selected environment; they cannot forward to a real npm/node/deployment.
  for (const command of [
    'npm',
    'npx',
    'node',
    'docker',
    'git',
    'dirname',
    'mkdir',
    'cat',
    'cp',
    'tee',
  ]) {
    fs.writeFileSync(
      path.join(bin, command),
      `#!${process.execPath}\n` +
        `require('node:fs').appendFileSync(process.env.COMMAND_LOG, JSON.stringify({command:${JSON.stringify(
          command
        )},args:process.argv.slice(2),cwd:process.cwd(),plan:process.env.ASI_TAKEOFF_PLAN_PATH,mission:process.env.AURORA_MISSION_CONFIG})+'\\n');\n` +
        `process.exit(${JSON.stringify(
          command
        )} !== 'npm' || process.argv[3] === process.env.FAIL_SCRIPT ? 91 : 0);\n`,
      { mode: 0o755 }
    );
  }
  const env = {
    PATH: bin,
    HOME: dir,
    TMPDIR: dir,
    COMMAND_LOG: log,
    FAIL_SCRIPT: failScript,
    CI: 'true',
    ASTRAL_OS_AUTO: 'true',
    IMPERATRIX_SKIP_INSTALL: '0',
    ...(missionConfig !== undefined
      ? { AURORA_MISSION_CONFIG: missionConfig }
      : {}),
  };
  return {
    repo,
    dir,
    log,
    invoke(args) {
      return spawnSync('/bin/bash', [file, ...args], {
        cwd: dir,
        env,
        encoding: 'utf8',
        timeout: 5000,
      });
    },
    invokeFromBin(args) {
      return spawnSync('/bin/bash', [path.basename(file), ...args], {
        cwd: path.dirname(file),
        env,
        encoding: 'utf8',
        timeout: 5000,
      });
    },
    commands() {
      return fs.existsSync(log)
        ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse)
        : [];
    },
  };
}
for (const [caller, profile] of callers) {
  test(`${caller}: all safe/invalid invocations are entirely inert without dependencies`, (t) => {
    const f = shellFixture(t, caller, { dependencies: false });
    for (const args of safeCases) {
      const code =
        profile !== 'first-class' && args.includes('sepolia') ? 2 : 0;
      const result = f.invoke(args);
      assert.equal(
        result.status,
        code,
        `${JSON.stringify(args)}: ${result.stderr}`
      );
      assert.deepEqual(f.commands(), []);
    }
    for (const args of invalidCases) {
      const result = f.invoke(args);
      assert.equal(
        result.status,
        2,
        `${JSON.stringify(args)}: ${result.stderr}`
      );
      assert.deepEqual(f.commands(), []);
    }
    assert.ok(!fs.existsSync(path.join(f.repo, 'reports')));
  });
  test(`${caller}: basename invocation from bin preserves planning and root resolution`, (t) => {
    const f = shellFixture(t, caller);
    for (const args of [[], ['--help'], ['--dry-run'], ['--unknown']]) {
      assert.equal(
        f.invokeFromBin(args).status,
        args.includes('--unknown') ? 2 : 0
      );
      assert.deepEqual(f.commands(), []);
    }
    const result = f.invokeFromBin(execute);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.commands()[0].cwd, f.repo);
    assert.deepEqual(f.commands()[0].args, [
      'run',
      'demo:agi-os:first-class',
      '--',
      ...execute,
    ]);
  });
  test(`${caller}: explicit local execution preserves exact argv/cwd and stage order`, (t) => {
    const f = shellFixture(t, caller);
    const args = [...execute, '--non-interactive'];
    const result = f.invoke(args);
    assert.equal(result.status, 0, result.stderr);
    const commands = f.commands();
    assert.deepEqual(
      commands.map((entry) => entry.args),
      [
        ['run', 'demo:agi-os:first-class', '--', ...args],
        ...(profile === 'alpha-meta' ? [['run', 'demo:alpha-meta:full']] : []),
        ...(profile !== 'first-class'
          ? [['run', 'demo:asi-takeoff:local']]
          : []),
      ]
    );
    for (const entry of commands) {
      assert.equal(entry.command, 'npm');
      assert.equal(entry.cwd, f.repo);
    }
    if (profile !== 'first-class') {
      assert.equal(
        commands[0].plan,
        path.join(
          f.repo,
          'demo',
          profile === 'alpha-meta'
            ? 'alpha-meta/config/project-plan.alpha-meta.json'
            : 'meta-agentic-alpha-agi/project-plan.meta-alpha.json'
        )
      );
      assert.equal(commands.at(-1).plan, undefined);
      assert.equal(
        commands.at(-1).mission,
        path.join(f.repo, 'demo/asi-takeoff/config/mission@v2.json')
      );
    }
  });
  if (profile !== 'first-class') {
    test(`${caller}: local replay clears only the scenario plan and preserves a selected mission config`, (t) => {
      const missionConfig = '/reviewed/selected mission with spaces.json';
      const f = shellFixture(t, caller, { missionConfig });
      const result = f.invoke(execute);
      assert.equal(result.status, 0, result.stderr);
      const commands = f.commands();
      assert.ok(
        commands[0].plan.endsWith(
          profile === 'alpha-meta'
            ? '/alpha-meta/config/project-plan.alpha-meta.json'
            : '/meta-agentic-alpha-agi/project-plan.meta-alpha.json'
        )
      );
      assert.equal(commands[0].mission, missionConfig);
      assert.equal(commands.at(-1).plan, undefined);
      assert.equal(commands.at(-1).mission, missionConfig);
      if (profile === 'alpha-meta')
        assert.equal(commands[1].plan, commands[0].plan);
    });
  }
  test(`${caller}: missing dependencies never auto-install`, (t) => {
    const f = shellFixture(t, caller, { dependencies: false });
    assert.equal(f.invoke(execute).status, 2);
    assert.deepEqual(f.commands(), []);
  });
  test(`${caller}: first-class failure never executes additional pipelines`, (t) => {
    const f = shellFixture(t, caller, {
      failScript: 'demo:agi-os:first-class',
    });
    assert.equal(f.invoke(execute).status, 91);
    assert.equal(f.commands().length, 1);
  });
  if (profile !== 'first-class') {
    test(`${caller}: rejects external-to-local routing and misleading skip before effects`, (t) => {
      const f = shellFixture(t, caller);
      for (const args of [
        ['--mode', 'execute', '--network', 'sepolia', '--yes', '--no-compose'],
        [...execute, '--skip-deploy'],
      ]) {
        assert.equal(f.invoke(args).status, 2);
        assert.deepEqual(f.commands(), []);
      }
    });
  } else {
    test(`${caller}: explicit external target is forwarded without local substitution`, (t) => {
      const f = shellFixture(t, caller);
      const args = [
        '--mode',
        'execute',
        '--network',
        'sepolia',
        '--yes',
        '--no-compose',
      ];
      assert.equal(f.invoke(args).status, 0);
      assert.deepEqual(f.commands()[0].args, [
        'run',
        'demo:agi-os:first-class',
        '--',
        ...args,
      ]);
    });
  }
}

test('Alpha-Meta dossier failure prevents the later local replay', (t) => {
  const f = shellFixture(t, 'alpha-meta/bin/launch.sh', {
    failScript: 'demo:alpha-meta:full',
  });
  assert.equal(f.invoke(execute).status, 91);
  assert.deepEqual(
    f.commands().map((entry) => entry.args[1]),
    ['demo:agi-os:first-class', 'demo:alpha-meta:full']
  );
});
