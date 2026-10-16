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
  await reputation.setCaller(owner.address, true);

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
  reveal = approvals.map(() => true),
  early = false
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
  if (!early) await time.increaseTo(round.revealDeadline + 1n);
  else expect(await time.latest()).lt(Number(round.revealDeadline));
  if (!early) await validation.finalize(1);
  return round;
}

async function prepared() {
  const env = await deploySystem();
  const {
    identity,
    wrapper,
    validator,
    agent,
    token,
    stake,
    stakeAmt,
    employer,
    registry,
    reputation,
  } = env;
  const node = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'bytes32'],
      [await identity.agentRootNode(), ethers.id('agent')]
    )
  );
  await wrapper.setOwner(BigInt(node), agent.address);
  await identity.setValidatorMerkleRoot(leaf(validator.address, 'validator'));
  await reputation.add(agent.address, 19036);
  await token.connect(agent).approve(await stake.getAddress(), stakeAmt);
  await stake.connect(agent).depositStake(Role.Agent, stakeAmt);
  for (const v of env.validators) {
    await token.connect(v).approve(await stake.getAddress(), stakeAmt);
    await stake.connect(v).depositStake(Role.Validator, stakeAmt);
    await reputation.add(v.address, 1);
  }
  const reward = ethers.parseUnits('100', AGIALPHA_DECIMALS);
  await token.connect(employer).approve(await stake.getAddress(), reward);
  await registry
    .connect(employer)
    .createJob(
      reward,
      BigInt((await time.latest()) + 3600),
      ethers.id('spec'),
      'ipfs://job'
    );
  await registry.connect(agent).applyForJob(1, 'agent', []);
  await registry
    .connect(agent)
    .submit(1, ethers.id('result'), 'ipfs://result', 'agent', []);
  await registry
    .connect(employer)
    .submitBurnReceipt(1, ethers.id('burn'), 0, 0);
  return env;
}
async function appeal(env: any) {
  await env.token
    .connect(env.agent)
    .approve(await env.stake.getAddress(), await env.dispute.disputeFee());
  await env.registry
    .connect(env.agent)
    .dispute(1, ethers.id('evidence'), 'ipfs://evidence');
}
// Functional regressions for the owner-approved v3 signature and reveal-window corrections.
describe('Terminal v3 signed resolution and promised reveal window', function () {
  it('rejects legacy payloads and stale-round approvals while accepting fresh v3 signatures', async function () {
    const env = await prepared();
    await validateRound(env, [true, true, true]);
    const { dispute, moderator, registry, employer, reputation, agent } = env;
    await appeal(env);
    const network = await ethers.provider.getNetwork();
    const legacy = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint256', 'bool', 'address', 'uint256'],
        [
          ethers.id(
            'ResolveDispute(uint256 jobId,bool employerWins,address module,uint256 chainId)'
          ),
          1,
          true,
          await dispute.getAddress(),
          network.chainId,
        ]
      )
    );
    await expect(
      dispute.resolveWithSignatures(1, true, [
        await moderator.signMessage(ethers.getBytes(legacy)),
      ])
    ).reverted;
    const payload = async () =>
      ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          [
            'bytes32',
            'uint256',
            'bool',
            'address',
            'uint256',
            'address',
            'uint256',
          ],
          [
            ethers.id(
              'ResolveDisputeV3(uint256 jobId,bool employerWins,address module,uint256 chainId,address registry,uint256 disputeRound)'
            ),
            1,
            true,
            await dispute.getAddress(),
            network.chainId,
            await registry.getAddress(),
            await dispute.disputeRound(1),
          ]
        )
      );
    const first = await payload();
    expect(await dispute.resolutionMessageHash(1, true)).equal(
      ethers.hashMessage(ethers.getBytes(first))
    );
    const signature = await moderator.signMessage(ethers.getBytes(first));
    await dispute.resolveWithSignatures(1, true, [signature]);
    await appeal(env);
    await dispute
      .connect(moderator)
      .resolveDisputeOutcome(1, 3, ethers.id('breach'));
    await appeal(env);
    expect(await dispute.resolutionMessageHash(1, true)).not.equal(
      ethers.hashMessage(ethers.getBytes(first))
    );
    await expect(dispute.resolveWithSignatures(1, true, [signature])).reverted;
    await dispute
      .connect(moderator)
      .resolveDisputeOutcome(1, 3, ethers.id('final-breach'));
    await registry.connect(employer).finalize(1);
    expect(await reputation.reputation(agent.address)).equal(19026);
  });
  it('preserves timely final reveal, stake, eligibility and early all-revealed settlement', async function () {
    const env = await prepared();
    await env.reputation.setPremiumThreshold(1);
    await env.validation.setRevealQuorum(66, 2);
    await env.validation.setEarlyFinalizeDelay(0);
    const missing = env.validators[2];
    const round = await validateRound(
      env,
      [true, true, true],
      [true, true, false],
      true
    );
    const stakeBefore = await env.stake.stakeOf(
      missing.address,
      Role.Validator
    );
    const lockBefore = await env.stake.lockedStakes(missing.address);
    await expect(env.validation.finalize(1)).revertedWithCustomError(
      env.validation,
      'RevealPending'
    );
    expect(await env.stake.stakeOf(missing.address, Role.Validator)).equal(
      stakeBefore
    );
    expect(await env.stake.lockedStakes(missing.address)).equal(lockBefore);
    expect(await env.reputation.reputation(missing.address)).equal(1);
    expect(await env.reputation.isBlacklisted(missing.address)).equal(false);
    expect(await env.validation.validatorBanUntil(missing.address)).equal(0);
    await env.validation
      .connect(missing)
      .revealValidation(
        1,
        true,
        ethers.id('burn'),
        ethers.id(`salt:${missing.address}`),
        'validator',
        []
      );
    expect(await time.latest()).lt(Number(round.revealDeadline));
    await env.validation.finalize(1);
    expect(await env.stake.stakeOf(missing.address, Role.Validator)).equal(
      stakeBefore
    );
    await env.registry
      .connect(env.employer)
      .confirmEmployerBurn(1, ethers.id('burn'));
    await env.registry.connect(env.employer).finalize(1);
    expect(await env.stake.lockedStakes(env.agent.address)).equal(0);
    await expect(env.registry.connect(env.employer).finalize(1)).reverted;
  });
  it('reserves the exact deadline and applies genuine timeout penalties once afterward', async function () {
    const env = await prepared();
    await env.reputation.setPremiumThreshold(1);
    await env.validation.setRevealQuorum(66, 2);
    await env.validation.setEarlyFinalizeDelay(0);
    const missing = env.validators[2];
    const round = await validateRound(
      env,
      [true, true, true],
      [true, true, false],
      true
    );
    await time.setNextBlockTimestamp(round.revealDeadline);
    await expect(env.validation.finalize(1)).revertedWithCustomError(
      env.validation,
      'RevealPending'
    );
    expect(await env.reputation.reputation(missing.address)).equal(1);
    await time.setNextBlockTimestamp(round.revealDeadline + 1n);
    await env.validation.finalize(1);
    expect(await env.stake.stakeOf(missing.address, Role.Validator)).equal(
      ethers.parseUnits('9.95', AGIALPHA_DECIMALS)
    );
    expect(await env.reputation.reputation(missing.address)).equal(0);
    expect(await env.reputation.isBlacklisted(missing.address)).equal(true);
    expect(await env.validation.validatorBanUntil(missing.address)).gt(
      await ethers.provider.getBlockNumber()
    );
    await expect(env.validation.finalize(1)).reverted;
    expect(await env.stake.stakeOf(missing.address, Role.Validator)).equal(
      ethers.parseUnits('9.95', AGIALPHA_DECIMALS)
    );
  });
});
