'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { create } = require('ts-node');

const ROOT = path.resolve(__dirname, '../../..');
const filename = path.join(ROOT, 'scripts/v2/testnetDryRun.ts');
const source = fs.readFileSync(filename, 'utf8');
const compiler = create({
  cwd: ROOT,
  project: path.join(ROOT, 'tsconfig.json'),
  compilerOptions: { module: 'commonjs' },
  transpileOnly: false,
});

test('owner dry-run passes the real ts-node type checker without execution', () => {
  // Compile the complete CLI, but never import it or start its Hardhat provider.
  assert.doesNotThrow(() => compiler.compile(source, filename));
});

function collateralCalculation() {
  const parsed = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.ES2020,
    true
  );
  const scenario = parsed.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name.text === 'runJobLifecycleScenario'
  );
  assert.ok(scenario, 'job lifecycle scenario must remain present');
  const names = new Set([
    'jobStake',
    'startingStake',
    'startingLocked',
    'roleMinimum',
    'globalMinimum',
    'admissionMinimum',
    'minimumFloor',
    'requiredTotal',
    'stakeAmount',
    'startingAgentBalance',
    'expectedBalance',
  ]);
  const declarations = scenario.body.statements.filter(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((declaration) =>
        names.has(declaration.name.getText(parsed))
      )
  );
  assert.equal(declarations.length, names.size);
  // Exercise the production expressions directly, including their bigint types.
  const calculation = `
    const ROLE_AGENT = 0;
    async function calculate(envFixture: any, reward: bigint): Promise<{
      requiredTotal: bigint; stakeAmount: bigint; expectedBalance: bigint;
    }> {
      ${declarations.map((node) => node.getText(parsed)).join('\n')}
      return { requiredTotal, stakeAmount, expectedBalance };
    }
    calculate;
  `;
  const output = compiler.compile(
    calculation,
    path.join(ROOT, 'scripts/v2/testnetDryRun.collateral-regression.ts')
  );
  return vm.runInNewContext(output);
}

function fixture(overrides = {}) {
  const state = {
    jobStake: 0n,
    startingStake: 0n,
    startingLocked: 0n,
    roleMinimum: 0n,
    globalMinimum: 0n,
    admissionMinimum: 0n,
    minimumFloor: 0n,
    startingAgentBalance: 1000n * 10n ** 18n,
    ...overrides,
  };
  return {
    agent: { address: 'fixture-agent' },
    registry: {
      jobs: async () => ({ stake: state.jobStake }),
      minAgentStake: async () => state.admissionMinimum,
    },
    stake: {
      stakeOf: async () => state.startingStake,
      lockedStakes: async () => state.startingLocked,
      roleMinimumStake: async () => state.roleMinimum,
      minStake: async () => state.globalMinimum,
      minStakeFloor: async () => state.minimumFloor,
    },
    token: { balanceOf: async () => state.startingAgentBalance },
  };
}

test('collateral top-up and payout preserve exact base units above 2^53', async () => {
  const calculate = collateralCalculation();
  const unit = 10n ** 18n;
  const balance = 1000n * unit + 7n;
  const reward = 100n * unit + 3n;
  const result = await calculate(
    fixture({
      jobStake: 10n * unit + 1n,
      startingLocked: 5n * unit,
      startingStake: 6n * unit,
      startingAgentBalance: balance,
    }),
    reward
  );
  assert.equal(result.requiredTotal, 15n * unit + 1n);
  assert.equal(result.stakeAmount, 9n * unit + 1n);
  assert.equal(result.expectedBalance, balance - (9n * unit + 1n) + reward);
});

test('every independent admission minimum can determine the top-up', async () => {
  const calculate = collateralCalculation();
  for (const minimum of [
    'globalMinimum',
    'roleMinimum',
    'admissionMinimum',
    'minimumFloor',
  ]) {
    const result = await calculate(
      fixture({ [minimum]: 25n, jobStake: 10n, startingStake: 5n }),
      100n
    );
    assert.equal(result.requiredTotal, 25n, minimum);
    assert.equal(result.stakeAmount, 20n, minimum);
  }
});

test('role override, zero collateral and already funded stake remain bigint', async () => {
  const calculate = collateralCalculation();
  const overridden = await calculate(
    fixture({ globalMinimum: 100n, roleMinimum: 25n }),
    100n
  );
  assert.equal(overridden.requiredTotal, 25n);
  for (const startingStake of [0n, 25n, 30n]) {
    const result = await calculate(
      fixture({ startingStake, jobStake: startingStake === 0n ? 0n : 25n }),
      100n
    );
    assert.equal(result.stakeAmount, 0n);
    assert.equal(result.expectedBalance, 1000n * 10n ** 18n + 100n);
  }
});
