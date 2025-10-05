import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../../scripts/constants';
import { decodeJobMetadata } from '../utils/jobMetadata';
import { readArtifact } from '../utils/artifacts';

enum Role {
  Agent,
  Validator,
  Platform,
}

async function deployFullSystem() {
  const [owner, employer, agent, v1, v2, v3, moderator] =
    await ethers.getSigners();

  const artifact = await readArtifact(
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
  await token.mint(v1.address, mint);
  await token.mint(v2.address, mint);
  await token.mint(v3.address, mint);

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

  const Identity = await ethers.getContractFactory(
    'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
  );
  const identity = await Identity.deploy();
  await identity.setResult(true);
  await identity.addAdditionalValidator(v1.address);
  await identity.addAdditionalValidator(v2.address);
  await identity.addAdditionalValidator(v3.address);
  await identity.addAdditionalAgent(agent.address);

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    0,
    0,
    0,
    0,
    []
  );

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
  await nft.connect(owner).setJobRegistry(await registry.getAddress());
  await nft.connect(owner).setStakeManager(await stake.getAddress());

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
  await dispute.waitForDeployment();
  await dispute.connect(owner).setStakeManager(await stake.getAddress());

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const feePool = await FeePool.deploy(
    await stake.getAddress(),
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  await stake.connect(owner).setFeePool(await feePool.getAddress());

  await stake
    .connect(owner)
    .setModules(
      await registry.getAddress(),
      await dispute.getAddress()
    );
  await stake
    .connect(owner)
    .setValidationModule(await validation.getAddress());
  await validation.connect(owner).setJobRegistry(await registry.getAddress());
  await validation
    .connect(owner)
    .setIdentityRegistry(await identity.getAddress());
  expect(await stake.disputeModule()).to.equal(await dispute.getAddress());
  expect(await dispute.stakeManager()).to.equal(await stake.getAddress());
  expect(await dispute.jobRegistry()).to.equal(await registry.getAddress());
  await validation
    .connect(owner)
    .setValidatorPool([v1.address, v2.address, v3.address]);
  await validation.connect(owner).setValidatorsPerJob(3);
  await validation.connect(owner).setRevealQuorum(0, 2);
  await registry
    .connect(owner)
    .setModules(
      await validation.getAddress(),
      await stake.getAddress(),
      await reputation.getAddress(),
      await dispute.getAddress(),
      await nft.getAddress(),
      await feePool.getAddress(),
      []
    );
  expect(await registry.disputeModule()).to.equal(await dispute.getAddress());
  await registry
    .connect(owner)
    .setIdentityRegistry(await identity.getAddress());
  await reputation.connect(owner).setCaller(await registry.getAddress(), true);

  return {
    owner,
    employer,
    agent,
    v1,
    v2,
    v3,
    moderator,
    token,
    stake,
    validation,
    registry,
    dispute,
  };
}

describe('job lifecycle with dispute and validator failure', function () {
  it('handles validator non-participation and dispute resolution', async () => {
    const env = await deployFullSystem();
    const {
      owner,
      employer,
      agent,
      v1,
      v2,
      v3,
      token,
      stake,
      validation,
      registry,
      dispute,
      moderator,
    } = env;

    const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
    for (const signer of [agent, v1, v2, v3]) {
      await token
        .connect(signer)
        .approve(await stake.getAddress(), stakeAmount);
      const role = signer === agent ? Role.Agent : Role.Validator;
      await stake.connect(signer).depositStake(role, stakeAmount);
    }
    const initialAgentBalance = await token.balanceOf(agent.address);

    const reward = ethers.parseUnits('100', AGIALPHA_DECIMALS);
    const feePct = await registry.feePct();
    const fee = (reward * feePct) / 100n;
    await token
      .connect(employer)
      .approve(await stake.getAddress(), reward + fee);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');

    await registry.connect(agent).applyForJob(1, 'agent', []);
    await registry
      .connect(agent)
      .submit(1, ethers.id('ipfs://result'), 'ipfs://result', 'agent', []);
    const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    await registry.connect(employer).submitBurnReceipt(1, burnTxHash, 0, 0);
    await registry.connect(employer).confirmEmployerBurn(1, burnTxHash);

    await time.increase(1);
    await validation.connect(employer).selectValidators(1, 0);
    const round = await validation.rounds(1);
    const commitDeadline = round.commitDeadline;
    const revealDeadline = round.revealDeadline;
    expect(commitDeadline).to.be.gt(0n);

    const nonce = await validation.jobNonce(1);
    const salt1 = ethers.randomBytes(32);
    const commit1 = ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [1n, nonce, true, burnTxHash, salt1, specHash]
      )
    );
    await validation.connect(v1).commitValidation(1, commit1, 'validator', []);
    const salt2 = ethers.randomBytes(32);
    const commit2 = ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [1n, nonce, false, burnTxHash, salt2, specHash]
      )
    );
    await validation.connect(v2).commitValidation(1, commit2, 'validator', []);
    const salt3 = ethers.randomBytes(32);
    const commit3 = ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
        [1n, nonce, false, burnTxHash, salt3, specHash]
      )
    );
    await validation.connect(v3).commitValidation(1, commit3, 'validator', []);

    const now = BigInt(await time.latest());
    const waitForReveal = commitDeadline - now + 1n;
    if (waitForReveal > 0n) {
      await time.increase(Number(waitForReveal));
    }
    await validation
      .connect(v1)
      .revealValidation(1, true, burnTxHash, salt1, 'validator', []);
    await validation
      .connect(v3)
      .revealValidation(1, false, burnTxHash, salt3, 'validator', []);
    // v2 fails to reveal
    const nowAfterReveal = BigInt(await time.latest());
    const waitForFinalize = revealDeadline - nowAfterReveal + 1n;
    if (waitForFinalize > 0n) {
      await time.increase(Number(waitForFinalize));
    }
    await validation.finalize(1);

    expect(await stake.stakes(v2.address, Role.Validator)).to.be.lt(
      stakeAmount
    );
    {
      const job = await registry.jobs(1);
      const metadata = decodeJobMetadata(job.packedMetadata);
      expect(metadata.state).to.equal(5); // Disputed
      expect(job.agent).to.equal(agent.address);
      expect(job.employer).to.equal(employer.address);
      expect(metadata.success).to.be.false;
    }
    await dispute.connect(owner).setDisputeFee(0);
    expect(await dispute.disputeFee()).to.equal(0n);
    await registry
      .connect(agent)
      ['raiseDispute(uint256,bytes32)'](1, ethers.id('ipfs://evidence'));
    await dispute.connect(owner).setDisputeWindow(0);
    await dispute.connect(owner).setModerator(owner.address, 1);
    await dispute.connect(owner).setModerator(moderator.address, 1);
    const typeHash = ethers.id(
      'ResolveDispute(uint256 jobId,bool employerWins,address module,uint256 chainId)'
    );
    const network = await ethers.provider.getNetwork();
    const structHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint256', 'bool', 'address', 'uint256'],
        [typeHash, 1n, false, await dispute.getAddress(), network.chainId]
      )
    );
    const sigOwner = await owner.signMessage(ethers.getBytes(structHash));
    const sigModerator = await moderator.signMessage(ethers.getBytes(structHash));
    await dispute
      .connect(moderator)
      .resolveWithSignatures(1, false, [sigOwner, sigModerator]);
    await registry.connect(employer).finalize(1);

    {
      const job = await registry.jobs(1);
      const metadata = decodeJobMetadata(job.packedMetadata);
      expect(metadata.state).to.equal(6); // Finalized
    }
    expect(await token.balanceOf(agent.address)).to.be.gt(initialAgentBalance);
  });
});
