import * as fs from 'fs';
import * as path from 'path';
import { ethers, network, run } from 'hardhat';
import { AGIALPHA_DECIMALS } from '../constants';
import { loadEnsConfig } from '../config';

type CliArgs = Record<string, string | boolean>;

interface TaxConfig {
  enabled?: boolean;
  uri?: string;
  description?: string;
}

interface EconConfig {
  feePct?: unknown;
  burnPct?: unknown;
  employerSlashPct?: unknown;
  treasurySlashPct?: unknown;
  validatorSlashRewardPct?: unknown;
  commitWindow?: unknown;
  revealWindow?: unknown;
  minStake?: unknown;
  jobStake?: unknown;
}

interface IdentityConfig {
  ens?: unknown;
  nameWrapper?: unknown;
  clubRootNode?: unknown;
  agentRootNode?: unknown;
  validatorMerkleRoot?: unknown;
  agentMerkleRoot?: unknown;
}

interface DeployerConfig {
  governance?: unknown;
  econ?: EconConfig;
  identity?: IdentityConfig;
  tax?: TaxConfig;
  output?: unknown;
}

const MAX_UINT96 = (1n << 96n) - 1n;
const DEFAULT_TAX_URI = 'ipfs://policy';
const DEFAULT_TAX_DESCRIPTION =
  'All taxes on participants; contract and owner exempt';

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJsonConfig(filePath: string): DeployerConfig {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Configuration file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Unable to parse configuration JSON at ${resolved}: ${
        (err as Error).message
      }`
    );
  }
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return JSON.stringify(value);
}

function unwrapValue(value: unknown, keys: string[]): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value === 'object') {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const candidate = (value as Record<string, unknown>)[key];
        if (candidate !== undefined && candidate !== null) {
          return candidate;
        }
      }
    }
  }
  return value;
}

function requireAddress(
  label: string,
  value: unknown,
  { allowZero = false }: { allowZero?: boolean } = {}
): string {
  const extracted = unwrapValue(value, ['address', 'value']);
  const str = toStringOrUndefined(extracted);
  if (!str) {
    if (allowZero) return ethers.ZeroAddress;
    throw new Error(`${label} address is required`);
  }
  if (str.toLowerCase() === 'zero') {
    return ethers.ZeroAddress;
  }
  try {
    const addr = ethers.getAddress(str);
    if (!allowZero && addr === ethers.ZeroAddress) {
      throw new Error(`${label} cannot be the zero address`);
    }
    return addr;
  } catch (err) {
    throw new Error(
      `${label} address ${str} is invalid: ${(err as Error).message}`
    );
  }
}

function optionalAddress(label: string, value: unknown): string {
  const extracted = unwrapValue(value, ['address', 'value']);
  if (extracted === undefined || extracted === null || extracted === '') {
    return ethers.ZeroAddress;
  }
  const str = toStringOrUndefined(extracted);
  if (!str) {
    return ethers.ZeroAddress;
  }
  if (str.toLowerCase() === 'zero') {
    return ethers.ZeroAddress;
  }
  try {
    return ethers.getAddress(str);
  } catch (err) {
    throw new Error(
      `${label} address ${str} is invalid: ${(err as Error).message}`
    );
  }
}

function parsePercentage(value: unknown, label: string): number {
  const extracted = unwrapValue(value, ['percentage', 'pct', 'value']);
  if (extracted === undefined || extracted === null || extracted === '') {
    return 0;
  }
  const str = toStringOrUndefined(extracted);
  if (!str) return 0;
  const numeric = Number(str);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${label} must be a positive number`);
  }
  const scaled = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
  if (!Number.isInteger(scaled)) {
    throw new Error(`${label} must be an integer percentage between 0 and 100`);
  }
  if (scaled > 100) {
    throw new Error(`${label} cannot exceed 100`);
  }
  return scaled;
}

function parseDuration(value: unknown, label: string): number {
  const extracted = unwrapValue(value, ['seconds', 'value']);
  if (extracted === undefined || extracted === null || extracted === '') {
    return 0;
  }
  const str = toStringOrUndefined(extracted);
  if (!str) return 0;
  const trimmed = str.replace(/_/g, '').toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const match = trimmed.match(/^([0-9]*\.?[0-9]+)([smhdw])$/);
  if (match) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      throw new Error(`${label} duration ${value} is not finite`);
    }
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 60 * 60 * 24,
      w: 60 * 60 * 24 * 7,
    };
    const seconds = amount * multipliers[unit];
    return Math.round(seconds);
  }
  throw new Error(
    `${label} must be provided in seconds or as <value><s|m|h|d|w>. Received ${value}`
  );
}

function parseTokenAmount(value: unknown, label: string): bigint {
  const extracted = unwrapValue(value, [
    'raw',
    'baseUnits',
    'wei',
    'tokens',
    'amount',
    'value',
  ]);
  if (extracted === undefined || extracted === null || extracted === '') {
    return 0n;
  }
  if (typeof extracted === 'bigint') {
    return extracted;
  }
  if (typeof extracted === 'number') {
    if (!Number.isFinite(extracted) || extracted < 0) {
      throw new Error(`${label} must be a non-negative number`);
    }
    return ethers.parseUnits(extracted.toString(), AGIALPHA_DECIMALS);
  }
  const str = toStringOrUndefined(extracted);
  if (!str) {
    return 0n;
  }
  const cleaned = str.replace(/_/g, '').trim();
  if (!cleaned) return 0n;
  if (cleaned.startsWith('0x')) {
    try {
      return BigInt(cleaned);
    } catch (err) {
      throw new Error(
        `${label} could not be parsed as a hex value: ${(err as Error).message}`
      );
    }
  }
  if (!/^[0-9]+(\.[0-9]+)?$/.test(cleaned)) {
    throw new Error(
      `${label} must be a decimal token amount or 0x-prefixed integer`
    );
  }
  return ethers.parseUnits(cleaned, AGIALPHA_DECIMALS);
}

function parseBytes32(value: unknown, label: string): string {
  const extracted = unwrapValue(value, ['node', 'hash', 'value']);
  if (extracted === undefined || extracted === null || extracted === '') {
    return ethers.ZeroHash;
  }
  const str = toStringOrUndefined(extracted);
  if (!str) return ethers.ZeroHash;
  if (str.toLowerCase() === 'zero') {
    return ethers.ZeroHash;
  }
  if (str.startsWith('0x')) {
    if (!ethers.isHexString(str)) {
      throw new Error(`${label} must be a valid hex string`);
    }
    const bytes = ethers.getBytes(str);
    if (bytes.length !== 32) {
      throw new Error(`${label} must be exactly 32 bytes`);
    }
    return ethers.hexlify(bytes);
  }
  try {
    return ethers.namehash(str);
  } catch (err) {
    throw new Error(
      `${label} must be a bytes32 value or ENS name: ${(err as Error).message}`
    );
  }
}

async function verify(address: string, args: any[] = []) {
  try {
    await run('verify:verify', {
      address,
      constructorArguments: args,
    });
  } catch (err) {
    console.error(`verification failed for ${address}`, err);
  }
}

async function main() {
  const [owner] = await ethers.getSigners();
  const cli = parseArgs(process.argv.slice(2));
  const envOutput = toStringOrUndefined(process.env.DEPLOY_DEFAULTS_OUTPUT);
  const skipVerifyEnv = (process.env.DEPLOY_DEFAULTS_SKIP_VERIFY || '').toLowerCase();
  const skipVerify =
    cli['skip-verify'] === true ||
    skipVerifyEnv === '1' ||
    skipVerifyEnv === 'true';
  const envConfig = toStringOrUndefined(process.env.DEPLOY_DEFAULTS_CONFIG);
  const configPath =
    (cli.config && typeof cli.config === 'string' ? cli.config : undefined) ||
    envConfig;
  const config = configPath
    ? readJsonConfig(configPath)
    : ({} as DeployerConfig);

  const configGovernance = toStringOrUndefined(config.governance);
  const governance =
    toStringOrUndefined(cli.governance) ?? configGovernance ?? owner.address;

  const taxConfig: TaxConfig = config.tax ?? {};
  const cliWithTax = cli['with-tax'] === true;
  const cliNoTax = cli['no-tax'] === true;
  const withTax = cliWithTax
    ? true
    : cliNoTax
    ? false
    : taxConfig.enabled ?? true;

  const requestedTaxUri =
    toStringOrUndefined(cli['tax-uri']) ?? taxConfig.uri ?? DEFAULT_TAX_URI;
  const requestedTaxDescription =
    toStringOrUndefined(cli['tax-description']) ??
    taxConfig.description ??
    DEFAULT_TAX_DESCRIPTION;

  const econConfig: EconConfig = config.econ ?? {};
  const econ = {
    feePct: parsePercentage(
      toStringOrUndefined(cli.fee) ?? econConfig.feePct,
      'Protocol fee percentage'
    ),
    burnPct: parsePercentage(
      toStringOrUndefined(cli.burn) ?? econConfig.burnPct,
      'Fee burn percentage'
    ),
    employerSlashPct: parsePercentage(
      toStringOrUndefined(cli['employer-slash']) ?? econConfig.employerSlashPct,
      'Employer slash percentage'
    ),
    treasurySlashPct: parsePercentage(
      toStringOrUndefined(cli['treasury-slash']) ?? econConfig.treasurySlashPct,
      'Treasury slash percentage'
    ),
    validatorSlashRewardPct: parsePercentage(
      toStringOrUndefined(cli['validator-slash']) ??
        econConfig.validatorSlashRewardPct,
      'Validator slash reward percentage'
    ),
    commitWindow: parseDuration(
      toStringOrUndefined(cli['commit-window']) ?? econConfig.commitWindow,
      'Commit window'
    ),
    revealWindow: parseDuration(
      toStringOrUndefined(cli['reveal-window']) ?? econConfig.revealWindow,
      'Reveal window'
    ),
    minStake: parseTokenAmount(
      toStringOrUndefined(cli['min-stake']) ?? econConfig.minStake,
      'Global minimum stake'
    ),
    jobStake: parseTokenAmount(
      toStringOrUndefined(cli['job-stake']) ?? econConfig.jobStake,
      'Per-job validator stake'
    ),
  };

  if (
    econ.employerSlashPct !== 0 ||
    econ.treasurySlashPct !== 0 ||
    econ.validatorSlashRewardPct !== 0
  ) {
    const total =
      econ.employerSlashPct +
      econ.treasurySlashPct +
      econ.validatorSlashRewardPct;
    if (total !== 100) {
      throw new Error(
        'Employer, treasury and validator slash percentages must sum to 100 when any is set'
      );
    }
  }

  if (econ.minStake < 0) {
    throw new Error('Global minimum stake must be non-negative');
  }
  if (econ.jobStake < 0) {
    throw new Error('Per-job validator stake must be non-negative');
  }
  if (econ.jobStake > MAX_UINT96) {
    throw new Error('Per-job validator stake exceeds uint96 range');
  }

  const hasEconOverrides =
    econ.feePct !== 0 ||
    econ.burnPct !== 0 ||
    econ.employerSlashPct !== 0 ||
    econ.treasurySlashPct !== 0 ||
    econ.validatorSlashRewardPct !== 0 ||
    econ.commitWindow !== 0 ||
    econ.revealWindow !== 0 ||
    econ.minStake !== 0n ||
    econ.jobStake !== 0n;

  const identityConfig: IdentityConfig = config.identity ?? {};

  const { config: ensConfig } = loadEnsConfig({
    network: network.name,
    chainId: network.config?.chainId,
  });
  const roots = ensConfig.roots ?? {};

  const identity = {
    ens: requireAddress(
      'ENS registry',
      toStringOrUndefined(cli.ens) ?? identityConfig.ens ?? ensConfig.registry
    ),
    nameWrapper: optionalAddress(
      'ENS NameWrapper',
      toStringOrUndefined(cli['name-wrapper']) ??
        identityConfig.nameWrapper ??
        ensConfig.nameWrapper
    ),
    clubRootNode: parseBytes32(
      toStringOrUndefined(cli['club-root']) ??
        identityConfig.clubRootNode ??
        roots.club?.node,
      'Club root node'
    ),
    agentRootNode: parseBytes32(
      toStringOrUndefined(cli['agent-root']) ??
        identityConfig.agentRootNode ??
        roots.agent?.node,
      'Agent root node'
    ),
    validatorMerkleRoot: parseBytes32(
      toStringOrUndefined(cli['validator-merkle']) ??
        identityConfig.validatorMerkleRoot ??
        roots.club?.merkleRoot,
      'Validator Merkle root'
    ),
    agentMerkleRoot: parseBytes32(
      toStringOrUndefined(cli['agent-merkle']) ??
        identityConfig.agentMerkleRoot ??
        roots.agent?.merkleRoot,
      'Agent Merkle root'
    ),
  };

  if (
    identity.clubRootNode === ethers.ZeroHash ||
    identity.agentRootNode === ethers.ZeroHash
  ) {
    throw new Error(
      'Agent and club root nodes are required. Provide them via config or CLI options.'
    );
  }

  const Deployer = await ethers.getContractFactory(
    'contracts/v2/Deployer.sol:Deployer'
  );
  const deployer = await Deployer.deploy();
  await deployer.waitForDeployment();
  const deployerAddress = await deployer.getAddress();
  console.log('Deployer deployed at', deployerAddress);

  const tx = withTax
    ? hasEconOverrides
      ? await deployer.deploy(econ, identity, governance)
      : await deployer.deployDefaults(identity, governance)
    : hasEconOverrides
    ? await deployer.deployWithoutTaxPolicy(econ, identity, governance)
    : await deployer.deployDefaultsWithoutTaxPolicy(identity, governance);

  const receipt = await tx.wait();
  const deployLog = receipt.logs.find((log) => log.address === deployerAddress);
  if (!deployLog) {
    throw new Error('Deployment transaction missing Deployed event');
  }
  const decoded = deployer.interface.decodeEventLog(
    'Deployed',
    deployLog.data,
    deployLog.topics
  );

  const [
    stakeManager,
    jobRegistry,
    validationModule,
    reputationEngine,
    disputeModule,
    certificateNFT,
    platformRegistry,
    jobRouter,
    platformIncentives,
    feePool,
    taxPolicy,
    identityRegistry,
    systemPause,
  ] = decoded as string[];

  const effectiveFeePct = econ.feePct === 0 ? 5 : econ.feePct;
  const effectiveBurnPct = econ.burnPct === 0 ? 5 : econ.burnPct;
  const effectiveEmployerSlash =
    econ.employerSlashPct === 0 && econ.treasurySlashPct === 0
      ? 0
      : econ.employerSlashPct;
  const effectiveTreasurySlash =
    econ.employerSlashPct === 0 && econ.treasurySlashPct === 0
      ? 100
      : econ.treasurySlashPct;
  const effectiveValidatorSlash =
    econ.employerSlashPct === 0 &&
    econ.treasurySlashPct === 0 &&
    econ.validatorSlashRewardPct === 0
      ? 0
      : econ.validatorSlashRewardPct;
  const effectiveCommitWindow =
    econ.commitWindow === 0 ? 1_800 : econ.commitWindow;
  const effectiveRevealWindow =
    econ.revealWindow === 0 ? 1_800 : econ.revealWindow;
  const defaultStake = ethers.parseUnits('1', AGIALPHA_DECIMALS);
  const effectiveMinStake = econ.minStake === 0n ? defaultStake : econ.minStake;
  const effectiveJobStake = econ.jobStake === 0n ? defaultStake : econ.jobStake;

  console.log('\nEconomic parameters applied');
  console.table(
    Object.entries({
      feePct: `${effectiveFeePct}%`,
      burnPct: `${effectiveBurnPct}%`,
      employerSlashPct: `${effectiveEmployerSlash}%`,
      treasurySlashPct: `${effectiveTreasurySlash}%`,
      validatorSlashRewardPct: `${effectiveValidatorSlash}%`,
      commitWindowSeconds: effectiveCommitWindow,
      revealWindowSeconds: effectiveRevealWindow,
      minStakeWei: effectiveMinStake.toString(),
      jobStakeWei: effectiveJobStake.toString(),
    }).map(([parameter, value]) => ({ parameter, value }))
  );

  console.log('\nIdentity parameters applied');
  console.table(
    Object.entries({
      ens: identity.ens,
      nameWrapper: identity.nameWrapper,
      clubRootNode: identity.clubRootNode,
      agentRootNode: identity.agentRootNode,
      validatorMerkleRoot: identity.validatorMerkleRoot,
      agentMerkleRoot: identity.agentMerkleRoot,
    }).map(([parameter, value]) => ({ parameter, value }))
  );

  if (!skipVerify) {
    await verify(deployerAddress);
    await verify(stakeManager, [
      effectiveMinStake,
      effectiveEmployerSlash,
      effectiveTreasurySlash,
      governance,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      deployerAddress,
    ]);
    await verify(jobRegistry, [
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      effectiveFeePct,
      effectiveJobStake,
      [stakeManager],
      deployerAddress,
    ]);
    await verify(validationModule, [
      jobRegistry,
      stakeManager,
      effectiveCommitWindow,
      effectiveRevealWindow,
      0,
      0,
      [],
    ]);
    await verify(reputationEngine, [stakeManager]);
    await verify(disputeModule, [jobRegistry, 0, 0, ethers.ZeroAddress]);
    await verify(certificateNFT, ['Cert', 'CERT']);
    await verify(platformRegistry, [stakeManager, reputationEngine, 0]);
    await verify(jobRouter, [platformRegistry]);
    await verify(platformIncentives, [stakeManager, platformRegistry, jobRouter]);
    await verify(feePool, [
      stakeManager,
      effectiveBurnPct,
      ethers.ZeroAddress,
      withTax ? taxPolicy : ethers.ZeroAddress,
    ]);
    await verify(identityRegistry, [
      identity.ens,
      identity.nameWrapper,
      reputationEngine,
      identity.agentRootNode,
      identity.clubRootNode,
    ]);
    await verify(systemPause, [
      jobRegistry,
      stakeManager,
      validationModule,
      disputeModule,
      platformRegistry,
      feePool,
      reputationEngine,
      governance,
    ]);
    if (withTax) {
      await verify(taxPolicy, [DEFAULT_TAX_URI, DEFAULT_TAX_DESCRIPTION]);
    }
  } else {
    console.log('\nSkipping contract verification (DEPLOY_DEFAULTS_SKIP_VERIFY enabled).');
  }

  let appliedTaxUri = DEFAULT_TAX_URI;
  let appliedTaxDescription = DEFAULT_TAX_DESCRIPTION;
  if (withTax) {
    const shouldUpdatePolicy =
      requestedTaxUri !== DEFAULT_TAX_URI ||
      requestedTaxDescription !== DEFAULT_TAX_DESCRIPTION;
    if (shouldUpdatePolicy) {
      let governanceSigner: typeof owner | null = null;
      if (governance.toLowerCase() === owner.address.toLowerCase()) {
        governanceSigner = owner;
      } else {
        try {
          governanceSigner = await ethers.getSigner(governance);
        } catch (err) {
          if (network.name === 'hardhat' || network.name === 'localhost') {
            try {
              await network.provider.request({
                method: 'hardhat_impersonateAccount',
                params: [governance],
              });
              governanceSigner = await ethers.getSigner(governance);
            } catch (impersonateErr) {
              console.warn(
                `Unable to impersonate governance ${governance}: ${
                  (impersonateErr as Error).message
                }`
              );
            }
          }
          if (!governanceSigner) {
            console.warn(
              `Unable to obtain signer for governance address ${governance}. Update the tax policy manually via setPolicy(uri, text).`
            );
          }
        }
      }
      if (governanceSigner) {
        const taxContract = await ethers.getContractAt(
          'contracts/v2/TaxPolicy.sol:TaxPolicy',
          taxPolicy,
          governanceSigner
        );
        try {
          const policyTx = await taxContract.setPolicy(
            requestedTaxUri,
            requestedTaxDescription
          );
          const receipt = await policyTx.wait();
          appliedTaxUri = requestedTaxUri;
          appliedTaxDescription = requestedTaxDescription;
          console.log(
            `Updated tax policy metadata in tx ${receipt?.hash ?? '<unknown>'}`
          );
        } catch (err) {
          console.warn(
            `Automatic tax policy update failed: ${
              (err as Error).message
            }. Use setPolicy(uri, text) manually if required.`
          );
        }
      }
    }
  }

  const summary = {
    StakeManager: stakeManager,
    JobRegistry: jobRegistry,
    ValidationModule: validationModule,
    ReputationEngine: reputationEngine,
    DisputeModule: disputeModule,
    CertificateNFT: certificateNFT,
    PlatformRegistry: platformRegistry,
    JobRouter: jobRouter,
    PlatformIncentives: platformIncentives,
    FeePool: feePool,
    TaxPolicy: withTax ? taxPolicy : 'disabled',
    IdentityRegistry: identityRegistry,
    SystemPause: systemPause,
  } as Record<string, string>;

  console.log('\nDeployment summary');
  console.table(summary);

  const outputCandidate =
    toStringOrUndefined(cli.output) ??
    toStringOrUndefined(config.output) ??
    envOutput;

  if (outputCandidate) {
    const outputPath = path.resolve(outputCandidate);
    const payload = {
      timestamp: new Date().toISOString(),
      network: network.name,
      governance,
      withTax,
      taxPolicy: withTax
        ? {
            address: taxPolicy,
            uri: appliedTaxUri,
            acknowledgement: appliedTaxDescription,
          }
        : null,
      econ: {
        feePct: effectiveFeePct,
        burnPct: effectiveBurnPct,
        employerSlashPct: effectiveEmployerSlash,
        treasurySlashPct: effectiveTreasurySlash,
        validatorSlashRewardPct: effectiveValidatorSlash,
        commitWindow: effectiveCommitWindow,
        revealWindow: effectiveRevealWindow,
        minStake: effectiveMinStake.toString(),
        jobStake: effectiveJobStake.toString(),
      },
      identity,
      contracts: summary,
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    console.log(`Deployment summary written to ${outputPath}`);
  }

  console.log('\nDeployment complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
