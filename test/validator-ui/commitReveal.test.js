const { expect } = require('chai');
const { ethers, artifacts } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const {
  UI_VALIDATION_ABI,
  VALIDATION_REGISTRY_ABI,
  commitVote,
  revealVote,
  checkVote,
  decodeRecord,
  loadRecords,
  recordKey,
} = require('../../apps/validator-ui/lib/commit');

function memoryStorage() {
  const records = new Map();
  return {
    get length() {
      return records.size;
    },
    key: (index) => [...records.keys()][index],
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
}

async function setup() {
  const [owner, employer, v1, v2, v3] = await ethers.getSigners();
  const stake = await (
    await ethers.getContractFactory('MockStakeManager')
  ).deploy();
  const registry = await (
    await ethers.getContractFactory('MockJobRegistry')
  ).deploy();
  await registry.setStakeManager(await stake.getAddress());
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
  await registry.setJob(1, {
    employer: employer.address,
    agent: ethers.ZeroAddress,
    reward: 0,
    stake: 0,
    success: false,
    status: 3,
    uriHash: ethers.ZeroHash,
    resultHash: ethers.ZeroHash,
  });
  async function select() {
    await validation.connect(v1).selectValidators(1, 0);
    const target = await validation.selectionBlock(1);
    await validation.connect(v2).selectValidators(1, 1);
    while (BigInt(await ethers.provider.getBlockNumber()) <= target)
      await ethers.provider.send('evm_mine', []);
    await validation.connect(v1).selectValidators(1, 0);
  }
  await select();
  return {
    owner,
    actual: validation,
    stake,
    actualRegistry: registry,
    select,
    validation: new ethers.Contract(
      await validation.getAddress(),
      UI_VALIDATION_ABI,
      ethers.provider
    ),
    registry: new ethers.Contract(
      await registry.getAddress(),
      VALIDATION_REGISTRY_ABI,
      ethers.provider
    ),
    provider: ethers.provider,
    signer: v1,
    storage: memoryStorage(),
    jobId: '1',
    approve: true,
    expectedSpecHash: ethers.ZeroHash,
    subdomain: 'validator',
    proof: [],
  };
}

describe('validator-ui current deployed commit/reveal protocol', function () {
  it('matches the actual ABI, persists both intents before broadcasting and reveals after a reload', async () => {
    const actual = new ethers.Interface(
      (
        await artifacts.readArtifact(
          'contracts/v2/ValidationModule.sol:ValidationModule'
        )
      ).abi
    );
    for (const fragment of new ethers.Interface(UI_VALIDATION_ABI).fragments)
      expect(fragment.format('sighash')).to.equal(
        (fragment.type === 'event'
          ? actual.getEvent(fragment.name)
          : actual.getFunction(fragment.name)
        ).format('sighash')
      );
    const context = await setup();
    const originalConnect = context.validation.connect.bind(context.validation);
    const sent = [];
    context.validation = new Proxy(context.validation, {
      get(target, property) {
        if (property === 'connect')
          return (signer) => {
            const contract = originalConnect(signer);
            return {
              commitValidation: async (...args) => {
                sent.push(loadRecords(context.storage)[0].status);
                return contract.commitValidation(...args);
              },
              revealValidation: async (...args) => {
                sent.push(loadRecords(context.storage)[0].status);
                return contract.revealValidation(...args);
              },
            };
          };
        return Reflect.get(target, property);
      },
    });
    const record = await commitVote(context);
    expect(record.burnTxHash).to.equal(ethers.ZeroHash);
    const [restored] = loadRecords(context.storage);
    expect(restored.salt).to.equal(record.salt);
    expect((await checkVote({ ...context, record: restored })).ready).to.equal(
      false
    );
    await time.increaseTo(BigInt(record.commitDeadline) + 1n);
    await revealVote({ ...context, record: restored });
    expect(sent).to.deep.equal(['commit-intent', 'reveal-intent']);
    expect(await context.actual.revealed(1, context.signer.address)).to.equal(
      true
    );
    expect(await context.actual.votes(1, context.signer.address)).to.equal(
      true
    );
    expect(loadRecords(context.storage)[0].status).to.equal('revealed');
  });

  it('rejects stale specification, unselected wallet and missing burn evidence before saving or sending', async () => {
    const context = await setup();
    await expect(
      commitVote({
        ...context,
        expectedSpecHash: ethers.id('other specification'),
      })
    ).to.be.rejectedWith('specification does not match');
    await expect(
      commitVote({ ...context, signer: context.owner })
    ).to.be.rejectedWith('not selected');
    await context.stake.setBurnPct(5);
    await expect(commitVote(context)).to.be.rejectedWith(
      'VALIDATION_BURN_EVIDENCE_REQUIRED'
    );
    expect(context.storage.length).to.equal(0);
    expect(
      await context.actual.commitments(1, context.signer.address, 1)
    ).to.equal(ethers.ZeroHash);
  });

  it('never replaces a saved secret after an uncertain commit outcome', async () => {
    const context = await setup();
    let sends = 0;
    const validation = new Proxy(context.validation, {
      get(target, property) {
        if (property === 'connect')
          return () => ({
            commitValidation: async () => {
              sends++;
              throw new Error('RPC response lost');
            },
          });
        return Reflect.get(target, property);
      },
    });
    await expect(commitVote({ ...context, validation })).to.be.rejectedWith(
      'RPC response lost'
    );
    const [saved] = loadRecords(context.storage);
    expect(saved.status).to.equal('commit-intent');
    await expect(
      commitVote({ ...context, validation, approve: false })
    ).to.be.rejectedWith('saved vote already exists');
    expect(loadRecords(context.storage)[0].salt).to.equal(saved.salt);
    expect(sends).to.equal(1);
  });

  it('keeps uncertain reveal intent through reload and stale UI calls without resending', async () => {
    const context = await setup();
    const record = await commitVote(context);
    await time.increaseTo(BigInt(record.commitDeadline) + 1n);
    let sends = 0;
    const validation = new Proxy(context.validation, {
      get(target, property) {
        if (property === 'connect')
          return () => ({
            revealValidation: async () => {
              sends++;
              throw new Error('RPC response lost');
            },
          });
        return Reflect.get(target, property);
      },
    });
    await expect(
      revealVote({ ...context, validation, record: { ...record } })
    ).to.be.rejectedWith('RPC response lost');
    expect(loadRecords(context.storage)[0].status).to.equal('reveal-intent');
    await expect(
      revealVote({ ...context, validation, record: { ...record } })
    ).to.be.rejectedWith('already attempted');
    expect(sends).to.equal(1);
    await context.actual
      .connect(context.signer)
      .revealValidation(
        1,
        true,
        record.burnTxHash,
        record.salt,
        record.subdomain,
        record.proof
      );
    const checked = await checkVote({ ...context, record: { ...record } });
    expect(checked.record.status).to.equal('revealed');
    expect(checked.record.revealTx).to.match(/^0x[0-9a-f]{64}$/);
    expect(sends).to.equal(1);
    await context.actual.resetJobNonce(1);
    await context.select();
    const next = await commitVote({ ...context, approve: false });
    expect(next.commitHash).not.to.equal(record.commitHash);
    expect(context.storage.length).to.equal(2);
  });

  it('recovers a lost reveal response when the first return is after a later round is selected', async () => {
    const context = await setup();
    const record = await commitVote(context);
    await time.increaseTo(BigInt(record.commitDeadline) + 1n);
    const signed = context.actual.connect(context.signer);
    const validation = new Proxy(context.validation, {
      get(target, property) {
        if (property === 'connect')
          return () => ({
            revealValidation: async (...args) => {
              await (await signed.revealValidation(...args)).wait();
              throw new Error('Response lost after mining');
            },
          });
        return Reflect.get(target, property);
      },
    });
    await expect(
      revealVote({ ...context, validation, record: { ...record } })
    ).to.be.rejectedWith('Response lost after mining');
    expect(loadRecords(context.storage)[0].revealTx).to.equal(undefined);
    await context.actual.resetJobNonce(1);
    await context.select();
    const recovered = await checkVote({ ...context, record: { ...record } });
    expect(recovered.record.status).to.equal('revealed');
    expect(recovered.record.revealTx).to.match(/^0x[0-9a-f]{64}$/);
    expect(recovered.ready).to.equal(false);
    const next = await commitVote({ ...context, approve: false });
    expect(next.commitHash).not.to.equal(record.commitHash);
    expect(context.storage.length).to.equal(2);
  });

  it('refuses an old record after the real contract resets and reuses nonce one', async () => {
    const context = await setup();
    const record = await commitVote(context);
    await context.actual.resetJobNonce(1);
    await context.select();
    expect(await context.actual.jobNonce(1)).to.equal(BigInt(record.nonce));
    await expect(revealVote({ ...context, record })).to.be.rejectedWith(
      'round changed'
    );
    await expect(commitVote(context)).to.be.rejectedWith(
      'saved vote already exists'
    );
  });

  it('archives a canonically revealed vote before committing an explicit new-round rejection', async () => {
    const context = await setup();
    const record = await commitVote(context);
    await time.increaseTo(BigInt(record.commitDeadline) + 1n);
    await revealVote({ ...context, record });
    await context.actual.resetJobNonce(1);
    await context.select();
    const next = await commitVote({ ...context, approve: false });
    expect(next.salt).not.to.equal(record.salt);
    expect(context.storage.length).to.equal(2);
    expect(loadRecords(context.storage).length).to.equal(1);
    await time.increaseTo(BigInt(next.commitDeadline) + 1n);
    await revealVote({ ...context, record: next });
    expect(await context.actual.votes(1, context.signer.address)).to.equal(
      false
    );
  });

  it('refuses storage failure before broadcasting and rejects tampered recovery data', async () => {
    const context = await setup();
    const failure = {
      ...context.storage,
      setItem() {
        throw new Error('quota exceeded');
      },
    };
    await expect(
      commitVote({ ...context, storage: failure })
    ).to.be.rejectedWith('quota exceeded');
    expect(
      await context.actual.commitments(1, context.signer.address, 1)
    ).to.equal(ethers.ZeroHash);
    const record = await commitVote(context);
    expect(() =>
      decodeRecord(JSON.stringify({ ...record, approve: false }))
    ).to.throw('does not match');
    context.storage.setItem(recordKey(record), '{broken');
    expect(() => loadRecords(context.storage)).to.throw();
  });
});
