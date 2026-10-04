import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ContractFactory, Interface, JsonRpcProvider, id } from 'ethers';
import {
  OnChainSelfPlayArenaClient,
  SELF_PLAY_ARENA_ABI,
} from '../backend/arena-orchestrator/dist/selfplay-arena.js';

// A real EVM adapter rehearsal with explicitly simulated dependency contracts.
// Always creates its own loopback chain; never accepts a provider URL or key.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const listener = createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const { port } = listener.address();
await new Promise((resolve, reject) =>
  listener.close((error) => (error ? reject(error) : resolve()))
);
const rpc = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  [
    require.resolve('hardhat/internal/cli/cli'),
    'node',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
);
// Hardhat prints public test keys. They are deliberately not echoed to CI logs.
child.stdout.resume();
child.stderr.resume();
const exited = once(child, 'exit');
let stopped = false;
void exited.then(() => {
  stopped = true;
});
const provider = new JsonRpcProvider(rpc, undefined, { cacheTimeout: 0 });
provider.pollingInterval = 50;
try {
  let ready = false;
  for (let attempt = 0; attempt < 200 && !stopped; attempt += 1) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
        signal: AbortSignal.timeout(1000),
      });
      assert.equal((await response.json()).result, '0x7a69');
      ready = true;
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(ready, 'Disposable Hardhat chain did not become ready');
  assert.equal((await provider.getNetwork()).chainId, 31337n);
  const owner = await provider.getSigner(0);
  const teacher = await (await provider.getSigner(2)).getAddress();
  const student = await (await provider.getSigner(3)).getAddress();
  const validator = await (await provider.getSigner(4)).getAddress();
  const ownerAddress = await owner.getAddress();
  const artifact = async (name, folder = 'test/') =>
    JSON.parse(
      await readFile(
        new URL(
          `../artifacts/contracts/${folder}${name}.sol/${name}.json`,
          import.meta.url
        ),
        'utf8'
      )
    );
  const deploy = async (name, args = [], folder) => {
    const compiled = await artifact(name, folder);
    const contract = await new ContractFactory(
      compiled.abi,
      compiled.bytecode,
      owner
    ).deploy(...args);
    await contract.waitForDeployment();
    return contract;
  };
  const mined = async (operation) => {
    assert.equal((await (await operation).wait()).status, 1);
  };
  const identity = await deploy('MockIdentityRegistry');
  const jobs = await deploy('MockJobRegistry');
  const stake = await deploy('MockStakeManager');
  const validation = await deploy('MockValidationModule');
  for (const [role, account] of [
    ['TEACHER_ROLE', teacher],
    ['STUDENT_ROLE', student],
    ['VALIDATOR_ROLE', validator],
  ]) {
    await mined(identity.setRole(id(role), account, true));
  }
  for (const [jobId, account] of [
    [1, teacher],
    [10, student],
    [20, validator],
  ]) {
    await mined(jobs.setJob(jobId, ownerAddress, account));
  }
  const arena = await deploy(
    'SelfPlayArena',
    [
      ownerAddress,
      ownerAddress,
      await identity.getAddress(),
      await jobs.getAddress(),
      await stake.getAddress(),
      await validation.getAddress(),
      3,
      1,
      { teacher: 1, student: 1, validator: 1 },
      6000,
      2,
    ],
    ''
  );
  const compiled = new Interface((await artifact('SelfPlayArena', '')).abi);
  const adapterAbi = new Interface(SELF_PLAY_ARENA_ABI);
  for (const fragment of adapterAbi.fragments) {
    const signature = fragment.format('sighash');
    assert.ok(
      compiled.fragments.some(
        (candidate) =>
          candidate.type === fragment.type &&
          candidate.format('sighash') === signature
      ),
      `Adapter ABI drift: ${signature}`
    );
  }
  const client = new OnChainSelfPlayArenaClient(
    await arena.getAddress(),
    rpc,
    // Public Hardhat account zero, only usable on this newly created local chain.
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
  );
  assert.equal(await client.getTotalRounds(), 0);
  const roundId = await client.startRound(1, teacher, 4);
  assert.equal(roundId, 1);
  await client.registerStudent(roundId, 10, student);
  await client.registerValidator(roundId, 20, validator);
  await client.closeRound(roundId);
  await client.finalizeRound(roundId, 1, 7500, 42, false, [validator]);
  const round = await arena.getRound(roundId);
  assert.equal(round.finalized, true);
  assert.equal(round.validationPassed, true);
  assert.equal(round.difficulty, 5n);
  assert.equal(round.observedSuccessRateBps, 7500n);
  assert.equal(round.eloEventId, 42n);
  assert.deepEqual([...round.students], [student]);
  assert.deepEqual([...round.winningValidators], [validator]);
  assert.equal(await stake.callsLength(), 0n);

  const rejected = await client.startRound(1, teacher, 4);
  await client.registerStudent(rejected, 10, student);
  await client.closeRound(rejected);
  await mined(validation.setFinalizeSuccess(false));
  await assert.rejects(client.finalizeRound(rejected, 0, 0, 0, false, []));
  assert.equal((await arena.getRound(rejected)).finalized, false);
  console.log(
    'PASS: compiled ABI matches; adapter starts, registers, closes and finalizes on a local EVM; validator rejection stays unfinalized; no slashing. Dependency contracts are fixtures.'
  );
} finally {
  provider.destroy();
  if (!stopped) child.kill('SIGTERM');
  await exited;
}
