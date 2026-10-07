const { expect } = require('chai');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const {
  VALIDATION_PROTOCOL_ABI,
  VALIDATION_REGISTRY_ABI,
} = require('../../shared/validationProtocol');
const {
  RevealJournal,
  createValidatorRuntime,
} = require('../../examples/agentic/validator-recovery');

describe('Generic validator per-job burn evidence', function () {
  it('commits and reveals two jobs with different confirmed receipts, ignoring a legacy global hash', async () => {
    const [owner, employer, v1, v2, v3] = await ethers.getSigners();
    const stake = await (
      await ethers.getContractFactory('MockStakeManager')
    ).deploy();
    const registryFactory = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const registry = await registryFactory.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address,
      await deployImplementations('JobRegistry', registryFactory.runner)
    );
    const workerIdentity = await (
      await ethers.getContractFactory(
        'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
      )
    ).deploy();
    await workerIdentity.setResult(true);
    await registry.setIdentityRegistry(await workerIdentity.getAddress());
    for (const jobId of [1, 2]) {
      await registry
        .connect(employer)
        .createJob(
          1,
          (await time.latest()) + 3600,
          ethers.id(`job specification ${jobId}`),
          `ipfs://spec${jobId}`
        );
      await registry.connect(owner).applyForJob(jobId, 'worker', []);
      await registry
        .connect(owner)
        .submit(
          jobId,
          ethers.id(`result ${jobId}`),
          `ipfs://result${jobId}`,
          'worker',
          []
        );
    }
    await stake.setBurnPct(5);
    const burns = [
      ethers.id('confirmed receipt for job one'),
      ethers.id('confirmed receipt for job two'),
    ];
    for (const jobId of [1, 2]) {
      await registry
        .connect(employer)
        .submitBurnReceipt(jobId, burns[jobId - 1], 1, 1);
      await registry
        .connect(employer)
        .confirmEmployerBurn(jobId, burns[jobId - 1]);
    }
    const factory = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    const validation = await factory.deploy(
      await registry.getAddress(),
      await stake.getAddress(),
      120,
      120,
      3,
      3,
      [],
      await deployImplementations('ValidationModule', factory.runner)
    );
    const identity = await (
      await ethers.getContractFactory(
        'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
      )
    ).deploy();
    await validation.setIdentityRegistry(await identity.getAddress());
    for (const signer of [v1, v2, v3]) {
      await identity.addAdditionalValidator(signer.address);
      await stake.setStake(signer.address, 1, ethers.parseEther('1000'));
    }
    await validation.setValidatorPool([v1.address, v2.address, v3.address]);
    for (const jobId of [1, 2]) {
      await validation.connect(v1).selectValidators(jobId, 0);
      const target = await validation.selectionBlock(jobId);
      await validation.connect(v2).selectValidators(jobId, 1);
      while (BigInt(await ethers.provider.getBlockNumber()) <= target)
        await ethers.provider.send('evm_mine', []);
      await validation.connect(v1).selectValidators(jobId, 0);
    }
    await ethers.provider.send('evm_mine', []);
    const client = new ethers.Contract(
      await validation.getAddress(),
      [
        ...VALIDATION_PROTOCOL_ABI,
        'event ValidatorsSelected(uint256 indexed jobId,address[] validators)',
        'event ValidationCommitted(uint256 indexed jobId,address indexed validator,bytes32 commitHash,string subdomain)',
      ],
      ethers.provider
    );
    const registryClient = new ethers.Contract(
      await registry.getAddress(),
      VALIDATION_REGISTRY_ABI,
      ethers.provider
    );
    const directory = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), 'generic-burn-')
    );
    const originalGlobal = process.env.BURN_TX_HASH;
    process.env.BURN_TX_HASH = ethers.id('unrelated process-wide receipt');
    const writes = [];
    const writer = {};
    for (const method of ['commitValidation', 'revealValidation']) {
      writer[method] = async (...args) => {
        writes.push({ method, args });
        const tx = await client.connect(v1)[method](...args);
        return {
          wait: async (confirmations, timeout) => {
            await ethers.provider.send('evm_mine', []);
            return tx.wait(confirmations, timeout);
          },
        };
      };
    }
    try {
      const scope = {
        chainId: String((await ethers.provider.getNetwork()).chainId),
        validationModule: await validation.getAddress(),
        validator: v1.address,
      };
      const journal = new RevealJournal(directory, scope);
      const options = {
        journal,
        reader: client,
        writer,
        registry: registryClient,
        provider: ethers.provider,
        validatorLabel: 'validator',
        approve: true,
        burnTxHash: process.env.BURN_TX_HASH,
      };
      const runtime = createValidatorRuntime(options);
      for (const jobId of [1n, 2n]) {
        expect(await runtime.selected(jobId, [v1.address])).to.equal(
          'committed'
        );
        const saved = journal
          .records()
          .find((record) => record.jobId === String(jobId));
        expect(saved.burnTxHash).to.equal(burns[Number(jobId) - 1]);
        expect(saved.burnTxHash).not.to.equal(process.env.BURN_TX_HASH);
      }
      const latestDeadline = (await client.rounds(2)).commitDeadline;
      await time.increaseTo(latestDeadline + 1n);
      await ethers.provider.send('evm_mine', []);
      const restarted = createValidatorRuntime({
        ...options,
        journal: new RevealJournal(directory, scope),
      });
      expect(
        (await restarted.recover()).map((entry) => entry.status)
      ).to.deep.equal(['revealed', 'revealed']);
      for (const jobId of [1n, 2n])
        expect(await validation.revealed(jobId, v1.address)).to.equal(true);
      expect(
        writes
          .filter((entry) => entry.method === 'revealValidation')
          .map((entry) => entry.args[2])
      ).to.deep.equal(burns);
      expect(
        writes.filter((entry) => entry.method === 'commitValidation')
      ).to.have.length(2);
      const previous = journal.records().find((record) => record.jobId === '1');
      await validation.resetJobNonce(1);
      await validation.connect(v1).selectValidators(1, 0);
      const target = await validation.selectionBlock(1);
      await validation.connect(v2).selectValidators(1, 1);
      while (BigInt(await ethers.provider.getBlockNumber()) <= target)
        await ethers.provider.send('evm_mine', []);
      await validation.connect(v1).selectValidators(1, 0);
      await ethers.provider.send('evm_mine', []);
      expect(String(await client.jobNonce(1))).to.equal(previous.nonce);
      expect(await restarted.selected(1n, [v1.address])).to.equal('committed');
      const records = journal
        .records()
        .filter((record) => record.jobId === '1');
      expect(records).to.have.length(2);
      const next = records.find(
        (record) => record.commitHash !== previous.commitHash
      );
      expect(next.salt).not.to.equal(previous.salt);
      expect(
        await validation.commitments(1, v1.address, previous.nonce)
      ).to.equal(next.commitHash);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
      if (originalGlobal === undefined) delete process.env.BURN_TX_HASH;
      else process.env.BURN_TX_HASH = originalGlobal;
    }
  });
});
