import { expect } from 'chai';
import { artifacts, ethers, network } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

import { AGIALPHA, AGIALPHA_DECIMALS } from '../../scripts/constants';
import { decodeJobMetadata } from '../utils/jobMetadata';

enum StakeRole {
  Agent,
  Validator,
  Platform,
}

const SUBDOMAIN_AGENT = 'policy-author';
const SUBDOMAIN_VALIDATOR_A = 'validator-a';
const SUBDOMAIN_VALIDATOR_B = 'validator-b';
const SUBDOMAIN_VALIDATOR_C = 'validator-c';

function buildCommit(
  jobId: bigint,
  nonce: bigint,
  approve: boolean,
  burnTxHash: string,
  salt: Uint8Array,
  specHash: string
) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32', 'bytes32'],
      [jobId, nonce, approve, burnTxHash, salt, specHash]
    )
  );
}

async function deploySolvingGovernanceFixture() {
  await network.provider.send('hardhat_reset');

  const [
    owner,
    nationA,
    nationB,
    policyAuthor,
    validatorA,
    validatorB,
    validatorC,
    treasury,
  ] = await ethers.getSigners();

  const tokenArtifact = await artifacts.readArtifact(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    tokenArtifact.deployedBytecode,
  ]);
  const ownerSlotValue = ethers.zeroPadValue(owner.address, 32);
  const ownerSlot = ethers.toBeHex(5, 32);
  await network.provider.send('hardhat_setStorageAt', [
    AGIALPHA,
    ownerSlot,
    ownerSlotValue,
  ]);

  const token = await ethers.getContractAt(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
    AGIALPHA
  );
  const initialMint = ethers.parseUnits('1000000', AGIALPHA_DECIMALS);
  for (const signer of [
    owner,
    nationA,
    nationB,
    policyAuthor,
    validatorA,
    validatorB,
    validatorC,
  ]) {
    await token.mint(signer.address, initialMint);
  }

  const StakeManager = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stakeManager = await StakeManager.deploy(
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    owner.address
  );
  await stakeManager.connect(owner).setMinStake(1);
  await token.connect(owner).mint(await stakeManager.getAddress(), 0);

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stakeManager.getAddress());

  const Identity = await ethers.getContractFactory(
    'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
  );
  const identity = await Identity.deploy();
  await identity.connect(owner).setResult(false);

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stakeManager.getAddress(),
    60,
    60,
    3,
    5,
    []
  );

  const Certificate = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const certificates = await Certificate.deploy('AGI Certificate', 'AGICERT');

  const Registry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const registry = await Registry.deploy(
    await validation.getAddress(),
    await stakeManager.getAddress(),
    await reputation.getAddress(),
    ethers.ZeroAddress,
    await certificates.getAddress(),
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
    treasury.address,
    owner.address
  );

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const feePool = await FeePool.deploy(
    await stakeManager.getAddress(),
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  await feePool.setBurnPct(0);

  await stakeManager
    .connect(owner)
    .setModules(await registry.getAddress(), await dispute.getAddress());
  await stakeManager
    .connect(owner)
    .setValidationModule(await validation.getAddress());
  await stakeManager
    .connect(owner)
    .setDisputeModule(await dispute.getAddress());
  await stakeManager.connect(owner).setSlashingPercentages(100, 0);

  await validation.connect(owner).setJobRegistry(await registry.getAddress());
  await validation.connect(owner).setIdentityRegistry(await identity.getAddress());
  await validation.connect(owner).setStakeManager(await stakeManager.getAddress());
  await validation
    .connect(owner)
    .setReputationEngine(await reputation.getAddress());
  await validation
    .connect(owner)
    .setValidatorPool([
      validatorA.address,
      validatorB.address,
      validatorC.address,
    ]);
  await validation.connect(owner).setValidatorsPerJob(3);
  await validation.connect(owner).setRequiredValidatorApprovals(2);
  await validation.connect(owner).setCommitWindow(60);
  await validation.connect(owner).setRevealWindow(60);

  await registry.connect(owner).setModules(
    await validation.getAddress(),
    await stakeManager.getAddress(),
    await reputation.getAddress(),
    await dispute.getAddress(),
    await certificates.getAddress(),
    await feePool.getAddress(),
    []
  );
  await registry.connect(owner).setIdentityRegistry(await identity.getAddress());
  await registry.connect(owner).setValidatorRewardPct(0);
  await registry.connect(owner).setJobParameters(0, 0);

  await certificates
    .connect(owner)
    .setJobRegistry(await registry.getAddress());
  await certificates
    .connect(owner)
    .setStakeManager(await stakeManager.getAddress());
  await reputation.connect(owner).setCaller(await registry.getAddress(), true);
  await reputation.connect(owner).setCaller(await validation.getAddress(), true);

  await identity.connect(owner).addAdditionalAgent(nationA.address);
  await identity.connect(owner).addAdditionalAgent(nationB.address);
  await identity.connect(owner).addAdditionalAgent(policyAuthor.address);
  await identity
    .connect(owner)
    .addAdditionalValidator(validatorA.address);
  await identity
    .connect(owner)
    .addAdditionalValidator(validatorB.address);
  await identity
    .connect(owner)
    .addAdditionalValidator(validatorC.address);
  await identity
    .connect(owner)
    .setAgentType(policyAuthor.address, 0); // Human drafter

  return {
    owner,
    nationA,
    nationB,
    policyAuthor,
    validatorA,
    validatorB,
    validatorC,
    treasury,
    token,
    stakeManager,
    validation,
    registry,
    identity,
  };
}

describe('Solving α-AGI governance integration', function () {
  this.timeout(120000);

  it('orchestrates multi-nation proposals with wallet validators and owner control', async () => {
    const env = await deploySolvingGovernanceFixture();
    const {
      owner,
      nationA,
      nationB,
      policyAuthor,
      validatorA,
      validatorB,
      validatorC,
      token,
      stakeManager,
      validation,
      registry,
    } = env;

    const stakeAmount = ethers.parseUnits('250', AGIALPHA_DECIMALS);
    for (const participant of [
      policyAuthor,
      validatorA,
      validatorB,
      validatorC,
    ]) {
      await token
        .connect(participant)
        .approve(await stakeManager.getAddress(), stakeAmount);
      const role =
        participant === policyAuthor ? StakeRole.Agent : StakeRole.Validator;
      await stakeManager.connect(participant).depositStake(role, stakeAmount);
    }

    const rewardA = ethers.parseUnits('5000', AGIALPHA_DECIMALS);
    const specHashA = ethers.id('policy://nation-a/climate');
    const deadlineA = BigInt((await time.latest()) + 3600);
    const feePct = BigInt(await registry.feePct());
    const totalFundingA = rewardA + (rewardA * feePct) / 100n;
    await token
      .connect(nationA)
      .approve(await stakeManager.getAddress(), totalFundingA);
    await registry
      .connect(nationA)
      .createJob(rewardA, deadlineA, specHashA, 'ipfs://proposal/nation-a');

    await registry
      .connect(policyAuthor)
      .applyForJob(1, SUBDOMAIN_AGENT, []);
    await registry
      .connect(policyAuthor)
      .submit(
        1,
        ethers.id('ipfs://result/nation-a'),
        'ipfs://result/nation-a',
        SUBDOMAIN_AGENT,
        []
      );

    const burnHashA = ethers.keccak256(ethers.toUtf8Bytes('nation-a-burn'));
    await registry
      .connect(nationA)
      .submitBurnReceipt(1, burnHashA, 0, 0);

    await time.increase(1);
    await validation.selectValidators(1, 0);

    const nonceA = await validation.jobNonce(1);
    const saltA1 = ethers.randomBytes(32);
    const commitA1 = buildCommit(1n, nonceA, true, burnHashA, saltA1, specHashA);
    await validation
      .connect(validatorA)
      .commitValidation(1, commitA1, SUBDOMAIN_VALIDATOR_A, []);

    const saltA2 = ethers.randomBytes(32);
    const commitA2 = buildCommit(1n, nonceA, true, burnHashA, saltA2, specHashA);
    await validation
      .connect(validatorB)
      .commitValidation(1, commitA2, SUBDOMAIN_VALIDATOR_B, []);

    const saltA3 = ethers.randomBytes(32);
    const commitA3 = buildCommit(1n, nonceA, true, burnHashA, saltA3, specHashA);
    await validation
      .connect(validatorC)
      .commitValidation(1, commitA3, SUBDOMAIN_VALIDATOR_C, []);

    {
      const round = await validation.rounds(1);
      const now = BigInt(await time.latest());
      const waitForReveal = round.commitDeadline - now + 1n;
      if (waitForReveal > 0n) {
        await time.increase(Number(waitForReveal));
      }
    }
    await validation
      .connect(validatorA)
      .revealValidation(1, true, burnHashA, saltA1, SUBDOMAIN_VALIDATOR_A, []);
    await validation
      .connect(validatorB)
      .revealValidation(1, true, burnHashA, saltA2, SUBDOMAIN_VALIDATOR_B, []);
    await validation
      .connect(validatorC)
      .revealValidation(1, true, burnHashA, saltA3, SUBDOMAIN_VALIDATOR_C, []);
    {
      const round = await validation.rounds(1);
      const now = BigInt(await time.latest());
      const waitForFinalize = round.revealDeadline - now + 1n;
      if (waitForFinalize > 0n) {
        await time.increase(Number(waitForFinalize));
      }
    }

    await validation.finalize(1);
    await registry.connect(nationA).confirmEmployerBurn(1, burnHashA);
    await registry.connect(nationA).finalize(1);

    {
      const job = await registry.jobs(1);
      expect(job.employer).to.equal(nationA.address);
      const metadata = decodeJobMetadata(job.packedMetadata);
      expect(metadata.state).to.equal(6);
      expect(metadata.success).to.equal(true);
      expect(metadata.burnConfirmed).to.equal(true);
    }

    await registry.connect(owner).pause();
    await expect(
      registry
        .connect(nationB)
        .createJob(
          1,
          BigInt((await time.latest()) + 3600),
          ethers.id('policy://nation-b/trade'),
          'ipfs://proposal/nation-b'
        )
    ).to.be.revertedWithCustomError(registry, 'EnforcedPause');

    await registry.connect(owner).unpause();
    await validation
      .connect(owner)
      .setRequiredValidatorApprovals(3);
    expect(await validation.requiredValidatorApprovals()).to.equal(3);

    const rewardB = ethers.parseUnits('8000', AGIALPHA_DECIMALS);
    const specHashB = ethers.id('policy://nation-b/trade');
    const deadlineB = BigInt((await time.latest()) + 5400);
    const totalFundingB = rewardB + (rewardB * feePct) / 100n;
    await token
      .connect(nationB)
      .approve(await stakeManager.getAddress(), totalFundingB);
    await registry
      .connect(nationB)
      .createJob(rewardB, deadlineB, specHashB, 'ipfs://proposal/nation-b');

    await registry
      .connect(policyAuthor)
      .applyForJob(2, SUBDOMAIN_AGENT, []);
    await registry
      .connect(policyAuthor)
      .submit(
        2,
        ethers.id('ipfs://result/nation-b'),
        'ipfs://result/nation-b',
        SUBDOMAIN_AGENT,
        []
      );

    const burnHashB = ethers.keccak256(ethers.toUtf8Bytes('nation-b-burn'));
    await registry
      .connect(nationB)
      .submitBurnReceipt(2, burnHashB, 0, 0);

    await time.increase(1);
    await validation.selectValidators(2, 0);

    const nonceB = await validation.jobNonce(2);
    const saltB1 = ethers.randomBytes(32);
    const commitB1 = buildCommit(2n, nonceB, true, burnHashB, saltB1, specHashB);
    await validation
      .connect(validatorA)
      .commitValidation(2, commitB1, SUBDOMAIN_VALIDATOR_A, []);

    const saltB2 = ethers.randomBytes(32);
    const commitB2 = buildCommit(2n, nonceB, true, burnHashB, saltB2, specHashB);
    await validation
      .connect(validatorB)
      .commitValidation(2, commitB2, SUBDOMAIN_VALIDATOR_B, []);

    const saltB3 = ethers.randomBytes(32);
    const commitB3 = buildCommit(2n, nonceB, true, burnHashB, saltB3, specHashB);
    await validation
      .connect(validatorC)
      .commitValidation(2, commitB3, SUBDOMAIN_VALIDATOR_C, []);

    {
      const round = await validation.rounds(2);
      const now = BigInt(await time.latest());
      const waitForReveal = round.commitDeadline - now + 1n;
      if (waitForReveal > 0n) {
        await time.increase(Number(waitForReveal));
      }
    }
    await validation
      .connect(validatorA)
      .revealValidation(2, true, burnHashB, saltB1, SUBDOMAIN_VALIDATOR_A, []);
    await validation
      .connect(validatorB)
      .revealValidation(2, true, burnHashB, saltB2, SUBDOMAIN_VALIDATOR_B, []);
    await validation
      .connect(validatorC)
      .revealValidation(2, true, burnHashB, saltB3, SUBDOMAIN_VALIDATOR_C, []);
    {
      const round = await validation.rounds(2);
      const now = BigInt(await time.latest());
      const waitForFinalize = round.revealDeadline - now + 1n;
      if (waitForFinalize > 0n) {
        await time.increase(Number(waitForFinalize));
      }
    }

    await validation.finalize(2);
    await registry.connect(nationB).confirmEmployerBurn(2, burnHashB);
    await registry.connect(nationB).finalize(2);

    {
      const job = await registry.jobs(2);
      expect(job.employer).to.equal(nationB.address);
      const metadata = decodeJobMetadata(job.packedMetadata);
      expect(metadata.state).to.equal(6);
      expect(metadata.success).to.equal(true);
      expect(metadata.burnConfirmed).to.equal(true);
    }
  });
});
