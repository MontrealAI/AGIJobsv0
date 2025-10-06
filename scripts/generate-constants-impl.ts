import * as fs from 'fs';
import * as path from 'path';
import * as ethersNamespace from 'ethers';
import { loadTokenConfig } from './config';

const namespace = (ethersNamespace as unknown) as {
  ethers?: typeof import('ethers');
};
const ethersLib: typeof import('ethers') =
  namespace.ethers ?? ((ethersNamespace as unknown) as typeof import('ethers'));

function assertAddress(
  value: string,
  label: string,
  { allowZero = false }: { allowZero?: boolean } = {}
): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  if (!ethersLib.isAddress(value)) {
    throw new Error(`${label} must be a valid Ethereum address`);
  }
  const normalised = ethersLib.getAddress(value);
  if (!allowZero && normalised === ethersLib.ZeroAddress) {
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

function readPositiveInteger(
  raw: string,
  label: string,
  { minimum = 1 }: { minimum?: number } = {}
): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be an integer`);
  }
  const numeric = Number.parseInt(raw, 10);
  if (!Number.isFinite(numeric) || numeric < minimum) {
    throw new Error(`${label} must be >= ${minimum}`);
  }
  return numeric;
}

function readPercentagePoints(
  raw: string | undefined,
  label: string,
  fallback: number,
  { minimum = 0, maximum = 100 }: { minimum?: number; maximum?: number } = {}
): number {
  const trimmed = raw?.trim();
  const value = trimmed === undefined || trimmed === ''
    ? fallback
    : Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be an integer`);
  }
  if (value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function readWindowSeconds(
  raw: string | undefined,
  label: string,
  fallback: number
): number {
  const trimmed = raw?.trim();
  const value = trimmed === undefined || trimmed === ''
    ? fallback
    : Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be an integer`);
  }
  if (value <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return value;
}

export async function main() {
  const { config } = loadTokenConfig({ network: networkArg });

  const address = assertAddress(config.address, 'AGIALPHA address');
  const decimals = assertDecimals(config.decimals);
  const burnAddress = assertAddress(
    config.burnAddress ?? ethersLib.ZeroAddress,
    'burn address',
    {
      allowZero: true,
    }
  );
  const symbol = assertSymbol(config.symbol, 'AGIALPHA symbol');
  const name = assertName(config.name, 'AGIALPHA name');

  const scale = BigInt(10) ** BigInt(decimals);

  const feePct = readPercentagePoints(process.env.FEE_PCT, 'FEE_PCT', 2, {
    minimum: 0,
  });
  const burnPct = readPercentagePoints(process.env.BURN_PCT, 'BURN_PCT', 6, {
    minimum: 0,
  });
  const treasury = assertAddress(
    process.env.TREASURY ?? '0x1111111111111111111111111111111111111111',
    'TREASURY'
  );
  const validatorsPerJob = readPositiveInteger(
    (process.env.VALIDATORS_PER_JOB ?? '3').trim(),
    'VALIDATORS_PER_JOB'
  );
  const requiredApprovals = readPositiveInteger(
    (process.env.REQUIRED_APPROVALS ?? `${validatorsPerJob}`).trim(),
    'REQUIRED_APPROVALS'
  );
  if (requiredApprovals > validatorsPerJob) {
    throw new Error(
      'REQUIRED_APPROVALS cannot exceed VALIDATORS_PER_JOB in CI defaults'
    );
  }
  const commitWindowSeconds = readWindowSeconds(
    process.env.COMMIT_WINDOW_S,
    'COMMIT_WINDOW_S',
    1800
  );
  const revealWindowSeconds = readWindowSeconds(
    process.env.REVEAL_WINDOW_S,
    'REVEAL_WINDOW_S',
    1800
  );

  const content = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.25;\n\n// Shared AGI Jobs v2 constants.\n// @dev Auto-generated by scripts/generate-constants.ts\n// Canonical $AGIALPHA token on Ethereum mainnet.\naddress constant AGIALPHA = ${address};\n\n// Standard decimals for $AGIALPHA.\nuint8 constant AGIALPHA_DECIMALS = ${decimals};\n\n// ERC-20 metadata for $AGIALPHA.\nstring constant AGIALPHA_SYMBOL = ${JSON.stringify(
    symbol
  )};\nstring constant AGIALPHA_NAME = ${JSON.stringify(
    name
  )};\n\n// Base unit scaling factor for $AGIALPHA (10 ** decimals).\nuint256 constant TOKEN_SCALE = ${scale};\n\n// Address used for burning tokens.\naddress constant BURN_ADDRESS = ${burnAddress};\n\n// Protocol configuration defaults.\nuint256 constant FEE_PCT = ${feePct};\nuint256 constant BURN_PCT = ${burnPct};\nuint256 constant VALIDATORS_PER_JOB = ${validatorsPerJob};\nuint256 constant REQUIRED_APPROVALS = ${requiredApprovals};\nuint256 constant COMMIT_WINDOW_S = ${commitWindowSeconds};\nuint256 constant REVEAL_WINDOW_S = ${revealWindowSeconds};\naddress constant TREASURY = ${treasury};\n`;

  const outPath = path.join(__dirname, '..', 'contracts', 'v2', 'Constants.sol');
  fs.writeFileSync(outPath, content);
  console.log(`Generated ${outPath}`);

  const generatedDir = path.join(__dirname, 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  const protocolDefaults = {
    feePct,
    burnPct,
    treasury,
    validatorsPerJob,
    requiredApprovals,
    commitWindowS: commitWindowSeconds,
    revealWindowS: revealWindowSeconds,
  } as const;

  const generatedTs = `// Auto-generated by scripts/generate-constants.ts\n// Do not edit manually.\n\nexport interface ProtocolDefaults {\n  feePct: number;\n  burnPct: number;\n  treasury: string;\n  validatorsPerJob: number;\n  requiredApprovals: number;\n  commitWindowS: number;\n  revealWindowS: number;\n}\n\nexport const PROTOCOL_DEFAULTS: ProtocolDefaults = ${JSON.stringify(
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
