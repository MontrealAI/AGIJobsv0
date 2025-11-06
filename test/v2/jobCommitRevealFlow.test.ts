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
  const mint = ethers.parseUnits('1000', AGIALPHA_DECIMALS);
  await token.mint(employer.address, mint);
  await token.mint(agent.address, mint);
  await token.mint(validator.address, mint);
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
    owner.address
  );

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stake.getAddress());

  const ENS = await ethers.getContractFactory('MockENS');
  const ens = await ENS.deploy();
  const Wrapper = await ethers.getContractFactory(
    'contracts/mocks/MockNameWrapper.sol:MockNameWrapper'
  );
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

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    1,
    1,
    1,
    1,
    []
  );

  const NFT = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const nft = await NFT.deploy('Cert', 'CERT');

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const stakeAmt = ethers.parseUnits('1', AGIALPHA_DECIMALS);
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await nft.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    stakeAmt,
    [],
    owner.address
  );

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const dispute = await Dispute.deploy(
    await registry.getAddress(),
    0,
    0,
    moderator.address,
    owner.address
  );

  await stake.setModules(
    await registry.getAddress(),
    await dispute.getAddress()
  );
  await stake.setValidationModule(await validation.getAddress());
  await validation.setJobRegistry(await registry.getAddress());
  await validation.setStakeManager(await stake.getAddress());
  await validation.setIdentityRegistry(await identity.getAddress());
  await validation.setReputationEngine(await reputation.getAddress());
  await validation.setValidatorPool([validator.address]);
  await validation.setParameters(1, 1, 1, 50, 50);
  await validation.setRequiredValidatorApprovals(1);

  await registry.setModules(
    await validation.getAddress(),
    await stake.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await nft.getAddress(),
    ethers.ZeroAddress,
    []
  );
  await registry.setIdentityRegistry(await identity.getAddress());
  await registry.setValidatorRewardPct(0);
  await stake.setSlashingPercentages(100, 0);
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
  await reputation.setCaller(await registry.getAddress(), true);

  return {
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
        [ethers.ZeroHash, ethers.id(label)]
      )
    );
    await wrapper.setOwner(BigInt(node), agent.address);

    const vLeaf = leaf(validator.address, 'validator');
    await identity.setValidatorMerkleRoot(vLeaf);

    await token.connect(agent).approve(await stake.getAddress(), stakeAmt);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmt);
    await token.connect(validator).approve(await stake.getAddress(), stakeAmt);
    await stake.connect(validator).depositStake(Role.Validator, stakeAmt);

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

    await registry.connect(agent).applyForJob(1, label, []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://result'), 'ipfs://result', label, []);
    const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    await registry.connect(employer).submitBurnReceipt(1, burnTxHash, 0, 0);

    const nonce = await validation.jobNonce(1);
    const salt = ethers.id('salt');
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt, specHash]
    );
    await validation.connect(validator).commitValidation(1, commit, 'validator', []);
    await time.increase(2);
    await validation
      .connect(validator)
      .revealValidation(1, true, burnTxHash, salt, 'validator', []);
    await time.increase(2);
    await validation.finalize(1);
    await registry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await registry.connect(employer).finalize(1);

    expect(await nft.ownerOf(1)).to.equal(agent.address);
    expect(await token.balanceOf(agent.address)).to.equal(
      ethers.parseUnits('1100', AGIALPHA_DECIMALS)
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
        [ethers.ZeroHash, ethers.id(label)]
      )
    );
    await wrapper.setOwner(BigInt(node), agent.address);
    const vLeaf = leaf(validator.address, 'validator');
    await identity.setValidatorMerkleRoot(vLeaf);

    await token.connect(agent).approve(await stake.getAddress(), stakeAmt);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmt);
    await token.connect(validator).approve(await stake.getAddress(), stakeAmt);
    await stake.connect(validator).depositStake(Role.Validator, stakeAmt);

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

    await registry.connect(agent).applyForJob(1, label, []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://bad'), 'ipfs://bad', label, []);
    const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    await registry.connect(employer).submitBurnReceipt(1, burnTxHash, 0, 0);

    const nonce = await validation.jobNonce(1);
    const salt = ethers.id('salt');
    const commit = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [1n, nonce, true, burnTxHash, salt, specHash]
    );
    await validation.connect(validator).commitValidation(1, commit, 'validator', []);
    await time.increase(2);
    await validation
      .connect(validator)
      .revealValidation(1, true, burnTxHash, salt, 'validator', []);
    await time.increase(2);
    await validation.finalize(1);

    await registry
      .connect(agent)
      .dispute(1, ethers.id('evidence'), 'ipfs://evidence');
    const hash = ethers.solidityPackedKeccak256(
      ['address', 'uint256', 'bool'],
      [await env.dispute.getAddress(), 1, true]
    );
    const sig = await moderator.signMessage(ethers.getBytes(hash));
    const validatorStakeBefore = await stake.stakeOf(
      validator.address,
      Role.Validator
    );
    const disputeFee = await env.dispute.disputeFee();
    await env.dispute.connect(moderator).resolveDispute(1, true);
    await registry.connect(employer).confirmEmployerBurn(1, burnTxHash);
    await registry.connect(employer).finalize(1);

    expect(await stake.stakeOf(agent.address, Role.Agent)).to.equal(0);
    expect(await stake.stakeOf(validator.address, Role.Validator)).to.equal(
      validatorStakeBefore - disputeFee
    );
    expect(await token.balanceOf(employer.address)).to.equal(
      ethers.parseUnits('1001', AGIALPHA_DECIMALS)
    );
  });
});
