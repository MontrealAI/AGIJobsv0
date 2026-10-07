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
  RevealJournal,
  createValidatorRuntime,
} = require('../../examples/agentic/validator-recovery');

describe('Generic validator finalized reveal recovery', function () {
  it('recovers a lost reveal response after real finalization and rejects its later reorg', async () => {
    const [owner, employer, v1, v2, v3] = await ethers.getSigners();
    const stake = await (
      await ethers.getContractFactory('MockStakeManager')
    ).deploy();
    const registry = await (
      await ethers.getContractFactory('MockJobRegistry')
    ).deploy();
    await registry.setStakeManager(await stake.getAddress());
    await registry.setJob(1, {
      employer: employer.address,
      agent: owner.address,
      reward: 0,
      stake: 0,
      success: false,
      status: 3,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    });
    const factory = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    const validation = await factory.deploy(
      await registry.getAddress(),
      await stake.getAddress(),
      60,
      60,
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
      await stake.setStake(signer.address, 1, ethers.parseEther('100'));
    }
    await validation.setValidatorPool([v1.address, v2.address, v3.address]);
    await validation.connect(v1).selectValidators(1, 0);
    const target = await validation.selectionBlock(1);
    await validation.connect(v2).selectValidators(1, 1);
    while (BigInt(await ethers.provider.getBlockNumber()) <= target)
      await ethers.provider.send('evm_mine', []);
    await validation.connect(v1).selectValidators(1, 0);
    await ethers.provider.send('evm_mine', []);
    const directory = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), 'finalized-reveal-')
    );
    try {
      const scope = {
        chainId: String((await ethers.provider.getNetwork()).chainId),
        validationModule: await validation.getAddress(),
        validator: v1.address,
      };
      const journal = new RevealJournal(directory, scope);
      const writes = { commit: 0, reveal: 0 };
      const options = {
        journal,
        reader: validation,
        registry,
        provider: ethers.provider,
        validatorLabel: 'validator',
        approve: true,
        writer: {
          commitValidation: async (...args) => {
            writes.commit++;
            const tx = await validation.connect(v1).commitValidation(...args);
            return {
              wait: async (confirmations, timeout) => {
                await ethers.provider.send('evm_mine', []);
                return tx.wait(confirmations, timeout);
              },
            };
          },
          revealValidation: async (...args) => {
            writes.reveal++;
            await (
              await validation.connect(v1).revealValidation(...args)
            ).wait();
            throw new Error('response lost after reveal mined');
          },
        },
      };
      const runtime = createValidatorRuntime(options);
      expect(await runtime.selected(1n, [v1.address])).to.equal('committed');
      const saved = journal.records()[0];
      const snapshot = await ethers.provider.send('evm_snapshot', []);
      const round = await validation.rounds(1);
      await time.increaseTo(round.commitDeadline + 1n);
      await ethers.provider.send('evm_mine', []);
      expect((await runtime.recover())[0].status).to.equal(
        'VALIDATOR_RPC_OR_STORAGE_FAILURE'
      );
      expect(journal.has(saved, 'reveal')).to.equal(true);
      expect(journal.has(saved, 'complete')).to.equal(false);
      await time.increaseTo(round.revealDeadline + 1n);
      await validation.finalize(1);
      await ethers.provider.send('evm_mine', []);
      expect(await validation.jobNonce(1)).to.equal(0n);
      expect(await validation.commitments(1, v1.address, saved.nonce)).to.equal(
        ethers.ZeroHash
      );
      expect(await validation.revealed(1, v1.address)).to.equal(false);
      const restarted = createValidatorRuntime({
        ...options,
        journal: new RevealJournal(directory, scope),
      });
      expect((await restarted.recover())[0].status).to.equal('complete');
      expect(journal.has(saved, 'complete')).to.equal(true);
      expect((await restarted.recover())[0].status).to.equal('complete');
      expect(writes).to.deep.equal({ commit: 1, reveal: 1 });
      await ethers.provider.send('evm_revert', [snapshot]);
      await time.increaseTo(round.commitDeadline + 1n);
      await ethers.provider.send('evm_mine', []);
      expect((await restarted.recover())[0].status).to.equal(
        'reveal-uncertain'
      );
      expect(writes).to.deep.equal({ commit: 1, reveal: 1 });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
