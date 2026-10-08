import { deployImplementations } from './implementations.cjs';
import * as fs from 'fs';
import * as path from 'path';
import { ethers, network, artifacts } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { validationCommitmentHash } from '../../shared/validationProtocol';
import {
  loadTokenConfig,
  loadEnsConfig,
  inferNetworkKey,
  type TokenConfig,
  type EnsConfig,
} from '../config';
import { verifyAgialpha } from '../verify-agialpha';

const constantsPath = path.join(
  __dirname,
  '..',
  '..',
  'contracts',
  'v2',
  'Constants.sol'
);
const deploymentConfigDir = path.join(
  __dirname,
  '..',
  '..',
  'deployment-config'
);

function readJsonIfExists(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function requireAddress(
  label: string,
  value: string | undefined | null,
  { allowZero = false } = {}
) {
  if (!value || typeof value !== 'string') {
    if (allowZero) return ethers.ZeroAddress;
    throw new Error(`${label} is not configured`);
  }
  const addr = ethers.getAddress(value);
  if (!allowZero && addr === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return addr;
}

function pickAddress(
  candidates: Array<string | undefined | null>,
  { allowZero = false }: { allowZero?: boolean } = {}
): string | undefined {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const raw = String(candidate).trim();
    if (!raw) {
      continue;
    }
    try {
      const address = ethers.getAddress(raw);
      if (!allowZero && address === ethers.ZeroAddress) {
        continue;
      }
      return address;
    } catch (err) {
      console.warn(
        `Ignoring invalid address candidate "${candidate}": ${
          (err as Error).message
        }`
      );
    }
  }
  if (allowZero) {
    return ethers.ZeroAddress;
  }
  return undefined;
}

function parseUnits(
  value: string | number | undefined,
  decimals: number
): bigint {
  if (value === undefined || value === null) {
    return ethers.parseUnits('0', decimals);
  }
  if (typeof value === 'number') {
    return ethers.parseUnits(value.toString(), decimals);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return ethers.parseUnits('0', decimals);
  }
  return ethers.parseUnits(trimmed, decimals);
}

function parsePct(value: string | number | undefined): number {
  if (value === undefined || value === null) {
    return 0;
  }
  const raw = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(raw) || raw < 0) {
    throw new Error(`Invalid percentage value ${value}`);
  }
  const scaled = raw > 0 && raw < 1 ? raw * 100 : raw;
  if (scaled > 100) {
    throw new Error(`Percentage ${value} exceeds 100`);
  }
  return Math.round(scaled);
}

async function ensureLocalToken(
  tokenConfig: TokenConfig
): Promise<{ tokenAddress: string; tokenIsMock: boolean }> {
  const tokenAddress = requireAddress(
    'AGIALPHA token address',
    tokenConfig.address
  );
  const code = await ethers.provider.getCode(tokenAddress);
  if (code !== '0x') {
    return { tokenAddress, tokenIsMock: false };
  }
  if (network.name !== 'hardhat' && network.name !== 'localhost') {
    throw new Error(
      `Token at ${tokenAddress} is not deployed and cannot be mocked on ${network.name}`
    );
  }
  const artifact = await artifacts.readArtifact(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
  );
  await network.provider.send('hardhat_setCode', [
    tokenAddress,
    artifact.deployedBytecode,
  ]);
  const [ownerSigner] = await ethers.getSigners();
  const ownerSlotValue = ethers.zeroPadValue(ownerSigner.address, 32);
  const ownerSlot = ethers.toBeHex(5, 32);
  await network.provider.send('hardhat_setStorageAt', [
    tokenAddress,
    ownerSlot,
    ownerSlotValue,
  ]);
  return { tokenAddress, tokenIsMock: true };
}

async function verifyTokenMetadata(
  tokenConfigPath: string,
  provider: ethers.Provider,
  skipOnChain: boolean
): Promise<void> {
  await verifyAgialpha(tokenConfigPath, constantsPath, {
    provider,
    timeoutMs: 30_000,
    skipOnChain,
  });
}

type DeploymentContext = {
  deployer: ethers.Signer;
  governanceTarget: string;
  treasury: string;
  decimals: number;
  tokenAddress: string;
  tokenIsMock: boolean;
  tokenConfig: TokenConfig;
  ensConfig: EnsConfig;
};

async function deployContracts(ctx: DeploymentContext) {
  const { deployer, treasury, decimals, ensConfig } = ctx;
  const deployerAddress = await deployer.getAddress();

  const minStake = parseUnits(process.env.MIN_STAKE || '0', decimals);
  const employerSlashPct = parsePct(process.env.EMPLOYER_SLASH_PCT);
  const treasurySlashPct = parsePct(process.env.TREASURY_SLASH_PCT || '100');

  const Stake = await ethers.getContractFactory(
    'contracts/v2/StakeManager.sol:StakeManager'
  );
  const stake = await Stake.deploy(
    minStake,
    employerSlashPct,
    treasurySlashPct,
    treasury,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    deployerAddress,
    await deployImplementations('StakeManager', Stake.runner)
  );
  await stake.waitForDeployment();

  const Reputation = await ethers.getContractFactory(
    'contracts/v2/ReputationEngine.sol:ReputationEngine'
  );
  const reputation = await Reputation.deploy(await stake.getAddress());
  await reputation.waitForDeployment();

  const Identity = await ethers.getContractFactory(
    'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
  );
  const agentRoot = ensConfig.roots?.agent?.node
    ? ensConfig.roots.agent.node
    : ethers.ZeroHash;
  const clubRoot = ensConfig.roots?.club?.node
    ? ensConfig.roots.club.node
    : ethers.ZeroHash;
  const identity = await Identity.deploy(
    ensConfig.registry
      ? ethers.getAddress(ensConfig.registry)
      : ethers.ZeroAddress,
    ensConfig.nameWrapper
      ? ethers.getAddress(ensConfig.nameWrapper)
      : ethers.ZeroAddress,
    await reputation.getAddress(),
    agentRoot,
    clubRoot
  );
  await identity.waitForDeployment();

  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const commitWindow = Number(process.env.COMMIT_WINDOW || 3600);
  const revealWindow = Number(process.env.REVEAL_WINDOW || 3600);
  const minValidators = Number(process.env.MIN_VALIDATORS || 3);
  const maxValidators = Number(process.env.MAX_VALIDATORS || 3);
  const validation = await Validation.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    commitWindow,
    revealWindow,
    minValidators,
    maxValidators,
    [],
    await deployImplementations('ValidationModule', Validation.runner)
  );
  await validation.waitForDeployment();

  const Attestation = await ethers.getContractFactory(
    'contracts/v2/AttestationRegistry.sol:AttestationRegistry'
  );
  const attestation = await Attestation.deploy(
    ensConfig.registry
      ? ethers.getAddress(ensConfig.registry)
      : ethers.ZeroAddress,
    ensConfig.nameWrapper
      ? ethers.getAddress(ensConfig.nameWrapper)
      : ethers.ZeroAddress
  );
  await attestation.waitForDeployment();
  await (
    await identity.setAttestationRegistry(await attestation.getAddress())
  ).wait();

  const Dispute = await ethers.getContractFactory(
    'contracts/v2/modules/DisputeModule.sol:DisputeModule'
  );
  const disputeFee = parseUnits(process.env.DISPUTE_FEE || '1', decimals);
  const disputeWindow = Number(process.env.DISPUTE_WINDOW || 86400);
  const dispute = await Dispute.deploy(
    ethers.ZeroAddress,
    disputeFee,
    disputeWindow,
    ethers.ZeroAddress,
    deployerAddress
  );
  await dispute.waitForDeployment();

  const NFT = await ethers.getContractFactory(
    'contracts/v2/CertificateNFT.sol:CertificateNFT'
  );
  const certificate = await NFT.deploy('AGI Certificate', 'AGICERT');
  await certificate.waitForDeployment();

  const TaxPolicy = await ethers.getContractFactory(
    'contracts/v2/TaxPolicy.sol:TaxPolicy'
  );
  const taxPolicy = await TaxPolicy.deploy(
    process.env.TAX_POLICY_URI || 'ipfs://policy',
    process.env.TAX_ACK_TEXT || 'Participants accept AGI Jobs v2 tax terms.'
  );
  await taxPolicy.waitForDeployment();

  const FeePool = await ethers.getContractFactory(
    'contracts/v2/FeePool.sol:FeePool'
  );
  const burnPct = parsePct(process.env.FEEPOOL_BURN_PCT);
  const feePool = await FeePool.deploy(
    await stake.getAddress(),
    burnPct,
    treasury,
    await taxPolicy.getAddress()
  );
  await feePool.waitForDeployment();

  const JobRegistry = await ethers.getContractFactory(
    'contracts/v2/JobRegistry.sol:JobRegistry'
  );
  const feePct = parsePct(process.env.JOB_FEE_PCT);
  const jobStake = parseUnits(process.env.JOB_STAKE || '0', decimals);
  const registry = await JobRegistry.deploy(
    ethers.ZeroAddress,
    await stake.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    feePct,
    jobStake,
    [],
    deployerAddress,
    await deployImplementations('JobRegistry', JobRegistry.runner)
  );
  await registry.waitForDeployment();

  const Committee = await ethers.getContractFactory(
    'contracts/v2/ArbitratorCommittee.sol:ArbitratorCommittee'
  );
  const committee = await Committee.deploy(
    await registry.getAddress(),
    await dispute.getAddress()
  );
  await committee.waitForDeployment();

  // Wire modules together
  await (
    await stake.setModules(
      await registry.getAddress(),
      await dispute.getAddress()
    )
  ).wait();
  await (await stake.setValidationModule(await validation.getAddress())).wait();
  await (await stake.setFeePool(await feePool.getAddress())).wait();

  await (await validation.setJobRegistry(await registry.getAddress())).wait();
  await (await validation.setStakeManager(await stake.getAddress())).wait();
  await (
    await validation.setReputationEngine(await reputation.getAddress())
  ).wait();
  await (
    await validation.setIdentityRegistry(await identity.getAddress())
  ).wait();

  await (await dispute.setJobRegistry(await registry.getAddress())).wait();
  await (await dispute.setStakeManager(await stake.getAddress())).wait();
  await (await dispute.setCommittee(await committee.getAddress())).wait();
  await (await committee.setDisputeModule(await dispute.getAddress())).wait();

  await (await certificate.setJobRegistry(await registry.getAddress())).wait();
  await (await certificate.setStakeManager(await stake.getAddress())).wait();

  const baseUriEnv = process.env.CERTIFICATE_BASE_URI?.trim();
  if (baseUriEnv && baseUriEnv.length > 0) {
    const baseUri = baseUriEnv.endsWith('/') ? baseUriEnv : `${baseUriEnv}/`;
    await (await certificate.setBaseURI(baseUri)).wait();
    if (/^true$/i.test(process.env.CERTIFICATE_LOCK_BASE_URI ?? '')) {
      await (await certificate.lockBaseURI()).wait();
    }
  }

  await (await feePool.setStakeManager(await stake.getAddress())).wait();

  await (
    await registry.setModules(
      await validation.getAddress(),
      await stake.getAddress(),
      await reputation.getAddress(),
      await dispute.getAddress(),
      await certificate.getAddress(),
      await feePool.getAddress(),
      []
    )
  ).wait();
  await (
    await registry.setIdentityRegistry(await identity.getAddress())
  ).wait();
  await (await registry.setTaxPolicy(await taxPolicy.getAddress())).wait();
  await (await dispute.setTaxPolicy(await taxPolicy.getAddress())).wait();

  await (await reputation.setCaller(await registry.getAddress(), true)).wait();
  await (
    await reputation.setCaller(await validation.getAddress(), true)
  ).wait();

  await (
    await taxPolicy.setAcknowledger(await registry.getAddress(), true)
  ).wait();
  await (
    await taxPolicy.setAcknowledger(await stake.getAddress(), true)
  ).wait();
  await (
    await taxPolicy.setAcknowledger(await dispute.getAddress(), true)
  ).wait();
  await (
    await taxPolicy.setAcknowledger(await feePool.getAddress(), true)
  ).wait();

  return {
    stake,
    reputation,
    identity,
    validation,
    dispute,
    committee,
    certificate,
    feePool,
    registry,
    taxPolicy,
    attestation,
  };
}

async function runIntegrationScenario(
  ctx: DeploymentContext,
  contracts: Awaited<ReturnType<typeof deployContracts>>
) {
  if (!ctx.tokenIsMock) {
    console.log(
      'Skipping integration scenario (token is not locally controlled).'
    );
    return;
  }

  const { registry, stake, validation, identity } = contracts;
  const signers = await ethers.getSigners();
  const [deployer, employer, agent, validatorA, validatorB, validatorC] =
    signers;
  const validators = [validatorA, validatorB, validatorC];
  const decimals = ctx.decimals;
  const tokenArtifact = await artifacts.readArtifact(
    'contracts/test/AGIALPHAToken.sol:AGIALPHAToken'
  );
  const token = new ethers.Contract(
    ctx.tokenAddress,
    tokenArtifact.abi,
    deployer
  );

  await (
    await token.connect(deployer).mint(await stake.getAddress(), 0)
  ).wait();

  const stakeAmount = ethers.parseUnits('1000', decimals);
  for (const signer of [employer, agent, ...validators]) {
    await (
      await token.connect(deployer).mint(signer.address, stakeAmount)
    ).wait();
  }

  await (await identity.addAdditionalAgent(agent.address)).wait();
  for (const validator of validators) {
    await (await identity.addAdditionalValidator(validator.address)).wait();
  }

  await (
    await validation.setValidatorPool(
      validators.map((validator) => validator.address)
    )
  ).wait();
  await (await validation.setValidatorsPerJob(validators.length)).wait();
  await (await validation.setCommitWindow(1800)).wait();
  await (await validation.setRevealWindow(1800)).wait();
  await (
    await validation.setRequiredValidatorApprovals(validators.length)
  ).wait();

  await (
    await registry.setJobParameters(ethers.parseUnits('100000', decimals), 0)
  ).wait();
  await (await registry.setFeePct(0)).wait();
  await (await registry.setValidatorRewardPct(0)).wait();
  await (await registry.setJobDurationLimit(3600)).wait();

  const roleEnum = { Agent: 0, Validator: 1 } as const;

  for (const signer of [agent, ...validators]) {
    await (
      await token.connect(signer).approve(await stake.getAddress(), stakeAmount)
    ).wait();
    const role = signer === agent ? roleEnum.Agent : roleEnum.Validator;
    await (
      await stake.connect(signer).acknowledgeAndDeposit(role, stakeAmount)
    ).wait();
  }

  const reward = ethers.parseUnits('100', decimals);
  await (
    await token.connect(employer).approve(await stake.getAddress(), reward)
  ).wait();
  const deadline = BigInt((await time.latest()) + 3600);
  const specHash = ethers.id('integration-spec');
  const tx = await registry
    .connect(employer)
    .acknowledgeAndCreateJob(reward, deadline, specHash, 'ipfs://job');
  const receipt = await tx.wait();
  const jobCreated = receipt?.logs
    .map((log) => {
      try {
        return registry.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === 'JobCreated');
  const jobId: bigint = jobCreated?.args?.jobId ?? 1n;

  const readCommitDeadline = async (): Promise<bigint> => {
    const round = (await validation.rounds(jobId)) as unknown;
    const keyed = round as { commitDeadline?: bigint };
    if (keyed.commitDeadline !== undefined) {
      return BigInt(keyed.commitDeadline);
    }
    if (Array.isArray(round) && round.length > 0) {
      const value = round[0];
      if (value !== undefined) {
        return BigInt(value as bigint);
      }
    }
    return 0n;
  };

  const ensureValidatorsSelected = async () => {
    const deadline = await readCommitDeadline();
    if (deadline > 0n) {
      const current = BigInt(await time.latest());
      if (current <= deadline) {
        return;
      }
      throw new Error('Validator selection expired before commit phase');
    }
    const trySelect = async (signer: ethers.Signer, entropy: number) => {
      try {
        await (
          await validation.connect(signer).selectValidators(jobId, entropy)
        ).wait();
      } catch (err) {
        const message = (err as Error).message || '';
        if (!message.includes('ValidatorsAlreadySelected')) {
          throw err;
        }
      }
    };
    await trySelect(deployer, 1);
    await trySelect(agent, 2);
    await time.increase(1);
    await trySelect(validators[0], 3);
    if ((await readCommitDeadline()) === 0n) {
      throw new Error('Validator selection did not finalize');
    }
  };

  await (await registry.connect(agent).applyForJob(jobId, 'agent', [])).wait();
  await (
    await registry
      .connect(agent)
      .acknowledgeAndSubmit(
        jobId,
        ethers.id('ipfs://result'),
        'ipfs://result',
        'agent',
        []
      )
  ).wait();

  await ensureValidatorsSelected();

  const burnHash = ethers.keccak256(ethers.toUtf8Bytes('burn-proof'));
  await (
    await registry.connect(employer).submitBurnReceipt(jobId, burnHash, 0, 0)
  ).wait();

  const commitDeadline = await readCommitDeadline();
  if (commitDeadline === 0n) {
    throw new Error('Validator selection missing commit deadline');
  }
  const now = BigInt(await time.latest());
  if (now > commitDeadline) {
    throw new Error('Commit window elapsed before validators committed');
  }

  const nonce = await validation.jobNonce(jobId);
  const domain = await validation.DOMAIN_SEPARATOR();
  const { chainId } = await ethers.provider.getNetwork();
  const commitFor = async (validator: ethers.Signer, saltLabel: string) => {
    const saltBytes = ethers.keccak256(ethers.toUtf8Bytes(saltLabel));
    const commit = validationCommitmentHash({
      jobId,
      nonce,
      validator: await validator.getAddress(),
      approve: true,
      burnTxHash: burnHash,
      salt: saltBytes,
      specHash,
      domain,
      chainId,
    });
    await (
      await validation
        .connect(validator)
        .commitValidation(jobId, commit, 'validator', [])
    ).wait();
    return saltBytes;
  };

  const salts: string[] = new Array(validators.length).fill('');

  for (let i = 0; i < validators.length; i += 1) {
    const validator = validators[i];
    const saltLabel = `salt-${i}`;
    const saltBytes = await commitFor(validator, saltLabel);
    salts[i] = saltBytes;
  }

  await time.increaseTo(commitDeadline + 1n);
  for (let i = 0; i < validators.length; i += 1) {
    const validator = validators[i];
    const saltBytes = salts[i];
    await (
      await validation
        .connect(validator)
        .revealValidation(jobId, true, burnHash, saltBytes, 'validator', [])
    ).wait();
  }

  const round = await validation.rounds(jobId);
  await time.increaseTo(BigInt(round.revealDeadline ?? round[1]) + 1n);
  await (await validation.finalize(jobId)).wait();
  await (
    await registry.connect(employer).confirmEmployerBurn(jobId, burnHash)
  ).wait();
  await (await registry.connect(employer).finalize(jobId)).wait();

  console.log(`Integration scenario finalized job ${jobId} successfully.`);
}

async function transferOwnership(
  ctx: DeploymentContext,
  contracts: Awaited<ReturnType<typeof deployContracts>>
) {
  const target = ctx.governanceTarget;
  const {
    stake,
    reputation,
    identity,
    validation,
    dispute,
    committee,
    certificate,
    feePool,
    registry,
    taxPolicy,
    attestation,
  } = contracts;

  if (ethers.getAddress(target) === (await ctx.deployer.getAddress())) {
    console.log('Governance target is deployer; ownership transfers skipped.');
    return;
  }

  await (await stake.setGovernance(target)).wait();
  await (await registry.setGovernance(target)).wait();
  await (await feePool.setGovernance(target)).wait();

  for (const contract of [
    reputation,
    validation,
    dispute,
    certificate,
    feePool,
    identity,
    taxPolicy,
    committee,
    attestation,
  ]) {
    await (await contract.transferOwnership(target)).wait();
  }

  for (const [name, contract] of Object.entries({
    stake,
    registry,
    feePool,
    reputation,
    validation,
    dispute,
    certificate,
    committee,
    attestation,
  })) {
    if (
      ethers.getAddress(await contract.owner()) !== ethers.getAddress(target)
    ) {
      throw new Error(`${name} governance handoff did not complete`);
    }
  }
  for (const [name, contract] of Object.entries({ identity, taxPolicy })) {
    if (
      ethers.getAddress(await contract.pendingOwner()) !==
      ethers.getAddress(target)
    ) {
      throw new Error(`${name} pending governance handoff was not recorded`);
    }
  }
  console.log(
    `Ownership handed off to ${target}; governance must still call acceptOwnership() on IdentityRegistry and TaxPolicy before commissioning.`
  );
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const networkKey = inferNetworkKey({
    name: network.name,
    chainId: network.config?.chainId,
  });

  const { config: tokenConfig, path: tokenConfigPath } = loadTokenConfig({
    network: networkKey,
  });

  const deploymentConfigPath = networkKey
    ? path.join(deploymentConfigDir, `${networkKey}.json`)
    : path.join(deploymentConfigDir, 'default.json');
  const deploymentOverrides = readJsonIfExists(deploymentConfigPath);

  const { config: ensConfig } = loadEnsConfig({
    network: networkKey,
    persist: false,
  });

  const decimals = Number(tokenConfig.decimals ?? 18);
  const { tokenAddress, tokenIsMock } = await ensureLocalToken(tokenConfig);
  await verifyTokenMetadata(tokenConfigPath, ethers.provider, tokenIsMock);

  const governanceTarget = requireAddress(
    'Governance multisig',
    pickAddress(
      [
        process.env.GOVERNANCE_ADDRESS,
        deploymentOverrides.governance,
        tokenConfig.governance?.govSafe,
        tokenConfig.governance?.timelock,
        deployerAddress,
      ],
      { allowZero: false }
    )
  );

  const treasury = requireAddress(
    'Treasury address',
    pickAddress([process.env.TREASURY_ADDRESS, deploymentOverrides.treasury], {
      allowZero: true,
    }),
    { allowZero: true }
  );

  const ctx: DeploymentContext = {
    deployer,
    governanceTarget,
    treasury,
    decimals,
    tokenAddress,
    tokenIsMock,
    tokenConfig,
    ensConfig,
  };

  console.log(`Deploying with signer ${deployerAddress} on ${network.name}`);
  console.log(`AGIALPHA token: ${tokenAddress}`);
  console.log(`Governance target: ${governanceTarget}`);
  console.log(`Treasury: ${treasury}`);

  const contracts = await deployContracts(ctx);
  await runIntegrationScenario(ctx, contracts);
  await transferOwnership(ctx, contracts);

  console.log('Deployment complete. Addresses:');
  console.log(`  StakeManager        ${await contracts.stake.getAddress()}`);
  console.log(
    `  ReputationEngine    ${await contracts.reputation.getAddress()}`
  );
  console.log(`  IdentityRegistry    ${await contracts.identity.getAddress()}`);
  console.log(
    `  ValidationModule    ${await contracts.validation.getAddress()}`
  );
  console.log(`  DisputeModule       ${await contracts.dispute.getAddress()}`);
  console.log(
    `  ArbitratorCommittee ${await contracts.committee.getAddress()}`
  );
  console.log(
    `  CertificateNFT      ${await contracts.certificate.getAddress()}`
  );
  console.log(`  FeePool             ${await contracts.feePool.getAddress()}`);
  console.log(`  JobRegistry         ${await contracts.registry.getAddress()}`);
  console.log(
    `  TaxPolicy           ${await contracts.taxPolicy.getAddress()}`
  );
  console.log(
    `  AttestationRegistry ${await contracts.attestation.getAddress()}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
