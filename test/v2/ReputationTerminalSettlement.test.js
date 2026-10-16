'use strict';
const { expect } = require('chai');
const { ethers, network, artifacts } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const { address: TOKEN } = require('../../config/agialpha.json');
const actualTokenForkUrl = process.env.REPUTATION_TERMINAL_FORK_URL;

describe('Reputation: terminal settlement with the actual committee', function () {
  let owner,
    buyer,
    agent,
    validators,
    token,
    stake,
    registry,
    validation,
    reputation,
    dispute,
    baseline;
  const reward = ethers.parseEther('1000');
  let forkCodeHash, forkSupply, forkToken;
  before(async function () {
    if (!actualTokenForkUrl) return;
    if (network.name !== 'hardhat' || 'url' in network.config)
      throw Error('Disposable in-process Hardhat network required');
    const {
      setErc20Balance,
      setUintStorage,
    } = require('../utils/tokenStorage');
    await network.provider.send('hardhat_reset', [
      { forking: { jsonRpcUrl: actualTokenForkUrl, blockNumber: 26200139 } },
    ]);
    const metadata = await ethers.provider.send('hardhat_metadata', []);
    expect(metadata.forkedNetwork.chainId).to.equal(1);
    expect(metadata.forkedNetwork.forkBlockNumber).to.equal(26200139);
    expect(metadata.forkedNetwork.forkBlockHash).to.equal(
      '0x5ba89450466ec7979fd0ab037d86077799089630aab9d8923cf63753a7cb11be'
    );
    await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x0']);
    const code = await ethers.provider.getCode(TOKEN);
    expect(code).not.to.equal('0x');
    forkCodeHash = ethers.keccak256(code);
    forkToken = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata',
      TOKEN
    );
    expect(await forkToken.decimals()).to.equal(18);
    let delta = 0n;
    for (const signer of (await ethers.getSigners()).slice(0, 6)) {
      const amount = ethers.parseEther('10000'),
        previous = await forkToken.balanceOf(signer.address);
      delta += amount - previous;
      await setErc20Balance(TOKEN, signer.address, amount);
      await network.provider.send('hardhat_setBalance', [
        signer.address,
        ethers.toBeHex(ethers.parseEther('100')),
      ]);
      expect(await forkToken.balanceOf(signer.address)).to.equal(amount);
    }
    forkSupply = (await forkToken.totalSupply()) + delta;
    await setUintStorage(TOKEN, 2, forkSupply);
    expect(await forkToken.totalSupply()).to.equal(forkSupply);
    console.log(
      JSON.stringify({
        scope: 'actual-token-and-actual-committee',
        block: 26200139,
        tokenCodeHash: forkCodeHash,
        syntheticBalancesAndSupplyDelta: true,
        identityFixtures: true,
        externalTransactions: false,
      })
    );
  });
  beforeEach(async function () {
    baseline = await network.provider.send('evm_snapshot');
    [owner, buyer, agent, ...validators] = await ethers.getSigners();
    validators = validators.slice(0, 3);
    if (actualTokenForkUrl) token = forkToken;
    else {
      const artifact = await artifacts.readArtifact(
        'contracts/test/MockERC20.sol:MockERC20'
      );
      await network.provider.send('hardhat_setCode', [
        TOKEN,
        artifact.deployedBytecode,
      ]);
      token = await ethers.getContractAt(
        'contracts/test/MockERC20.sol:MockERC20',
        TOKEN
      );
    }
    const SF = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stake = await SF.deploy(
      0,
      10000,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address,
      await deployImplementations('StakeManager', SF.runner)
    );
    await stake.setMinStake(1);
    await stake.setSlashingPercentages(100, 0);
    reputation = await (
      await ethers.getContractFactory(
        'contracts/v2/ReputationEngine.sol:ReputationEngine'
      )
    ).deploy(await stake.getAddress());
    const VF = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await VF.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      60,
      60,
      3,
      3,
      [],
      await deployImplementations('ValidationModule', VF.runner)
    );
    const RF = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await RF.deploy(
      await validation.getAddress(),
      await stake.getAddress(),
      await reputation.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address,
      await deployImplementations('JobRegistry', RF.runner)
    );
    dispute = await (
      await ethers.getContractFactory(
        'contracts/v2/modules/DisputeModule.sol:DisputeModule'
      )
    ).deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress,
      owner.address
    );
    await dispute.setDisputeFee(0);
    await dispute.setDisputeWindow(0);
    await dispute.setStakeManager(await stake.getAddress());
    await registry.setDisputeModule(await dispute.getAddress());
    await stake.setDisputeModule(await dispute.getAddress());
    await stake.setJobRegistry(await registry.getAddress());
    await stake.setValidationModule(await validation.getAddress());
    await validation.setJobRegistry(await registry.getAddress());
    await validation.setReputationEngine(await reputation.getAddress());
    await validation.setValidatorSlashingPct(0);
    await validation.setNonRevealPenalty(0, 0);
    await validation.setRevealQuorum(66, 2);
    const identity = await (
      await ethers.getContractFactory(
        'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
      )
    ).deploy();
    for (const validator of validators)
      await identity.addAdditionalValidator(validator.address);
    await registry.setIdentityRegistry(await identity.getAddress());
    await validation.setIdentityRegistry(await identity.getAddress());
    await validation.setValidatorPool(validators.map((v) => v.address));
    await validation.setValidatorSubdomains(
      validators.map((v) => v.address),
      validators.map(() => 'validator')
    );
    await registry.setFeePct(0);
    await registry.setValidatorRewardPct(10);
    await registry.setMinAgentStake(ethers.parseEther('500'));
    const policy = await (
      await ethers.getContractFactory('contracts/v2/TaxPolicy.sol:TaxPolicy')
    ).deploy('ipfs://policy', 'ack');
    await registry.setTaxPolicy(await policy.getAddress());
    for (const signer of [buyer, agent, ...validators]) {
      await policy.connect(signer).acknowledge();
      if (!actualTokenForkUrl)
        await token.mint(signer.address, ethers.parseEther('10000'));
      await token
        .connect(signer)
        .approve(await stake.getAddress(), ethers.MaxUint256);
    }
    await stake.connect(agent).depositStake(0, ethers.parseEther('500'));
    for (const validator of validators)
      await stake.connect(validator).depositStake(1, ethers.parseEther('100'));
    await reputation.setCaller(owner.address, true);
    await reputation.setCaller(await registry.getAddress(), true);
    await reputation.setCaller(await validation.getAddress(), true);
    for (const signer of [agent, ...validators])
      await reputation.add(signer.address, 100);
  });
  afterEach(async function () {
    if (actualTokenForkUrl) {
      expect(ethers.keccak256(await ethers.provider.getCode(TOKEN))).to.equal(
        forkCodeHash
      );
      expect(await forkToken.totalSupply()).to.equal(forkSupply);
    }
    await network.provider.send('evm_revert', [baseline]);
  });
  async function scores() {
    return Promise.all(
      [agent, ...validators].map((s) => reputation.reputation(s.address))
    );
  }
  async function round(votes, reveals = [true, true, true], forced = false) {
    await registry
      .connect(buyer)
      .createJob(
        reward,
        (await time.latest()) + 10000,
        ethers.id('spec'),
        'ipfs://spec'
      );
    await registry.connect(agent).applyForJob(1, 'agent', []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('result'), 'ipfs://result', 'agent', []);
    await network.provider.send('evm_mine');
    await validation.connect(buyer).selectValidators(1, 0);
    expect(Array.from(await validation.validators(1))).to.have.members(
      validators.map((v) => v.address)
    );
    const nonce = await validation.jobNonce(1),
      spec = await registry.getSpecHash(1),
      burn = ethers.ZeroHash;
    const domain = await validation.DOMAIN_SEPARATOR(),
      chain = (await ethers.provider.getNetwork()).chainId;
    const coder = ethers.AbiCoder.defaultAbiCoder(),
      salts = validators.map((v) => ethers.id(v.address));
    for (let i = 0; i < 3; i++) {
      const outcome = ethers.keccak256(
        coder.encode(
          ['uint256', 'bytes32', 'bool', 'bytes32'],
          [nonce, spec, votes[i], burn]
        )
      );
      const commitment = ethers.keccak256(
        coder.encode(
          ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
          [1, outcome, salts[i], validators[i].address, chain, domain]
        )
      );
      await validation
        .connect(validators[i])
        .commitValidation(1, commitment, 'validator', []);
    }
    const windows = await validation.rounds(1);
    await time.increaseTo(windows.commitDeadline + 1n);
    for (let i = 0; i < 3; i++)
      if (reveals[i])
        await validation
          .connect(validators[i])
          .revealValidation(1, votes[i], burn, salts[i], 'validator', []);
    await time.increaseTo(
      windows.revealDeadline +
        (forced ? await validation.forceFinalizeGrace() : 0n) +
        1n
    );
    await validation[forced ? 'forceFinalize' : 'finalize'](1);
  }
  async function settleAndRepeatGuard(expectedGeneral = 500) {
    await (await registry.connect(buyer).finalize(1)).wait();
    expect(await registry.reputationProcessed(1)).to.equal(true);
    const after = await scores(),
      wallet = await token.balanceOf(agent.address);
    await expect(
      registry.connect(buyer).finalize(1)
    ).to.be.revertedWithCustomError(registry, 'NotReady');
    expect(await scores()).to.deep.equal(after);
    expect(await token.balanceOf(agent.address)).to.equal(wallet);
    expect(await stake.lockedStakes(agent.address)).to.equal(0);
    expect(await stake.stakes(agent.address, 0)).to.equal(
      ethers.parseEther(String(expectedGeneral))
    );
    return after;
  }
  it('defers outcome scores until payout and passes native 18-decimal units exactly once', async function () {
    const before = await scores();
    await reputation.setCaller(await validation.getAddress(), false);
    await round([true, true, false]);
    expect(await scores()).to.deep.equal(before);
    expect(await registry.reputationProcessed(1)).to.equal(false);
    for (const validator of validators)
      expect(await validation.revealed(1, validator.address)).to.equal(false);
    const talliedAt = await time.latest();
    const wallet = await token.balanceOf(agent.address);
    const job = await registry.jobs(1),
      metadata = await registry.decodeJobMetadata(job.packedMetadata);
    await time.increase(30000); // Waiting to settle must not earn duration credit.
    const after = await settleAndRepeatGuard();
    expect((await token.balanceOf(agent.address)) - wallet).to.equal(
      ethers.parseEther('900')
    );
    const nativePoints = await reputation.calculateReputationPoints(
      ethers.parseEther('900'),
      BigInt(talliedAt) - metadata.assignedAt
    );
    expect(after[0] - before[0])
      .to.be.greaterThan(0)
      .and.lessThanOrEqual(nativePoints);
    expect(after[0] - before[0]).to.be.lessThan(
      await reputation.calculateReputationPoints(
        ethers.parseEther('900') * 10n ** 12n,
        BigInt(talliedAt) - metadata.assignedAt
      )
    );
    expect(after[1]).to.be.greaterThan(before[1]);
    expect(after[2]).to.be.greaterThan(before[2]);
    expect(after[3]).to.equal(before[3] - 1n);
  });
  it('scores approval reversed to failure against the final outcome without retaining credit', async function () {
    const before = await scores();
    await round([true, true, false]);
    expect(await scores()).to.deep.equal(before);
    await registry
      .connect(buyer)
      ['raiseDispute(uint256,string)'](1, 'wrong result');
    await dispute.resolveDispute(1, true);
    expect(await scores()).to.deep.equal(before);
    expect(await registry.reputationProcessed(1)).to.equal(false);
    expect(await settleAndRepeatGuard(400)).to.deep.equal([
      before[0],
      before[1] - 1n,
      before[2] - 1n,
      before[3],
    ]);
  });
  it('scores rejection reversed to success once and preserves the post-dispute payout', async function () {
    const before = await scores();
    await round([false, false, true]);
    expect(await scores()).to.deep.equal(before);
    await registry
      .connect(agent)
      ['raiseDispute(uint256,string)'](1, 'valid result');
    await dispute.resolveDispute(1, false);
    const wallet = await token.balanceOf(agent.address);
    const after = await settleAndRepeatGuard();
    expect((await token.balanceOf(agent.address)) - wallet).to.equal(reward);
    expect(after[0]).to.be.greaterThan(before[0]);
    expect(after[1]).to.equal(before[1] - 1n);
    expect(after[2]).to.equal(before[2] - 1n);
    expect(after[3]).to.be.greaterThan(before[3]);
  });
  it('retains non-reveal facts through cleanup and applies the round penalty once', async function () {
    const before = await scores();
    await round([true, true, false], [true, true, false]);
    expect(await scores()).to.deep.equal(before);
    const after = await settleAndRepeatGuard();
    expect(after[3]).to.equal(before[3] - 1n);
    expect(after[1]).to.be.greaterThan(before[1]);
  });
  it('preserves the separate forced-quorum non-reveal fault without double counting', async function () {
    const before = await scores();
    await round([true, false, false], [true, false, false], true);
    expect(await scores()).to.deep.equal([
      before[0],
      before[1],
      before[2] - 1n,
      before[3] - 1n,
    ]);
    expect(await settleAndRepeatGuard(400)).to.deep.equal([
      before[0],
      before[1],
      before[2] - 1n,
      before[3] - 1n,
    ]);
  });
  it('rolls back funds, locks, outcome and the processing marker if the score hook rejects', async function () {
    await round([true, true, false]);
    const before = {
      scores: await scores(),
      job: await registry.jobs(1),
      locked: await stake.lockedStakes(agent.address),
      balances: await Promise.all(
        [buyer.address, agent.address, await stake.getAddress()].map(
          (address) => token.balanceOf(address)
        )
      ),
    };
    await reputation.pause();
    await expect(
      registry.connect(buyer).finalize(1)
    ).to.be.revertedWithCustomError(reputation, 'EnforcedPause');
    expect(await scores()).to.deep.equal(before.scores);
    expect(await registry.jobs(1)).to.deep.equal(before.job);
    expect(await stake.lockedStakes(agent.address)).to.equal(before.locked);
    expect(await registry.reputationProcessed(1)).to.equal(false);
    expect(
      await Promise.all(
        [buyer.address, agent.address, await stake.getAddress()].map(
          (address) => token.balanceOf(address)
        )
      )
    ).to.deep.equal(before.balances);
    await reputation.unpause();
    const after = await settleAndRepeatGuard();
    expect(after[0]).to.be.greaterThan(before.scores[0]);
  });
  it('rejects participant self-call routes and the obsolete early validator marker', async function () {
    await expect(registry.processTerminalReputation(1, reward)).to.be.reverted;
    const address = await validation.getAddress();
    await network.provider.send('hardhat_setBalance', [
      address,
      '0x1000000000000000000',
    ]);
    await network.provider.send('hardhat_impersonateAccount', [address]);
    try {
      await expect(
        registry
          .connect(await ethers.getSigner(address))
          .markReputationProcessed(1)
      ).to.be.reverted;
    } finally {
      await network.provider.send('hardhat_stopImpersonatingAccount', [
        address,
      ]);
    }
    expect(await registry.reputationProcessed(1)).to.equal(false);
  });
});
