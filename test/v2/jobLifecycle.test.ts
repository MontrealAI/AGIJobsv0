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
    'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
  );
  const validation = await Validation.deploy();

  const NFT = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const nft = await NFT.deploy('Cert', 'CERT');

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
  await validation.setJobRegistry(await registry.getAddress());
  await nft.setJobRegistry(await registry.getAddress());
  await nft.setStakeManager(await stake.getAddress());
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
  await reputation.setCaller(await registry.getAddress(), true);
  await reputation.setPremiumThreshold(10);

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
        [ethers.ZeroHash, ethers.id(subdomain)]
      )
    );
    await wrapper.setOwner(BigInt(subnode), agent.address);

    const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
    await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmount);

    const reward = ethers.parseUnits('100', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');

    await registry.connect(agent).applyForJob(1, subdomain, []);
    const hash = ethers.id('ipfs://result');
    await registry
      .connect(agent)
      .submit(1, hash, 'ipfs://result', subdomain, []);
    await validation.setResult(true);
    await validation.finalize(1);
    await registry.connect(employer).finalize(1);

    expect(await token.balanceOf(agent.address)).to.equal(
      ethers.parseUnits('1099', AGIALPHA_DECIMALS)
    );
    expect(await nft.ownerOf(1)).to.equal(agent.address);
    expect(await reputation.reputation(agent.address)).to.be.gt(0);

    const price = ethers.parseUnits('50', AGIALPHA_DECIMALS);
    await nft.connect(agent).list(1, price);
    await token.connect(buyer).approve(await nft.getAddress(), price);
    await nft.connect(buyer).purchase(1);

    expect(await nft.ownerOf(1)).to.equal(buyer.address);
    expect(await token.balanceOf(agent.address)).to.equal(
      ethers.parseUnits('1149', AGIALPHA_DECIMALS)
    );
  });

  it('handles validation failure, dispute resolution and blacklisting', async () => {
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
        [ethers.ZeroHash, ethers.id(subdomain)]
      )
    );
    await wrapper.setOwner(BigInt(subnode), agent.address);

    const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
    await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmount);

    const reward = ethers.parseUnits('100', AGIALPHA_DECIMALS);
    await token.connect(employer).approve(await stake.getAddress(), reward);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');

    await registry.connect(agent).applyForJob(1, subdomain, []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://bad'), 'ipfs://bad', subdomain, []);
    await validation.setResult(false);
    await validation.finalize(1);

    await registry
      .connect(employer)
      .dispute(1, ethers.id('evidence'), 'ipfs://evidence');
    const hash = ethers.solidityPackedKeccak256(
      ['address', 'uint256', 'bool'],
      [await dispute.getAddress(), 1, true]
    );
    const sig = await moderator.signMessage(ethers.getBytes(hash));
    await dispute.connect(moderator).resolveDispute(1, true); // employer wins
    await registry.connect(employer).finalize(1);

    expect(await reputation.isBlacklisted(agent.address)).to.equal(true);

    await reputation.add(agent.address, 20);
    expect(await reputation.isBlacklisted(agent.address)).to.equal(false);
  });
});
