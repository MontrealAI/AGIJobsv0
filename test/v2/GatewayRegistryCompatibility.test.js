const { expect } = require('chai');
const { ethers, artifacts } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const path = require('node:path');
const { compileAndRequireTsModule } = require('../utils/tsLoader');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const { decodeJobMetadata } = require('../../agent-gateway/jobMetadata');

describe('Gateway current registry compatibility', function () {
  let utils;
  let previous;
  before(function () {
    const settings = {
      RPC_URL: 'http://127.0.0.1:1',
      KEYSTORE_URL: 'http://127.0.0.1:1/keys',
      JOB_REGISTRY_ADDRESS: '0x1111111111111111111111111111111111111111',
      VALIDATION_MODULE_ADDRESS: '0x2222222222222222222222222222222222222222',
      STAKE_MANAGER_ADDRESS: '0x3333333333333333333333333333333333333333',
      DISPUTE_MODULE_ADDRESS: '0x4444444444444444444444444444444444444444',
    };
    previous = Object.fromEntries(
      Object.keys(settings).map((key) => [key, process.env[key]])
    );
    Object.assign(process.env, settings);
    utils = compileAndRequireTsModule(
      path.join(__dirname, '../../agent-gateway/utils.ts')
    );
  });
  after(function () {
    utils.provider.destroy();
    for (const timer of utils.expiryTimers.values()) clearTimeout(timer);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function stack() {
    const [owner, employer, agent] = await ethers.getSigners();
    const Stake = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockStakeManager'
    );
    const stake = await Stake.deploy();
    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    const identity = await Identity.deploy();
    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      7,
      0,
      [],
      owner.address,
      await deployImplementations('JobRegistry', Registry.runner)
    );
    await registry.setIdentityRegistry(await identity.getAddress());
    await registry.setJobParameters(1000, 0);
    await registry.setExpirationGracePeriod(17);
    const gateway = new ethers.Contract(
      await registry.getAddress(),
      utils.JOB_REGISTRY_ABI,
      employer
    );
    const deadline = (await time.latest()) + 3600;
    const specHash = ethers.id('reviewed work specification');
    const uri = 'ipfs://gateway-registry-compatibility';
    const receipt = await (
      await gateway.createJob(100, deadline, specHash, uri)
    ).wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return gateway.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === 'JobCreated');
    return {
      registry,
      gateway,
      employer,
      agent,
      deadline,
      specHash,
      uri,
      jobId: event.args.jobId,
    };
  }

  it('matches every runtime function selector and output layout to the current module artifacts', async function () {
    for (const [name, source] of Object.entries({
      registry: 'contracts/v2/JobRegistry.sol:JobRegistry',
      validation: 'contracts/v2/ValidationModule.sol:ValidationModule',
      stakeManager: 'contracts/v2/StakeManager.sol:StakeManager',
      dispute: 'contracts/v2/modules/DisputeModule.sol:DisputeModule',
    })) {
      const canonical = new ethers.Interface(
        (await artifacts.readArtifact(source)).abi
      );
      for (const fragment of utils[name].interface.fragments.filter(
        (item) => item.type === 'function'
      )) {
        const actual = canonical.getFunction(fragment.selector);
        expect(actual, `${name}.${fragment.format()}`).not.to.equal(null);
        expect(
          fragment.outputs.map((item) => item.format('sighash')),
          `${name}.${fragment.name} outputs`
        ).to.deep.equal(actual.outputs.map((item) => item.format('sighash')));
        expect(
          fragment.stateMutability,
          `${name}.${fragment.name} mutability`
        ).to.equal(actual.stateMutability);
      }
    }
    expect(utils.registry.interface.getFunction('finalizeJob')).to.equal(null);
  });

  it('reads actual nine-field jobs, decodes all metadata fields and submits using bytes32 proofs', async function () {
    const { registry, gateway, agent, deadline, specHash, uri, jobId } =
      await stack();
    expect(jobId).to.equal(1n);
    expect(await gateway.nextJobId()).to.equal(jobId);
    const created = await gateway.jobs(jobId);
    expect(created).to.have.lengthOf(9);
    expect(created.burnReceiptAmount).to.equal(0n);
    expect(created.specHash).to.equal(specHash);
    expect(created.uriHash).to.equal(ethers.id(uri));
    expect(decodeJobMetadata(created.packedMetadata)).to.include({
      state: 1,
      agentTypes: 3,
      feePct: 7,
      deadline: BigInt(deadline),
    });
    const packed =
      5n |
      8n |
      16n |
      (171n << 5n) |
      (37n << 13n) |
      (63n << 45n) |
      (9007199254740993n << 77n) |
      (12345n << 141n);
    const decoded = decodeJobMetadata(packed);
    const onChain = await gateway.decodeJobMetadata(packed);
    for (const [key, value] of Object.entries(decoded)) {
      expect(typeof value === 'number' ? BigInt(value) : value, key).to.equal(
        onChain[key]
      );
    }
    const proof = [
      ethers.id('first Merkle sibling'),
      ethers.id('second Merkle sibling'),
    ];
    await expect(
      gateway.connect(agent).applyForJob(jobId, 'agent', proof)
    ).to.emit(registry, 'AgentAssigned');
    await expect(
      gateway
        .connect(agent)
        .submit(
          jobId,
          ethers.id('reviewable result'),
          'ipfs://result',
          'agent',
          proof
        )
    ).to.emit(registry, 'ResultSubmitted');
    const submitted = await gateway.jobs(jobId);
    expect(decodeJobMetadata(submitted.packedMetadata).state).to.equal(3);
    expect(submitted.resultHash).to.equal(ethers.id('reviewable result'));
    const { serialiseChainJob } = compileAndRequireTsModule(
      path.join(__dirname, '../../agent-gateway/jobSerialization.ts')
    );
    const api = serialiseChainJob(submitted);
    expect(api).to.include({
      state: 3,
      feePct: 7,
      deadline,
      agentTypes: 3,
      specHash,
      uriHash: ethers.id(uri),
      resultHash: submitted.resultHash,
      burnReceiptAmount: '0',
    });
    expect(() => JSON.stringify(api)).not.to.throw();
    const largeTimestamp = serialiseChainJob({
      ...submitted,
      packedMetadata: packed,
    });
    expect(largeTimestamp.deadline).to.equal('9007199254740993');
    expect(() => JSON.stringify(largeTimestamp)).not.to.throw();
  });

  it('schedules expiration from packed deadline without immediate or overflowing timers', async function () {
    const { gateway, employer, deadline, jobId } = await stack();
    utils.registry = gateway;
    utils.automationWallet = employer;
    const originalNow = Date.now;
    const originalTimeout = global.setTimeout;
    const timers = [];
    try {
      Date.now = () => (deadline - 100) * 1000;
      // Keep provider polling intact; capture only the gateway expiration timer.
      global.setTimeout = (callback, delay, ...args) => {
        if (callback.toString().includes('scheduleExpiration')) {
          timers.push(delay);
          return { unref() {} };
        }
        return originalTimeout(callback, delay, ...args);
      };
      await utils.scheduleExpiration(jobId.toString());
      expect(timers).to.deep.equal([118000]);
      Date.now = () => 0;
      await utils.scheduleExpiration(jobId.toString());
      expect(timers.at(-1)).to.equal(2147483647);
      expect(
        decodeJobMetadata((await gateway.jobs(jobId)).packedMetadata).state
      ).to.equal(1);
    } finally {
      Date.now = originalNow;
      global.setTimeout = originalTimeout;
      utils.expiryTimers.clear();
    }
  });
});
