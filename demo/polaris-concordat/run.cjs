#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const { address: AGIALPHA } = require('../../config/agialpha.json');
const {
  EdrProviderWrapper,
} = require('hardhat/internal/hardhat-network/provider/provider');
const STAKE_AMOUNT = 1000n * 10n ** 18n;
const COMMIT_WINDOW = 60;
const REVEAL_WINDOW = 60;
const Role = { Validator: 1 };

async function requireLocal(hre) {
  if (
    hre.network.name !== 'hardhat' ||
    hre.network.config.chainId !== 31337 ||
    hre.network.config.url ||
    hre.network.config.forking?.enabled
  )
    throw Error('Only a non-forked in-process Hardhat chain 31337 is allowed');
  await hre.network.provider.send('eth_chainId');
  let provider = hre.network.provider;
  let local = false;
  for (let n = 0; provider && n < 12; n++) {
    if (provider instanceof EdrProviderWrapper) {
      local = true;
      break;
    }
    provider = provider._wrapped || provider._provider || provider.provider;
  }
  if (!local)
    throw Error(
      'The actual provider is not an in-process Hardhat EDR instance'
    );
  const metadata = await hre.network.provider.send('hardhat_metadata');
  if (
    metadata.chainId !== 31337 ||
    metadata.forkedNetwork ||
    metadata.latestBlockNumber !== 0
  )
    throw Error('A fresh, unforked disposable Hardhat instance is required');
  return metadata;
}

function validateOptions(options) {
  if (
    !options ||
    Object.keys(options).sort().join(',') !==
      'initialReveals,replacementApprovals'
  )
    throw Error('Expected initialReveals and replacementApprovals only');
  for (const [name, value] of Object.entries(options))
    if (!Number.isInteger(value) || value < 0 || value > 3)
      throw Error(`${name} must be an integer from 0 to 3`);
  return options;
}

async function restoreSnapshot(provider, snapshot) {
  if ((await provider.send('evm_revert', [snapshot])) !== true)
    throw Error('Disposable fixture snapshot cleanup failed');
}

async function runScenario(
  hre,
  options = { initialReveals: 1, replacementApprovals: 3 }
) {
  validateOptions(options);
  const initialMetadata = await requireLocal(hre);
  const { ethers, artifacts, network } = hre;
  if ((await ethers.provider.getCode(AGIALPHA)) !== '0x')
    throw Error('Disposable token address is already occupied');
  const snapshot = await network.provider.send('evm_snapshot');
  let owner,
    employer,
    agent,
    validators,
    token,
    stakeManager,
    validation,
    jobRegistry,
    identity;
  try {
    [owner, employer, agent, ...validators] = await ethers.getSigners();
    validators = validators.slice(0, 6);

    const artifact = await artifacts.readArtifact(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const totalSupply = STAKE_AMOUNT * BigInt(validators.length);
    const supplySlot = '0x' + (2).toString(16).padStart(64, '0');
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      supplySlot,
      ethers.toBeHex(totalSupply, 32),
    ]);

    for (const signer of [...validators, employer]) {
      const balanceSlot = ethers.keccak256(
        abi.encode(['address', 'uint256'], [signer.address, 0])
      );
      const ackSlot = ethers.keccak256(
        abi.encode(['address', 'uint256'], [signer.address, 6])
      );
      const balance = validators.includes(signer) ? STAKE_AMOUNT : 0n;
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        balanceSlot,
        ethers.toBeHex(balance, 32),
      ]);
      await network.provider.send('hardhat_setStorageAt', [
        AGIALPHA,
        ackSlot,
        ethers.toBeHex(1n, 32),
      ]);
    }

    const JobRegistry = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockJobRegistry'
    );
    jobRegistry = await JobRegistry.deploy();
    await jobRegistry.waitForDeployment();

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      ethers.parseEther('1'),
      100,
      0,
      ethers.ZeroAddress,
      await jobRegistry.getAddress(),
      ethers.ZeroAddress,
      owner.address,
      await deployImplementations('StakeManager', StakeManager.runner)
    );
    await stakeManager.waitForDeployment();

    const stakeAckSlot = ethers.keccak256(
      abi.encode(['address', 'uint256'], [await stakeManager.getAddress(), 6])
    );
    await network.provider.send('hardhat_setStorageAt', [
      AGIALPHA,
      stakeAckSlot,
      ethers.toBeHex(1n, 32),
    ]);

    await jobRegistry.setStakeManager(await stakeManager.getAddress());

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await Validation.deploy(
      await jobRegistry.getAddress(),
      await stakeManager.getAddress(),
      COMMIT_WINDOW,
      REVEAL_WINDOW,
      3,
      3,
      [],
      await deployImplementations('ValidationModule', Validation.runner)
    );
    await validation.waitForDeployment();

    await jobRegistry.setValidationModule(await validation.getAddress());
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await validation
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());

    for (const val of validators) {
      await identity.addAdditionalValidator(val.address);
    }

    await validation
      .connect(owner)
      .setValidatorPool(validators.slice(0, 3).map((v) => v.address));
    await validation.connect(owner).setNonRevealPenalty(100, 10);
    await validation.connect(owner).setRevealQuorum(100, 3);

    for (const signer of validators) {
      await token
        .connect(signer)
        .approve(await stakeManager.getAddress(), STAKE_AMOUNT);
      await stakeManager
        .connect(signer)
        .depositStake(Role.Validator, STAKE_AMOUNT);
    }

    const Status = {
      Submitted: 3,
    };

    await jobRegistry.setJob(1, {
      employer: employer.address,
      agent: agent.address,
      reward: 0,
      stake: 0,
      success: false,
      status: Status.Submitted,
      uriHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
    });
    async function advance(seconds) {
      await network.provider.send('evm_increaseTime', [seconds]);
      await network.provider.send('evm_mine');
    }
    const readPolicy = async () => ({
      approvalThresholdPct: String(await validation.approvalThreshold()),
      nonRevealPenaltyBps: String(await validation.nonRevealPenaltyBps()),
      nonRevealBanBlocks: String(await validation.nonRevealBanBlocks()),
      validatorsPerJob: String(await validation.validatorsPerJob()),
      requiredApprovals: String(await validation.requiredValidatorApprovals()),
      revealQuorumPct: String(await validation.revealQuorumPct()),
      minRevealValidators: String(await validation.minRevealValidators()),
    });
    const policyBefore = await readPolicy();
    async function round(jobId, committee, revealCount, approvingCount) {
      if (jobId !== 1)
        await jobRegistry.setJob(jobId, {
          employer: employer.address,
          agent: agent.address,
          reward: 0,
          stake: 0,
          success: false,
          status: 3,
          uriHash: ethers.ZeroHash,
          resultHash: ethers.ZeroHash,
        });
      await validation.setValidatorPool(committee.map((v) => v.address));
      await validation.selectValidators(jobId, 1);
      await validation.connect(committee[0]).selectValidators(jobId, 2);
      const target = await validation.selectionBlock(jobId);
      while (BigInt(await ethers.provider.getBlockNumber()) <= target)
        await network.provider.send('evm_mine');
      await validation.connect(committee[0]).selectValidators(jobId, 0);
      const domain = await validation.DOMAIN_SEPARATOR();
      const nonce = await validation.jobNonce(jobId);
      const specHash = await jobRegistry.getSpecHash(jobId);
      const abi = ethers.AbiCoder.defaultAbiCoder();
      const salts = [];
      for (let i = 0; i < revealCount; i++) {
        const salt = ethers.keccak256(
          ethers.toUtf8Bytes(`polaris-${jobId}-${i}`)
        );
        salts.push(salt);
        const approve = i < approvingCount;
        const outcome = ethers.keccak256(
          abi.encode(
            ['uint256', 'bytes32', 'bool', 'bytes32'],
            [nonce, specHash, approve, ethers.ZeroHash]
          )
        );
        const commitment = ethers.keccak256(
          abi.encode(
            ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
            [jobId, outcome, salt, committee[i].address, 31337, domain]
          )
        );
        await validation
          .connect(committee[i])
          .commitValidation(jobId, commitment, 'validator', []);
      }
      await advance(61);
      for (let i = 0; i < revealCount; i++)
        await validation
          .connect(committee[i])
          .revealValidation(
            jobId,
            i < approvingCount,
            ethers.ZeroHash,
            salts[i],
            'validator',
            []
          );
      await advance(61 + Number(await validation.forceFinalizeGrace()));
      const receipt = await (await validation.forceFinalize(jobId)).wait();
      const canonical = await ethers.provider.getTransactionReceipt(
        receipt.hash
      );
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      if (
        canonical.blockHash !== receipt.blockHash ||
        block.hash !== receipt.blockHash ||
        canonical.status !== 1
      )
        throw Error('Finalization receipt is not canonical and successful');
      const job = await jobRegistry.jobs(jobId);
      const metadata = await jobRegistry.decodeJobMetadata(job.packedMetadata);
      return {
        jobId,
        committee: committee.map((v) => v.address),
        requestedRevealCount: revealCount,
        requestedApprovalCount: approvingCount,
        observedSuccess: metadata.success,
        observedStatus: Number(metadata.status),
        receipt: {
          transactionHash: canonical.hash,
          blockHash: canonical.blockHash,
          blockNumber: canonical.blockNumber,
          status: canonical.status,
          logs: canonical.logs.map((l) => ({
            address: l.address,
            topics: Array.from(l.topics),
            data: l.data,
            transactionHash: l.transactionHash,
            blockHash: l.blockHash,
            blockNumber: l.blockNumber,
            index: l.index,
          })),
        },
      };
    }
    const first = await round(
      1,
      validators.slice(0, 3),
      options.initialReveals,
      options.initialReveals
    );
    const firstStakes = await Promise.all(
      validators.map(async (v) => ({
        address: v.address,
        stake: String(await stakeManager.stakes(v.address, 1)),
        banUntil: String(await validation.validatorBanUntil(v.address)),
      }))
    );
    const employerAfterFirst = String(await token.balanceOf(employer.address));
    const recovery = await round(
      2,
      validators.slice(3, 6),
      3,
      options.replacementApprovals
    );
    const policyAfter = await readPolicy();
    const contracts = {};
    for (const [name, contract] of Object.entries({
      validation,
      stakeManager,
      token,
      jobRegistry,
      identity,
    })) {
      const address = await contract.getAddress();
      contracts[name] = {
        address,
        runtimeKeccak256: ethers.keccak256(
          await ethers.provider.getCode(address)
        ),
        mock: ['token', 'jobRegistry', 'identity'].includes(name),
      };
    }
    const result = {
      schema: 'agijobs.polaris-quorum-fixture.v1',
      scope:
        'disposable in-process Hardhat EVM; real modular validation/stake, mock token/registry/identity',
      chainId: 31337,
      instanceId: initialMetadata.instanceId,
      options,
      policyBefore,
      policyAfter,
      contracts,
      initialStakePerValidator: STAKE_AMOUNT.toString(),
      first,
      firstStakes,
      employerAfterFirst,
      recovery,
      liveAssets: false,
      productionApproved: false,
      settlementApproved: false,
    };
    result.review = require('./review.cjs').review(result);
    if (!result.review.accepted)
      throw Error(
        'Independent receipt/economic checks failed: ' +
          result.review.checks
            .filter((c) => !c.passed)
            .map((c) => c.name)
            .join(', ')
      );
    return result;
  } finally {
    await restoreSnapshot(network.provider, snapshot);
  }
}

async function main() {
  const options = { initialReveals: 1, replacementApprovals: 3 };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const key = {
      '--initial-reveals': 'initialReveals',
      '--replacement-approvals': 'replacementApprovals',
    }[args[i]];
    if (!key || !/^[0-3]$/.test(args[i + 1] || ''))
      throw Error(
        'Use --initial-reveals 0..3 and --replacement-approvals 0..3'
      );
    options[key] = Number(args[i + 1]);
  }
  const result = await runScenario(require('hardhat'), options);
  const root = path.resolve(__dirname, '../..');
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'reports/polaris-'));
  fs.writeFileSync(
    path.join(directory, 'result.json'),
    JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx' }
  );
  console.log(
    JSON.stringify({
      report: path.join(directory, 'result.json'),
      firstSuccess: result.first.observedSuccess,
      recoverySuccess: result.recovery.observedSuccess,
      productionApproved: false,
    })
  );
}
if (require.main === module)
  main().catch((error) => {
    console.error(`Polaris rehearsal failed: ${error.message}`);
    process.exitCode = 2;
  });
module.exports = {
  requireLocal,
  validateOptions,
  restoreSnapshot,
  runScenario,
};
