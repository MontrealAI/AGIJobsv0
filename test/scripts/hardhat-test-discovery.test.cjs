'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const yaml = require('js-yaml');
const {
  TASK_TEST_GET_TEST_FILES,
} = require('hardhat/builtin-tasks/task-names');
const root = path.resolve(__dirname, '../..');

// Register the installed Hardhat task and the entire real project override,
// without loading plugins, Mocha, contracts, or any discovered test module.
function discoveryActions() {
  const actions = [];
  const register = (name) => {
    const builder = new Proxy(
      {},
      {
        get:
          (_, method) =>
          (...args) => {
            if (method === 'setAction' && name === TASK_TEST_GET_TEST_FILES)
              actions.push(args[0]);
            return builder;
          },
      }
    );
    return builder;
  };
  const builtin = require.resolve('hardhat/builtin-tasks/test');
  const builtinRequire = createRequire(builtin);
  vm.runInNewContext(
    fs.readFileSync(builtin, 'utf8'),
    {
      exports: {},
      process,
      require: (name) =>
        name === '../internal/core/config/config-env'
          ? { task: register, subtask: register }
          : builtinRequire(name),
    },
    { filename: builtin }
  );
  const plugins = new Set([
    'ts-node/register/transpile-only',
    '@nomicfoundation/hardhat-toolbox',
    'hardhat-gas-reporter',
    'solidity-coverage',
    'hardhat-contract-sizer',
  ]);
  const configFile = path.join(root, 'hardhat.config.js');
  vm.runInNewContext(
    fs.readFileSync(configFile, 'utf8'),
    {
      __dirname: root,
      module: { exports: {} },
      process: { env: {} },
      require: (name) => {
        if (name === 'hardhat/config') return { subtask: register };
        if (name === 'dotenv') return { config() {} };
        if (plugins.has(name)) return {};
        return require(name);
      },
    },
    { filename: configFile }
  );
  assert.equal(
    actions.length,
    2,
    'base discovery and project override must both register'
  );
  return actions;
}

async function discover(testFiles = []) {
  const [base, override] = discoveryActions();
  const context = {
    config: {
      paths: {
        tests: path.join(root, 'test'),
        configFile: path.join(root, 'hardhat.config.js'),
      },
    },
  };
  const args = { testFiles };
  const all = Array.from(await base(args, context));
  const selected = Array.from(
    await override(args, context, async (forwarded) => {
      assert.equal(forwarded, args, 'discovery arguments must reach runSuper');
      return all;
    })
  );
  return { all, selected };
}

const dedicated = [
  ['lint', 'test/scripts/alpha-supplier-proof.test.cjs'],
  ['lint', 'test/scripts/omni-stack-mode.test.cjs'],
  ['tests', 'test/scripts/polaris-quorum.test.cjs'],
  ['tests', 'test/pages/zenith-reconciliation.test.mjs'],
  ['tests', 'test/scripts/omega-pipeline.test.cjs'],
  ['tests', 'test/scripts/hardhat-test-discovery.test.cjs'],
];
const receiverSuites = [
  'integrations/alpha-agent/tests/alpha-project-source.test.mjs',
  'integrations/alpha-agent/tests/alpha-project-name.test.mjs',
  'integrations/alpha-agent/tests/alpha-project-transfer.test.mjs',
  'integrations/alpha-agent/tests/alpha-project-receipt.test.cjs',
];

test('actual aggregate discovery excludes every node:test suite and retains native Mocha files', async () => {
  const { all, selected } = await discover();
  for (const [, file] of dedicated) {
    const absolute = path.join(root, file);
    assert.ok(
      all.includes(absolute),
      `Hardhat must discover ${file} before filtering`
    );
    assert.ok(
      !selected.includes(absolute),
      `${file} requires a fresh node:test process`
    );
  }
  const native = all.filter(
    (file) =>
      /\b(?:describe|it)\s*\(/.test(fs.readFileSync(file, 'utf8')) &&
      !fs.readFileSync(file, 'utf8').includes('node:test')
  );
  assert.ok(
    native.length > 100,
    'exercise the real native contract suite inventory'
  );
  for (const file of native)
    assert.ok(selected.includes(file), `lost Mocha suite: ${file}`);
  for (const file of selected)
    assert.ok(
      !fs.readFileSync(file, 'utf8').includes('node:test'),
      `native runner would load node:test suite: ${file}`
    );
});

test('explicit native JavaScript and TypeScript selections survive the registered override', async () => {
  const phase6 = fs
    .readdirSync(path.join(root, 'test/scripts'))
    .find((name) => /^phase6.*\.test\.ts$/.test(name));
  assert.ok(phase6, 'the explicit Phase 6 TypeScript CI suite must exist');
  const files = [
    'test/v2/Phase6ExpansionManager.test.js',
    `test/scripts/${phase6}`,
  ];
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)));
  const { selected } = await discover(
    files.map((file) => path.join(root, file))
  );
  assert.deepEqual(
    selected,
    files.map((file) => path.join(root, file))
  );
});

test('receiver suites stay outside native contract discovery', async () => {
  const { all, selected } = await discover();
  for (const file of receiverSuites) {
    const absolute = path.join(root, file);
    assert.ok(fs.existsSync(absolute), `missing receiver suite: ${file}`);
    assert.ok(
      !all.includes(absolute),
      `receiver suite entered native discovery: ${file}`
    );
    assert.ok(
      !selected.includes(absolute),
      `receiver suite reached Mocha: ${file}`
    );
  }
});

test('documented project npm command runs all relocated receiver suites', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  assert.deepEqual(
    packageJson.scripts['alpha-agent:project:test'].trim().split(/\s+/),
    ['node', '--test', ...receiverSuites]
  );
  for (const file of receiverSuites)
    assert.ok(
      fs.statSync(path.join(root, file)).isFile(),
      `missing npm project suite: ${file}`
    );
});

test('isolated suites retain mandatory fresh-process CI registrations', () => {
  const workflow = yaml.load(
    fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
  );
  for (const [jobName, file] of [
    ...dedicated,
    ...receiverSuites.map((file) => ['lint', file]),
  ]) {
    const job = workflow.jobs[jobName];
    assert.ok(
      job && !job.if && !job['continue-on-error'],
      `${jobName} must remain mandatory`
    );
    const steps = job.steps.filter((step) =>
      (step.run || '').split('\n').some((line) => {
        const words = line.trim().split(/\s+/);
        return (
          words[0] === 'node' &&
          words[1] === '--test' &&
          words.includes(file) &&
          !/[;&|]/.test(line)
        );
      })
    );
    assert.equal(
      steps.length,
      1,
      `${file} must have one explicit node --test CI invocation`
    );
    assert.ok(
      !steps[0].if && !steps[0]['continue-on-error'],
      `${file} must not be optional`
    );
    const installIndex = job.steps.findIndex(
      (step) =>
        (step.run || '').startsWith('./scripts/ci/npm-ci.sh ') &&
        !step.if &&
        !step['continue-on-error']
    );
    assert.ok(
      installIndex >= 0 && installIndex < job.steps.indexOf(steps[0]),
      `${file} must run after the mandatory locked dependency install`
    );
  }
  assert.ok(
    workflow.jobs.tests.steps.some(
      (step) =>
        step.run === 'npm test' && !step.if && !step['continue-on-error']
    ),
    'aggregate Hardhat suite remains mandatory'
  );
});

test('security regressions stay isolated and mandatory in their source-bound workflow', async () => {
  const file = 'test/security/inherited-codeql.test.cjs';
  const { all, selected } = await discover();
  assert.ok(all.includes(path.join(root, file)));
  assert.ok(!selected.includes(path.join(root, file)));
  const workflow = yaml.load(
    fs.readFileSync(
      path.join(root, '.github/workflows/security-remediation.yml'),
      'utf8'
    )
  );
  const job = workflow.jobs.regressions;
  assert.ok(job && !job.if && !job['continue-on-error']);
  const step = job.steps.find((step) =>
    (step.run || '').includes(`node --test ${file}`)
  );
  assert.ok(step && !step.if && !step['continue-on-error']);
  assert.match(step.run, /set -eo pipefail/);
  const install = job.steps.findIndex(
    (step) =>
      (step.run || '').includes('./scripts/ci/npm-ci.sh') &&
      !step.if &&
      !step['continue-on-error']
  );
  assert.ok(install >= 0 && install < job.steps.indexOf(step));

  const discoveryFile = 'test/security/discovery-protected-scope.test.mjs';
  const absolute = path.join(root, discoveryFile);
  assert.ok(
    all.includes(absolute),
    'real Hardhat discovery must see the new security suite'
  );
  assert.ok(
    !selected.includes(absolute),
    'the new node:test suite must not reach Mocha'
  );
  assert.deepEqual(
    (await discover([absolute])).selected,
    [],
    'explicit Hardhat selection must also stay isolated'
  );
  const discovery = yaml.load(
    fs.readFileSync(
      path.join(root, '.github/workflows/discovery-lab-receiver.yml'),
      'utf8'
    )
  );
  const policy = discovery.jobs.policy;
  assert.ok(
    policy && !Object.hasOwn(policy, 'if') && !policy['continue-on-error'],
    'Discovery policy must remain mandatory'
  );
  const invocations = policy.steps.filter((item) =>
    (item.run || '').split('\n').some((line) => {
      const words = line.trim().split(/\s+/);
      return (
        words[0] === 'node' &&
        words[1] === '--test' &&
        words.includes(discoveryFile) &&
        !/[;&|]/.test(line)
      );
    })
  );
  assert.equal(
    invocations.length,
    1,
    'the excluded suite must have one dedicated node:test invocation'
  );
  const invocation = invocations[0];
  assert.ok(
    !Object.hasOwn(invocation, 'if') && !invocation['continue-on-error'],
    'Discovery regressions must not be optional'
  );
  assert.match(invocation.run, /set -euo pipefail/);
  assert.match(
    invocation.run,
    /test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SOURCE"/
  );
  assert.equal(
    invocation.env.EXPECTED_SOURCE,
    '${{ github.event.pull_request.head.sha || github.sha }}'
  );
  const checkout = policy.steps.find((item) =>
    (item.uses || '').startsWith('actions/checkout@')
  );
  assert.ok(
    checkout &&
      !Object.hasOwn(checkout, 'if') &&
      !checkout['continue-on-error'] &&
      policy.steps.indexOf(checkout) < policy.steps.indexOf(invocation),
    'the source-bound checkout must be mandatory and precede regressions'
  );
  assert.equal(
    checkout.with.ref,
    invocation.env.EXPECTED_SOURCE,
    'dedicated tests must use the selected exact head'
  );
  const setup = policy.steps.findIndex(
    (item) =>
      (item.uses || '').startsWith('actions/setup-node@') &&
      !Object.hasOwn(item, 'if') &&
      !item['continue-on-error']
  );
  assert.ok(
    setup >= 0 && setup < policy.steps.indexOf(invocation),
    'the native Node runtime must be installed before regressions'
  );
});
