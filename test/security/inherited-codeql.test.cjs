const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { ethers } = require('ethers');
const { JSDOM } = require('jsdom');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });

const root = path.resolve(__dirname, '../..');
function loadTs(relative, dependencies = {}, options = {}) {
  const filename = path.join(root, relative);
  let source = fs.readFileSync(filename, 'utf8');
  if (options.stopBefore) { const end = source.indexOf(options.stopBefore); assert.ok(end >= 0, 'CLI entrypoint boundary must exist'); source = source.slice(0, end); }
  if (options.expose) source += `\nexport { ${options.expose.join(', ')} };\n`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React },
    fileName: filename,
  }).outputText;
  const module = { exports: {} }, originalRequire = createRequire(filename);
  new Function('require', 'module', 'exports', '__dirname', 'process', compiled)(
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : originalRequire(name),
    module, module.exports, options.dirname ?? path.dirname(filename),
    options.cwd ? { ...process, cwd: () => options.cwd } : process,
  );
  return module.exports;
}

test('Onebox treats hostile user/server/receipt strings as text and creates only its own controls', async () => {
  const dom = new JSDOM('<body></body>');
  global.document = dom.window.document;
  try {
    const ui = await import('../../apps/onebox/dom-rendering.js');
    const hostile = '<img src=x onerror="globalThis.pwned=1"><button id="sim-approve">Fake approval</button><svg onload="bad()"></svg>';
    const nodes = [ui.planPreview(hostile, '1ms'), ui.missingFields([hostile]),
      ui.simulationPreview({ estimatedBudget: hostile, feeAmount: hostile, burnPct: hostile, risks: [hostile] }),
      ui.receiptMessage({ planHash: hostile, jobId: hostile, cid: hostile, url: 'javascript:bad()', tx: hostile }),
      ui.receiptCard({ planHash: hostile, jobId: hostile, reward: hostile, status: hostile, cid: hostile, url: 'data:text/html,bad', timestamp: 0 }),
      ui.runSteps({ steps: [{ state: 'bad" onclick="bad()', kind: hostile, name: hostile }] }), ui.errorMessage(hostile)];
    for (const node of nodes) document.body.append(node);
    assert.equal(document.querySelectorAll('script,img,svg,iframe,a,[onerror],[onclick]').length, 0);
    assert.equal(document.querySelectorAll('#plan-approve').length, 1);
    assert.equal(document.querySelectorAll('#sim-approve').length, 1);
    assert.ok(document.body.textContent.includes(hostile));
    assert.equal(ui.httpsLink('https://example.com/tx/0x123', 'Verify').protocol, 'https:');
    for (const url of ['JaVaScRiPt:alert(1)', ' https://example.com', 'https://user@example.com', 'https:\\evil.test']) assert.equal(ui.httpsLink(url, 'bad'), null);
  } finally { delete global.document; dom.window.close(); }
});

test('portal URL policy rejects script, encoded scheme, whitespace and path confusion; preserves HTTPS/IPFS', () => {
  const { resolveResourceUri } = loadTs('apps/enterprise-portal/src/lib/uri.ts');
  for (const value of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>bad()</script>', 'file:///etc/passwd', 'ethereum:0x1', '//evil.test', 'https:evil.test', ' https://good.test', 'https://good.test\t@evil.test', 'https://user:pass@good.test', 'https:\\evil.test', 'javascript%3Aalert(1)', '%6aavascript:alert(1)', 'ipfs://../escape', 'ipfs://bafytest/%2e%2e/x', 'ipfs://bafytest/%252e%252e/x', 'ipfs://bafytest/%2fescape', 'ipfs://bafytest/%5cescape', 'ipfs://bafytest/%00', 'https://']) {
    assert.equal(resolveResourceUri(value), undefined, value);
  }
  assert.equal(resolveResourceUri('HTTPS://example.com/a%20b?x=1#ok'), 'https://example.com/a%20b?x=1#ok');
  assert.equal(resolveResourceUri('ipfs://bafytest/folder/a%20b'), 'https://ipfs.io/ipfs/bafytest/folder/a%20b');
  assert.equal(resolveResourceUri('IPFS://ipfs/Qm1234/file.json'), 'https://ipfs.io/ipfs/Qm1234/file.json');
  assert.equal(resolveResourceUri('ipfs://bafytest', 'javascript:bad'), undefined);
});

test('IPFS resource paths preserve Unicode and encoded filenames as canonical HTTPS path segments', () => {
  const { resolveResourceUri } = loadTs('apps/enterprise-portal/src/lib/uri.ts');
  const expected = 'https://ipfs.io/ipfs/bafytest/Montr%C3%A9al/%CE%A9%20report%22%3Cfinal%3E.json';
  for (const value of ['ipfs://bafytest/Montréal/Ω%20report"<final>.json', 'ipfs://bafytest/Montr%C3%A9al/%CE%A9%20report%22%3Cfinal%3E.json']) {
    const result = resolveResourceUri(value);
    assert.equal(result, expected);
    const url = new URL(result);
    assert.equal(url.protocol, 'https:');
    assert.equal(decodeURIComponent(url.pathname), '/ipfs/bafytest/Montréal/Ω report"<final>.json');
    assert.equal(url.search, ''); assert.equal(url.hash, '');
  }
  for (const value of ['ipfs://bafytest/%E0%A4%A', 'ipfs://bafytest/\ud800', 'ipfs://bafytest/%0a', 'ipfs://bafytest/%23fragment', 'ipfs://bafytest/%3Fquery', 'ipfs://bafytest/%2e%2e/sibling', 'ipfs://bafytest/%252fescape']) {
    assert.equal(resolveResourceUri(value), undefined, value);
  }
});

test('contributor evidence verifies its actual payload and never manufactures an authority principal', async () => {
  const { parseContributors } = loadTs('agent-gateway/apiHelpers.ts', {
    './utils': { TOKEN_DECIMALS: 18, provider: {} },
    './stakeCoordinator': { ROLE_AGENT: 0, ROLE_VALIDATOR: 1, ROLE_PLATFORM: 2 },
  });
  const signer = ethers.Wallet.createRandom(), other = ethers.Wallet.createRandom();
  const payload = { work: 'public evidence', jobId: '42' }, canonical = JSON.stringify(payload);
  const signature = await signer.signMessage(canonical);
  const [verified] = parseContributors([{ address: signer.address, payload, signature, role: 'operator', metadata: { principal: 'operator' } }]);
  assert.equal(verified.payloadDigest, ethers.hashMessage(canonical));
  assert.equal(verified.signature, signature);
  assert.equal(verified.principal, undefined);
  assert.throws(() => parseContributors([{ address: other.address, payload, signature }]), /verification failed/);
  assert.throws(() => parseContributors([{ address: signer.address, payload: 'changed', signature }]), /verification failed/);
  assert.throws(() => parseContributors([{ address: signer.address, payload, signature: '0xbad' }]), /verification failed/);
  assert.throws(() => parseContributors([{ address: signer.address, signature, payloadDigest: ethers.hashMessage(canonical) }]), /requires its signed payload/);
  assert.throws(() => parseContributors([{ address: '../../operator', payload, signature }]), /valid Ethereum address/);
  const [unsigned] = parseContributors([{ address: signer.address, payloadDigest: 'self-asserted', role: 'operator' }]);
  assert.equal(unsigned.signature, undefined);
});

test('contained storage rejects traversal, symlinks and hardlinks, including replacement at write time', () => {
  const files = require('../../shared/containedFiles.ts');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-files-')), directory = path.join(temporary, 'records');
  try {
    files.writeContainedFile(directory, 'good.json', '{"ok":true}');
    assert.equal(files.readContainedFile(directory, 'good.json'), '{"ok":true}');
    for (const filename of ['../escape', '/tmp/escape', 'a/b', 'a\\b', '..', '%2e%2e', 'a\u0000']) assert.throws(() => files.containedFile(directory, filename));
    const outside = path.join(temporary, 'outside.json'); fs.writeFileSync(outside, 'unchanged');
    fs.symlinkSync(outside, path.join(directory, 'link.json'));
    assert.throws(() => files.readContainedFile(directory, 'link.json'));
    files.writeContainedFile(directory, 'link.json', 'replacement');
    assert.equal(fs.readFileSync(outside, 'utf8'), 'unchanged');
    fs.linkSync(outside, path.join(directory, 'hard.json'));
    assert.throws(() => files.readContainedFile(directory, 'hard.json'), /Invalid storage file/);
    fs.symlinkSync(directory, path.join(temporary, 'alias'));
    assert.throws(() => files.writeContainedFile(path.join(temporary, 'alias'), 'new.json', 'bad'), /symlink/);
    const rename = fs.renameSync;
    fs.renameSync = (source, target) => { if (target.endsWith('race.json')) fs.symlinkSync(outside, target); return rename(source, target); };
    try { files.writeContainedFile(directory, 'race.json', 'safe'); } finally { fs.renameSync = rename; }
    assert.equal(fs.readFileSync(outside, 'utf8'), 'unchanged');
    assert.throws(() => files.writeContainedFile(directory, 'good.json', 'overwritten', true), /EEXIST/);
    assert.equal(fs.statSync(path.join(directory, 'good.json')).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(directory).filter((file) => file.startsWith('tmp-')).length, 0);
    require('node:child_process').execFileSync('mkfifo', [path.join(directory, 'fifo.json')]);
    const fifo = require('node:child_process').spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', 'try { require("./shared/containedFiles.ts").readContainedFile(process.argv[1],"fifo.json");process.exit(1); } catch(error) { if(!error.message.includes("Invalid storage file"))process.exit(2); }', directory], { cwd: root, timeout: 5000, encoding: 'utf8' });
    assert.equal(fifo.status, 0, fifo.stderr);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('contained paths support the filesystem root and reject sibling-prefix escapes', () => {
  const { containedFile } = require('../../shared/containedFiles.ts');
  const filesystemRoot = path.parse(process.cwd()).root;
  assert.equal(containedFile(filesystemRoot, 'record.json'), path.join(filesystemRoot, 'record.json'));
  const directory = path.join(filesystemRoot, 'records');
  assert.equal(containedFile(directory + path.sep, 'record.json'), path.join(directory, 'record.json'));
  for (const filename of ['../records-sibling/record.json', path.join(filesystemRoot, 'records-sibling', 'record.json')]) {
    assert.throws(() => containedFile(directory, filename), /Invalid storage filename|Storage path escapes/);
  }
});

test('receipt writes validate response-derived fields, reject tampered persisted records and preserve valid receipts', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-receipts-'));
  try {
    const store = loadTs('apps/orchestrator/receiptStore.ts', {}, { cwd: temporary });
    const receipt = { kind: 'EXECUTION', planHash: '0x123', jobId: 42, createdAt: '2026-10-19T00:00:00.000Z', payload: { text: '<script>inert</script>' } };
    await store.saveReceipt(receipt);
    assert.deepEqual(await store.listReceipts({}), [receipt]);
    for (const patch of [{ createdAt: '../../outside' }, { kind: '../outside' }, { planHash: null }, { createdAt: '2026-10-19T00:00:00.000Z/../outside' }]) await assert.rejects(store.saveReceipt({ ...receipt, ...patch }));
    const directory = path.join(temporary, 'storage/receipts'), filename = fs.readdirSync(directory)[0];
    fs.writeFileSync(path.join(directory, filename), JSON.stringify({ ...receipt, planHash: 'tampered' }));
    const warn = console.warn; console.warn = () => {};
    try { assert.deepEqual(await store.listReceipts({}), []); } finally { console.warn = warn; }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('planner validates identifiers at read/write boundary and refuses a forged persisted plan ID', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-planner-')), dirname = path.join(temporary, 'agent-gateway'); fs.mkdirSync(dirname);
  const dependencies = { './employer': {}, './utils': {}, './security': {}, './telemetry': {} };
  try {
    const planner = loadTs('agent-gateway/jobPlanner.ts', dependencies, { dirname });
    for (const planId of ['../escape', 'a/b', 'a\\b', '%2e%2e', 'a'.repeat(129)]) await assert.rejects(planner.getJobPlan(planId));
    const directory = path.join(temporary, 'storage/employer/plans'); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'valid.json'), JSON.stringify({ planId: '../escape', tasks: [], tags: [], history: [] }));
    const warn = console.warn; console.warn = () => {};
    try { await assert.rejects(planner.getJobPlan('valid'), /identifier does not match/); } finally { console.warn = warn; }
    assert.equal(fs.existsSync(path.join(temporary, 'storage/employer/escape.json')), false);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('large adversarial planner text completes in a bounded child process and preserves ordinary parsing', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', `const {streamLLM,extractJobId}=require('./packages/orchestrator/src/providers/openai.ts'); (async()=>{if(extractJobId('job id #42')!==42)process.exit(1); for(const s of [' '.repeat(100000), '0'.repeat(100000)]) await streamLLM([{role:'user',content:s}],{});})().catch(()=>process.exit(1));`], { cwd: root, timeout: 5000, encoding: 'utf8' });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
});

test('console log values cannot introduce raw control characters or terminal escape sequences', () => {
  const { logValue } = require('../../shared/logValue.ts');
  for (const value of ['name\nforged log\r\u001b[31m', new Error('bad\nforged')]) {
    const encoded = logValue(value);
    assert.ok(!/[\r\n\u001b]/.test(encoded));
    assert.doesNotThrow(() => JSON.parse(encoded));
  }
});

test('constructor arguments use unique private directories and exclusive private files', () => {
  const { writeConstructorArgsTempFile } = require('../../scripts/release/run-etherscan-verification.js');
  const first = writeConstructorArgsTempFile(['value', 42], '../../untrusted-label');
  const second = writeConstructorArgsTempFile(['other'], '../../untrusted-label');
  try {
    assert.notEqual(path.dirname(first), path.dirname(second));
    assert.equal(fs.statSync(path.dirname(first)).mode & 0o777, 0o700);
    assert.equal(fs.statSync(first).mode & 0o777, 0o600);
    assert.deepEqual(require(first), ['value', 42]);
  } finally {
    fs.rmSync(path.dirname(first), { recursive: true, force: true });
    fs.rmSync(path.dirname(second), { recursive: true, force: true });
  }
});

test('report data stays literal after Markdown parsing and Mermaid labels cannot introduce graph syntax', async () => {
  const { escapeMarkdownLiteral } = require('../../scripts/v2/lib/markdownLiteral.ts');
  const { escapeMermaidLiteral } = require('../../scripts/v2/lib/mermaidLiteral.ts');
  const { marked } = await import('marked');
  for (const value of ['back\\|pipe', 'two\\\\|pipe', '<img src=x onerror=bad()>', '[approve](javascript:bad)', 'x"] --> attacker["Approved', 'x\nclick attacker "javascript:bad"']) {
    const dom = new JSDOM(marked.parse(`| Value | Next |\n| --- | --- |\n| ${escapeMarkdownLiteral(value).replace(/\r?\n/g, '<br/>')} | kept |`));
    assert.equal(dom.window.document.querySelectorAll('tbody td').length, 2);
    assert.equal(dom.window.document.querySelectorAll('a,img,script,button').length, 0);
    assert.ok(!/["\\\[\]<>\r\n]/.test(escapeMermaidLiteral(value)));
    dom.window.close();
  }
});

test('notifications bounds peer work before body parsing and safely stores inert JSON at its fixed path', async () => {
  const request = require('supertest');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-notify-'));
  const previous = process.env.NOTIFICATIONS_STORAGE_DIR;
  process.env.NOTIFICATIONS_STORAGE_DIR = temporary;
  delete require.cache[require.resolve('../../services/notifications/server.js')];
  const { app } = require('../../services/notifications/server.js');
  const info = console.info; console.info = () => {};
  try {
    const payload = { filename: '../../outside', text: 'line\nnext\u001b[31m', html: '<script>bad()</script>' };
    assert.equal((await request(app).post('/notify').send(payload)).status, 202);
    const lines = fs.readFileSync(path.join(temporary, 'notifications.log'), 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).filename, payload.filename);
    assert.equal((await request(app).get('/notifications')).body.notifications[0].html, payload.html);
    for (let i = 0; i < 118; i++) assert.equal((await request(app).get('/notifications')).status, 200);
    assert.equal((await request(app).get('/notifications').set('X-Forwarded-For', '1.2.3.4')).status, 429);
    assert.equal(fs.readdirSync(temporary).length, 1);
  } finally {
    console.info = info;
    if (previous === undefined) delete process.env.NOTIFICATIONS_STORAGE_DIR; else process.env.NOTIFICATIONS_STORAGE_DIR = previous;
    delete require.cache[require.resolve('../../services/notifications/server.js')];
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('world-model snapshots cannot use response-derived job IDs to escape their directory', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-model-')), dirname = path.join(temporary, 'shared'); fs.mkdirSync(dirname);
  try {
    const store = loadTs('shared/worldModel.ts', {}, { dirname });
    await assert.rejects(store.persistWorldModelSnapshot({ jobId: '../../outside' }));
    await store.persistWorldModelSnapshot({ jobId: '42', observations: [] });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temporary, 'storage/world-model/snapshots/42.json'), 'utf8')), { jobId: '42', observations: [] });
    assert.equal(fs.existsSync(path.join(temporary, 'storage/outside.json')), false);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('telemetry and retraining exports use configured destinations and JSON bodies, not file-derived network targets', async () => {
  const oldFetch = global.fetch, saved = { oracle: process.env.ENERGY_ORACLE_URL, signature: process.env.ENERGY_ORACLE_REQUIRE_SIGNATURE, reload: process.env.ORCHESTRATOR_CONTROL_URL };
  const calls = [], address = '0x1111111111111111111111111111111111111111';
  process.env.ENERGY_ORACLE_URL = 'https://oracle.example/telemetry';
  process.env.ENERGY_ORACLE_REQUIRE_SIGNATURE = 'false';
  process.env.ORCHESTRATOR_CONTROL_URL = 'https://control.example/reload';
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true }; };
  try {
    const telemetry = loadTs('agent-gateway/telemetry.ts', {
      './utils': { orchestratorWallet: null, agents: new Map([['configured', { wallet: address, url: 'https://worker.example/notify' }]]), FETCH_TIMEOUT_MS: 1000 },
      './operator': { isOracleContractConfigured: () => false }, './identity': {}, './security': {}, './auditAnchoring': {},
    }, { expose: ['sendToOracle', 'notifyAgentOfAnomaly'] });
    const payload = { reason: 'line\nnext', url: 'https://untrusted.example/escape' };
    telemetry.notifyAgentOfAnomaly(address, payload);
    await telemetry.sendToOracle([{ jobId: '42', agent: address, energyEstimate: 1 }]);
    const retrain = loadTs('scripts/retrainAgent.ts', {}, { stopBefore: '\nmain().catch', expose: ['notifyOrchestratorReload'] });
    await retrain.notifyOrchestratorReload('https://untrusted.example/escape\nlabel');
    assert.deepEqual(calls.map(call => call.url), ['https://worker.example/notify', 'https://oracle.example/telemetry', 'https://control.example/reload']);
    assert.deepEqual(JSON.parse(calls[0].options.body), payload);
    assert.deepEqual(Object.keys(JSON.parse(calls[1].options.body)).sort(), ['samples', 'submittedAt']);
    assert.deepEqual(Object.keys(JSON.parse(calls[2].options.body)).sort(), ['label', 'reason', 'timestamp']);
  } finally {
    global.fetch = oldFetch;
    for (const [key, value] of [['ENERGY_ORACLE_URL', saved.oracle], ['ENERGY_ORACLE_REQUIRE_SIGNATURE', saved.signature], ['ORCHESTRATOR_CONTROL_URL', saved.reload]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('identity creation refuses an existing symlink or record and does not overwrite wallet material', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-identity-'));
  const factory = loadTs('agent-gateway/agentFactory.ts', {
    './agentRegistry': {}, './identity': {}, './security': {}, './utils': {}, './ensRegistrar': {}, '../shared/spawnManager': { spawnDefaults: { categoryCap: 3 } },
  }, { expose: ['persistIdentityRecord'] });
  const blueprint = { ensName: 'fixture.agent.agi.eth', ensLabel: 'fixture', wallet: { address: '0x' + '1'.repeat(40), privateKey: 'PUBLIC_TEST_SENTINEL_NOT_A_KEY' }, metadata: {}, metrics: {}, spawn: {} };
  try {
    const outside = path.join(directory, 'outside'); fs.writeFileSync(outside, 'original');
    fs.symlinkSync(outside, path.join(directory, 'fixture.json'));
    await assert.rejects(factory.persistIdentityRecord(blueprint, null, { passed: true }, 'sandbox', { identityDir: directory }), /EEXIST/);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'original');
    fs.unlinkSync(path.join(directory, 'fixture.json'));
    const file = await factory.persistIdentityRecord(blueprint, null, { passed: true }, 'sandbox', { identityDir: directory });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    await assert.rejects(factory.persistIdentityRecord(blueprint, null, { passed: true }, 'sandbox', { identityDir: directory }), /EEXIST/);
    await assert.rejects(factory.persistIdentityRecord({ ...blueprint, ensLabel: '../escape' }, null, { passed: true }, 'sandbox', { identityDir: directory }), /Invalid identity label/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('coverage remapping reads and rewrites the same opened inode if its pathname is replaced', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-coverage-'));
  const coverage = path.join(directory, 'coverage'); fs.mkdirSync(coverage);
  const file = path.join(coverage, 'lcov.info'), outside = path.join(directory, 'outside'), held = path.join(coverage, 'held.info');
  fs.writeFileSync(file, 'SF:contracts/coverage/GovernorHarness.sol\nend_of_record\n'); fs.writeFileSync(outside, 'unchanged');
  const filename = path.join(root, 'scripts/ci/remap-coverage-paths.js'), module = { exports: {} }, read = fs.readFileSync;
  fs.readFileSync = (value, ...args) => {
    if (typeof value === 'number' && !fs.existsSync(held)) { fs.renameSync(file, held); fs.symlinkSync(outside, file); }
    return read(value, ...args);
  };
  try {
    new Function('require', 'module', '__dirname', read(filename, 'utf8').replace(/^#!.*\n/, ''))(require, module, path.join(directory, 'scripts/ci'));
    assert.equal(read(outside, 'utf8'), 'unchanged');
    assert.ok(read(held, 'utf8').includes('contracts/v2/governance/AGIGovernor.sol'));
  } finally { fs.readFileSync = read; fs.rmSync(directory, { recursive: true, force: true }); }
});

test('signed contributor payload survives actual protobuf encoding and real gRPC request mapping', async () => {
  const loader = require('@grpc/proto-loader');
  const definitions = loader.loadSync(path.join(root, 'agent-gateway/protos/agent_gateway.proto'), { keepCase: true, longs: String, enums: String, defaults: false, oneofs: true });
  const service = definitions['agentgateway.v1.AgentGateway'].SubmitResult;
  const helpers = loadTs('agent-gateway/apiHelpers.ts', { './utils': { provider: {}, TOKEN_DECIMALS: 18 }, './stakeCoordinator': {} });
  const rpc = loadTs('agent-gateway/grpc.ts', { './utils': {}, './deliverableStore': {}, './apiHelpers': helpers, './agentActions': {}, './stakeCoordinator': {}, './events': {}, './telemetry': {}, './jobSerialization': {} }, { expose: ['handleContributorParsing'] });
  const signer = ethers.Wallet.createRandom();
  for (const payload of ['{"jobId":"42","work":"public evidence"}', '', 'Preuve signée — Montréal Ω']) {
    const signature = await signer.signMessage(payload);
    const input = { job_id: '42', contributors: [{ address: signer.address, signature, signed_payload: payload }] };
    const decoded = service.requestDeserialize(service.requestSerialize(input));
    assert.equal(decoded.contributors[0].signed_payload, payload);
    const [contributor] = rpc.handleContributorParsing(decoded.contributors);
    assert.equal(contributor.signature, signature);
    assert.equal(contributor.payloadDigest, ethers.hashMessage(payload));
    const altered = { ...decoded.contributors[0], signed_payload: payload + 'tampered' };
    assert.throws(() => rpc.handleContributorParsing([altered]), /verification failed/);
    const missing = { ...decoded.contributors[0] }; delete missing.signed_payload;
    assert.throws(() => rpc.handleContributorParsing([missing]), /requires its signed payload/);
  }
  const legacy = service.requestDeserialize(service.requestSerialize({ job_id: '42', contributors: [{ address: signer.address, role: 'agent', payload_digest: 'self-asserted', metadata_json: '{"legacy":true}' }] }));
  const [unsigned] = rpc.handleContributorParsing(legacy.contributors);
  assert.equal(unsigned.address, signer.address);
  assert.equal(unsigned.signature, undefined);
  assert.equal(unsigned.payloadDigest, 'self-asserted');
  assert.deepEqual(unsigned.metadata, { legacy: true });
  assert.equal(rpc.handleContributorParsing([{ address: signer.address, payload_digest: 'self-asserted' }])[0].signature, undefined);
});

test('partial wiring expectations preserve null and never report an omitted dependency as a zero-address success', async () => {
  const filename = path.join(root, 'scripts/verify-wiring.js'), module = { exports: {} };
  const source = fs.readFileSync(filename, 'utf8').replace(/^#!.*\n/, '') + '\nmodule.exports = { normaliseExpectedValue, verifyModule };';
  new Function('require', 'module', 'exports', '__dirname', source)(createRequire(filename), module, module.exports, path.dirname(filename));
  const { normaliseExpectedValue, verifyModule } = module.exports;
  assert.equal(normaliseExpectedValue(null, 'address', 'missing'), null);
  assert.equal(normaliseExpectedValue(ethers.ZeroAddress, 'address', 'explicit'), ethers.ZeroAddress);
  const output = [], originalLog = console.log;
  let calls = 0;
  console.log = (...args) => output.push(args.join(' '));
  try {
    const artifact = { at: async () => ({ dependency: async () => { calls++; return ethers.ZeroAddress; } }) };
    const base = { key: 'fixture', displayName: 'Fixture', address: '0x1111111111111111111111111111111111111111', artifact };
    await verifyModule({ ...base, checks: [{ getter: 'dependency', expected: () => null }] });
    assert.equal(calls, 0);
    assert.ok(output.some((line) => line.includes('expected value not provided; skipping')));
    await verifyModule({ ...base, checks: [{ getter: 'dependency', expected: ethers.ZeroAddress }] });
    assert.equal(calls, 1);
    assert.ok(output.some((line) => line.includes(`Fixture.dependency = ${ethers.ZeroAddress}`)));
  } finally { console.log = originalLog; }
});

test('audit log reading rejects symlinks and binds metadata plus bytes to one descriptor', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-audit-')), file = path.join(directory, 'events.log'), held = path.join(directory, 'held');
  const audit = loadTs('scripts/anchor-logs.ts', { dotenv: { config() {} } }, { stopBefore: '\nmain().catch', expose: ['readAuditEntries'] });
  fs.writeFileSync(file, 'original event\n');
  const stat = fs.fstatSync;
  fs.fstatSync = (fd, ...args) => { if (!fs.existsSync(held)) { fs.renameSync(file, held); fs.writeFileSync(file, 'different file\n'); } return stat(fd, ...args); };
  try { assert.deepEqual(audit.readAuditEntries(directory, 1).entries, ['original event']); }
  finally { fs.fstatSync = stat; }
  try {
    fs.unlinkSync(file); fs.symlinkSync(held, file);
    assert.throws(() => audit.readAuditEntries(directory, 1), /ELOOP/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('owner configuration hash and size come from the same opened file after pathname replacement', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-config-')), file = path.join(directory, 'config.json'), held = path.join(directory, 'held.json');
  const audit = loadTs('scripts/v2/ownerConfigAudit.ts', { '../config': {} }, { stopBefore: '\nvoid main();', expose: ['computeFileSummary'] });
  fs.writeFileSync(file, 'original');
  const open = fs.promises.open;
  fs.promises.open = async (...args) => { const handle = await open(...args); fs.renameSync(file, held); fs.writeFileSync(file, 'different and longer'); return handle; };
  try {
    const summary = await audit.computeFileSummary(file);
    assert.equal(summary.hash, require('node:crypto').createHash('sha256').update('original').digest('hex'));
    assert.equal(summary.size, 8);
  } finally { fs.promises.open = open; fs.rmSync(directory, { recursive: true, force: true }); }
});

test('finalization rejects prototype keys and malformed IDs before a transaction or state write', async () => {
  let transactions = 0, saved;
  const state = {};
  const submission = loadTs('apps/orchestrator/submission.ts', {
    ethers: { ethers: { ...ethers, Contract: class { async finalize() { transactions += 1; return { hash: '0xfixture', wait: async () => ({}) }; } } } },
    './config': { JOB_REGISTRY_ADDRESS: '0x1111111111111111111111111111111111111111' },
    './execution': { loadState: () => state, saveState: value => { saved = value; } },
  });
  const wallet = { provider: {}, connect: () => ({}) };
  for (const id of ['__proto__', 'constructor', '../1', '-1', '1.5', '01', (2n ** 256n).toString(), Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(submission.finalizeJob(id, wallet), /Job ID/);
  assert.equal(transactions, 0); assert.equal(saved, undefined); assert.equal(Object.prototype.completed, undefined);
  assert.deepEqual(await submission.finalizeJob('42', wallet), { txHash: '0xfixture' });
  assert.equal(transactions, 1); assert.equal(saved['42'].completed, true);
});

test('audit/config descriptor checks refuse nonregular inputs without blocking on FIFOs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-cli-fifo-'));
  require('node:child_process').execFileSync('mkfifo', [path.join(directory, 'fifo.log')]);
  const preamble = `const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{createRequire}=require('module'),ts=require('typescript'),root=process.cwd();require('ts-node').register({transpileOnly:true,compilerOptions:{module:'commonjs'}});${loadTs.toString()};`;
  const cases = [
    `const m=loadTs('scripts/anchor-logs.ts',{dotenv:{config(){}}},{stopBefore:'\\nmain().catch',expose:['readAuditEntries']});assert.deepEqual(m.readAuditEntries(process.argv[1],1).entries,[]);`,
    `const m=loadTs('scripts/v2/ownerConfigAudit.ts',{'../config':{}},{stopBefore:'\\nvoid main();',expose:['computeFileSummary']});m.computeFileSummary(path.join(process.argv[1],'fifo.log')).then(r=>assert.equal(r.exists,false));`,
  ];
  try {
    for (const script of cases) {
      const result = require('node:child_process').spawnSync(process.execPath, ['-e', preamble + script, directory], { cwd: root, timeout: 5000, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});


test('spawn labels reserve collision suffixes inside the canonical 63-character bound', () => {
  const spawn = loadTs('shared/spawnManager.ts', {
    ethers: { ethers: {} }, './trainingRecords': {}, './energyMonitor': {},
  }, { expose: ['generateUniqueLabel'] });
  const labels = new Set();
  const first = spawn.generateUniqueLabel('a'.repeat(1000), labels);
  const second = spawn.generateUniqueLabel('a'.repeat(63), labels);
  const third = spawn.generateUniqueLabel('a'.repeat(1000), labels);
  assert.equal(first, 'a'.repeat(63));
  assert.equal(second, 'a'.repeat(61) + '-2');
  assert.equal(third, 'a'.repeat(61) + '-3');
  for (const label of [first, second, third]) assert.match(label, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const truncatedHyphen = spawn.generateUniqueLabel('a'.repeat(62) + '-long category', new Set());
  assert.equal(truncatedHyphen, 'a'.repeat(62));
  const collisions = new Set(['a'.repeat(63)]);
  for (let index = 2; index <= 12; index++) {
    const label = spawn.generateUniqueLabel('a'.repeat(63), collisions);
    assert.equal(label.length, 63); assert.ok(label.endsWith('-' + index));
  }
  assert.equal(spawn.generateUniqueLabel('Public Analysis', new Set(['public-analysis'])), 'public-analysis-2');
  assert.equal(spawn.generateUniqueLabel('Ω', new Set()), 'agent');
});

test('invalid spawn candidates fail before metrics, wallet creation, writes or request consumption', async () => {
  const calls = { metrics: 0, wallet: 0, writes: 0, mkdir: 0, reads: 0 };
  const fakeFs = { ...fs, existsSync: () => false, mkdirSync: () => { calls.mkdir++; },
    promises: { ...fs.promises, readFile: async () => { calls.reads++; return '[]'; }, writeFile: async () => { calls.writes++; } } };
  const spawn = loadTs('shared/spawnManager.ts', {
    fs: fakeFs, ethers: { ethers: { ...ethers, Wallet: { createRandom: () => { calls.wallet++; throw Error('Wallet creation must not execute'); } } } },
    './trainingRecords': { readTrainingRecords: async () => { calls.metrics++; return []; } },
    './energyMonitor': { readEnergySamples: async () => [] },
  });
  for (const recommendedLabel of ['', 'a'.repeat(64), 'a'.repeat(63) + '-2', '../escape', 'bad--label', '-bad', 'bad-', 'UPPER', null, 42]) {
    await assert.rejects(spawn.createBlueprintForCandidate({ recommendedLabel }, { persist: true, markConsumed: true }), /Invalid identity label/);
    assert.deepEqual(calls, { metrics: 0, wallet: 0, writes: 0, mkdir: 0, reads: 0 });
  }
});

test('valid bounded spawn blueprint keeps the exact generated label and name with a synthetic wallet', async () => {
  let walletCalls = 0;
  const spawn = loadTs('shared/spawnManager.ts', {
    ethers: { ethers: { ...ethers, Wallet: { createRandom: () => { walletCalls++; return { address: '0x' + '1'.repeat(40), privateKey: 'PUBLIC_TEST_SENTINEL_NOT_A_KEY' }; } } } },
    './trainingRecords': { readTrainingRecords: async () => [] }, './energyMonitor': { readEnergySamples: async () => [] },
  }, { expose: ['generateUniqueLabel'] });
  const label = spawn.generateUniqueLabel('a'.repeat(1000), new Set(['a'.repeat(63)]));
  const candidate = { recommendedLabel: label, category: 'Public analysis', categoryKey: 'public-analysis', observed: 4, jobs: [], priority: 2, recencyHours: 1, saturationRatio: 0, lastSeen: '2026-10-19T00:00:00.000Z' };
  const blueprint = await spawn.createBlueprintForCandidate(candidate, { persist: false, markConsumed: false });
  assert.equal(walletCalls, 1); assert.equal(blueprint.ensLabel, label); assert.equal(blueprint.ensName, label + '.agent.agi.eth');
  assert.ok(blueprint.metadata.tags.includes(label)); assert.equal(blueprint.persistedTo, undefined);
});

test('agent clone rejects invalid recommended or returned labels before sandbox, registration or persistence', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-spawn-preflight-'));
  const calls = { blueprint: 0, profiles: 0, register: 0, verify: 0, audit: 0, wallet: 0, identity: 0 };
  let returnedLabel = 'a'.repeat(65);
  const factory = loadTs('agent-gateway/agentFactory.ts', {
    './agentRegistry': { listAgentProfiles: async () => { calls.profiles++; return []; } },
    './identity': { registerIdentityFile: () => { calls.identity++; } },
    './security': { secureLogAction: async () => { calls.audit++; } },
    './utils': { walletManager: { register: () => { calls.wallet++; } } },
    './ensRegistrar': { registerEnsSubdomain: async () => { calls.register++; throw Error('Registration must not execute'); }, verifyEnsRegistration: async () => { calls.verify++; return { matches: true }; } },
    '../shared/spawnManager': { spawnDefaults: { categoryCap: 3 }, createBlueprintForCandidate: async () => { calls.blueprint++; return { ensLabel: returnedLabel, ensName: returnedLabel + '.agent.agi.eth', wallet: { address: '0x' + '1'.repeat(40), privateKey: 'PUBLIC_TEST_SENTINEL_NOT_A_KEY' } }; } },
  }, { expose: ['cloneCandidate', 'persistIdentityRecord'] });
  const options = { threshold: 1, allowSandboxFailure: true, identityDir: path.join(directory, 'identity'), sandboxDir: path.join(directory, 'sandbox') };
  try {
    for (const label of ['a'.repeat(65), '../escape', 'bad--label']) {
      await assert.rejects(factory.cloneCandidate({ observed: 4, available: true, recommendedLabel: label }, options), /Invalid identity label/);
      assert.equal(calls.blueprint, 0);
    }
    await assert.rejects(factory.cloneCandidate({ observed: 4, available: true, recommendedLabel: 'public' }, options), /Invalid identity label/);
    assert.equal(calls.blueprint, 1);
    await assert.rejects(factory.persistIdentityRecord({ ensLabel: returnedLabel }, null, {}, '', options), /Invalid identity label/);
    assert.deepEqual(fs.readdirSync(directory), []);
    assert.deepEqual({ ...calls, blueprint: 0 }, { blueprint: 0, profiles: 0, register: 0, verify: 0, audit: 0, wallet: 0, identity: 0 });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('ENS registration rejects oversized labels before wallet, contract or provider effects', async () => {
  const calls = { wallet: 0, contract: 0, provider: 0 };
  const registrar = loadTs('agent-gateway/ensRegistrar.ts', {
    ethers: { ethers, Wallet: function () { calls.wallet++; throw Error('Wallet must not be created'); }, Contract: function () { calls.contract++; throw Error('Contract must not be created'); } },
    '../scripts/config': { loadEnsConfig: () => ({ config: { roots: {} } }) },
    './utils': { provider: new Proxy({}, { get() { calls.provider++; throw Error('Provider must not be used'); } }) }, './security': {},
  });
  assert.equal(registrar.ensureEnsLabel(' ' + 'A'.repeat(63) + ' '), 'a'.repeat(63));
  for (const label of ['a'.repeat(64), 'a'.repeat(63) + '-2', '../escape', 'bad--label', '-bad', 'bad-']) {
    await assert.rejects(registrar.registerEnsSubdomain({ label, targetPrivateKey: 'PUBLIC_TEST_SENTINEL_NOT_A_KEY' }), /label/i);
    assert.deepEqual(calls, { wallet: 0, contract: 0, provider: 0 });
  }
});
