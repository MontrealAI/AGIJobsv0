const { expect } = require('chai');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const hre = require('hardhat');
const { ethers } = hre;
const { main } = require('../../scripts/v2/deployDefaults.ts');
const {
  auditAuthority,
  requireActivationReady,
  MANAGED,
} = require('../../scripts/deploy/authority-audit.cjs');
const {
  createAuthoritySourceReader,
} = require('../../scripts/deploy/authority-runtime.cjs');
const {
  createAuthorityHandover,
  acquireDeploymentLock,
} = require('../../scripts/deploy/authority-handover.cjs');
const implementationNames = Object.values(
  require('../../config/implementation-modules.json')
).flat();
const copy = (value) => JSON.parse(JSON.stringify(value));

async function rejects(action, text) {
  let caught;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  expect(caught, 'Expected a fail-closed rejection').to.be.instanceOf(Error);
  expect(caught.message).to.include(text);
}

describe('Journaled staged authority handover', function () {
  this.timeout(240000);
  let directory,
    creator,
    governor,
    treasury,
    report,
    readSource,
    pinProvider,
    snapshot;
  before(async function () {
    [creator, governor, treasury] = await ethers.getSigners();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-authority-test-'));
    const lockDirectory = path.join(directory, 'locks');
    fs.mkdirSync(lockDirectory);
    process.env.DEPLOYMENT_LOCK_DIRECTORY = lockDirectory;
    const config = path.join(directory, 'config.json');
    const campaignBlock = await ethers.provider.getBlock('latest');
    fs.writeFileSync(
      config,
      JSON.stringify({
        governance: governor.address,
        campaign: {
          chainId: 31337,
          blockNumber: campaignBlock.number,
          blockHash: campaignBlock.hash,
        },
        authority: {
          stakeManagerTreasury: treasury.address,
          feePoolTreasury: treasury.address,
          feePoolGovernance: governor.address,
        },
        tax: { enabled: false },
      })
    );
    const output = path.join(directory, 'deployment.json');
    await main(['--config', config, '--output', output, '--skip-verify']);
    report = JSON.parse(fs.readFileSync(output, 'utf8'));
    report.testConfig = config;
    readSource = createAuthoritySourceReader();
    // Only ENS is simulated by this transport: the canonical contract bytecode,
    // every staged owner/role/receipt and all governance calls use the local EVM.
    // This fixture does not claim real ENS or explorer verification.
    const ensAbi = new ethers.Interface([
      'function owner(bytes32) view returns(address)',
      'function isApprovedForAll(address,address) view returns(bool)',
    ]);
    pinProvider = {
      getBlock: (...args) => ethers.provider.getBlock(...args),
      getTransaction: (...args) => ethers.provider.getTransaction(...args),
      getTransactionReceipt: (...args) =>
        ethers.provider.getTransactionReceipt(...args),
      async send(method, args) {
        if (
          method === 'eth_getCode' &&
          args[0].toLowerCase() === report.identity.ens.toLowerCase()
        )
          return '0x6000';
        if (
          method === 'eth_call' &&
          args[0].to.toLowerCase() === report.identity.ens.toLowerCase()
        ) {
          const call = ensAbi.parseTransaction(args[0]);
          return ensAbi.encodeFunctionResult(call.name, [
            call.name === 'owner' ? governor.address : false,
          ]);
        }
        return ethers.provider.send(method, args);
      },
    };
    snapshot = await ethers.provider.send('evm_snapshot', []);
  });
  afterEach(async function () {
    await ethers.provider.send('evm_revert', [snapshot]);
    snapshot = await ethers.provider.send('evm_snapshot', []);
  });
  after(function () {
    delete process.env.DEPLOYMENT_LOCK_DIRECTORY;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const audit = (data, provider) =>
    auditAuthority(data || report, {
      provider: provider || pinProvider,
      readSource,
      blockTag: 'latest',
    });
  async function configure() {
    const identity = await ethers.getContractAt(
      'IdentityRegistry',
      report.contracts.IdentityRegistry,
      governor
    );
    await (await identity.acceptOwnership()).wait();
    const pause = await ethers.getContractAt(
      'SystemPause',
      report.contracts.SystemPause,
      governor
    );
    async function call(name, method, args) {
      const contract = await ethers.getContractAt(name, report.contracts[name]);
      await (
        await pause.executeGovernanceCall(
          await contract.getAddress(),
          contract.interface.encodeFunctionData(method, args)
        )
      ).wait();
    }
    for (const name of ['StakeManager', 'FeePool']) {
      await call(name, 'setTreasuryAllowlist', [treasury.address, true]);
      await call(name, 'setTreasury', [treasury.address]);
    }
    await call('FeePool', 'setGovernance', [governor.address]);
    return { pause, identity, call };
  }
  function verified() {
    const data = copy(report);
    data.explorerVerification = Object.values(data.creationRecords).map(
      ({ address }) => ({ address, status: 'verified' })
    );
    return data;
  }
  it('hands all ten implementations and the coordinator to distinct governance; eight live modules stay paused under SystemPause', async function () {
    expect(Object.keys(report.creationRecords)).to.have.length(24);
    expect(report.governance).not.to.equal(report.creator);
    for (const name of ['Deployer', ...implementationNames]) {
      const contract = await ethers.getContractAt(
        ['function owner() view returns(address)'],
        report.creationRecords[name].address
      );
      expect(await contract.owner(), name).to.equal(governor.address);
      const op = report.authorityOperations[`handover:${name}`];
      expect(op.receipt.status).to.equal(1);
      expect(op.creator).to.equal(creator.address);
      expect(op.value).to.equal('0');
    }
    for (const name of MANAGED) {
      const contract = await ethers.getContractAt(
        [
          'function owner() view returns(address)',
          'function paused() view returns(bool)',
        ],
        report.creationRecords[name].address
      );
      expect(await contract.owner(), name).to.equal(
        report.contracts.SystemPause
      );
      expect(await contract.paused(), name).to.equal(true);
    }
    expect(report.econ.feePct).to.equal(5);
    expect(report.econ.burnPct).to.equal(1);
    expect(report.econ.commitWindow).to.equal(86400);
    expect(report.econ.revealWindow).to.equal(86400);
    expect(report.econ.jobStakeBps).to.equal('1000');
  });
  it('keeps pending acceptance and separate treasury/governance roles incomplete without writing them', async function () {
    const certificate = await audit();
    expect(certificate.authorityComplete).to.equal(false);
    expect(certificate.activationReady).to.equal(false);
    expect(certificate.blockers).to.include.members([
      'IdentityRegistry.owner',
      'IdentityRegistry.pendingOwner',
      'StakeManager.treasury',
      'FeePool.treasury',
      'FeePool.governance',
    ]);
  });
  it('independently certifies the bounded final roles without a signer after manual governance completion', async function () {
    await configure();
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    const certificate = await audit(verified());
    expect(certificate.blockers).to.deep.equal([]);
    expect(certificate.authorityComplete).to.equal(true);
    expect(certificate.activationReady).to.equal(true);
    expect(certificate.productionApproved).to.equal(false);
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
  });
  it('recovers after the coordinator transfer with no second deployment or transfer', async function () {
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    const output = path.join(directory, 'recovered.json');
    await main([
      '--config',
      report.testConfig,
      '--output',
      output,
      '--skip-verify',
      '--resume-deployer',
      report.coordinator,
      '--resume-evidence',
      path.join(directory, 'deployment.json'),
    ]);
    const recovered = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(recovered.contracts).to.deep.equal(report.contracts);
    expect(recovered.implementations).to.deep.equal(report.implementations);
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
  });
  it('rejects an unpaused request before allocating or submitting a transaction', async function () {
    const config = JSON.parse(fs.readFileSync(report.testConfig, 'utf8'));
    config.secureDefaults = { pauseOnLaunch: false };
    const file = path.join(directory, 'unpaused.json');
    fs.writeFileSync(file, JSON.stringify(config));
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    await rejects(
      () =>
        main(['--config', file, '--output', `${file}.out`, '--skip-verify']),
      'requires a paused launch'
    );
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
    expect(fs.existsSync(`${file}.out`)).to.equal(false);
  });
  it('reconciles every prior operation before any resumed write and recovers a hashless component', async function () {
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    const data = copy(report);
    data.authorityOperations['component:FeePool'].dataHash = ethers.ZeroHash;
    const evidence = path.join(directory, 'tampered-component.json');
    fs.writeFileSync(evidence, JSON.stringify(data));
    await rejects(
      () =>
        main([
          '--config',
          report.testConfig,
          '--output',
          `${evidence}.out`,
          '--skip-verify',
          '--resume-deployer',
          report.coordinator,
          '--resume-evidence',
          evidence,
        ]),
      'transaction identity mismatch'
    );
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
    // The failed-run lease is intentionally retained. A separate test lock root
    // simulates operator reconciliation without auto-clearing the held lease.
    const locks = path.join(directory, 'component-recovery-locks');
    fs.mkdirSync(locks);
    process.env.DEPLOYMENT_LOCK_DIRECTORY = locks;
    const orphan = copy(report);
    delete orphan.authorityOperations['component:FeePool'].hash;
    delete orphan.authorityOperations['component:FeePool'].receipt;
    const orphanFile = path.join(directory, 'orphan-component.json');
    fs.writeFileSync(orphanFile, JSON.stringify(orphan));
    await main([
      '--config',
      report.testConfig,
      '--output',
      `${orphanFile}.out`,
      '--skip-verify',
      '--resume-deployer',
      report.coordinator,
      '--resume-evidence',
      orphanFile,
    ]);
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
    const recovered = JSON.parse(fs.readFileSync(`${orphanFile}.out`, 'utf8'));
    expect(recovered.authorityOperations['component:FeePool'].hash).to.equal(
      report.authorityOperations['component:FeePool'].hash
    );
  });
  it('rejects a tampered operation in a genuinely partial run before any remaining component is created', async function () {
    const locks = path.join(directory, 'partial-locks');
    fs.mkdirSync(locks);
    process.env.DEPLOYMENT_LOCK_DIRECTORY = locks;
    const output = path.join(directory, 'partial.json');
    const originalWrite = fs.writeSync;
    let injected = false;
    fs.writeSync = function (...args) {
      const text = Buffer.isBuffer(args[1])
        ? args[1].toString()
        : String(args[1]);
      if (
        !injected &&
        text.includes('"creationRecords"') &&
        text.includes('"ReputationEngine":{"address"')
      ) {
        injected = true;
        throw new Error('injected after reputation component');
      }
      return originalWrite.apply(this, args);
    };
    try {
      await rejects(
        () =>
          main([
            '--config',
            report.testConfig,
            '--output',
            output,
            '--skip-verify',
          ]),
        'injected'
      );
    } finally {
      fs.writeSync = originalWrite;
    }
    expect(injected).to.equal(true);
    const partial = JSON.parse(fs.readFileSync(output, 'utf8'));
    const coordinator = await ethers.getContractAt(
      'Deployer',
      partial.coordinator
    );
    expect(await coordinator.deployed()).to.equal(false);
    expect(await coordinator.components(ethers.id('DisputeModule'))).to.equal(
      ethers.ZeroAddress
    );
    partial.authorityOperations['component:ReputationEngine'].dataHash =
      ethers.ZeroHash;
    const evidence = path.join(directory, 'partial-tampered.json');
    fs.writeFileSync(evidence, JSON.stringify(partial));
    const recoveredLocks = path.join(directory, 'partial-reconciled-locks');
    fs.mkdirSync(recoveredLocks);
    process.env.DEPLOYMENT_LOCK_DIRECTORY = recoveredLocks;
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    await rejects(
      () =>
        main([
          '--config',
          report.testConfig,
          '--output',
          `${evidence}.out`,
          '--skip-verify',
          '--resume-deployer',
          partial.coordinator,
          '--resume-evidence',
          evidence,
        ]),
      'transaction identity mismatch'
    );
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
    expect(await coordinator.components(ethers.id('DisputeModule'))).to.equal(
      ethers.ZeroAddress
    );
    const duplicated = copy(partial.authorityOperations);
    duplicated['duplicate:commit'] = {
      ...duplicated.commit,
      role: 'duplicate:commit',
    };
    delete duplicated['component:ReputationEngine'];
    const context = {
      provider: ethers.provider,
      signer: creator,
      runtime: ethers,
      chainId: 31337,
      creator: creator.address,
      governance: governor.address,
      token: report.token,
      readSource,
      creationScope: partial.creationScope,
      operations: duplicated,
      checkpoint: () => {},
    };
    await rejects(
      () => createAuthorityHandover(context).reconcile(),
      'journal identity mismatch'
    );
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
  });
  it('rejects a real older unlisted creation relabeled inside a newer reviewed campaign', async function () {
    const operations = {};
    const context = {
      provider: ethers.provider,
      signer: creator,
      runtime: ethers,
      chainId: 31337,
      creator: creator.address,
      governance: governor.address,
      token: report.token,
      readSource,
      creationScope: copy(report.creationScope),
      operations,
      checkpoint: () => {},
    };
    const authority = createAuthorityHandover(context);
    const old = await authority.deploy('JobRegistryConfiguration');
    const latest = await ethers.provider.getBlock('latest');
    const scope = copy(report.creationScope);
    scope.campaign = {
      chainId: 31337,
      blockNumber: latest.number,
      blockHash: latest.hash,
    };
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    await rejects(
      () =>
        createAuthorityHandover({ ...context, creationScope: scope }).handover(
          'JobRegistryConfiguration',
          old.target
        ),
      'predates'
    );
    scope.initialBlock = {
      number: latest.number,
      hash: latest.hash,
      timestamp: latest.timestamp,
    };
    await rejects(
      () =>
        createAuthorityHandover({ ...context, creationScope: scope }).handover(
          'JobRegistryConfiguration',
          old.target
        ),
      'failed or noncanonical'
    );
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
  });
  it('rejects a relabeled historical addressbook and forged or missing original anchors before writing', async function () {
    const historical = require('../../docs/deployment-addresses.mainnet.json');
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    for (const mutate of [
      (data) => {
        data.coordinator = historical.deployer;
        data.authorityOperations['create:Deployer'].address =
          historical.deployer;
      },
      (data) => {
        delete data.creationScope;
      },
      (data) => {
        data.creationScope.initialBlock.hash = ethers.id(
          'false-original-anchor'
        );
      },
      (data) => {
        data.creationScope.initialBlock = {
          number: 0,
          hash: ethers.id('invented-genesis'),
          timestamp: 0,
        };
      },
    ]) {
      const data = copy(report);
      data.deploymentId = 'relabeled-new-campaign';
      mutate(data);
      const evidence = path.join(directory, `forged-${Math.random()}.json`);
      fs.writeFileSync(evidence, JSON.stringify(data));
      await rejects(
        () =>
          main([
            '--config',
            report.testConfig,
            '--output',
            `${evidence}.out`,
            '--skip-verify',
            '--resume-deployer',
            data.coordinator,
            '--resume-evidence',
            evidence,
          ]),
        ''
      );
      expect(
        await ethers.provider.getTransactionCount(creator.address)
      ).to.equal(nonce);
    }
    const data = copy(report);
    const latest = await ethers.provider.getBlock('latest');
    data.creationScope.initialBlock = {
      number: latest.number,
      hash: latest.hash,
      timestamp: latest.timestamp,
    };
    data.configuration.creationScope = data.creationScope;
    data.configurationHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(data.configuration))
    );
    await rejects(() => audit(data), 'authority transaction');
    const authority = createAuthorityHandover({
      provider: ethers.provider,
      signer: creator,
      runtime: ethers,
      chainId: 31337,
      creator: creator.address,
      governance: governor.address,
      token: report.token,
      readSource,
      creationScope: report.creationScope,
      operations: copy(report.authorityOperations),
      checkpoint: () => {},
    });
    await rejects(
      () => authority.handover('Deployer', historical.deployer),
      'Historical deployment address'
    );
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
  });
  it('rejects altered role/scope commitments even with a new journal label', async function () {
    const data = copy(report);
    data.deploymentId = 'new-label';
    data.authority.feePoolGovernance = treasury.address;
    await rejects(() => audit(data), 'plan commitment');
    const operations = copy(report.authorityOperations);
    operations['create:JobRegistryConfiguration'].dataHash = ethers.ZeroHash;
    const authority = createAuthorityHandover({
      provider: ethers.provider,
      signer: creator,
      runtime: ethers,
      chainId: 31337,
      creator: creator.address,
      governance: governor.address,
      token: report.token,
      readSource,
      creationScope: report.creationScope,
      operations,
      checkpoint: () => {},
    });
    await rejects(
      () =>
        authority.handover(
          'JobRegistryConfiguration',
          report.implementations.JobRegistryConfiguration
        ),
      'new creation journal'
    );
  });
  it('refuses stale or missing creation evidence and wrong fixed delegates', async function () {
    for (const mutate of [
      (data) => {
        delete data.creationRecords[implementationNames[0]];
      },
      (data) => {
        data.implementations[implementationNames[0]] = treasury.address;
      },
      (data) => {
        data.creationRecords.Deployer.source =
          'contracts/v2/FeePool.sol:FeePool';
      },
      (data) => {
        data.authorityOperations['create:Deployer'].dataHash = ethers.ZeroHash;
      },
      (data) => {
        delete data.authorityOperations['create:Deployer'].hash;
      },
      (data) => {
        data.authorityOperations['create:Deployer'].compilerInputSha256 =
          'stale';
      },
    ]) {
      const data = copy(report);
      mutate(data);
      await rejects(() => audit(data), '');
    }
  });
  it('refuses wrong chain, changed runtime, and a reorg during pinned readback', async function () {
    await rejects(
      () =>
        audit(report, {
          ...pinProvider,
          send: (method, args) =>
            method === 'eth_chainId'
              ? Promise.resolve('0x1')
              : pinProvider.send(method, args),
        }),
      'chain mismatch'
    );
    await rejects(
      () =>
        audit(report, {
          ...pinProvider,
          send: (method, args) =>
            method === 'eth_getCode' && args[0] === report.coordinator
              ? Promise.resolve('0x00')
              : pinProvider.send(method, args),
        }),
      'runtime/source mismatch'
    );
    const last = await ethers.provider.getBlock('latest');
    let count = 0;
    await rejects(
      () =>
        audit(report, {
          ...pinProvider,
          getBlock: async (...args) => {
            const block = await pinProvider.getBlock(...args);
            if (args[0] === last.number && ++count > 1)
              return { ...block, hash: ethers.id('reorg') };
            return block;
          },
        }),
      'canonical'
    );
  });
  it('ignores saved completion flags and detects a fresh unexpected implementation owner', async function () {
    const implementation = await ethers.getContractAt(
      ['function transferOwnership(address)'],
      report.implementations[implementationNames[0]],
      governor
    );
    await (await implementation.transferOwnership(treasury.address)).wait();
    const data = verified();
    data.authorityCertificate = {
      authorityComplete: true,
      activationReady: true,
    };
    const certificate = await audit(data);
    expect(certificate.activationReady).to.equal(false);
    expect(certificate.blockers).to.include(`${implementationNames[0]}.owner`);
  });
  it('blocks activation for pending, failed, skipped, duplicate or incomplete source-verification evidence', async function () {
    await configure();
    for (const status of ['pending', 'failed', 'skipped', 'interrupted']) {
      const data = verified();
      data.explorerVerification[0].status = status;
      expect((await audit(data)).activationReady, status).to.equal(false);
      await rejects(
        () =>
          requireActivationReady(data, {
            provider: pinProvider,
            readSource,
            blockTag: 'latest',
          }),
        'Activation blocked'
      );
    }
    const data = verified();
    data.explorerVerification.pop();
    expect((await audit(data)).sourceVerificationComplete).to.equal(false);
    data.explorerVerification.push(data.explorerVerification[0]);
    expect((await audit(data)).sourceVerificationComplete).to.equal(false);
  });
  it('reports creator-specific privileged mappings and rejects a wrong pending owner', async function () {
    const { call } = await configure();
    for (const [name, method] of [
      ['FeePool', 'setRewarder'],
      ['ReputationEngine', 'setAuthorizedCaller'],
      ['PlatformRegistry', 'setRegistrar'],
      ['StakeManager', 'setValidatorLockManager'],
    ]) {
      await call(name, method, [creator.address, true]);
      expect((await audit(verified())).activationReady).to.equal(false);
      await call(name, method, [creator.address, false]);
    }
    const identity = await ethers.getContractAt(
      'IdentityRegistry',
      report.contracts.IdentityRegistry,
      governor
    );
    await (await identity.transferOwnership(creator.address)).wait();
    expect((await audit(verified())).blockers).to.include(
      'IdentityRegistry.pendingOwner'
    );
  });
  it('retains no live controller authority through standalone implementation ownership', async function () {
    const implementation = await ethers.getContractAt(
      'StakeManagerConfiguration',
      report.implementations.StakeManagerConfiguration,
      governor
    );
    await expect(implementation.setMinStake(1)).to.be.revertedWithCustomError(
      implementation,
      'DirectImplementationCall'
    );
    const stake = await ethers.getContractAt(
      'StakeManager',
      report.contracts.StakeManager,
      governor
    );
    await expect(stake.setMinStake(1)).to.be.revertedWithCustomError(
      stake,
      'NotGovernance'
    );
  });
  it('rejects tampered component creation bytecode or ABI before submitting any component', async function () {
    const authority = createAuthorityHandover({
      provider: ethers.provider,
      signer: creator,
      runtime: ethers,
      chainId: 31337,
      creator: creator.address,
      governance: governor.address,
      token: report.token,
      readSource,
      creationScope: report.creationScope,
      operations: {},
      checkpoint: () => {},
    });
    const factory = await ethers.getContractFactory('FeePool', creator);
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    expect(() =>
      authority.checkFactory(
        'FeePool',
        { bytecode: '0x6000', interface: factory.interface },
        'contracts/v2/FeePool.sol:FeePool'
      )
    ).to.throw('factory/source mismatch');
    expect(() =>
      authority.checkFactory(
        'FeePool',
        { bytecode: factory.bytecode, interface: new ethers.Interface([]) },
        'contracts/v2/FeePool.sol:FeePool'
      )
    ).to.throw('factory/source mismatch');
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
  });
  it('rejects an unfinished coordinator handover and unexpected direct owners', async function () {
    const operations = {};
    const authority = createAuthorityHandover({
      provider: ethers.provider,
      signer: creator,
      runtime: ethers,
      chainId: 31337,
      creator: creator.address,
      governance: governor.address,
      token: report.token,
      readSource,
      creationScope: report.creationScope,
      operations,
      checkpoint: () => {},
    });
    const deployer = await authority.deploy('Deployer');
    await rejects(
      () => authority.handover('Deployer', deployer.target),
      'requires finalized'
    );
    const implementation = await authority.deploy('JobRegistryConfiguration');
    await (await implementation.transferOwnership(treasury.address)).wait();
    await rejects(
      () =>
        authority.handover('JobRegistryConfiguration', implementation.target),
      'Unexpected authority owner'
    );
  });
  it('recovers a mined orphan and mixed creator/governor implementation handover without duplicate creation or transfer', async function () {
    const name = 'JobRegistryConfiguration';
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    let durable = {};
    let failCreationSubmission = true;
    let operations = {};
    function session(checkpoint) {
      return createAuthorityHandover({
        provider: ethers.provider,
        signer: creator,
        runtime: ethers,
        chainId: 31337,
        creator: creator.address,
        governance: governor.address,
        token: report.token,
        readSource,
        creationScope: report.creationScope,
        operations,
        checkpoint,
      });
    }
    await rejects(
      () =>
        session(({ authorityOperations }) => {
          if (
            authorityOperations[`create:${name}`]?.hash &&
            failCreationSubmission
          ) {
            failCreationSubmission = false;
            throw new Error('injected after broadcast before journal hash');
          }
          durable = copy(authorityOperations);
        }).implementation(name),
      'injected'
    );
    expect(durable[`create:${name}`].hash).to.equal(undefined);
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce + 1
    );
    operations = durable;
    let failTransferSubmission = true;
    await rejects(
      () =>
        session(({ authorityOperations }) => {
          if (
            authorityOperations[`handover:${name}`]?.hash &&
            failTransferSubmission
          ) {
            failTransferSubmission = false;
            throw new Error('injected after transfer before journal hash');
          }
          durable = copy(authorityOperations);
        }).implementation(name),
      'injected'
    );
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce + 2
    );
    operations = durable;
    const address = await session(({ authorityOperations }) => {
      durable = copy(authorityOperations);
    }).implementation(name);
    expect(address).to.equal(
      ethers.getCreateAddress({ from: creator.address, nonce })
    );
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce + 2
    );
    await session(() => {}).implementation(name);
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce + 2
    );
  });
  it('blocks intent-only ambiguous submission rather than blindly redeploying', async function () {
    const operations = {};
    const context = {
      provider: ethers.provider,
      signer: creator,
      runtime: ethers,
      chainId: 31337,
      creator: creator.address,
      governance: governor.address,
      token: report.token,
      readSource,
      creationScope: report.creationScope,
      operations,
    };
    const nonce = await ethers.provider.getTransactionCount(creator.address);
    await rejects(
      () =>
        createAuthorityHandover({
          ...context,
          checkpoint: () => {
            throw new Error('injected before submission');
          },
        }).implementation('JobRegistryConfiguration'),
      'injected'
    );
    await rejects(
      () =>
        createAuthorityHandover({
          ...context,
          checkpoint: () => {},
        }).implementation('JobRegistryConfiguration'),
      'Unresolved authority submission'
    );
    expect(await ethers.provider.getTransactionCount(creator.address)).to.equal(
      nonce
    );
  });
  it('serializes cooperative runs by actual sender and refuses stale locks', function () {
    const locks = path.join(directory, 'lock-test');
    fs.mkdirSync(locks);
    const held = acquireDeploymentLock(locks, {
      chainId: 31337,
      creator: creator.address,
    });
    expect(() =>
      acquireDeploymentLock(locks, { chainId: 31337, creator: creator.address })
    ).to.throw();
    const other = acquireDeploymentLock(locks, {
      chainId: 31337,
      creator: governor.address,
    });
    other.release();
    held.release();
  });
});
