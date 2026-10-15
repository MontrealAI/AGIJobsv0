import { deployImplementations } from '../../scripts/deploy/implementations.cjs';
import { expect } from 'chai';
import { artifacts, ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../../scripts/constants';

enum Role {
  Agent,
  Validator,
  Platform,
}

async function deploySystem() {
  const [owner, employer, agent, validator, buyer, moderator] =
    await ethers.getSigners();

  const artifact = await artifacts.readArtifact(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
  );
  await ethers.provider.send('hardhat_setCode', [
    AGIALPHA,
    artifact.deployedBytecode,
  ]);
  const ownerSlotValue = ethers.zeroPadValue(owner.address, 32);
  const ownerSlot = ethers.toBeHex(5, 32);
  await ethers.provider.send('hardhat_setStorageAt', [
    AGIALPHA,
    ownerSlot,
    ownerSlotValue,
  ]);
  const token = await ethers.getContractAt(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
    AGIALPHA
  );
  await token.mint(
    employer.address,
    ethers.parseUnits('1000', AGIALPHA_DECIMALS)
  );
  await token.mint(agent.address, ethers.parseUnits('1000', AGIALPHA_DECIMALS));
  await token.mint(buyer.address, ethers.parseUnits('1000', AGIALPHA_DECIMALS));

  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await Stake.deploy(
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address,
    await deployImplementations('StakeManager', Stake.runner)
  );

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stake.getAddress());

  const ENS = await ethers.getContractFactory('MockENS');
  const ens = await ENS.deploy();
  const Wrapper = await ethers.getContractFactory('MockNameWrapper');
  const wrapper = await Wrapper.deploy();

  const Identity = await ethers.getContractFactory(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
  );
  const identity = await Identity.deploy(
    await ens.getAddress(),
    await wrapper.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroHash,
    ethers.ZeroHash
  );

  await identity.setAgentRootNode(ethers.id('agent-root'));

  const Validation = await ethers.getContractFactory(
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
  );
  const validation = await Validation.deploy();

  const NFT = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const nft = await NFT.deploy('Cert', 'CERT');

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const feePool = await FeePool.deploy(
    await stake.getAddress(),
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await nft.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0,
    [],
    owner.address,
    await deployImplementations('JobRegistry', Registry.runner)
  );

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    ethers.ZeroAddress,
    owner.address
  );
  await dispute.setModerator(moderator.address, 1);
  await dispute.setDisputeWindow(0);
  await dispute.setStakeManager(await stake.getAddress());

  await stake.setModules(
    await registry.getAddress(),
    await dispute.getAddress()
  );
  await validation.setJobRegistry(await registry.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    await feePool.getAddress(),
    []
  );
  await registry.setIdentityRegistry(await identity.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);
  await reputation.setPremiumThreshold(10);
  await reputation.setCaller(owner.address, true);
  // Growth uses diminishing returns: adding 11 seeds the eligibility threshold of 10.
  await reputation.add(agent.address, 11);
  expect(await reputation.reputation(agent.address)).to.equal(10);

  await registry.setFeePct(0);
  await registry.setValidatorRewardPct(0);
  expect(await registry.jobStakeBps()).to.equal(1000);
  await stake.setBurnPct(0);
  await stake.setSlashingPercentages(100, 0);
  await stake.setValidationModule(await validation.getAddress());
  // setCode skips constructors, and escrow/marketplace contracts must accept token terms.
  for (const module of [stake, feePool, nft]) {
    await token.mint(await module.getAddress(), 0);
  }

  return {
    initialAgentBalance: await token.balanceOf(agent.address),
    initialEmployerBalance: await token.balanceOf(employer.address),
    feePool,
    owner,
    employer,
    agent,
    validator,
    buyer,
    moderator,
    token,
    stake,
    reputation,
    wrapper,
    identity,
    validation,
    nft,
    registry,
    dispute,
  };
}

describe('Job lifecycle', function () {
  it('runs full happy path and marketplace interactions', async () => {
    const env = await deploySystem();
    const {
      token,
      stake,
      reputation,
      wrapper,
      validation,
      nft,
      registry,
      employer,
      agent,
      buyer,
    } = env;

    const subdomain = 'agent';
    const subnode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [await env.identity.agentRootNode(), ethers.id(subdomain)]
      )
    );
    await wrapper.setOwner(BigInt(subnode), agent.address);

    const stakeAmount = ethers.parseUnits('10', AGIALPHA_DECIMALS);
    await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmount);

    const reward = ethers.parseUnits('100', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');

    expect((await registry.jobs(1)).stake).to.equal(reward / 10n);
    await registry.connect(agent).applyForJob(1, subdomain, []);
    const hash = ethers.id('ipfs://result');
    await registry
      .connect(agent)
      .submit(1, hash, 'ipfs://result', subdomain, []);
    await validation.setResult(true);
    await validation.finalize(1);
    await registry.connect(employer).finalize(1);

    expect(await token.balanceOf(agent.address)).to.equal(
      env.initialAgentBalance - stakeAmount + reward
    );
    expect(await nft.ownerOf(1)).to.equal(agent.address);
    expect(await reputation.reputation(agent.address)).to.be.gt(0);

    const price = ethers.parseUnits('50', AGIALPHA_DECIMALS);
    await nft.connect(agent).list(1, price);
    await token.connect(buyer).approve(await nft.getAddress(), price);
    await nft.connect(buyer).purchase(1);

    expect(await nft.ownerOf(1)).to.equal(buyer.address);
    expect(await token.balanceOf(agent.address)).to.equal(
      env.initialAgentBalance - stakeAmount + reward + price
    );
  });

  it('handles validation failure and employer dispute resolution', async () => {
    const env = await deploySystem();
    const {
      token,
      stake,
      reputation,
      wrapper,
      validation,
      registry,
      dispute,
      employer,
      agent,
      moderator,
    } = env;

    const subdomain = 'agent';
    const subnode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [await env.identity.agentRootNode(), ethers.id(subdomain)]
      )
    );
    await wrapper.setOwner(BigInt(subnode), agent.address);

    const stakeAmount = ethers.parseUnits('10', AGIALPHA_DECIMALS);
    await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmount);

    const reward = ethers.parseUnits('100', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');

    expect((await registry.jobs(1)).stake).to.equal(reward / 10n);
    await registry.connect(agent).applyForJob(1, subdomain, []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://bad'), 'ipfs://bad', subdomain, []);
    await validation.setResult(false);
    await validation.finalize(1);

    await token
      .connect(employer)
      .approve(await stake.getAddress(), await dispute.disputeFee());
    await registry
      .connect(employer)
      .dispute(1, ethers.id('evidence'), 'ipfs://evidence');
    await dispute.connect(moderator).resolveDispute(1, true); // employer wins
    expect(await stake.lockedStakes(agent.address)).to.equal(stakeAmount);
    await registry.connect(employer).finalize(1);

    // The old fixture expected settlement itself to blacklist the agent.
    // Current zero-payout failure settlement applies no reputation penalty.
    expect(await reputation.reputation(agent.address)).to.equal(10);
    expect(await reputation.isBlacklisted(agent.address)).to.equal(false);
    expect(await stake.stakeOf(agent.address, Role.Agent)).to.equal(0);
    expect(await token.balanceOf(employer.address)).to.equal(
      env.initialEmployerBalance + stakeAmount
    );
    expect(await stake.lockedStakes(agent.address)).to.equal(0);
    await expect(
      registry.connect(employer).finalize(1)
    ).to.be.revertedWithCustomError(registry, 'NotReady');
    expect(await token.balanceOf(employer.address)).to.equal(
      env.initialEmployerBalance + stakeAmount
    );
    expect(await stake.stakeOf(agent.address, Role.Agent)).to.equal(0);
  });

  it('blacklists after an authorized penalty and rehabilitates reputation', async () => {
    const { reputation, agent } = await deploySystem();
    // Exercise the explicit reputation-penalty mechanism separately from settlement.
    await reputation.subtract(agent.address, 1);
    expect(await reputation.isBlacklisted(agent.address)).to.equal(true);
    await reputation.add(agent.address, 20);
    expect(await reputation.isBlacklisted(agent.address)).to.equal(false);
  });
});
