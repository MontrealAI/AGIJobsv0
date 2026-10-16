import { stageProtocol } from '../deploy/stage-protocol.cjs';
import { readImplementationAddresses } from '../deploy/implementations.cjs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { artifacts, ethers, network, run } from 'hardhat';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../constants';
import { loadEnsConfig, loadTokenConfig } from '../config';
const { buildDeploymentCandidate } = require('./lib/deployment-candidate.cjs');
const { reserveDeploymentOutput } = require('./lib/reserved-output.cjs');
const { archiveVerification } = require('../deploy/archive-verification.cjs');
const {
  createVerifiedArtifactReader,
} = require('../deploy/verified-artifact.cjs');

const {
  createAuthorityHandover,
  validateAuthorityRoles,
  acquireDeploymentLock,
  readRecoveryEvidence,
  assertNewAddress,
  assertCreationScope,
} = require('../deploy/authority-handover.cjs');
const {
  createAuthoritySourceReader,
} = require('../deploy/authority-runtime.cjs');
const { auditAuthority } = require('../deploy/authority-audit.cjs');

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
  jobStakeBps?: unknown;
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
  campaign?: { chainId: number; blockNumber: number; blockHash: string };
  authority?: {
    stakeManagerTreasury: string;
    feePoolTreasury: string;
    feePoolGovernance: string;
  };
  econ?: EconConfig;
  identity?: IdentityConfig;
  tax?: TaxConfig;
  output?: unknown;
  secureDefaults?: { pauseOnLaunch?: boolean; [key: string]: unknown };
}

async function ensureAgialphaToken(): Promise<void> {
  const localNetworks = new Set(['hardhat', 'localhost', 'anvil']);
  if (!localNetworks.has(network.name)) {
    return;
  }

  let decimals: number | undefined;
  try {
    const token = await ethers.getContractAt(
      ['function decimals() view returns (uint8)'],
      AGIALPHA
    );
    decimals = Number(await token.decimals());
    if (decimals === AGIALPHA_DECIMALS) {
      return;
    }
    console.warn(
      `⚠️  AGIALPHA token at ${AGIALPHA} reports ${decimals} decimals; reinstalling local stub`
    );
  } catch (error) {
    // Fall through to install a local stub.
    console.warn(
      `⚠️  AGIALPHA token missing on ${network.name}; installing LocalAgialpha stub`
    );
  }

  const agiArtifact = await artifacts.readArtifact(
    'contracts/v2/mocks/LocalAgialpha.sol:LocalAgialpha'
  );
  const setCodePayload = [AGIALPHA, agiArtifact.deployedBytecode];
  const setCodeMethods = ['hardhat_setCode', 'anvil_setCode'];
  let seeded = false;
  for (const method of setCodeMethods) {
    try {
      await network.provider.send(method, setCodePayload);
      seeded = true;
      break;
    } catch (err) {
      const message = String((err as Error).message ?? err);
      if (!message.toLowerCase().includes('method not found')) {
        throw err;
      }
    }
  }
  if (!seeded) {
    throw new Error(
      `Unable to install LocalAgialpha stub: provider does not support ${setCodeMethods.join(
        ' or '
      )}`
    );
  }

  const [defaultSigner] = await ethers.getSigners();
  const token = await ethers.getContractAt(
    [
      'function mint(address to,uint256 amount) external',
      'function decimals() view returns (uint8)',
    ],
    AGIALPHA
  );
  const mintAmount = ethers.parseUnits('1000000', AGIALPHA_DECIMALS);
  const gasLimitOverride = await getLocalGasLimitOverride();
  await token.mint(defaultSigner.address, mintAmount, {
    ...(gasLimitOverride ? { gasLimit: gasLimitOverride } : {}),
  });
  console.log(
    `🔧 Provisioned LocalAgialpha stub at ${AGIALPHA} with ${ethers.formatUnits(
      mintAmount,
      AGIALPHA_DECIMALS
    )} tokens for signer ${defaultSigner.address}`
  );
}

const MAX_UINT96 = (1n << 96n) - 1n;
const DEFAULT_TAX_URI = 'ipfs://policy';
const DEFAULT_TAX_DESCRIPTION =
  'All taxes on participants; contract and owner exempt';
const LOCAL_NETWORKS = new Set(['hardhat', 'localhost', 'anvil']);

async function getLocalGasLimitOverride(): Promise<bigint | undefined> {
  if (!LOCAL_NETWORKS.has(network.name)) {
    return undefined;
  }
  const latestBlock = await ethers.provider.getBlock('latest');
  const blockGasLimit = latestBlock?.gasLimit;
  if (!blockGasLimit || blockGasLimit <= 1n) {
    return undefined;
  }
  // EIP-7825 caps individual Osaka transactions independently of the block.
  // This conservative local-only ceiling also works on pre-Osaka dev chains.
  const transactionGasCap = 16_777_216n;
  return blockGasLimit - 1n < transactionGasCap
    ? blockGasLimit - 1n
    : transactionGasCap;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  const switches = new Set(['help', 'skip-verify', 'with-tax', 'no-tax']);
  const values = new Set([
    'config',
    'output',
    'governance',
    'tax-uri',
    'tax-description',
    'fee',
    'burn',
    'employer-slash',
    'treasury-slash',
    'validator-slash',
    'commit-window',
    'reveal-window',
    'min-stake',
    'job-stake-bps',
    'ens',
    'name-wrapper',
    'club-root',
    'agent-root',
    'validator-merkle',
    'agent-merkle',
    'resume-deployer',
    'resume-evidence',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--'))
      throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (Object.prototype.hasOwnProperty.call(args, key))
      throw new Error(`Duplicate option: --${key}`);
    if (switches.has(key)) {
      args[key] = true;
      continue;
    }
    if (!values.has(key))
      throw new Error(`Unknown option: --${key}. Use --help.`);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      throw new Error(`Missing value for --${key}`);
    }
  }
  return args;
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
    if (!allowZero) throw new Error(`${label} cannot be the zero address`);
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
  const scaled = numeric > 0 && numeric < 1 ? numeric * 100 : numeric;
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
    const seconds = Number(trimmed);
    if (!Number.isSafeInteger(seconds))
      throw new Error(`${label} must be a safe integer number of seconds`);
    return seconds;
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
    if (!Number.isSafeInteger(seconds))
      throw new Error(
        `${label} must resolve to a safe integer number of seconds`
      );
    return seconds;
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
    if (
      !Number.isFinite(extracted) ||
      extracted < 0 ||
      extracted > Number.MAX_SAFE_INTEGER
    ) {
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

async function verify(address: string, args: any[] = [], contract?: string) {
  try {
    await run('verify:verify', {
      address,
      constructorArguments: args,
      ...(contract ? { contract } : {}),
    });
    return { address, status: 'verified' };
  } catch (err) {
    // Provider errors may contain credential-bearing URLs. Keep reports public-safe.
    console.error(
      `Explorer verification incomplete for ${address}; inspect the explorer and retry verification separately.`
    );
    return { address, status: 'pending' };
  }
}

function reportNumber(value: bigint, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error(
      `${label} exceeds the deployment report's safe integer range`
    );
  return number;
}

export function parseJobStakeBps(value: unknown): number {
  if (!/^[0-9]+$/.test(String(value)))
    throw new Error('jobStakeBps must be an integer from 0 to 10000');
  const bps = Number(value);
  if (!Number.isSafeInteger(bps) || bps > 10000)
    throw new Error('jobStakeBps must be an integer from 0 to 10000');
  return bps;
}

export async function main(argv = process.argv.slice(2)) {
  const cli = parseArgs(argv);
  if (cli.help) {
    console.log(
      'Staged deployment: sends transactions. Public networks require a reviewed config and fresh output file.\nHardhat: DEPLOY_DEFAULTS_CONFIG=<file> DEPLOY_DEFAULTS_OUTPUT=<new-file> npx hardhat run scripts/v2/deployDefaults.ts --network sepolia\nRead-only preflight: npm run deploy:plan -- --network sepolia --config <file>\nRecovery: set DEPLOYER_ADDRESS and DEPLOY_DEFAULTS_RESUME_EVIDENCE to the prior report; use a NEW output file with the SAME config. Public execution requires DEPLOYMENT_LOCK_DIRECTORY. Explicit distinct governance and separate authority roles are required.\nLocal rehearsal: DEPLOY_DEFAULTS_CONFIG=<reviewed-local.json> DEPLOY_DEFAULTS_SKIP_VERIFY=1 npx hardhat run scripts/v2/deployDefaults.ts\nUse docs/deployment-v2-agialpha.md. This command does not certify production readiness.'
    );
    return;
  }
  const envOutput = toStringOrUndefined(process.env.DEPLOY_DEFAULTS_OUTPUT);
  const skipVerifyEnv = (
    process.env.DEPLOY_DEFAULTS_SKIP_VERIFY || ''
  ).toLowerCase();
  const skipVerify =
    LOCAL_NETWORKS.has(network.name) ||
    cli['skip-verify'] === true ||
    skipVerifyEnv === '1' ||
    skipVerifyEnv === 'true';
  const envConfig = toStringOrUndefined(process.env.DEPLOY_DEFAULTS_CONFIG);
  const configPath =
    (cli.config && typeof cli.config === 'string' ? cli.config : undefined) ||
    envConfig;
  const configBytes = configPath
    ? fs.readFileSync(path.resolve(configPath), 'utf8')
    : '{}';
  let config = configPath
    ? (JSON.parse(configBytes) as DeployerConfig)
    : ({} as DeployerConfig);

  if (Object.prototype.hasOwnProperty.call(config.econ ?? {}, 'jobStake'))
    throw new Error(
      'Legacy econ.jobStake uses token amounts and is unsupported; explicitly configure econ.jobStakeBps'
    );
  const publicNetwork = !LOCAL_NETWORKS.has(network.name);
  const outputCandidate =
    toStringOrUndefined(cli.output) ??
    envOutput ??
    toStringOrUndefined(config.output);
  if (publicNetwork) {
    if (!configPath || !outputCandidate)
      throw new Error(
        'Public deployment requires DEPLOY_DEFAULTS_CONFIG and a fresh DEPLOY_DEFAULTS_OUTPUT. Run deploy:plan first.'
      );
    if (
      Object.keys(cli).some(
        (key) =>
          ![
            'config',
            'output',
            'resume-deployer',
            'resume-evidence',
            'skip-verify',
          ].includes(key)
      )
    )
      throw new Error(
        'Public deployment parameters must come from the reviewed JSON, without CLI overrides.'
      );
    const token = loadTokenConfig({ network: network.name }).config;
    if (
      ethers.getAddress(token.address) !== ethers.getAddress(AGIALPHA) ||
      token.decimals !== AGIALPHA_DECIMALS
    )
      throw new Error(
        'Compiled token constants differ from the selected network. Recompile for that network before deployment.'
      );
    const candidate = await buildDeploymentCandidate({
      network: network.name,
      config,
      configBytes,
      token,
      provider: ethers.provider,
      readArtifact: createVerifiedArtifactReader(),
    });
    if (candidate.blockers.length)
      throw new Error(
        `Deployment preflight blocked: ${candidate.blockers
          .map((item) => `${item.gate}: ${item.detail}`)
          .join('; ')}`
      );
    config = candidate.config;
  }
  if (cli['with-tax'] && cli['no-tax'])
    throw new Error('Choose either --with-tax or --no-tax.');
  if (
    config.secureDefaults?.pauseOnLaunch !== undefined &&
    typeof config.secureDefaults.pauseOnLaunch !== 'boolean'
  )
    throw new Error('secureDefaults.pauseOnLaunch must be boolean');
  const pauseOnLaunch =
    publicNetwork || config.secureDefaults?.pauseOnLaunch !== false;
  if (!pauseOnLaunch)
    throw new Error('The authority-handover route requires a paused launch');
  const externalProfilePath = process.env.DEPLOYMENT_EXTERNAL_PROFILE;
  if (
    externalProfilePath &&
    Object.keys(cli).some(
      (key) =>
        ![
          'config',
          'output',
          'resume-deployer',
          'resume-evidence',
          'skip-verify',
        ].includes(key)
    )
  )
    throw new Error(
      'External-manual contract parameters must come only from the exact reviewed configuration'
    );
  if (
    externalProfilePath &&
    publicNetwork &&
    (!Array.isArray((network.config as any).accounts) ||
      (network.config as any).accounts.length !== 0)
  )
    throw new Error(
      'External-manual public profile requires no configured key, mnemonic, or unlocked network accounts'
    );
  const externalProfile = externalProfilePath
    ? require('../deploy/external-profile.cjs').loadExternalProfile(
        externalProfilePath,
        {
          provider: ethers.provider,
          root: process.cwd(),
          configBytes,
          configPath,
        }
      )
    : undefined;
  const owner = externalProfile?.signer ?? (await ethers.getSigners())[0];
  if (!owner)
    throw new Error('No deployment signer configured for this network');

  const configGovernance = toStringOrUndefined(config.governance);
  if (!configGovernance && !toStringOrUndefined(cli.governance))
    throw new Error(
      'Explicit governance/config required. For a disposable Hardhat rehearsal use npm run deploy:local (demo/aurora/config/deployer.hardhat.json); public networks require your separately reviewed deployment config.'
    );
  const governance = requireAddress(
    'Governance',
    toStringOrUndefined(cli.governance) ?? configGovernance
  );

  const creator = ethers.getAddress(await owner.getAddress());
  const authorityRoles = validateAuthorityRoles(
    { governance, authority: config.authority },
    creator
  );

  const taxConfig: TaxConfig = config.tax ?? {};
  const cliWithTax = cli['with-tax'] === true;
  const cliNoTax = cli['no-tax'] === true;
  const withTax = cliWithTax
    ? true
    : cliNoTax
    ? false
    : taxConfig.enabled ?? true;

  if (externalProfile && !withTax)
    throw new Error(
      'Initial external-manual profile requires the exact tax-enabled 39-operation scope'
    );
  if (externalProfile && externalProfile.plan.governor !== governance)
    throw new Error(
      'External reviewed governor differs from deployment configuration'
    );

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
    jobStakeBps: parseJobStakeBps(
      cli['job-stake-bps'] ?? econConfig.jobStakeBps ?? 1000
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

  const identityConfig: IdentityConfig = config.identity ?? {};

  const { config: ensConfig } = loadEnsConfig({
    persist: false,
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

  const outputPath = path.resolve(
    outputCandidate ?? `reports/deployment-${network.name}-${Date.now()}.json`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const resumeAddress =
    toStringOrUndefined(cli['resume-deployer']) ?? process.env.DEPLOYER_ADDRESS;
  const resumeFile =
    toStringOrUndefined(cli['resume-evidence']) ??
    process.env.DEPLOY_DEFAULTS_RESUME_EVIDENCE;
  if (Boolean(resumeAddress) !== Boolean(resumeFile))
    throw new Error(
      'Recovery requires both the recorded coordinator and DEPLOY_DEFAULTS_RESUME_EVIDENCE (the prior complete report or journal checkpoint).'
    );
  const previous = resumeFile
    ? readRecoveryEvidence(path.resolve(resumeFile))
    : undefined;
  const configSha256 = createHash('sha256').update(configBytes).digest('hex');
  if (
    previous &&
    (previous.authorityJournalVersion !== (externalProfile ? 2 : 1) ||
      previous.provenance !== 'new-staged-creation' ||
      !previous.deploymentId ||
      !previous.authorityOperations?.['create:Deployer'] ||
      ethers.getAddress(
        previous.authorityOperations['create:Deployer'].address
      ) !== ethers.getAddress(resumeAddress!))
  )
    throw new Error(
      'Recovery requires the original new-creation journal; historical addressbooks cannot authorize this writer'
    );
  if (
    previous &&
    (previous.schema !== 'agi-jobs/staged-deployment/v1' ||
      previous.chainId !== chainId ||
      previous.creator !== creator ||
      previous.governance !== governance ||
      previous.configSha256 !== configSha256 ||
      (externalProfile &&
        previous.externalPlanHash !== externalProfile.session.planHash) ||
      ethers.getAddress(
        previous.coordinator ??
          previous.authorityOperations['create:Deployer'].address
      ) !== ethers.getAddress(resumeAddress!))
  )
    throw new Error(
      'Deployment configuration changed or recovery evidence belongs to another chain, creator or coordinator'
    );
  const initialBlock = await ethers.provider.getBlock(
    externalProfile ? externalProfile.plan.initialBlock.number : 'latest'
  );
  const localGenesis = publicNetwork
    ? undefined
    : await ethers.provider.getBlock(0);
  const campaign =
    config.campaign ??
    (localGenesis
      ? { chainId, blockNumber: 0, blockHash: localGenesis.hash }
      : undefined);
  if (!campaign)
    throw new Error(
      'Public creation requires an explicit reviewed campaign block anchor'
    );
  const creationScope = previous
    ? previous.creationScope
    : {
        chainId,
        creator,
        governance,
        campaign,
        initialBlock: {
          number: initialBlock!.number,
          hash: initialBlock!.hash,
          timestamp: initialBlock!.timestamp,
        },
      };
  if (JSON.stringify(creationScope?.campaign) !== JSON.stringify(campaign))
    throw new Error(
      'Recovery campaign differs from the reviewed configuration'
    );
  await assertCreationScope(ethers.provider, chainId, creationScope);
  if (externalProfile) {
    if (
      process.env.DEPLOYMENT_LOCK_DIRECTORY &&
      process.env.DEPLOYMENT_LOCK_DIRECTORY !==
        externalProfile.plan.lockDirectory
    )
      throw new Error('External lock directory differs from the reviewed plan');
    const { digest } = require('../deploy/external-session.cjs');
    if (
      externalProfile.plan.chainId !== chainId ||
      externalProfile.plan.creator !== creator ||
      externalProfile.plan.configHash !== `0x${configSha256}` ||
      externalProfile.plan.creationScopeHash !== digest(creationScope)
    )
      throw new Error(
        'External reviewed plan differs from the source-bound creation scope'
      );
    if (!fs.existsSync(externalProfile.sessionDirectory))
      await externalProfile.session.initialize();
    else await externalProfile.session.inspect();
  }
  if (previous) {
    assertNewAddress(resumeAddress!);
    for (const record of Object.values(previous.creationRecords ?? {}) as any[])
      assertNewAddress(record.address);
  }
  const output = reserveDeploymentOutput(outputPath);
  let journal;
  try {
    journal = reserveDeploymentOutput(`${outputPath}.journal.jsonl`);
  } catch (error) {
    output.close();
    throw error;
  }
  const progress: Record<string, unknown> = {
    schema: 'agi-jobs/staged-deployment/v1',
    authorityJournalVersion: externalProfile ? 2 : 1,
    ...(externalProfile
      ? { externalPlanHash: externalProfile.session.planHash }
      : {}),
    provenance: 'new-staged-creation',
    deploymentId: previous?.deploymentId ?? randomUUID(),
    status: 'prepared',
    network: network.name,
    chainId,
    governance,
    creator,
    authority: authorityRoles,
    authorityOperations: previous?.authorityOperations ?? {},
    creationScope,
    token: AGIALPHA,
    pauseOnLaunch,
    configSha256,
    transactions: previous?.transactions ?? [],
    creationRecords: {},
    productionApproved: false,
    journal: `${outputPath}.journal.jsonl`,
  };
  function checkpoint(values: Record<string, unknown>) {
    Object.assign(progress, values, { updatedAt: new Date().toISOString() });
    journal.append(
      JSON.stringify(progress, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ) + '\n'
    );
    output.write(
      JSON.stringify(
        progress,
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
        2
      ) + '\n'
    );
  }
  console.log(`Deployment evidence: ${outputPath}`);
  let deploymentLock;
  let completed = false;
  try {
    checkpoint({});
    if (publicNetwork) {
      checkpoint({
        verificationBundle: archiveVerification(`${outputPath}.verification`),
      });
    }
    const lockDirectory =
      externalProfile?.plan.lockDirectory ??
      process.env.DEPLOYMENT_LOCK_DIRECTORY ??
      (publicNetwork
        ? undefined
        : path.join(os.tmpdir(), 'agi-deployment-locks'));
    if (!externalProfile && !publicNetwork && lockDirectory)
      fs.mkdirSync(lockDirectory, { recursive: true, mode: 0o700 });
    deploymentLock = externalProfile
      ? {
          path: path.join(
            externalProfile.plan.lockDirectory,
            `${chainId}-${creator.toLowerCase()}`
          ),
        }
      : acquireDeploymentLock(lockDirectory, {
          chainId,
          creator,
          governance,
          configSha256,
          outputPath,
        });
    checkpoint({ deploymentLock: deploymentLock.path });
    const readAuthoritySource = createAuthoritySourceReader();
    const authority = createAuthorityHandover({
      provider: ethers.provider,
      signer: owner,
      runtime: ethers,
      chainId,
      creator,
      governance,
      creationScope,
      token: AGIALPHA,
      readSource: readAuthoritySource,
      operations: progress.authorityOperations,
      checkpoint,
    });
    if (previous) await authority.reconcile();
    if (!externalProfile) await ensureAgialphaToken();
    else {
      const token = new ethers.Contract(
        AGIALPHA,
        ['function decimals() view returns(uint8)'],
        ethers.provider
      );
      if (Number(await token.decimals()) !== AGIALPHA_DECIMALS)
        throw new Error(
          'External signing requires the reviewed token already present; no fixture or balance changes'
        );
    }

    const gasLimitOverride = await getLocalGasLimitOverride();
    const txOverrides = gasLimitOverride ? { gasLimit: gasLimitOverride } : {};

    const deployer = await authority.deploy('Deployer', txOverrides);
    if (
      resumeAddress &&
      ethers.getAddress(resumeAddress) !== (await deployer.getAddress())
    )
      throw new Error(
        'Coordinator differs from the canonical creation journal'
      );
    checkpoint({
      status: 'coordinator-recorded',
      coordinator: await deployer.getAddress(),
    });
    await deployer.waitForDeployment();
    const deployerAddress = await deployer.getAddress();
    if (
      (await ethers.provider.getCode(deployerAddress)) !==
      (await artifacts.readArtifact('contracts/v2/Deployer.sol:Deployer'))
        .deployedBytecode
    )
      throw new Error(
        'Coordinator runtime differs from this compiled release; use its matching release for recovery.'
      );
    const alreadyFinalized = await deployer.deployed();
    const coordinatorOwner = ethers.getAddress(await deployer.owner());
    if (
      coordinatorOwner !== creator &&
      !(alreadyFinalized && coordinatorOwner === governance)
    )
      throw new Error(
        'Unexpected coordinator owner; unfinished deployment requires its creation signer'
      );
    const configuration = JSON.parse(
      JSON.stringify(
        {
          chainId,
          token: AGIALPHA,
          governance,
          authority: authorityRoles,
          creationScope,
          econ,
          identity,
          pauseOnLaunch,
          tax: withTax
            ? { uri: requestedTaxUri, description: requestedTaxDescription }
            : null,
          secureDefaults: Object.fromEntries(
            Object.entries(config.secureDefaults ?? {}).sort(([a], [b]) =>
              a.localeCompare(b)
            )
          ),
        },
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
      )
    );
    const configurationHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(configuration))
    );
    checkpoint({ configuration, configurationHash });
    const committed = await deployer.configurationHash();
    if (committed !== ethers.ZeroHash && committed !== configurationHash)
      throw new Error(
        'Deployment configuration changed. Resume using the exact reviewed parameters; no further transactions were sent.'
      );
    if (committed === ethers.ZeroHash) {
      if (alreadyFinalized)
        throw new Error(
          'Finalized coordinator has no matching plan commitment. Reconcile it using the original deployment procedure.'
        );
      const operation = await authority.send(
        'commit',
        'Deployer',
        deployerAddress,
        deployer.interface.encodeFunctionData('commitConfiguration', [
          configurationHash,
        ]),
        txOverrides
      );
      checkpoint({
        configurationHash,
        configurationTransaction: operation.hash,
      });
    }
    checkpoint({
      configurationHash,
      status: alreadyFinalized ? 'recovering-finalized' : 'staging',
      coordinator: deployerAddress,
    });
    console.log('Deployment coordinator:', deployerAddress);
    console.log(
      `To resume an interrupted run, use DEPLOYER_ADDRESS=${deployerAddress} with the same configuration.`
    );

    const creationRecords: Record<
      string,
      {
        address: string;
        args: unknown[];
        source: string;
        constructorArguments: string;
      }
    > = {
      Deployer: {
        address: deployerAddress,
        args: [],
        source: 'contracts/v2/Deployer.sol:Deployer',
        constructorArguments: '0x',
      },
    };
    await stageProtocol(deployer, identity, governance, {
      authority,
      econ,
      withTaxPolicy: withTax,
      tax: { uri: requestedTaxUri, description: requestedTaxDescription },
      overrides: txOverrides,
      onSubmitted: async (name, hash) => {
        (progress.transactions as Array<unknown>).push({ name, hash });
        checkpoint({});
      },
      onDeployed: async (name, contract, args, source) => {
        const address = await contract.getAddress();
        creationRecords[name] = {
          address,
          args,
          source,
          constructorArguments: contract.interface.encodeDeploy(args),
        };
        checkpoint({ creationRecords });
        console.log(`${name} deployed at ${address}`);
      },
    });

    if (!alreadyFinalized) {
      if (!pauseOnLaunch)
        throw new Error(
          'The authority-handover route requires a paused launch'
        );
      const operation = await authority.send(
        'finalize',
        'Deployer',
        deployerAddress,
        deployer.interface.encodeFunctionData('deployPaused', [
          econ,
          identity,
          governance,
          withTax,
        ]),
        txOverrides
      );
      checkpoint({
        status: 'finalization-recorded',
        finalizationTransaction: operation.hash,
      });
      const receipt = await ethers.provider.getTransactionReceipt(
        operation.hash
      );
      const deployLog = receipt.logs.find(
        (log) =>
          log.address.toLowerCase() === deployerAddress.toLowerCase() &&
          log.topics[0] === deployer.interface.getEvent('Deployed')!.topicHash
      );
      if (!deployLog) {
        throw new Error('Deployment transaction missing Deployed event');
      }
      checkpoint({
        status: 'finalized',
        finalizationBlock: receipt.blockNumber,
      });
    }

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
    ] = Array.from(await deployer.stagedModules()) as string[];

    // Report confirmed contract state, not duplicated defaults that can drift
    // from the deployed implementation (including burn and timing parameters).
    const deployedStake = await ethers.getContractAt(
      'contracts/v2/StakeManager.sol:StakeManager',
      stakeManager
    );
    const deployedRegistry = await ethers.getContractAt(
      'contracts/v2/JobRegistry.sol:JobRegistry',
      jobRegistry
    );
    const deployedValidation = await ethers.getContractAt(
      'contracts/v2/ValidationModule.sol:ValidationModule',
      validationModule
    );
    const deployedPool = await ethers.getContractAt(
      'contracts/v2/FeePool.sol:FeePool',
      feePool
    );
    const [
      effectiveFeePct,
      effectiveBurnPct,
      effectiveEmployerSlash,
      effectiveTreasurySlash,
      effectiveValidatorSlash,
      effectiveCommitWindow,
      effectiveRevealWindow,
      effectiveMinStake,
      effectiveJobStakeBps,
    ] = await Promise.all([
      deployedRegistry.feePct(),
      deployedPool.burnPct(),
      deployedStake.employerSlashPct(),
      deployedStake.treasurySlashPct(),
      deployedStake.validatorSlashRewardPct(),
      deployedValidation.commitWindow(),
      deployedValidation.revealWindow(),
      deployedStake.minStake(),
      deployedRegistry.jobStakeBps(),
    ]);

    const pendingOwnership: Array<{
      contract: string;
      address: string;
      pendingOwner: string;
    }> = [];
    for (const [name, address] of [
      ['IdentityRegistry', identityRegistry],
      ...(withTax ? [['TaxPolicy', taxPolicy]] : []),
    ]) {
      const ownable = await ethers.getContractAt(
        [
          'function owner() view returns (address)',
          'function pendingOwner() view returns (address)',
          'function acceptOwnership()',
        ],
        address,
        owner
      );
      const currentOwner = ethers.getAddress(await ownable.owner());
      if (currentOwner === ethers.getAddress(governance)) continue;
      if (currentOwner !== ethers.getAddress(deployerAddress))
        throw new Error(`${name} has an unexpected current owner`);
      const pendingOwner = await ownable.pendingOwner();
      if (ethers.getAddress(pendingOwner) !== ethers.getAddress(governance))
        throw new Error(
          `${name} pending governance does not match the requested owner`
        );
      pendingOwnership.push({ contract: name, address, pendingOwner });
    }
    if (pendingOwnership.length) {
      console.log(
        'Governance acceptance required before commissioning:',
        pendingOwnership
      );
    }

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
        jobStakeBps: effectiveJobStakeBps.toString(),
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

    const implementations = await readImplementationAddresses({
      StakeManager: stakeManager,
      JobRegistry: jobRegistry,
      ValidationModule: validationModule,
    });
    for (const [name, address] of Object.entries(implementations)) {
      creationRecords[name] = {
        address: address as string,
        args: [],
        source: `contracts/v2/implementation/${name}.sol:${name}`,
        constructorArguments: '0x',
      };
    }
    checkpoint({ creationRecords, implementations });
    const explorerVerification: Array<{ address: string; status: string }> = [];
    if (!skipVerify) {
      for (const { address, args, source } of Object.values(creationRecords)) {
        explorerVerification.push(await verify(address, args, source));
      }
    } else {
      explorerVerification.push({
        address: deployerAddress,
        status: 'skipped',
      });
      console.log(
        '\nExplorer verification skipped for this run; it remains a commissioning requirement on public networks.'
      );
    }

    let appliedTaxUri: string | null = null;
    let appliedTaxDescription: string | null = null;
    if (withTax) {
      const policy = await ethers.getContractAt(
        'contracts/v2/TaxPolicy.sol:TaxPolicy',
        taxPolicy
      );
      [appliedTaxUri, appliedTaxDescription] = await Promise.all([
        policy.policyURI(),
        policy.acknowledgement(),
      ]);
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
      ArbitratorCommittee: (await deployer.stagedModules())[13],
    } as Record<string, string>;

    console.log('\nDeployment summary');
    console.table(summary);

    const payload = {
      timestamp: new Date().toISOString(),
      network: network.name,
      governance,
      pendingOwnership,
      withTax,
      taxPolicy: withTax
        ? {
            address: taxPolicy,
            uri: appliedTaxUri,
            acknowledgement: appliedTaxDescription,
          }
        : null,
      econ: {
        feePct: reportNumber(effectiveFeePct, 'feePct'),
        burnPct: reportNumber(effectiveBurnPct, 'burnPct'),
        employerSlashPct: reportNumber(
          effectiveEmployerSlash,
          'employerSlashPct'
        ),
        treasurySlashPct: reportNumber(
          effectiveTreasurySlash,
          'treasurySlashPct'
        ),
        validatorSlashRewardPct: reportNumber(
          effectiveValidatorSlash,
          'validatorSlashRewardPct'
        ),
        commitWindow: reportNumber(effectiveCommitWindow, 'commitWindow'),
        revealWindow: reportNumber(effectiveRevealWindow, 'revealWindow'),
        minStake: effectiveMinStake.toString(),
        jobStakeBps: effectiveJobStakeBps.toString(),
      },
      identity,
      contracts: summary,
      implementations,
      creationRecords,
    };
    const managed = [
      stakeManager,
      jobRegistry,
      validationModule,
      reputationEngine,
      disputeModule,
      platformRegistry,
      feePool,
      (await deployer.stagedModules())[13],
    ];
    const pauseState = await Promise.all(
      managed.map(async (address) => {
        const module = await ethers.getContractAt(
          [
            'function paused() view returns (bool)',
            'function owner() view returns (address)',
          ],
          address
        );
        return {
          address,
          paused: await module.paused(),
          owner: await module.owner(),
        };
      })
    );
    const pause = await ethers.getContractAt(
      'contracts/v2/SystemPause.sol:SystemPause',
      systemPause
    );
    if (
      ethers.getAddress(await pause.owner()) !== governance ||
      pauseState.some(
        (item) =>
          ethers.getAddress(item.owner) !== ethers.getAddress(systemPause)
      )
    )
      throw new Error(
        'Observed ownership differs from the expected SystemPause/governance topology.'
      );
    const allPaused = pauseState.every((item) => item.paused);
    // Record the complete fixed-source/constructor inventory before the final
    // coordinator transfer. External treasury/governance roles stay manual.
    checkpoint({ ...payload, pauseState, explorerVerification });
    await authority.reconcile();
    const beforeHandover = await auditAuthority(progress, {
      allowPendingCoordinatorHandover: Boolean(
        externalProfile &&
          !(progress.authorityOperations as Record<string, unknown>)[
            'handover:Deployer'
          ]
      ),
      provider: ethers.provider,
      readSource: readAuthoritySource,
      blockTag: 'latest',
    });
    const pendingCommissioning =
      /^(Deployer\.owner$|(?:IdentityRegistry|TaxPolicy)\.(?:owner|pendingOwner)$|StakeManager\.treasury(?:$|Allowlist\()|FeePool\.(?:governance$|treasury(?:$|Allowlist\())|ENS\.|NameWrapper\.)/;
    if (
      beforeHandover.boundedBlockers.some(
        (role) => !pendingCommissioning.test(role)
      )
    )
      throw new Error(
        'Fixed wiring or deployment-granted authority differs from the reviewed topology'
      );
    if (!allPaused)
      throw new Error('Authority handover requires all managed modules paused');
    await authority.handover('Deployer', deployerAddress);
    const authorityCertificate = await auditAuthority(progress, {
      provider: ethers.provider,
      readSource: readAuthoritySource,
      blockTag: 'latest',
    });
    checkpoint({
      authorityCertificate,
      activationReady: false,
      ...payload,
      status: allPaused ? 'awaiting-commissioning' : 'requires-pause-review',
      pauseState,
      explorerVerification,
      requestedSecureDefaults: config.secureDefaults ?? {},
      remainingActions: [
        'Complete pending two-step ownership acceptance and explicit FeePool governance/treasury and StakeManager treasury configuration.',
        'Run signer-free authority-audit.cjs at a finalized block for bounded observations. Complete setup-history/indirect-authority and exact explorer-acceptance qualification are still required; activation remains blocked.',
        'Review and apply launch limits through the actual governance authority.',
        'Complete source verification and independent security/worker/settlement commissioning before governance unpauses the stack.',
      ],
    });
    completed = true;
    console.log(`Deployment evidence written to ${outputPath}`);
    console.log(
      allPaused
        ? '\nDeployment recorded. Managed modules remain paused for commissioning.'
        : '\nDeployment recorded. Inspect pause state before commissioning.'
    );
  } catch (error) {
    try {
      checkpoint({
        status:
          (error as any)?.code === 'AWAITING_EXTERNAL_SIGNATURE'
            ? 'awaiting-external-manual-signature'
            : 'interrupted',
        recovery:
          'Reconcile recorded transactions and coordinator state. Resume the same release and configuration using DEPLOYER_ADDRESS, DEPLOY_DEFAULTS_RESUME_EVIDENCE and a NEW output filename. Retained sender locks require manual receipt reconciliation before removal.',
      });
    } catch {
      /* Preserve existing evidence if its reservation was changed. */
    }
    if ((error as any)?.code === 'AWAITING_EXTERNAL_SIGNATURE') {
      console.log(
        'External operation prepared or awaiting canonical observation. Continue through the private manual session; no transaction was sent.'
      );
      return { status: 'awaiting-external-manual-signature', outputPath };
    }
    throw error;
  } finally {
    journal.close();
    output.close();
    if (completed && !externalProfile) deploymentLock?.release();
  }
}

if (require.main === module)
  main().catch((err) => {
    const message = err?.code
      ? 'RPC, filesystem or transaction operation failed. Inspect the retained evidence and provider privately; reconcile before retrying.'
      : String(err?.message ?? 'Unknown deployment failure');
    console.error(`Deployment stopped: ${message}`);
    process.exitCode = 1;
  });
