'use strict';
// Disposable source repositories below are unit fixtures, never qualification
// ancestry. No provider, real key, deployment or network is used in this suite.
const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ethers } = require('ethers');
const S = require('../../scripts/deploy/tty-source.cjs');
const L = require('../../scripts/deploy/tty-launcher.cjs');
function directory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-tty-unit-'));
  return {
    root,
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
function fixture() {
  const f = directory();
  const names = [
    'hardhat.config.js',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'scripts/v2/deployDefaults.ts',
    'scripts/deploy/tty-launcher.cjs',
    'scripts/deploy/tty-source.cjs',
    'scripts/deploy/tty-secret.cjs',
    'scripts/deploy/tty-fee-signer.cjs',
    'docs/deployment-addresses.mainnet.json',
  ];
  for (const name of names) {
    const file = path.join(f.root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'fixture\n', { mode: 0o644 });
  }
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: f.root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q');
  git(
    '-c',
    'user.name=Unit Fixture',
    '-c',
    'user.email=fixture@invalid',
    'add',
    '.'
  );
  git(
    '-c',
    'user.name=Unit Fixture',
    '-c',
    'user.email=fixture@invalid',
    'commit',
    '-qm',
    'disposable unit fixture'
  );
  return {
    ...f,
    git,
    commit: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
  };
}
const creator = ethers.getAddress('0x1111111111111111111111111111111111111111'),
  governor = ethers.getAddress('0x2222222222222222222222222222222222222222');
function plan() {
  return {
    schema: 'jobs-conventional-tty-v1',
    sourceCommit: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    network: 'mainnet',
    creator,
    governor,
    config: '/tmp/config.json',
    configSha256: 'c'.repeat(64),
    output: '/tmp/output.json',
    lockDirectory: '/tmp/locks',
    firstNonce: 7,
    rpcUrl: 'https://user:RPC_SECRET@example.invalid/api/RPC_SECRET',
    fees: {
      gasLimit: '100000',
      maxFeePerGas: '100',
      maxPriorityFeePerGas: '2',
      maxTotalCost: '390000000',
    },
    resume: null,
  };
}
test('only explicit public review or execute syntax is accepted', () => {
  assert.equal(
    L.parseArguments([
      '--plan',
      '/tmp/plan',
      '--plan-sha256',
      'a'.repeat(64),
      '--review',
    ]).execute,
    false
  );
  assert.equal(
    L.parseArguments([
      '--plan',
      '/tmp/plan',
      '--plan-sha256',
      'a'.repeat(64),
      '--execute',
    ]).execute,
    true
  );
  for (const args of [
    [],
    ['--private-key', 'secret'],
    [
      '--plan',
      '/tmp/plan',
      '--plan-sha256',
      'a'.repeat(64),
      '--execute',
      '--force',
    ],
  ])
    assert.throws(() => L.parseArguments(args));
});
test('plan binds chain/creator/config/fees and rejects unknown or invalid fields', () => {
  assert.equal(L.validatePlan(plan(), ethers).chainId, 1);
  for (const change of [
    { governor: creator },
    { network: 'hardhat' },
    { firstNonce: -1 },
    { sourceTree: 'unknown' },
    { privateKey: 'NEVER' },
    { rpcUrl: 'file:///tmp/a' },
    { fees: { ...plan().fees, maxTotalCost: '1' } },
    { fees: { ...plan().fees, maxPriorityFeePerGas: '101' } },
  ])
    assert.throws(() => L.validatePlan({ ...plan(), ...change }, ethers));
});
test('public review never serializes RPC URL or credentials', () => {
  const p = L.validatePlan(plan(), ethers),
    text = JSON.stringify(
      L.publicReview(
        p,
        { governance: governor },
        {
          artifacts: [],
          chain: { status: 'checked' },
          predictedCoordinator: creator,
        },
        'a'.repeat(64)
      )
    );
  assert.ok(!text.includes('RPC_SECRET'));
  assert.ok(!text.includes('example.invalid'));
  assert.ok(text.includes('maxFeePerGas'));
  assert.ok(text.includes('DEPLOY ' + 'a'.repeat(64)));
});
test('signing, dotenv and runtime-loader environment rejected without reading values', () => {
  const f = directory();
  try {
    S.assertEnvironment(f.root, {});
    for (const name of [
      'MAINNET_PRIVATE_KEY',
      'TESTNET_PRIVATE_KEY',
      'MNEMONIC',
      'NODE_OPTIONS',
      'NODE_PATH',
      'DEBUG',
      'NODE_DEBUG',
      'NODE_DEBUG_NATIVE',
      'HARDHAT_CONFIG',
      'DOTENV_CONFIG_PATH',
      'TS_NODE_PROJECT',
      'GIT_DIR',
      'DEPLOYMENT_EXTERNAL_PROFILE',
      'DEPLOYER_ADDRESS',
    ])
      assert.throws(
        () => S.assertEnvironment(f.root, { [name]: 'SYNTHETIC_SECRET' }),
        (e) => !String(e).includes('SYNTHETIC_SECRET')
      );
    fs.writeFileSync(path.join(f.root, '.env'), 'PRIVATE_KEY=SYNTHETIC_SECRET');
    assert.throws(() => S.assertEnvironment(f.root, {}));
  } finally {
    f.close();
  }
});
test('descriptor-first pin rejects symlink, hardlink, directory, oversized and mutations', () => {
  const f = directory();
  try {
    const file = path.join(f.root, 'a');
    fs.writeFileSync(file, 'data');
    const p = S.pinFile(file);
    assert.equal(p.verify(), true);
    fs.writeFileSync(file, 'DATA');
    assert.throws(() => p.verify());
    assert.throws(() => S.pinFile(file, 3));
    fs.symlinkSync(file, path.join(f.root, 'link'));
    assert.throws(() => S.pinFile(path.join(f.root, 'link')));
    fs.linkSync(file, path.join(f.root, 'hard'));
    assert.throws(() => S.pinFile(file));
    assert.throws(() => S.pinFile(f.root));
  } finally {
    f.close();
  }
});
test('parent replacement with original file inode still refuses', () => {
  const f = directory();
  try {
    const dir = path.join(f.root, 'parent');
    fs.mkdirSync(dir);
    const file = path.join(dir, 'a');
    fs.writeFileSync(file, 'data');
    const p = S.pinFile(file);
    fs.renameSync(dir, dir + '-old');
    fs.mkdirSync(dir);
    fs.renameSync(path.join(dir + '-old', 'a'), file);
    assert.throws(() => p.verify());
  } finally {
    f.close();
  }
});
test('private output and lock directories are pinned without creating or repairing them', () => {
  const f = directory();
  try {
    const guard = S.pinDirectory(f.root);
    assert.equal(guard(), true);
    fs.chmodSync(f.root, 0o755);
    assert.throws(() => guard());
    assert.throws(() => S.pinDirectory(f.root));
  } finally {
    f.close();
  }
});
test('actual Git fixture source identity validates then refuses source mutation', () => {
  const f = fixture();
  try {
    const guard = S.captureSource(f.root, f.commit, f.tree);
    assert.equal(guard(), true);
    fs.appendFileSync(
      path.join(f.root, 'scripts/v2/deployDefaults.ts'),
      'changed'
    );
    assert.throws(() => guard());
  } finally {
    f.close();
  }
});
test('wrong commit or tree refused before loading runtime', () => {
  const f = fixture();
  try {
    assert.throws(() => S.captureSource(f.root, '0'.repeat(40), f.tree));
    assert.throws(() => S.captureSource(f.root, f.commit, '0'.repeat(40)));
  } finally {
    f.close();
  }
});
test('new untracked executable module cannot shadow reviewed source', () => {
  const f = fixture();
  try {
    const guard = S.captureSource(f.root, f.commit, f.tree);
    fs.writeFileSync(
      path.join(f.root, 'scripts/deploy/unreviewed.js'),
      'module.exports=1'
    );
    assert.throws(() => guard());
  } finally {
    f.close();
  }
});
test('Git HEAD/reference identity changes refused after capture', () => {
  const f = fixture();
  try {
    const guard = S.captureSource(f.root, f.commit, f.tree);
    f.git('checkout', '-qb', 'new-branch');
    assert.throws(() => guard());
  } finally {
    f.close();
  }
});
test('source mode changes and newly introduced dotenv refuse', () => {
  const f = fixture();
  try {
    const guard = S.captureSource(f.root, f.commit, f.tree);
    fs.chmodSync(path.join(f.root, 'scripts/deploy/tty-source.cjs'), 0o755);
    assert.throws(() => guard());
  } finally {
    f.close();
  }
  const g = fixture();
  try {
    const guard = S.captureSource(g.root, g.commit, g.tree);
    fs.writeFileSync(path.join(g.root, '.env'), 'SECRET=hidden');
    assert.throws(() => guard());
  } finally {
    g.close();
  }
});
test('ordinary writer is only invoked after exact confirmation and hidden key setup in source order', () => {
  const code = fs.readFileSync(
    require.resolve('../../scripts/deploy/tty-launcher.cjs'),
    'utf8'
  );
  assert.ok(
    code.indexOf('assertEnvironment(root)') < code.indexOf("require('hardhat')")
  );
  assert.ok(
    code.indexOf('await confirmPublicPlan(') <
      code.indexOf('secret = await readSecret()')
  );
  assert.ok(
    code.indexOf('secret = await readSecret()') <
      code.indexOf("require('../v2/deployDefaults.ts').main([])")
  );
  assert.ok(!code.includes('PRIVATE_KEY='));
  assert.ok(
    code.includes('new ethers.Wallet(new ethers.SigningKey(secret), provider)')
  );
  assert.ok(code.includes('hre.ethers.getSigners = async () => [signer]'));
});
function launcherProcess(
  mode,
  {
    wrongKey = false,
    ambient = false,
    drift = false,
    providerFailure = false,
    artifactDrift = false,
  } = {}
) {
  const f = directory();
  try {
    for (const name of [
      'tty-launcher.cjs',
      'tty-source.cjs',
      'tty-secret.cjs',
      'tty-fee-signer.cjs',
    ]) {
      const dst = path.join(f.root, 'scripts/deploy', name);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(
        path.resolve(__dirname, '../../scripts/deploy', name),
        dst
      );
    }
    for (const name of [
      'hardhat.config.js',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'scripts/v2/deployDefaults.ts',
      'docs/deployment-addresses.mainnet.json',
    ]) {
      fs.mkdirSync(path.dirname(path.join(f.root, name)), { recursive: true });
      fs.writeFileSync(path.join(f.root, name), '{}');
    }
    fs.mkdirSync(path.join(f.root, 'artifacts/contracts/Demo.sol'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(f.root, 'artifacts/build-info'));
    fs.writeFileSync(
      path.join(f.root, 'artifacts/contracts/Demo.sol/Demo.json'),
      '{}'
    );
    fs.writeFileSync(
      path.join(f.root, 'artifacts/contracts/Demo.sol/Demo.dbg.json'),
      JSON.stringify({ buildInfo: '../../build-info/exact.json' })
    );
    fs.writeFileSync(
      path.join(f.root, 'artifacts/build-info/exact.json'),
      'compiler'
    );
    fs.symlinkSync(
      path.dirname(path.dirname(path.dirname(require.resolve('ethers')))),
      path.join(f.root, 'node_modules')
    );
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: f.root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    git('init', '-q');
    git('add', '.');
    git(
      '-c',
      'user.name=Unit Fixture',
      '-c',
      'user.email=fixture@invalid',
      'commit',
      '-qm',
      'disposable mocked launch fixture'
    );
    const wallet = new ethers.Wallet('0x' + '11'.repeat(32)),
      cfg = {
        governance: governor,
        tax: { enabled: true },
        secureDefaults: { pauseOnLaunch: true },
        authority: {
          stakeManagerTreasury: governor,
          feePoolTreasury: governor,
          feePoolGovernance: governor,
        },
      };
    fs.mkdirSync(path.join(f.root, 'private'), { mode: 0o700 });
    fs.mkdirSync(path.join(f.root, 'locks'), { mode: 0o700 });
    const cfgPath = path.join(f.root, 'private/config.json');
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const p = {
      ...plan(),
      creator: wallet.address,
      sourceCommit: git('rev-parse', 'HEAD'),
      sourceTree: git('rev-parse', 'HEAD^{tree}'),
      config: cfgPath,
      configSha256: S.hash(fs.readFileSync(cfgPath)),
      output: path.join(f.root, 'private/output.json'),
      lockDirectory: path.join(f.root, 'locks'),
    };
    const planPath = path.join(f.root, 'private/plan.json');
    fs.writeFileSync(planPath, JSON.stringify(p));
    const harness = `const fs=require('node:fs'),M=require('node:module'),original=M._load,root=${JSON.stringify(
      f.root
    )},events=[];let nonce=7;const E=require('ethers');Object.defineProperty(process.stdin,'isTTY',{value:true});Object.defineProperty(process.stdout,'isTTY',{value:true});const provider={getNetwork:async()=>{events.push('chain');${
      providerFailure
        ? "throw new Error('https://RPC_SECRET@example.invalid/SECRET');"
        : 'return{chainId:1n};'
    }},getTransactionCount:async()=>nonce,estimateGas:async()=>21000n,broadcastTransaction:async(raw)=>{const t=E.Transaction.from(raw);if(t.from!==${JSON.stringify(
      wallet.address
    )})throw Error('wrong synthetic signer');events.push('broadcast');nonce++;return{hash:t.hash,nonce:t.nonce};}};const hre={network:{name:'mainnet',config:{accounts:[],url:''}},ethers:{provider,getSigners:async()=>[]}};M._load=function(id,parent,main){if(id==='hardhat'){events.push('hardhat');return hre;}if(id==='../config')return{loadTokenConfig:()=>({config:{}})};if(id==='../v2/lib/deployment-candidate.cjs')return{inventory:()=>[{name:"Demo",source:"contracts/Demo.sol"}],buildDeploymentCandidate:async({config})=>({config,blockers:[],artifacts:[],chain:{status:'observed'}})};if(id==='./verified-artifact.cjs')return{createVerifiedArtifactReader:()=>()=>{}};if(id==='./authority-handover.cjs')return{validateAuthorityRoles:()=>{}};if(id==='./tty-secret.cjs')return{confirmPublicPlan:async()=>{events.push('confirm');${
      artifactDrift
        ? "fs.writeFileSync(root+'/artifacts/build-info/exact.json','changed!');"
        : ''
    }${
      drift
        ? "fs.appendFileSync(root+'/scripts/v2/deployDefaults.ts','drift');"
        : ''
    }},readSecret:async()=>{events.push('secret');return Buffer.alloc(32,${
      wrongKey ? 34 : 17
    });}};if(id==='../v2/lib/reserved-output.cjs')return{reserveDeploymentOutput:(file)=>{let bytes='';return{verify:()=>{if(fs.readFileSync(file,'utf8')!==bytes)throw Error('changed');},write:(v)=>{bytes=v;fs.writeFileSync(file,v,{flag:'wx',mode:0o600});},close:()=>{}};}};if(id==='../v2/deployDefaults.ts')return{main:async()=>{events.push('writer');const [signer]=await hre.ethers.getSigners();await signer.sendTransaction({nonce:7,to:null,data:'0x60006000f3'});}};return original.call(this,id,parent,main);};process.chdir(root);require(root+'/scripts/deploy/tty-launcher.cjs').main(['--plan',${JSON.stringify(
      planPath
    )},'--plan-sha256',${JSON.stringify(
      S.hash(fs.readFileSync(planPath))
    )},${JSON.stringify(
      mode
    )}]).then(()=>process.stdout.write('RESULT '+JSON.stringify({ok:true,events})+'\\n')).catch(()=>process.stdout.write('RESULT '+JSON.stringify({ok:false,events})+'\\n'));`;
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TERM: 'xterm',
      ...(ambient ? { MAINNET_PRIVATE_KEY: 'SYNTHETIC_SECRET' } : {}),
    };
    const stdout = execFileSync(process.execPath, ['-e', harness], {
      cwd: f.root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    });
    assert.ok(!stdout.includes('RPC_SECRET'));
    assert.ok(!stdout.includes('SYNTHETIC_SECRET'));
    const line = stdout.split('\n').find((l) => l.startsWith('RESULT '));
    return JSON.parse(line.slice(7));
  } finally {
    f.close();
  }
}
test('mocked actual launcher review never prompts or invokes writer', () => {
  const r = launcherProcess('--review');
  assert.equal(r.ok, true);
  assert.ok(r.events.includes('hardhat'));
  assert.ok(!r.events.includes('confirm'));
  assert.ok(!r.events.includes('secret'));
  assert.ok(!r.events.includes('writer'));
});
test('mocked actual launcher confirms then creates closure-local signer and submits exact synthetic envelope', () => {
  const r = launcherProcess('--execute');
  assert.equal(r.ok, true);
  for (const event of ['confirm', 'secret', 'writer', 'broadcast'])
    assert.ok(r.events.includes(event));
  assert.ok(r.events.indexOf('confirm') < r.events.indexOf('secret'));
  assert.ok(r.events.indexOf('secret') < r.events.indexOf('writer'));
});
test('ambient key fails before Hardhat/provider load', () => {
  const r = launcherProcess('--execute', { ambient: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.events, []);
});
test('wrong synthetic key and post-confirmation source drift never invoke writer', () => {
  for (const options of [
    { wrongKey: true },
    { drift: true },
    { artifactDrift: true },
  ]) {
    const r = launcherProcess('--execute', options);
    assert.equal(r.ok, false);
    assert.ok(!r.events.includes('writer'));
    assert.ok(!r.events.includes('broadcast'));
  }
});
test('provider error remains generic and prevents confirmation/key', () => {
  const r = launcherProcess('--execute', { providerFailure: true });
  assert.equal(r.ok, false);
  assert.ok(!r.events.includes('confirm'));
  assert.ok(!r.events.includes('secret'));
});

test('runtime historical address data is mandatory and drift refuses', () => {
  const f = fixture();
  try {
    const guard = S.captureSource(f.root, f.commit, f.tree);
    fs.writeFileSync(
      path.join(f.root, 'docs/deployment-addresses.mainnet.json'),
      'changed'
    );
    assert.throws(() => guard());
  } finally {
    f.close();
  }
});
test('packed branch gaining a loose reference refuses even when HEAD bytes are unchanged', () => {
  const f = fixture();
  try {
    f.git('pack-refs', '--all');
    const guard = S.captureSource(f.root, f.commit, f.tree);
    const ref = f.git('symbolic-ref', 'HEAD');
    const file = path.join(f.root, '.git', ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, f.commit + '\n');
    assert.throws(() => guard());
  } finally {
    f.close();
  }
});

test('canonical mainnet and sepolia ENS resolution is unchanged without source persistence', () => {
  const { loadEnsConfig } = require('../../scripts/config');
  for (const network of ['mainnet', 'sepolia']) {
    const file = path.resolve(__dirname, `../../config/ens.${network}.json`);
    const pin = S.pinFile(file);
    const raw = JSON.parse(pin.bytes.toString());
    const result = loadEnsConfig({ network, persist: false });
    assert.equal(result.updated, false);
    assert.equal(pin.verify(), true);
    assert.equal(result.config.registry, raw.registry);
    assert.equal(result.config.nameWrapper, raw.nameWrapper);
    for (const key of Object.keys(raw.roots)) {
      assert.equal(result.config.roots[key].node, raw.roots[key].node);
      assert.equal(
        result.config.roots[key].merkleRoot,
        raw.roots[key].merkleRoot
      );
    }
    assert.deepEqual(
      loadEnsConfig({ network, persist: false }).config,
      result.config
    );
    const originalWrite = fs.writeFileSync;
    let wouldWrite;
    try {
      fs.writeFileSync = (target, bytes) => {
        assert.equal(target, file);
        wouldWrite = JSON.parse(bytes);
      };
      const old = loadEnsConfig({ network, persist: true });
      assert.deepEqual(old.config, result.config);
      assert.deepEqual(wouldWrite, result.config);
    } finally {
      fs.writeFileSync = originalWrite;
    }
    assert.equal(pin.verify(), true);
  }
  assert.match(
    fs.readFileSync(
      path.resolve(__dirname, '../../scripts/v2/deployDefaults.ts'),
      'utf8'
    ),
    /loadEnsConfig\(\{\s*persist: false,/
  );
});
test('displayed artifact and compiler inputs stay pinned through later signing guards', () => {
  const f = directory();
  try {
    const dir = path.join(f.root, 'artifacts/contracts/Example.sol');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(f.root, 'artifacts/build-info'));
    const artifact = path.join(dir, 'Example.json'),
      build = path.join(f.root, 'artifacts/build-info/exact.json');
    fs.writeFileSync(artifact, '{}');
    fs.writeFileSync(
      path.join(dir, 'Example.dbg.json'),
      JSON.stringify({ buildInfo: '../../build-info/exact.json' })
    );
    fs.writeFileSync(build, 'compiler');
    const guard = S.captureArtifacts(f.root, [
      { name: 'Example', source: 'contracts/Example.sol' },
    ]);
    assert.equal(guard(), true);
    fs.writeFileSync(build, 'changed!');
    assert.throws(() => guard());
  } finally {
    f.close();
  }
});
