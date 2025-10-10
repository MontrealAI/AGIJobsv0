import * as fs from 'fs';
import * as path from 'path';
import parseDuration from './utils/parseDuration';

let ethersLib: typeof import('ethers') | undefined;

function getEthers(): typeof import('ethers') {
  if (!ethersLib) {
    throw new Error('Ethers library not initialised');
  }
  return ethersLib;
}

function assertAddress(
  value: string,
  label: string,
  { allowZero = false }: { allowZero?: boolean } = {}
): string {
  const ethers = getEthers();
  if (!value || typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`${label} must be a valid Ethereum address`);
  }
  const normalised = ethers.getAddress(value);
  if (!allowZero && normalised === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return normalised;
}

function assertDecimals(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error('decimals must be an integer');
  }
  if (value < 0 || value > 255) {
    throw new Error('decimals must be between 0 and 255');
  }
  return value;
}

function assertSymbol(value: string, label: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty`);
  }
  if (trimmed.length > 32) {
    throw new Error(`${label} must be 32 characters or fewer`);
  }
  return trimmed;
}

function assertName(value: string, label: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty`);
  }
  if (trimmed.length > 64) {
    throw new Error(`${label} must be 64 characters or fewer`);
  }
  return trimmed;
}

let networkArg: string | undefined;
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--network' && i + 1 < process.argv.length) {
    networkArg = process.argv[i + 1];
    break;
  }
  if (arg.startsWith('--network=')) {
    networkArg = arg.slice('--network='.length);
    break;
  }
}

function assertPositiveInteger(
  value: string,
  label: string,
  { minimum = 1 }: { minimum?: number } = {}
): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be an integer`);
  }
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < minimum) {
    throw new Error(`${label} must be >= ${minimum}`);
  }
  return numeric;
}

function formatDecimalString(value: number): string {
  return value.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 18,
  });
}

function normalisePercentage(
  raw: string | undefined,
  label: string,
  fallback: string
) {
  const input = (raw ?? fallback).trim();
  if (!input) {
    throw new Error(`${label} is required`);
  }
  const numeric = Number.parseFloat(input);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  const decimal = numeric > 1 ? numeric / 100 : numeric;
  if (decimal > 1) {
    throw new Error(`${label} cannot exceed 100%`);
  }
  const basisPoints = Math.round(decimal * 10_000);
  return {
    input,
    decimal,
    percent: decimal * 100,
    basisPoints,
    decimalString: formatDecimalString(decimal),
  };
}

type ParseDurationFn = (value: string, unit?: string) => number | null;

function normaliseDurationInput(
  raw: string | undefined,
  label: string,
  fallback: string,
  parseDuration: ParseDurationFn
) {
  const input = (raw ?? fallback).trim();
  if (!input) {
    throw new Error(`${label} is required`);
  }
  const milliseconds = parseDuration(input);
  if (milliseconds === null || milliseconds === undefined) {
    throw new Error(`${label} must be a valid duration string`);
  }
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds <= 0) {
    throw new Error(`${label} must be at least one second`);
  }
  return {
    input,
    seconds,
  };
}

export async function main() {
  const ethersModule = (await import('ethers')) as unknown as {
    ethers?: typeof import('ethers');
  } & typeof import('ethers');
  ethersLib = ethersModule.ethers ?? (ethersModule as typeof import('ethers'));
  const { loadTokenConfig } = await import('./config/index.js');
  const { config } = loadTokenConfig({ network: networkArg });

  const address = assertAddress(config.address, 'AGIALPHA address');
  const decimals = assertDecimals(config.decimals);
  const burnAddress = assertAddress(
    config.burnAddress ?? getEthers().ZeroAddress,
    'burn address',
    {
      allowZero: true,
    }
  );
  const symbol = assertSymbol(config.symbol, 'AGIALPHA symbol');
  const name = assertName(config.name, 'AGIALPHA name');

  const scale = BigInt(10) ** BigInt(decimals);

  const feePct = normalisePercentage(process.env.FEE_PCT, 'FEE_PCT', '0.02');
  const burnPct = normalisePercentage(
    process.env.BURN_PCT,
    'BURN_PCT',
    '0.06'
  );
  const treasury = assertAddress(
    process.env.TREASURY ?? '0x1111111111111111111111111111111111111111',
    'TREASURY'
  );
  const validatorsPerJob = assertPositiveInteger(
    (process.env.VALIDATORS_PER_JOB ?? '3').trim(),
    'VALIDATORS_PER_JOB'
  );
  const requiredApprovals = assertPositiveInteger(
    (process.env.REQUIRED_APPROVALS ?? '3').trim(),
    'REQUIRED_APPROVALS'
  );
  if (requiredApprovals > validatorsPerJob) {
    throw new Error(
      'REQUIRED_APPROVALS cannot exceed VALIDATORS_PER_JOB in CI defaults'
    );
  }
  const commitWindow = normaliseDurationInput(
    process.env.COMMIT_WINDOW,
    'COMMIT_WINDOW',
    '30m',
    parseDuration
  );
  const revealWindow = normaliseDurationInput(
    process.env.REVEAL_WINDOW,
    'REVEAL_WINDOW',
    '30m',
    parseDuration
  );

  const content = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.25;\n\n// Shared AGI Jobs v2 constants.\n// @dev Auto-generated by scripts/generate-constants.ts\n// Canonical $AGIALPHA token on Ethereum mainnet.\naddress constant AGIALPHA = ${address};\n\n// Standard decimals for $AGIALPHA.\nuint8 constant AGIALPHA_DECIMALS = ${decimals};\n\n// ERC-20 metadata for $AGIALPHA.\nstring constant AGIALPHA_SYMBOL = ${JSON.stringify(
    symbol
  )};\nstring constant AGIALPHA_NAME = ${JSON.stringify(
    name
  )};\n\n// Base unit scaling factor for $AGIALPHA (10 ** decimals).\nuint256 constant TOKEN_SCALE = ${scale};\n\n// Address used for burning tokens.\naddress constant BURN_ADDRESS = ${burnAddress};\n`;

  const outPath = path.join(__dirname, '..', 'contracts', 'v2', 'Constants.sol');
  fs.writeFileSync(outPath, content);
  console.log(`Generated ${outPath}`);

  const generatedDir = path.join(__dirname, 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  const protocolDefaults = {
    feePct: feePct.decimalString,
    feePctPercent: feePct.percent,
    feePctBasisPoints: feePct.basisPoints,
    burnPct: burnPct.decimalString,
    burnPctPercent: burnPct.percent,
    burnPctBasisPoints: burnPct.basisPoints,
    treasury,
    validatorsPerJob,
    requiredApprovals,
    commitWindow: commitWindow.input,
    commitWindowSeconds: commitWindow.seconds,
    revealWindow: revealWindow.input,
    revealWindowSeconds: revealWindow.seconds,
  };

  const generatedTs = `// Auto-generated by scripts/generate-constants.ts\n// Do not edit manually.\n\nexport interface ProtocolDefaults {\n  feePct: string;\n  feePctPercent: number;\n  feePctBasisPoints: number;\n  burnPct: string;\n  burnPctPercent: number;\n  burnPctBasisPoints: number;\n  treasury: string;\n  validatorsPerJob: number;\n  requiredApprovals: number;\n  commitWindow: string;\n  commitWindowSeconds: number;\n  revealWindow: string;\n  revealWindowSeconds: number;\n}\n\nexport const PROTOCOL_DEFAULTS: ProtocolDefaults = ${JSON.stringify(
    protocolDefaults,
    null,
    2
  )} as const;\n`;

  const generatedTsPath = path.join(generatedDir, 'protocol-defaults.ts');
  fs.writeFileSync(generatedTsPath, generatedTs);
  console.log(`Generated ${generatedTsPath}`);

  const generatedJsonPath = path.join(
    __dirname,
    '..',
    'deployment-config',
    'generated'
  );
  fs.mkdirSync(generatedJsonPath, { recursive: true });
  const protocolDefaultsJsonPath = path.join(
    generatedJsonPath,
    'protocol-defaults.json'
  );
  fs.writeFileSync(
    protocolDefaultsJsonPath,
    `${JSON.stringify(protocolDefaults, null, 2)}\n`
  );
  console.log(`Generated ${protocolDefaultsJsonPath}`);
}
