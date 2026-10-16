'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript');
const source = fs.readFileSync(
  path.join(__dirname, '../../scripts/v2/systemPauseAction.ts'),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const address = (n) => '0x' + n.toString(16).padStart(40, '0');
async function execute(
  args,
  { qualified = false, providerError = false } = {}
) {
  const calls = {
    signers: 0,
    signatures: 0,
    guard: 0,
    simulations: 0,
    messages: [],
  };
  const governor = address(2),
    pause = {
      governance: async () => governor,
      interface: { encodeFunctionData: (name) => name },
      connect() {
        return {
          pauseAll: async () => {
            calls.signatures++;
            return { hash: '0x1', wait: async () => ({ blockNumber: 1 }) };
          },
          unpauseAll: async () => {
            calls.signatures++;
            return { hash: '0x1', wait: async () => ({ blockNumber: 1 }) };
          },
        };
      },
    };
  for (const getter of [
    'jobRegistry',
    'stakeManager',
    'validationModule',
    'disputeModule',
    'platformRegistry',
    'feePool',
    'reputationEngine',
    'arbitratorCommittee',
  ])
    pause[getter] = async () => address(3);
  const ethers = {
    provider: {
      call: async () => {
        calls.simulations++;
      },
    },
    ZeroAddress: address(0),
    getAddress: (v) => v,
    getSigners: async () => {
      calls.signers++;
      return [{ getAddress: async () => governor }];
    },
    Contract: function (a, abi, runner) {
      assert(runner, 'Read-only contract must specify provider runner');
      return abi === 'SystemPause'
        ? pause
        : {
            paused: async () => {
              if (providerError)
                throw Object.assign(
                  Error(
                    'RPC failed https://user:SECRET_PASSWORD@rpc.example/v3/API_SECRET?apiKey=EXPLORER_SECRET'
                  ),
                  { code: 'ETIMEDOUT' }
                );
              return args.includes('unpause');
            },
          };
    },
  };
  const localProcess = { argv: ['node', 'systemPauseAction.ts', ...args] };
  const requireStub = (name) => {
    if (name === 'hardhat')
      return {
        ethers,
        artifacts: { readArtifact: async () => ({ abi: 'SystemPause' }) },
        network: { name: 'mainnet' },
      };
    if (name === '../config')
      return {
        loadTokenConfig: () => ({
          config: { modules: { systemPause: address(1) } },
        }),
      };
    if (name === '../verification/verify-release.cjs')
      return {
        guardFiles: async () => {
          calls.guard++;
          if (!qualified) throw Error('missing qualification');
        },
      };
    if (name === '../verification/evidence.cjs')
      return require('../../scripts/verification/evidence.cjs');
    return require(name);
  };
  // Execute the real transpiled entrypoint; drain its promises without live RPC/signers.
  vm.runInNewContext(compiled, {
    require: requireStub,
    exports: {},
    process: localProcess,
    console: {
      log: (...m) => calls.messages.push(m.join(' ')),
      error: (...m) => calls.messages.push(m),
      table: () => {},
    },
    setTimeout,
    clearTimeout,
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { ...calls, exitCode: localProcess.exitCode };
}
test('emergency pause works by default without qualification, account discovery or signing', async () => {
  const r = await execute(['--action', 'pause']);
  assert.equal(r.exitCode, undefined);
  assert.equal(r.guard, 0);
  assert.equal(r.signers, 0);
  assert.equal(r.signatures, 0);
  assert.equal(r.simulations, 1);
});
test('unpause missing qualification rejects before even looking up a signer', async () => {
  const r = await execute(['--action', 'unpause', '--execute', '--yes']);
  assert.equal(r.exitCode, 1);
  assert.equal(r.signers, 0);
  assert.equal(r.signatures, 0);
  assert.equal(r.guard, 1);
});
test('qualified unpause dry-run does not request a signer; explicit execute rechecks after confirmation', async () => {
  const dry = await execute(['--action', 'unpause'], { qualified: true });
  assert.equal(dry.signers, 0);
  assert.equal(dry.signatures, 0);
  assert.equal(dry.simulations, 1);
  const run = await execute(['--action', 'unpause', '--execute', '--yes'], {
    qualified: true,
  });
  assert.equal(run.signatures, 1);
  assert.equal(run.guard, 2);
});
test('conflicting execute/dry-run flags cannot cause a broadcast', async () => {
  const r = await execute([
    '--action',
    'pause',
    '--dry-run',
    '--execute',
    '--yes',
  ]);
  assert.equal(r.exitCode, 1);
  assert.equal(r.signers, 0);
  assert.equal(r.signatures, 0);
});

test('keyless emergency pause diagnostics redact provider URLs and credentials from caught module errors', async () => {
  const result = await execute(['--action', 'pause'], { providerError: true });
  assert.equal(result.signers, 0);
  assert.equal(result.signatures, 0);
  const output = JSON.stringify(result.messages);
  assert(
    !output.includes('SECRET_PASSWORD') &&
      !output.includes('API_SECRET') &&
      !output.includes('EXPLORER_SECRET')
  );
  assert(output.includes('ETIMEDOUT'));
});
