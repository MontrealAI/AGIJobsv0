import { deployImplementations } from '../../scripts/deploy/implementations.cjs';
import { expect } from 'chai';
import { artifacts, ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../../scripts/constants';

function leaf(addr: string, label: string) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'bytes32'],
      [addr, ethers.id(label)]
    )
  );
}

enum Role {
  Agent,
  Validator,
  Platform,
}

async function deploySystem() {
  const [owner, employer, agent, validator, buyer, moderator, v2, v3] =
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
  const mint = ethers.parseUnits('1000', AGIALPHA_DECIMALS);
  await token.mint(employer.address, mint);
  await token.mint(agent.address, mint);
  for (const v of [validator, v2, v3]) await token.mint(v.address, mint);
  await token.mint(buyer.address, mint);

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
  await identity.setClubRootNode(ethers.id('validator-root'));

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    30,
    30,
    3,
    3,
    [],
    await deployImplementations('ValidationModule', Validation.runner)
  );

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
  const stakeAmt = ethers.parseUnits('10', AGIALPHA_DECIMALS);
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await nft.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    0, // Legacy fixed stake is disabled; the default is 1000 basis points.
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
  await stake.setValidationModule(await validation.getAddress());
  await validation.setJobRegistry(await registry.getAddress());
  await validation.setStakeManager(await stake.getAddress());
  await validation.setIdentityRegistry(await identity.getAddress());
  await validation.setReputationEngine(await reputation.getAddress());
  const validators = [validator, v2, v3];
  await validation.setValidatorPool(validators.map((v) => v.address));
  await validation.setValidatorSubdomains(
    validators.map((v) => v.address),
    validators.map(() => 'validator')
  );
  await identity.addAdditionalValidator(v2.address);
  await identity.addAdditionalValidator(v3.address);
  await reputation.setCaller(await validation.getAddress(), true);
  await reputation.setThreshold(0);

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
  await registry.setValidatorRewardPct(0);
  await stake.setSlashingPercentages(100, 0);
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);
  await reputation.setJobRegistry(await registry.getAddress(), true);

  await registry.setFeePct(0);
  expect(await registry.jobStakeBps()).to.equal(1000);
  await stake.setBurnPct(0);
  // setCode skips constructors, and escrow/marketplace contracts must accept token terms.
  for (const module of [stake, feePool, nft]) {
    await token.mint(await module.getAddress(), 0);
  }

  return {
    initialAgentBalance: await token.balanceOf(agent.address),
    initialEmployerBalance: await token.balanceOf(employer.address),
    feePool,
    validators,
    owner,
    employer,
    agent,
    validator,
    buyer,
    moderator,
    token,
    stake,
    reputation,
    ens,
    wrapper,
    identity,
    validation,
    nft,
    registry,
    dispute,
    stakeAmt,
  };
}

async function validateRound(
  env: any,
  approvals: boolean[],
  reveal = approvals.map(() => true)
) {
  const { validation, registry, employer, validators } = env;
  // Submission seeds the round; finalize selection after the future block is mined.
  await ethers.provider.send('evm_mine', []);
  await validation.connect(employer).selectValidators(1, 0);
  expect(Array.from(await validation.validators(1))).to.have.members(
    validators.map((v: any) => v.address)
  );
  const nonce = await validation.jobNonce(1);
  const specHash = await registry.getSpecHash(1);
  const burnTxHash = ethers.id('burn');
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = await validation.DOMAIN_SEPARATOR();
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const salts = validators.map((v: any) => ethers.id(`salt:${v.address}`));
  for (let i = 0; i < validators.length; ++i) {
    const outcome = ethers.keccak256(
      coder.encode(
        ['uint256', 'bytes32', 'bool', 'bytes32'],
        [nonce, specHash, approvals[i], burnTxHash]
      )
    );
    const commitment = ethers.keccak256(
      coder.encode(
        ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
        [1, outcome, salts[i], validators[i].address, chainId, domain]
      )
    );
    await validation
      .connect(validators[i])
      .commitValidation(1, commitment, 'validator', []);
  }
  const round = await validation.rounds(1);
  await time.increaseTo(round.commitDeadline + 1n);
  for (let i = 0; i < validators.length; ++i) {
    if (reveal[i]) {
      await validation
        .connect(validators[i])
        .revealValidation(
          1,
          approvals[i],
          burnTxHash,
          salts[i],
          'validator',
          []
        );
    }
  }
  await time.increaseTo(round.revealDeadline + 1n);
  await validation.finalize(1);
}

describe('Commit-reveal job lifecycle', function () {
  it('runs full flow and certificate trade', async () => {
    const env = await deploySystem();
    const {
      token,
      stake,
      wrapper,
      identity,
      validation,
      nft,
      registry,
      employer,
      agent,
      validator,
      buyer,
      stakeAmt,
    } = env;

    const label = 'agent';
    const node = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [await identity.agentRootNode(), ethers.id(label)]
      )
    );
    await wrapper.setOwner(BigInt(node), agent.address);

    const vLeaf = leaf(validator.address, 'validator');
    await identity.setValidatorMerkleRoot(vLeaf);

    await token.connect(agent).approve(await stake.getAddress(), stakeAmt);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmt);
    for (const v of env.validators) {
      await token.connect(v).approve(await stake.getAddress(), stakeAmt);
      await stake.connect(v).depositStake(Role.Validator, stakeAmt);
    }

    const reward = ethers.parseUnits('100', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec1');
    await registry
      .connect(employer)
      ['createJob(uint256,uint64,bytes32,string)'](
        reward,
        deadline,
        specHash,
        'ipfs://job'
      );

    expect((await registry.jobs(1)).stake).to.equal(reward / 10n);
    await registry.connect(agent).applyForJob(1, label, []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://result'), 'ipfs://result', label, []);
    const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    await registry.connect(employer).submitBurnReceipt(1, burnTxHash, 0, 0);

    await validateRound(env, [true, true, true]);
    await registry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await registry.connect(employer).finalize(1);

    expect(await nft.ownerOf(1)).to.equal(agent.address);
    expect(await token.balanceOf(agent.address)).to.equal(
      env.initialAgentBalance - stakeAmt + reward
    );

    const price = ethers.parseUnits('50', AGIALPHA_DECIMALS);
    await nft.connect(agent).list(1, price);
    await token.connect(buyer).approve(await nft.getAddress(), price);
    await nft.connect(buyer).purchase(1);
    expect(await nft.ownerOf(1)).to.equal(buyer.address);
  });

  it('handles dispute resolution with slashing', async () => {
    const env = await deploySystem();
    const {
      token,
      stake,
      wrapper,
      identity,
      validation,
      registry,
      employer,
      agent,
      validator,
      moderator,
      stakeAmt,
    } = env;

    const label = 'agent';
    const node = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [await identity.agentRootNode(), ethers.id(label)]
      )
    );
    await wrapper.setOwner(BigInt(node), agent.address);
    const vLeaf = leaf(validator.address, 'validator');
    await identity.setValidatorMerkleRoot(vLeaf);

    await token.connect(agent).approve(await stake.getAddress(), stakeAmt);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmt);
    for (const v of env.validators) {
      await token.connect(v).approve(await stake.getAddress(), stakeAmt);
      await stake.connect(v).depositStake(Role.Validator, stakeAmt);
    }

    const reward = ethers.parseUnits('100', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec2');
    await registry
      .connect(employer)
      ['createJob(uint256,uint64,bytes32,string)'](
        reward,
        deadline,
        specHash,
        'ipfs://job'
      );

    expect((await registry.jobs(1)).stake).to.equal(reward / 10n);
    await registry.connect(agent).applyForJob(1, label, []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://bad'), 'ipfs://bad', label, []);
    const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    await registry.connect(employer).submitBurnReceipt(1, burnTxHash, 0, 0);

    await validateRound(env, [true, true, true]);

    const disputeFee = await env.dispute.disputeFee();
    await token.connect(agent).approve(await stake.getAddress(), disputeFee);
    await registry
      .connect(agent)
      .dispute(1, ethers.id('evidence'), 'ipfs://evidence');
    const validatorStakeBefore = await stake.stakeOf(
      validator.address,
      Role.Validator
    );
    await env.dispute.connect(moderator).resolveDispute(1, true);
    await registry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await registry.connect(employer).finalize(1);

    expect(await stake.stakeOf(agent.address, Role.Agent)).to.equal(0);
    expect(await stake.stakeOf(validator.address, Role.Validator)).to.equal(
      validatorStakeBefore - disputeFee
    );
    expect(await token.balanceOf(employer.address)).to.equal(
      env.initialEmployerBalance + stakeAmt + disputeFee * 4n
    );
  });
});
