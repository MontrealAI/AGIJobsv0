import { stageProtocol } from '../deploy/stage-protocol.cjs';
import { readImplementationAddresses } from '../deploy/implementations.cjs';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';
import { artifacts, ethers, network, run } from 'hardhat';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../constants';
import { loadEnsConfig, loadTokenConfig } from '../config';
const { buildDeploymentCandidate } = require('./lib/deployment-candidate.cjs');
const { reserveDeploymentOutput } = require('./lib/reserved-output.cjs');
const {
  createVerifiedArtifactReader,
} = require('../deploy/verified-artifact.cjs');

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
    'job-stake',
    'ens',
    'name-wrapper',
    'club-root',
    'agent-root',
    'validator-merkle',
    'agent-merkle',
    'resume-deployer',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--'))
      throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (Object.hasOwn(args, key)) throw new Error(`Duplicate option: --${key}`);
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

export async function main(argv = process.argv.slice(2)) {
  const cli = parseArgs(argv);
  if (cli.help) {
    console.log(
      'Staged deployment: sends transactions. Public networks require a reviewed config and fresh output file.\nHardhat: DEPLOY_DEFAULTS_CONFIG=<file> DEPLOY_DEFAULTS_OUTPUT=<new-file> npx hardhat run scripts/v2/deployDefaults.ts --network sepolia\nRead-only preflight: npm run deploy:plan -- --network sepolia --config <file>\nRecovery: set DEPLOYER_ADDRESS to the recorded coordinator and use a NEW output file with the SAME config.\nLocal rehearsal: DEPLOY_DEFAULTS_SKIP_VERIFY=1 npx hardhat run scripts/v2/deployDefaults.ts\nUse docs/deployment-v2-agialpha.md. This command does not certify production readiness.'
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
          !['config', 'output', 'resume-deployer', 'skip-verify'].includes(key)
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
  const [owner] = await ethers.getSigners();
  if (!owner)
    throw new Error('No deployment signer configured for this network');

  const configGovernance = toStringOrUndefined(config.governance);
  const governance = requireAddress(
    'Governance',
    toStringOrUndefined(cli.governance) ?? configGovernance ?? owner.address
  );

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

  const outputPath = path.resolve(
    outputCandidate ?? `reports/deployment-${network.name}-${Date.now()}.json`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
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
    status: 'prepared',
    network: network.name,
    chainId,
    governance,
    token: AGIALPHA,
    pauseOnLaunch,
    configSha256: createHash('sha256').update(configBytes).digest('hex'),
    transactions: [],
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
  try {
    checkpoint({});
    await ensureAgialphaToken();

    const gasLimitOverride = await getLocalGasLimitOverride();
    const txOverrides = gasLimitOverride ? { gasLimit: gasLimitOverride } : {};

    const Deployer = await ethers.getContractFactory(
      'contracts/v2/Deployer.sol:Deployer'
    );
    const resumeAddress =
      toStringOrUndefined(cli['resume-deployer']) ??
      process.env.DEPLOYER_ADDRESS;
    const deployer = resumeAddress
      ? Deployer.attach(ethers.getAddress(resumeAddress))
      : await Deployer.deploy({ ...txOverrides });
    const coordinatorTx = deployer.deploymentTransaction();
    if (coordinatorTx)
      checkpoint({
        status: 'coordinator-submitted',
        coordinatorTransaction: coordinatorTx.hash,
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
    if (
      (await deployer.owner()).toLowerCase() !== owner.address.toLowerCase()
    ) {
      throw new Error(
        'The connected signer does not own the deployment coordinator'
      );
    }
    const alreadyFinalized = await deployer.deployed();
    const configurationHash = ethers.keccak256(
      ethers.toUtf8Bytes(
        JSON.stringify(
          {
            chainId,
            token: AGIALPHA,
            governance,
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
          (_key, value) =>
            typeof value === 'bigint' ? value.toString() : value
        )
      )
    );
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
      const transaction = await deployer.commitConfiguration(configurationHash);
      checkpoint({
        configurationHash,
        configurationTransaction: transaction.hash,
      });
      await transaction.wait();
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
      { address: string; args: unknown[]; source: string }
    > = {};
    await stageProtocol(deployer, identity, governance, {
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
        creationRecords[name] = { address, args, source };
        checkpoint({ creationRecords });
        console.log(`${name} deployed at ${address}`);
      },
    });

    if (!alreadyFinalized) {
      const tx = pauseOnLaunch
        ? await deployer.deployPaused(
            econ,
            identity,
            governance,
            withTax,
            txOverrides
          )
        : withTax
        ? hasEconOverrides
          ? await deployer.deploy(econ, identity, governance, txOverrides)
          : await deployer.deployDefaults(identity, governance, txOverrides)
        : hasEconOverrides
        ? await deployer.deployWithoutTaxPolicy(
            econ,
            identity,
            governance,
            txOverrides
          )
        : await deployer.deployDefaultsWithoutTaxPolicy(
            identity,
            governance,
            txOverrides
          );

      checkpoint({
        status: 'finalization-submitted',
        finalizationTransaction: tx.hash,
      });
      const receipt = await tx.wait();
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
      effectiveJobStake,
    ] = await Promise.all([
      deployedRegistry.feePct(),
      deployedPool.burnPct(),
      deployedStake.employerSlashPct(),
      deployedStake.treasurySlashPct(),
      deployedStake.validatorSlashRewardPct(),
      deployedValidation.commitWindow(),
      deployedValidation.revealWindow(),
      deployedStake.minStake(),
      deployedRegistry.jobStake(),
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
      const pendingOwner = await ownable.pendingOwner();
      if (ethers.getAddress(pendingOwner) !== ethers.getAddress(governance))
        throw new Error(
          `${name} pending governance does not match the requested owner`
        );
      if (ethers.getAddress(governance) === ethers.getAddress(owner.address)) {
        const acceptance = await ownable.acceptOwnership();
        checkpoint({
          status: 'governance-acceptance-submitted',
          ownershipTransactions: [
            ...((progress.ownershipTransactions as unknown[]) ?? []),
            { contract: name, address, hash: acceptance.hash },
          ],
        });
        await acceptance.wait();
        if (
          ethers.getAddress(await ownable.owner()) !==
          ethers.getAddress(governance)
        )
          throw new Error(`${name} governance acceptance did not complete`);
      } else {
        pendingOwnership.push({ contract: name, address, pendingOwner });
      }
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

    const implementations = await readImplementationAddresses({
      StakeManager: stakeManager,
      JobRegistry: jobRegistry,
      ValidationModule: validationModule,
    });
    const explorerVerification: Array<{ address: string; status: string }> = [];
    if (!skipVerify) {
      explorerVerification.push(await verify(deployerAddress));
      for (const { address, args, source } of Object.values(creationRecords)) {
        explorerVerification.push(await verify(address, args, source));
      }
      for (const address of Object.values(implementations)) {
        explorerVerification.push(await verify(address as string, []));
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
        jobStake: effectiveJobStake.toString(),
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
    checkpoint({
      ...payload,
      status: allPaused ? 'awaiting-commissioning' : 'requires-pause-review',
      pauseState,
      explorerVerification,
      requestedSecureDefaults: config.secureDefaults ?? {},
      remainingActions: [
        'Complete pending two-step ownership acceptance.',
        'Review and apply launch limits through the actual governance authority.',
        'Complete source verification and independent security/worker/settlement commissioning before governance unpauses the stack.',
      ],
    });
    console.log(`Deployment evidence written to ${outputPath}`);
    console.log(
      allPaused
        ? '\nDeployment recorded. Managed modules remain paused for commissioning.'
        : '\nDeployment recorded. Inspect pause state before commissioning.'
    );
  } catch (error) {
    try {
      checkpoint({
        status: 'interrupted',
        recovery:
          'Reconcile recorded transactions and coordinator state. Resume the same release and configuration using DEPLOYER_ADDRESS and a NEW output filename.',
      });
    } catch {
      /* Preserve existing evidence if its reservation was changed. */
    }
    throw error;
  } finally {
    journal.close();
    output.close();
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
