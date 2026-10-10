const { expect } = require('chai');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('Deployment CLI rehearsals', function () {
  this.timeout(180000);
  let directory;
  beforeEach(function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-deployment-cli-'));
  });
  afterEach(function () {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  function run(script, extraEnv = {}, network = 'hardhat') {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (
        /^(ONECLICK_|DEPLOY_DEFAULTS_|DEPLOYER_ADDRESS$|GOVERNANCE_ADDRESS$|SKIP_MOCK_AGIALPHA$)/.test(
          key
        )
      )
        delete env[key];
    }
    const result = spawnSync(
      process.execPath,
      [
        require.resolve('hardhat/internal/cli/cli'),
        'run',
        '--no-compile',
        script,
        '--network',
        network,
      ],
      {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...env, ...extraEnv },
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
      }
    );
    return { ...result, log: `${result.stdout || ''}\n${result.stderr || ''}` };
  }

  it('reports confirmed staged defaults and completes connected-owner acceptance', function () {
    const output = path.join(directory, 'deployment.json');
    const result = run('scripts/v2/deployDefaults.ts', {
      DEPLOY_DEFAULTS_SKIP_VERIFY: '1',
      DEPLOY_DEFAULTS_OUTPUT: output,
    });
    expect(result.status, result.log).to.equal(0);
    const report = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(report.econ.feePct).to.equal(5);
    expect(report.econ.burnPct).to.equal(1);
    expect(report.econ.commitWindow).to.equal(86400);
    expect(report.econ.revealWindow).to.equal(86400);
    expect(report.econ.minStake).to.be.a('string');
    expect(report.econ.jobStake).to.be.a('string');
    expect(report.pendingOwnership).to.deep.equal([]);
    expect(report.contracts.SystemPause).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(report.status).to.equal('awaiting-commissioning');
    expect(report.pauseState).to.have.lengthOf(8);
    expect(report.pauseState.every((item) => item.paused)).to.equal(true);
    expect(report.productionApproved).to.equal(false);
    expect(report.coordinator).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(report.transactions).to.have.lengthOf(24);
    expect(report.ownershipTransactions).to.have.lengthOf(2);
  });

  it('reports outstanding governance acceptance without impersonation', function () {
    const output = path.join(directory, 'governance.json');
    const config = path.join(directory, 'config.json');
    const governance = '0x0000000000000000000000000000000000001234';
    fs.writeFileSync(
      config,
      JSON.stringify({
        governance,
        econ: { burnPct: 1 },
        tax: {
          uri: 'ipfs://reviewed-policy',
          description: 'Reviewed policy',
        },
      })
    );
    const result = run('scripts/v2/deployDefaults.ts', {
      DEPLOY_DEFAULTS_SKIP_VERIFY: '1',
      DEPLOY_DEFAULTS_OUTPUT: output,
      DEPLOY_DEFAULTS_CONFIG: config,
    });
    expect(result.status, result.log).to.equal(0);
    const report = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(report.econ.burnPct).to.equal(1);
    expect(report.pendingOwnership.map((item) => item.contract)).to.deep.equal([
      'IdentityRegistry',
      'TaxPolicy',
    ]);
    expect(
      report.pendingOwnership.every((item) => item.pendingOwner === governance)
    ).to.equal(true);
    expect(report.taxPolicy.uri).to.equal('ipfs://reviewed-policy');
    expect(report.taxPolicy.acknowledgement).to.equal('Reviewed policy');
    expect(result.log).to.include('Governance acceptance required');
  });

  it('runs the provider-agnostic real job lifecycle through settlement and handoff', function () {
    const result = run('scripts/deploy/providerAgnosticDeploy.ts', {
      GOVERNANCE_ADDRESS: '0x0000000000000000000000000000000000001234',
      COMMIT_WINDOW: '30m',
      REVEAL_WINDOW: '30m',
    });
    expect(result.status, result.log).to.equal(0);
    expect(result.log).to.include('Integration scenario finalized job');
    expect(result.log).to.include('must still call acceptOwnership()');
  });

  it('refuses an existing evidence file before deploying a coordinator', function () {
    const output = path.join(directory, 'keep.json');
    fs.writeFileSync(output, 'original evidence');
    const result = run('scripts/v2/deployDefaults.ts', {
      DEPLOY_DEFAULTS_SKIP_VERIFY: '1',
      DEPLOY_DEFAULTS_OUTPUT: output,
    });
    expect(result.status).to.equal(1);
    expect(fs.readFileSync(output, 'utf8')).to.equal('original evidence');
    expect(result.log).not.to.include('Deployment coordinator:');
  });

  it('recovers a finalized deployment without a second transaction and refuses configuration drift', async function () {
    const { main } = require('../../scripts/v2/deployDefaults.ts');
    const { ethers } = require('hardhat');
    const config = path.join(directory, 'reviewed.json');
    fs.writeFileSync(
      config,
      JSON.stringify({
        econ: { feePct: 6 },
        tax: { uri: 'ipfs://reviewed', description: 'Reviewed terms' },
      })
    );
    const initial = path.join(directory, 'initial.json');
    const common = ['--config', config, '--skip-verify'];
    await main([...common, '--output', initial]);
    const report = JSON.parse(fs.readFileSync(initial, 'utf8'));
    const [signer] = await ethers.getSigners();
    const nonce = await ethers.provider.getTransactionCount(signer.address);
    const recovered = path.join(directory, 'recovered.json');
    await main([
      ...common,
      '--resume-deployer',
      report.coordinator,
      '--output',
      recovered,
    ]);
    expect(await ethers.provider.getTransactionCount(signer.address)).to.equal(
      nonce
    );
    const restored = JSON.parse(fs.readFileSync(recovered, 'utf8'));
    expect(restored.contracts).to.deep.equal(report.contracts);
    expect(restored.configurationHash).to.equal(report.configurationHash);
    expect(restored.econ.feePct).to.equal(6);
    fs.writeFileSync(
      config,
      JSON.stringify({
        econ: { feePct: 7 },
        tax: { uri: 'ipfs://reviewed', description: 'Reviewed terms' },
      })
    );
    let failure;
    try {
      await main([
        ...common,
        '--resume-deployer',
        report.coordinator,
        '--output',
        path.join(directory, 'changed.json'),
      ]);
    } catch (error) {
      failure = error;
    }
    expect(failure.message).to.include('Deployment configuration changed');
    expect(await ethers.provider.getTransactionCount(signer.address)).to.equal(
      nonce
    );
  });

  it('rejects the ValidationStub fixture on external networks before contacting RPC', function () {
    const result = run('scripts/deploy-v2.ts', {}, 'localhost');
    expect(result.status).to.equal(1);
    expect(result.log).to.include('local Hardhat fixture with ValidationStub');
    expect(result.log).not.to.include('ECONNREFUSED');
  });
});

describe('One-click wizard launch status', function () {
  this.timeout(30000);
  let directory;
  beforeEach(function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-wizard-test-'));
  });
  afterEach(function () {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function runWizard(dockerExit, launch, network = 'localhost') {
    const config = path.join(directory, 'config.json');
    const envFile = path.join(directory, 'runtime env');
    const commands = path.join(directory, 'commands.jsonl');
    const preload = path.join(directory, 'commands.cjs');
    fs.writeFileSync(config, JSON.stringify({ network }));
    fs.writeFileSync(envFile, 'CHAIN_ID=31337\n');
    // Exercise the real CLI, logging commands and replacing only its external
    // deployment/command boundaries. No Docker daemon, RPC or funds are used.
    fs.writeFileSync(
      preload,
      `
const Module = require('node:module');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const original = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename.endsWith('/scripts/v2/oneclick-wizard.ts')) {
    if (request === './oneclick-deploy') return {
      deployOneClick: async (_args, consume) => consume('reviewed-addressbook.json')
    };
    if (request === 'child_process') return {
      spawn(command, args, options) {
        fs.appendFileSync(${JSON.stringify(
          commands
        )}, JSON.stringify({command, args, chainId: options.env.CHAIN_ID, rpc: options.env.RPC_URL, staleAddress: options.env.NEXT_PUBLIC_STALE_ADDRESS}) + '\\n');
        const child = new EventEmitter();
        process.nextTick(() => child.emit('exit', command === 'docker' ? ${dockerExit} : 0));
        return child;
      }
    };
  }
  return original.call(this, request, parent, isMain);
};
`
    );
    const result = spawnSync(
      process.execPath,
      [
        '--require',
        require.resolve('ts-node/register/transpile-only'),
        '--require',
        preload,
        'scripts/v2/oneclick-wizard.ts',
        '--config',
        config,
        '--env',
        envFile,
        '--yes',
        launch ? '--compose' : '--no-compose',
      ],
      {
        cwd: path.resolve(__dirname, '../..'),
        env: {
          ...process.env,
          CHAIN_ID: '1',
          RPC_URL: 'https://wrong.example',
          NEXT_PUBLIC_STALE_ADDRESS: 'stale',
        },
        encoding: 'utf8',
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      }
    );
    return {
      ...result,
      log: `${result.stdout || ''}\n${result.stderr || ''}`,
      envFile,
      commands: fs.existsSync(commands)
        ? fs.readFileSync(commands, 'utf8').trim().split('\n').map(JSON.parse)
        : [],
    };
  }

  it('returns failure and recovery instructions when Docker launch fails', function () {
    const result = runWizard(17, true);
    expect(result.status, result.log).to.equal(1);
    expect(result.log).to.include('Failed to launch Docker Compose stack');
    expect(result.log).to.include('You can launch it manually with:');
    expect(result.log).not.to.include('One-click workflow completed');
    const docker = result.commands.find(
      (command) => command.command === 'docker'
    );
    expect(docker.chainId).to.equal('31337');
    expect(docker.rpc).to.equal('http://anvil:8545');
    expect(docker.staleAddress).to.equal(undefined);
    expect(docker.args).to.include.members([
      '--env-file',
      result.envFile,
      '--detach',
    ]);
  });

  it('rejects public network local templates before deployment or commands', function () {
    const result = runWizard(0, true, 'sepolia');
    expect(result.status).to.equal(1);
    expect(result.log).to.include('RPC_URL must be explicitly configured');
    expect(result.commands).to.deep.equal([]);
  });

  it('retains success when Docker launches successfully', function () {
    const result = runWizard(0, true);
    expect(result.status, result.log).to.equal(0);
    expect(result.log).to.include('One-click workflow completed');
    expect(
      result.commands.filter((command) => command.command === 'docker')
    ).to.have.lengthOf(1);
  });

  it('retains success without invoking Docker when launch is skipped', function () {
    const result = runWizard(17, false);
    expect(result.status, result.log).to.equal(0);
    expect(result.log).to.include('Skipping Docker Compose launch');
    expect(result.log).to.include('One-click workflow completed');
    expect(
      result.commands.some((command) => command.command === 'docker')
    ).to.equal(false);
  });
});
