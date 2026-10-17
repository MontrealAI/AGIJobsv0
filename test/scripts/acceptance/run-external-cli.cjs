#!/usr/bin/env node
'use strict';
// Disposable, Linux-only acceptance fixture. It is NOT a production launcher,
// bootstrap qualification, independent source approval, or device acceptance.
// Default is help. Run only in the parent-authorized exclusive test window.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const net = require('node:net');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const {
  HOSTED_ROOT,
  getSourceIdentity,
  assertCleanSource,
  ownedGroupMembers,
  processIdentity,
  processGroupIdentity,
  assertGroupLeader,
  stopOwnedGroupChildren,
  assertExpectedNormalization,
  fixtureFileIdentity,
  restoreFixtureFile,
} = require('./external-cli-hosted-state.cjs');
const hook = path.join(__dirname, 'external-cli-metrics.cjs');
const {
  inspectHardhatCompletion,
} = require('./external-cli-child-completion.cjs');
const cli = path.join(root, 'node_modules/hardhat/internal/cli/cli.js');
let identity;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function save(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
}
function replace(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
  });
}
function privateDir(file) {
  fs.mkdirSync(file, { mode: 0o700 });
  return file;
}
function availableBytes() {
  const s = fs.statfsSync('/tmp');
  return Number(s.bavail) * Number(s.bsize);
}
function assertRunning() {
  assert.equal(
    stopped,
    false,
    'Fixture is stopping; further work is forbidden'
  );
}
function verifyOwnedListener(node, port, requireListener = true) {
  assertRunning();
  assertGroupLeader(supervisorIdentity);
  assert(
    node && node.child.exitCode === null && node.child.signalCode === null,
    'Owned node is no longer live'
  );
  const now = processIdentity(node.child.pid);
  assert.equal(now.start, node.identity.start, 'Owned node identity changed');
  assert.equal(
    now.group,
    supervisorIdentity.group,
    'Owned process group changed'
  );
  assert.equal(
    now.session,
    supervisorIdentity.session,
    'Owned process session changed'
  );
  assert.notEqual(now.state, 'Z');
  const sockets = new Set();
  for (const file of fs.readdirSync(`/proc/${now.pid}/fd`)) {
    try {
      sockets.add(fs.readlinkSync(`/proc/${now.pid}/fd/${file}`));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  let found = false;
  for (const table of ['tcp', 'tcp6']) {
    for (const line of fs
      .readFileSync(`/proc/net/${table}`, 'utf8')
      .trim()
      .split('\n')
      .slice(1)) {
      const fields = line.trim().split(/\s+/);
      const [address, hexport] = fields[1].split(':');
      if (Number.parseInt(hexport, 16) !== port || fields[3] !== '0A') continue;
      assert(
        table === 'tcp' &&
          address === '0100007F' &&
          sockets.has(`socket:[${fields[9]}]`),
        'Unowned or non-loopback listener; no RPC allowed'
      );
      found = true;
    }
  }
  if (requireListener) assert(found, 'Owned loopback listener missing');
  return found;
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
function capture(child, file, limit) {
  const fd = fs.openSync(file, 'wx', 0o600);
  let bytes = 0,
    discarded = 0;
  const consume = (chunk) => {
    const room = Math.max(0, limit - bytes);
    if (room) {
      const part = chunk.subarray(0, room);
      fs.writeSync(fd, part);
      bytes += part.length;
    }
    discarded += Math.max(0, chunk.length - room);
  };
  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  child.once('close', () => {
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  });
  return () => ({
    recordedBytes: bytes,
    discardedBytes: discarded,
    limitBytes: limit,
  });
}
const started = [];
let privateRoot,
  env,
  ownedNode,
  port,
  provider,
  ensBackup,
  normalizedEnsHash,
  ensIdentity,
  supervisorIdentity;
let stopped = false,
  currentLabel = 'preflight',
  completedOperations = 0,
  ensRestored = false;
let currentReport,
  plan,
  sourceManifestSha256,
  fixtureSourceManifest,
  nodeConfigIdentity;
const archive = [];
const subprocesses = [];
const limitations = [
  'Only an owned unforked loopback Hardhat chain 31337 and its public development account were used.',
  'Manifest hashes are disposable fixture bindings; they are not independent source approval.',
  'Actual Git HEAD/tree and clean tracked source are verified before and after the sole ENS fixture normalization; the runtime fixture manifest records its normalized ENS bytes.',
  'Node/dependency/bootstrap integrity and trusted-Mac, hardware-wallet, two-machine qualification remain unqualified.',
  'The hosted driver installs the committed dependencies and generates/validates canonical compiler evidence before this fresh-CLI run; this harness never compiles or installs.',
  'Hosted Node is the exact repository pin, unlike the prior local Node 24.19.0 attempts; hosted bootstrap trust is not independently qualified.',
  'Only the disposable node omits optional compiler-derived source tracing via an empty artifacts directory; actual Jobs CLI source/artifact verification is unchanged.',
  'Only the disposable config/ens.json normalization is permitted and original source bytes are restored.',
  'The fixture performs 39 explicit exact-envelope signing and relay acknowledgements; no production signing or activation is authorized.',
  'Completed harness reports/journals are gzip archived with exact uncompressed SHA-256 and size; the active prior report remains available for resume.',
];
function checkSpace() {
  const bytes = availableBytes();
  assert(
    bytes >= 24 * 1048576,
    'Less than 24 MiB free in /tmp; preserving fixture and stopping before exhaustion'
  );
  return bytes;
}
function launch(label, args, overrides = {}, longRunning = false) {
  assertRunning();
  assertGroupLeader(supervisorIdentity);
  checkSpace();
  currentLabel = label;
  const childEnv = { ...env, ...overrides, JOBS_CLI_METRICS_LABEL: label };
  assert(
    !childEnv.NODE_PATH && !childEnv.NODE_OPTIONS && !childEnv.HARDHAT_CONFIG
  );
  const child = cp.spawn(
    process.execPath,
    ['--max-old-space-size=256', '--require', hook, ...args],
    {
      cwd: root,
      env: childEnv,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const log = path.join(privateRoot, 'logs', `${label}.log`);
  const logStats = capture(child, log, longRunning ? 1048576 : 131072);
  const item = {
    label,
    pid: child.pid,
    parentPid: process.pid,
    node: process.version,
    entrypoint: path.basename(args[0]),
    startedAt: new Date().toISOString(),
  };
  subprocesses.push(item);
  let error;
  const promise = new Promise((resolve, reject) => {
    child.once('error', (e) => {
      error = e;
    });
    child.once('close', (code, signal) => {
      Object.assign(item, {
        finishedAt: new Date().toISOString(),
        code,
        signal,
        log: logStats(),
      });
      if (error || code !== 0)
        reject(
          new Error(`Fixture subprocess ${label} did not complete successfully`)
        );
      else resolve(item);
    });
  });
  // Long-running node termination is checked separately, never an unhandled rejection.
  if (longRunning) promise.catch(() => {});
  const handle = { child, promise, item, identity: processIdentity(child.pid) };
  assert.equal(handle.identity.group, supervisorIdentity.group);
  assert.equal(handle.identity.session, supervisorIdentity.session);
  started.push(handle);
  return handle;
}
async function run(label, args, overrides) {
  if (ownedNode) verifyOwnedListener(ownedNode, port);
  const child = launch(label, args, overrides);
  // Timeout is a diagnostic stop, never an implicit resume/retry or nonce reset.
  let timeout;
  const expired = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      stopped = true;
      reject(
        Error('Fixture subprocess timeout; entire owned fixture must stop')
      );
    }, 15 * 60000);
  });
  let launchError;
  try {
    await Promise.race([child.promise, expired]);
  } catch (error) {
    launchError = error;
  } finally {
    clearTimeout(timeout);
  }
  if (launchError) throw launchError;
  assertRunning();
  if (args[0] === cli && args[1] === 'run') {
    const completion = inspectHardhatCompletion(
      env.JOBS_CLI_METRICS_DIRECTORY,
      child.item,
      path.basename(args[3])
    );
    child.item.hardhatChildCompletion = completion;
    replace(path.join(privateRoot, 'subprocesses.json'), subprocesses);
    assert(
      completion.accepted,
      `Hardhat TS child completion refused: ${completion.reason}`
    );
  }
  if (launchError) throw launchError;
  if (ownedNode) verifyOwnedListener(ownedNode, port);
}
async function archiveFile(file) {
  assertRunning();
  if (!fs.existsSync(file)) return;
  assert(
    file.startsWith(privateRoot + path.sep),
    'Only harness-owned private evidence can be archived'
  );
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && stat.nlink === 1 && !(stat.mode & 0o077));
  const hasher = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hasher.update(chunk);
  const hash = hasher.digest('hex'),
    target = `${file}.gz`;
  await pipeline(
    fs.createReadStream(file),
    zlib.createGzip({ level: 6 }),
    fs.createWriteStream(target, { flags: 'wx', mode: 0o600 })
  );
  const verifyHash = crypto.createHash('sha256');
  let size = 0;
  const stream = fs.createReadStream(target).pipe(zlib.createGunzip());
  for await (const chunk of stream) {
    verifyHash.update(chunk);
    size += chunk.length;
  }
  assert.equal(size, stat.size);
  assert.equal(verifyHash.digest('hex'), hash);
  archive.push({
    original: path.relative(privateRoot, file),
    gzip: path.relative(privateRoot, target),
    uncompressedBytes: size,
    uncompressedSha256: hash,
    compressedBytes: fs.statSync(target).size,
  });
  replace(path.join(privateRoot, 'archive-inventory.json'), archive);
  assertRunning();
  fs.unlinkSync(file);
}
async function verifyNodeInstance() {
  verifyOwnedListener(ownedNode, port);
  const metadata = await provider.send('hardhat_metadata', []);
  assert.equal(Number(metadata.chainId), 31337);
  assert(!metadata.forkedNetwork, 'Forked chain forbidden');
  assert.equal(await provider.send('eth_chainId', []), '0x7a69');
  if (ownedNode.instanceId)
    assert.equal(metadata.instanceId, ownedNode.instanceId);
  else {
    assert.equal(await provider.send('eth_blockNumber', []), '0x0');
    ownedNode.instanceId = metadata.instanceId;
  }
  assert(
    typeof ownedNode.instanceId === 'string' && ownedNode.instanceId.length > 0
  );
}
async function command(step, commandName, options = {}) {
  await verifyNodeInstance();
  const name = `${String(step).padStart(2, '0')}-${commandName}`;
  const output = path.join(privateRoot, 'commands', `${name}-output.json`);
  const request = path.join(privateRoot, 'commands', `${name}-request.json`);
  save(request, { command: commandName, ...options, output });
  await run(
    name,
    [
      cli,
      'run',
      '--no-compile',
      'scripts/v2/externalManual.ts',
      '--network',
      'localhost',
    ],
    {
      DEPLOYMENT_EXTERNAL_COMMAND_FILE: request,
    }
  );
  const result = json(output);
  return { result, output };
}
async function writer(step) {
  await verifyNodeInstance();
  const output = path.join(
    privateRoot,
    'writers',
    `writer-${String(step).padStart(2, '0')}.json`
  );
  const prior = currentReport;
  const overrides = { DEPLOY_DEFAULTS_OUTPUT: output };
  if (prior) {
    const previous = json(prior);
    assert(
      previous.authorityOperations?.['create:Deployer']?.address,
      'Original creation checkpoint missing'
    );
    overrides.DEPLOY_DEFAULTS_RESUME_EVIDENCE = prior;
    overrides.DEPLOYER_ADDRESS =
      previous.coordinator ||
      previous.authorityOperations['create:Deployer'].address;
  }
  await run(
    `writer-${String(step).padStart(2, '0')}`,
    [
      cli,
      'run',
      '--no-compile',
      'scripts/v2/deployDefaults.ts',
      '--network',
      'localhost',
    ],
    overrides
  );
  const report = json(output);
  assert.equal(report.authorityJournalVersion, 2);
  assert.equal(report.externalPlanHash, env.JOBS_CLI_PLAN_HASH);
  assert.equal(report.productionApproved, false);
  assert.equal(
    report.status,
    step === 39
      ? 'awaiting-commissioning'
      : 'awaiting-external-manual-signature'
  );
  currentReport = output;
  // Only the report is a resume input. The writer's closed checkpoint stream is archived losslessly.
  await archiveFile(`${output}.journal.jsonl`);
  if (prior) await archiveFile(prior);
  return report;
}
let unexpectedChildren = false;
async function stopOwnedProcesses() {
  stopped = true;
  if (!supervisorIdentity) return true;
  // Only the disposable node is expected to remain when normal work ends.
  // An exited wrapper with a surviving TS child must fail even after cleanup succeeds.
  const expected = new Set([process.pid]);
  if (
    ownedNode &&
    ownedNode.child.exitCode === null &&
    ownedNode.child.signalCode === null
  )
    expected.add(ownedNode.child.pid);
  unexpectedChildren ||= ownedGroupMembers(supervisorIdentity).some(
    (pid) => !expected.has(pid)
  );
  const empty = await stopOwnedGroupChildren(supervisorIdentity);
  assert.equal(
    empty,
    true,
    'Owned fixture children remain; cleanup is incomplete'
  );
  // Allow close callbacks and final metrics to drain, without unbounded pipe waits.
  let timer;
  try {
    await Promise.race([
      Promise.all(started.map((handle) => handle.promise.catch(() => {}))),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error('Owned child close events incomplete')),
          3000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  return true;
}
function collectMetrics() {
  return fs
    .readdirSync(path.join(privateRoot, 'metrics'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => json(path.join(privateRoot, 'metrics', name)));
}
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--run-owned-loopback') {
    console.log(
      'Prepared only. Explicit test-window command: node --max-old-space-size=256 test/scripts/acceptance/run-external-cli.cjs --run-owned-loopback'
    );
    console.log(
      'Fresh private /tmp state; no provider URL, key, session, nonce, or override arguments are accepted.'
    );
    return;
  }
  assert.equal(process.platform, 'linux', 'Readable Linux /proc is mandatory');
  assert.equal(
    process.versions.node,
    fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim(),
    'Exact repository-pinned Node required'
  );
  supervisorIdentity = processGroupIdentity(process.pid);
  assertGroupLeader(supervisorIdentity);
  identity = getSourceIdentity(root);
  assertCleanSource(root);
  assert(
    process.execArgv.includes('--max-old-space-size=256'),
    'Explicit 256 MiB Node heap flag required'
  );
  assert.equal(fs.realpathSync(root), root);
  assert(
    !fs.existsSync(path.join(root, '.env')),
    'Unreviewed dotenv bootstrap is forbidden in this fixture'
  );
  assert(
    !process.env.NODE_OPTIONS &&
      !process.env.NODE_PATH &&
      !process.env.HARDHAT_CONFIG,
    'Runtime override environment forbidden'
  );
  assert(
    availableBytes() >= 48 * 1048576,
    'At least 48 MiB /tmp space required at start'
  );
  process.umask(0o077);
  privateRoot = privateDir(path.join(HOSTED_ROOT, 'cli')); // Exclusive fixed hosted fixture; never resume or overwrite.
  fs.chmodSync(privateRoot, 0o700);
  for (const directory of [
    'home',
    'cache',
    'config',
    'data',
    'logs',
    'metrics',
    'commands',
    'writers',
    'locks',
  ])
    privateDir(path.join(privateRoot, directory));
  const hardhatConfig = privateDir(
    path.join(privateRoot, 'config', 'hardhat-nodejs')
  );
  save(path.join(hardhatConfig, 'telemetry-consent.json'), { consent: false });
  env = {
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: path.join(privateRoot, 'home'),
    XDG_CACHE_HOME: path.join(privateRoot, 'cache'),
    XDG_CONFIG_HOME: path.join(privateRoot, 'config'),
    XDG_DATA_HOME: path.join(privateRoot, 'data'),
    GITHUB_ACTIONS: 'true',
    JOBS_QUALIFICATION_EXPECTED_SHA: identity.sourceCommit,
    CI: 'true',
    HARDHAT_DISABLE_TELEMETRY_PROMPT: 'true',
    DOTENV_CONFIG_QUIET: 'true',
    JOBS_CLI_METRICS_DIRECTORY: path.join(privateRoot, 'metrics'),
    JOBS_CLI_METRICS_LABEL: 'harness',
  };
  process.env.JOBS_CLI_METRICS_DIRECTORY = env.JOBS_CLI_METRICS_DIRECTORY;
  process.env.JOBS_CLI_METRICS_LABEL = 'harness';
  require(hook);
  process.chdir(root);
  const { ethers } = require('ethers');
  const {
    digest,
    OPERATION_KEYS,
  } = require('../../../scripts/deploy/external-session.cjs');
  const {
    canonicalJson,
    buildEnvelope,
    importSignedEnvelope,
  } = require('../../../scripts/deploy/external-envelope.cjs');
  const {
    requiredSourceFiles,
  } = require('../../../scripts/deploy/external-profile.cjs');
  const {
    loadEnsConfig,
    loadTokenConfig,
  } = require('../../../scripts/config/index.js');
  assert.equal(OPERATION_KEYS.length, 39);
  currentLabel = 'normalize-ens-fixture';
  const ensFile = path.join(root, 'config/ens.json');
  ensBackup = fs.readFileSync(ensFile);
  ensIdentity = fixtureFileIdentity(ensFile);
  normalizedEnsHash = sha(ensBackup);
  fs.writeFileSync(path.join(privateRoot, 'ens-original.json'), ensBackup, {
    flag: 'wx',
    mode: 0o600,
  });
  const previewEns = loadEnsConfig({
    network: 'localhost',
    chainId: 31337,
    persist: false,
  });
  assert.equal(previewEns.path, ensFile);
  normalizedEnsHash = sha(
    Buffer.from(JSON.stringify(previewEns.config, null, 2) + '\n')
  );
  const normalized = loadEnsConfig({ network: 'localhost', chainId: 31337 });
  assert.equal(normalized.path, ensFile, 'Unexpected ENS fixture resolution');
  assertExpectedNormalization(
    sha(ensBackup),
    normalizedEnsHash,
    sha(fs.readFileSync(ensFile))
  );
  assert.equal(
    loadEnsConfig({ network: 'localhost', chainId: 31337 }).updated,
    false,
    'ENS fixture normalization not idempotent'
  );
  assertExpectedNormalization(
    sha(ensBackup),
    normalizedEnsHash,
    sha(fs.readFileSync(ensFile))
  );
  currentLabel = 'build-fixture-manifest';
  const sourceFiles = new Set([
    ...requiredSourceFiles(root),
    ...fs
      .readdirSync(__dirname)
      .filter((name) => name.endsWith('.cjs'))
      .map((name) => `test/scripts/acceptance/${name}`),
    '.github/workflows/jobs-external-manual-qualification.yml',
    'test/scripts/external-cli-child-completion.test.cjs',
    'test/scripts/external-cli-public-evidence.test.cjs',
  ]);
  fixtureSourceManifest = {
    schema: 'jobs-reviewed-source-v1',
    ...identity,
    files: [...sourceFiles].sort().map((relative) => {
      const file = path.join(root, relative),
        stat = fs.lstatSync(file);
      assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
      const mode = stat.mode & 0o7777;
      assert(
        mode === 0o644 || mode === 0o755,
        `Unexpected fixture source mode: ${relative}`
      );
      return {
        path: relative,
        sha256: sha(fs.readFileSync(file)),
        mode: mode === 0o755 ? '100755' : '100644',
      };
    }),
  };
  const manifestFile = path.join(privateRoot, 'source-manifest.json');
  save(manifestFile, fixtureSourceManifest);
  sourceManifestSha256 = sha(fs.readFileSync(manifestFile));
  const compilerOutput = path.join(privateRoot, 'compiler-reader.json');
  await run('compiler-reader', [
    path.join(__dirname, 'external-cli-compiler.cjs'),
    compilerOutput,
  ]);
  const compiler = json(compilerOutput);
  currentLabel = 'reserve-owned-loopback-port';
  port = await freePort();
  assertRunning();
  env.LOCALHOST_RPC_URL = `http://127.0.0.1:${port}`;
  assert.equal(new URL(env.LOCALHOST_RPC_URL).hostname, '127.0.0.1');
  // Optional node-side compiler traces are diagnostic metadata, not EVM inputs.
  // Keep the reviewed network/EVM config by reference and preserve its effective
  // project root despite this wrapper living outside the checkout. Jobs CLI calls
  // below still use the original root config and canonical archived artifacts.
  const emptyNodeArtifacts = privateDir(
    path.join(privateRoot, 'node-empty-artifacts')
  );
  const nodeConfigFile = path.join(privateRoot, 'owned-node.config.cjs');
  const nodeConfigBytes = [
    "'use strict';",
    `const reviewed = require(${JSON.stringify(
      path.join(root, 'hardhat.config.js')
    )});`,
    `module.exports = { ...reviewed, paths: { ...reviewed.paths, root: ${JSON.stringify(
      root
    )}, artifacts: ${JSON.stringify(emptyNodeArtifacts)} } };`,
    '',
  ].join('\n');
  fs.writeFileSync(nodeConfigFile, nodeConfigBytes, {
    flag: 'wx',
    mode: 0o600,
  });
  nodeConfigIdentity = {
    file: nodeConfigFile,
    sha256: sha(Buffer.from(nodeConfigBytes)),
    importedRootConfig: path.join(root, 'hardhat.config.js'),
    importedRootConfigSha256: sha(
      fs.readFileSync(path.join(root, 'hardhat.config.js'))
    ),
    effectiveProjectRoot: root,
    onlyChangedEffectivePath: 'artifacts',
    artifactsDirectory: emptyNodeArtifacts,
    compilerSourceTracing: 'omitted-on-disposable-node-only',
    evmNetworkSettings: 'unchanged-imported-root-configuration',
    actualJobsCliConfigAndArtifacts: 'unchanged',
  };
  save(path.join(privateRoot, 'node-config-identity.json'), nodeConfigIdentity);
  ownedNode = launch(
    'owned-node-private',
    [
      cli,
      '--config',
      nodeConfigFile,
      'node',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
      '--network',
      'hardhat',
    ],
    {},
    true
  );
  ownedNode.identity = processIdentity(ownedNode.child.pid);
  for (let attempt = 0; ; attempt++) {
    if (verifyOwnedListener(ownedNode, port, false)) break;
    assert(attempt < 600, 'Owned node did not become ready in 60 seconds');
    await sleep(100);
  }
  class OwnedProvider extends ethers.JsonRpcProvider {
    async _send(payload) {
      verifyOwnedListener(ownedNode, port);
      const result = await super._send(payload);
      verifyOwnedListener(ownedNode, port);
      return result;
    }
  }
  provider = new OwnedProvider(env.LOCALHOST_RPC_URL, 31337, {
    cacheTimeout: -1,
    batchMaxCount: 1,
    staticNetwork: true,
  });
  await verifyNodeInstance();
  currentLabel = 'install-owned-token-fixture';
  const token = loadTokenConfig({ network: 'localhost' }).config;
  const tokenArtifact = json(
    path.join(
      root,
      'artifacts/contracts/v2/mocks/LocalAgialpha.sol/LocalAgialpha.json'
    )
  );
  assert.equal(await provider.getCode(token.address), '0x');
  await provider.send('hardhat_setCode', [
    token.address,
    tokenArtifact.deployedBytecode,
  ]);
  assert.equal(
    Number(
      await new ethers.Contract(
        token.address,
        ['function decimals() view returns(uint8)'],
        provider
      ).decimals()
    ),
    token.decimals
  );
  const wallet = ethers.HDNodeWallet.fromPhrase(
    'test test test test test test test test test test test junk'
  );
  const accounts = await provider.send('eth_accounts', []);
  assert.equal(
    ethers.getAddress(accounts[0]),
    wallet.address,
    'Only public development fixture account allowed'
  );
  assert.equal(await provider.getCode(wallet.address), '0x');
  const firstNonce = await provider.getTransactionCount(wallet.address);
  assert.equal(
    firstNonce,
    0,
    'Owned fresh creator must have original zero nonce, never reset'
  );
  const initial = await provider.getBlock('latest');
  assert.equal(initial.number, 0);
  const config = json(
    path.join(root, 'demo/aurora/config/deployer.hardhat.json')
  );
  const governor = ethers.getAddress(config.governance);
  assert.notEqual(governor, wallet.address);
  config.campaign = {
    chainId: 31337,
    blockNumber: initial.number,
    blockHash: initial.hash,
  };
  config.identity.clubRootNode = normalized.config.roots.club.node;
  config.identity.agentRootNode = normalized.config.roots.agent.node;
  const configFile = path.join(privateRoot, 'deployment-config.json');
  save(configFile, config);
  const creationScope = {
    chainId: 31337,
    creator: wallet.address,
    governance: governor,
    campaign: config.campaign,
    initialBlock: {
      number: initial.number,
      hash: initial.hash,
      timestamp: initial.timestamp,
    },
  };
  plan = {
    schema: 'jobs-external-plan-v1',
    campaignId: crypto.randomUUID(),
    chainId: 31337,
    creator: wallet.address,
    governor,
    ...identity,
    compilerInputSha256: compiler.compilerInputSha256,
    sourceManifestHash: sourceManifestSha256,
    configHash: `0x${sha(fs.readFileSync(configFile))}`,
    creationScopeHash: digest(creationScope),
    firstNonce,
    creatorCodeHash: ethers.keccak256('0x'),
    initialBlock: { number: initial.number, hash: initial.hash },
    confirmations: 1,
    expiresAt: new Date(Date.now() + 6 * 60 * 60000).toISOString(),
    fees: {
      gasLimit: '16777216',
      maxFeePerGas: '10000000000',
      maxPriorityFeePerGas: '1000000000',
    },
    lockDirectory: path.join(privateRoot, 'locks'),
  };
  const planFile = path.join(privateRoot, 'plan.json'),
    profileFile = path.join(privateRoot, 'profile.json');
  save(planFile, plan);
  const planHash = digest(plan);
  save(profileFile, {
    profile: 'jobs-external-manual-v1',
    sessionDirectory: path.join(privateRoot, 'session'),
    planFile,
    reviewedPlanHash: planHash,
    sourceManifestFile: manifestFile,
    reviewedSourceManifestSha256: sourceManifestSha256,
  });
  Object.assign(env, {
    DEPLOY_DEFAULTS_CONFIG: configFile,
    DEPLOYMENT_EXTERNAL_PROFILE: profileFile,
    DEPLOYMENT_LOCK_DIRECTORY: plan.lockDirectory,
    JOBS_CLI_PLAN_HASH: planHash,
  });
  save(path.join(privateRoot, 'fixture-context.json'), {
    schema: 'jobs-external-cli-fixture-context-v1',
    source: identity,
    privateRoot,
    localhostUrl: env.LOCALHOST_RPC_URL,
    node: { ...ownedNode.identity, instanceId: ownedNode.instanceId },
    nodeConfigIdentity,
    compiler,
    planHash,
    sourceManifestSha256,
    creationScope,
    initialFreeBytes: checkSpace(),
    limitations,
  });
  console.log(
    `Owned-loopback external CLI acceptance started; private evidence directory: ${privateRoot}`
  );
  let report = await writer(0);
  const operationEvidence = [];
  for (let index = 0; index < 39; index++) {
    const { result: status } = await command(index, 'inspect');
    assert.equal(status.planHash, planHash);
    assert.equal(status.operations.length, index + 1);
    assert(
      status.operations
        .slice(0, index)
        .every((item) => item.state === 'accepted')
    );
    const pending = status.operations[index];
    assert.equal(pending.key, OPERATION_KEYS[index]);
    assert.equal(pending.state, 'prepared');
    const review = {
      planHash,
      unsignedHash: pending.unsignedHash,
      policyHash: pending.policyHash,
    };
    const { result: handoff } = await command(index, 'handoff', { review });
    assert.equal(handoff.newSigningRequest, true);
    assert.equal(handoff.broadcastByCoordinator, false);
    const envelope = handoff.envelope;
    assert.equal(
      canonicalJson(
        buildEnvelope({
          transaction: envelope.transaction,
          context: envelope.context,
        })
      ),
      canonicalJson(envelope)
    );
    assert.equal(envelope.context.operationKey, OPERATION_KEYS[index]);
    assert.equal(envelope.context.operationIndex, index);
    assert.equal(envelope.context.planHash, planHash);
    assert.equal(envelope.context.creator, wallet.address);
    assert.equal(envelope.context.governor, governor);
    assert.equal(envelope.transaction.nonce, firstNonce + index);
    assert.equal(Number(envelope.transaction.chainId), 31337);
    assert.equal(envelope.unsignedHash, review.unsignedHash);
    assert.equal(envelope.policyHash, review.policyHash);
    assert.equal(envelope.transaction.value, '0');
    for (const [field, value] of Object.entries(plan.fees))
      assert.equal(envelope.transaction[field], value);
    // The only signing call uses this locally prepared, exact hash-checked envelope.
    assertRunning();
    const raw = await wallet.signTransaction(envelope.transaction);
    assertRunning();
    const checked = importSignedEnvelope(envelope, raw);
    const signedFile = path.join(
      privateRoot,
      'commands',
      `${String(index).padStart(2, '0')}-signed.json`
    );
    save(signedFile, { raw });
    const { result: imported } = await command(index, 'import-signed', {
      signedFile,
    });
    assert.equal(imported.transactionHash, checked.hash);
    assert.equal(
      imported.relayAcknowledgement,
      `RELAY_JOBS:${planHash}:${index}:${checked.hash}`
    );
    const { result: capability } = await command(index, 'authorize-relay', {
      acknowledgement: imported.relayAcknowledgement,
    });
    assert.equal(capability.oneAuthorizedAttempt, true);
    assert.equal(capability.transactionHash, checked.hash);
    assert.equal(capability.raw, raw);
    await verifyNodeInstance();
    assert.equal(
      await provider.getTransactionCount(wallet.address, 'pending'),
      firstNonce + index
    );
    // Exactly one manual relay invocation; any ambiguity fails and preserves state.
    assertRunning();
    const sent = await provider.broadcastTransaction(capability.raw);
    assert.equal(sent.hash, checked.hash);
    const receipt = await sent.wait(1, 120000);
    assert.equal(receipt.status, 1);
    const { result: observed } = await command(index, 'observe');
    assert.equal(observed.transactionHash, checked.hash);
    assert.equal(observed.receipt.blockHash, receipt.blockHash);
    report = await writer(index + 1);
    completedOperations++;
    operationEvidence.push({
      index,
      key: OPERATION_KEYS[index],
      unsignedHash: review.unsignedHash,
      policyHash: review.policyHash,
      transactionHash: checked.hash,
      nonce: firstNonce + index,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status,
    });
    replace(
      path.join(privateRoot, 'completed-operations.json'),
      operationEvidence
    );
    const usage = process.memoryUsage();
    console.log(
      `External CLI ${completedOperations}/39 accepted; harness RSS ${Math.round(
        usage.rss / 1048576
      )} MiB; heap ${Math.round(
        usage.heapUsed / 1048576
      )} MiB; external ${Math.round(
        usage.external / 1048576
      )} MiB; /tmp free ${Math.floor(checkSpace() / 1048576)} MiB`
    );
  }
  const { result: finalStatus } = await command(39, 'inspect');
  assert.equal(finalStatus.operations.length, 39);
  assert(finalStatus.operations.every((item) => item.state === 'accepted'));
  assert.deepEqual(Object.keys(report.authorityOperations), OPERATION_KEYS);
  assert.equal(Object.keys(report.creationRecords).length, 25);
  assert.equal(finalStatus.activationReady, false);
  assert.equal(finalStatus.productionApproved, false);
  assert.equal(report.activationReady, false);
  assert.equal(report.productionApproved, false);
  assert.equal(
    await provider.getTransactionCount(wallet.address),
    firstNonce + 39
  );
  const implementationNames = Object.values(
    require('../../../config/implementation-modules.json')
  ).flat();
  assert.equal(implementationNames.length, 10);
  const governorOwners = [];
  for (const name of ['Deployer', ...implementationNames]) {
    const address = report.authorityOperations[`create:${name}`].address;
    const owner = await new ethers.Contract(
      address,
      ['function owner() view returns(address)'],
      provider
    ).owner();
    assert.equal(owner, governor);
    governorOwners.push({ name, address, owner });
  }
  const managedNames = [
    'StakeManager',
    'JobRegistry',
    'ValidationModule',
    'ReputationEngine',
    'DisputeModule',
    'PlatformRegistry',
    'FeePool',
    'ArbitratorCommittee',
  ];
  const pausedModules = [];
  for (const name of managedNames) {
    const address = report.contracts[name];
    const contract = new ethers.Contract(
      address,
      [
        'function owner() view returns(address)',
        'function paused() view returns(bool)',
      ],
      provider
    );
    const owner = await contract.owner(),
      paused = await contract.paused();
    assert.equal(owner, report.contracts.SystemPause);
    assert.equal(paused, true);
    pausedModules.push({ name, address, owner, paused });
  }
  assert.equal(
    await new ethers.Contract(
      report.contracts.SystemPause,
      ['function owner() view returns(address)'],
      provider
    ).owner(),
    governor
  );
  for (const record of Object.values(report.creationRecords))
    assert.notEqual(await provider.getCode(record.address), '0x');
  assertRunning();
  save(path.join(privateRoot, 'acceptance-result.json'), {
    schema: 'jobs-external-cli-acceptance-v1',
    passed: true,
    completedOperations,
    signatures: 39,
    manualRelayInvocations: 39,
    canonicalKeys: OPERATION_KEYS,
    creations: 25,
    governorOwners,
    pausedModules,
    systemPause: { address: report.contracts.SystemPause, owner: governor },
    productionApproved: false,
    activationReady: false,
    chainId: 31337,
    governor,
    planHash,
    sourceManifestSha256,
    report: path.relative(privateRoot, currentReport),
    subprocesses,
    operationEvidence,
    archive,
    nodeConfigIdentity,
    limitations,
  });
  console.log(
    'PASS: 39 canonical actual-CLI operations, 25 creations, 11 direct governor owners, eight SystemPause-owned paused modules; activation remains false.'
  );
}
let finishPromise;
function finish() {
  stopped = true;
  if (!finishPromise) finishPromise = finishOnce();
  return finishPromise;
}
async function finishOnce() {
  if (provider) provider.destroy();
  const childrenStopped = await stopOwnedProcesses();
  if (ensBackup && !ensRestored) {
    ensRestored = restoreFixtureFile(
      path.join(root, 'config/ens.json'),
      ensIdentity,
      ensBackup,
      normalizedEnsHash,
      childrenStopped
    );
  }
  if (privateRoot) {
    replace(path.join(privateRoot, 'subprocesses.json'), subprocesses);
    replace(path.join(privateRoot, 'process-metrics.json'), collectMetrics());
    assert.deepEqual(getSourceIdentity(root), identity);
    assertCleanSource(root);
    replace(path.join(privateRoot, 'cleanup.json'), {
      allOwnedFixtureChildrenStopped: true,
      unexpectedRemainingChildren: unexpectedChildren,
      sourceIdentityUnchanged: true,
      trackedSourceClean: true,
      ownedNodeStopped:
        !ownedNode ||
        ownedNode.child.exitCode !== null ||
        ownedNode.child.signalCode !== null,
      ensOriginalRestored: ensRestored,
      completedOperations,
      finalFreeBytes: availableBytes(),
    });
  }
  assert.equal(
    unexpectedChildren,
    false,
    'Unexpected fixture descendants survived work; qualification failed after cleanup'
  );
}
let signalReceived = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    if (signalReceived) return;
    signalReceived = true;
    void finish().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  });
main()
  .then(finish)
  .catch(async (error) => {
    // Never print arbitrary library/provider errors: they may include signed bytes.
    if (privateRoot) {
      replace(path.join(privateRoot, 'failure.json'), {
        schema: 'jobs-external-cli-failure-v1',
        stage: currentLabel,
        completedOperations,
        errorName: error?.name || 'Error',
        errorCode: typeof error?.code === 'string' ? error.code : null,
        messageSha256: sha(String(error?.message || 'unknown')),
        diagnosticFrames: String(error?.stack || '')
          .split('\n')
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 12),
        retainOriginalSession: true,
        automaticRetry: false,
      });
      console.error(
        `STOP: disposable external CLI acceptance at ${currentLabel}; ${completedOperations}/39 accepted. Private evidence retained at ${privateRoot}. No automatic retry.`
      );
    } else
      console.error(
        'STOP: disposable external CLI acceptance preflight failed; no node was started.'
      );
    try {
      await finish();
    } catch {
      console.error(
        'Cleanup needs private inspection; no unverified process or changed source was overwritten.'
      );
    }
    process.exitCode = 1;
  });
