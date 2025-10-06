import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';
import { loadTokenConfig } from './config';

type AddressOptions = { allowZero?: boolean };

type PositiveIntOptions = { minimum?: number };

type SecondsOptions = { minimum?: number };

function parseArgsForNetwork(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--network' && i + 1 < argv.length) {
      return argv[i + 1];
    }
    if (current?.startsWith('--network=')) {
      return current.slice('--network='.length);
    }
  }
  return undefined;
}

function assertAddress(value: unknown, label: string, options: AddressOptions = {}): string {
  const { allowZero = false } = options;
  if (typeof value !== 'string') {
    throw new Error(`${label} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  const normalised = ethers.getAddress(trimmed);
  if (!allowZero && normalised === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return normalised;
}

function assertDecimals(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  if (value < 0 || value > 255) {
    throw new Error(`${label} must be between 0 and 255`);
  }
  return value;
}

function assertSymbol(value: unknown, label: string): string {
  if (typeof value !== 'string') {
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

function assertName(value: unknown, label: string): string {
  if (typeof value !== 'string') {
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

function parseWholePercent(raw: string | undefined, label: string, fallback: number): number {
  const source = raw?.trim();
  const value = source ? Number.parseInt(source, 10) : fallback;
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  if (value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100`);
  }
  return value;
}

function parsePositiveInt(
  raw: string | undefined,
  label: string,
  fallback: number,
  options: PositiveIntOptions = {}
): number {
  const { minimum = 1 } = options;
  const source = raw?.trim();
  const value = source ? Number.parseInt(source, 10) : fallback;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  if (value < minimum) {
    throw new Error(`${label} must be >= ${minimum}`);
  }
  return value;
}

function parseSeconds(
  raw: string | undefined,
  label: string,
  fallback: number,
  options: SecondsOptions = {}
): number {
  const { minimum = 1 } = options;
  const source = raw?.trim();
  const value = source ? Number.parseInt(source, 10) : fallback;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of seconds`);
  }
  if (value < minimum) {
    throw new Error(`${label} must be >= ${minimum}`);
  }
  return value;
}

function writeFileSync(target: string, contents: string) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  console.log(`Generated ${target}`);
}

export async function main() {
  const network = parseArgsForNetwork(process.argv);
  const { config } = loadTokenConfig({ network });

  const address = assertAddress(config.address, 'AGIALPHA address');
  const decimals = assertDecimals(config.decimals, 'AGIALPHA decimals');
  const burnAddress = assertAddress(
    config.burnAddress ?? ethers.ZeroAddress,
    'burn address',
    { allowZero: true }
  );
  const symbol = assertSymbol(config.symbol, 'AGIALPHA symbol');
  const name = assertName(config.name, 'AGIALPHA name');

  const feePct = parseWholePercent(process.env.FEE_PCT, 'FEE_PCT', 2);
  const burnPct = parseWholePercent(process.env.BURN_PCT, 'BURN_PCT', 6);
  const validatorsPerJob = parsePositiveInt(
    process.env.VALIDATORS_PER_JOB,
    'VALIDATORS_PER_JOB',
    3
  );
  const requiredApprovals = parsePositiveInt(
    process.env.REQUIRED_APPROVALS,
    'REQUIRED_APPROVALS',
    validatorsPerJob,
    { minimum: 1 }
  );
  if (requiredApprovals > validatorsPerJob) {
    throw new Error('REQUIRED_APPROVALS cannot exceed VALIDATORS_PER_JOB');
  }

  const commitWindowSeconds = parseSeconds(
    process.env.COMMIT_WINDOW_S,
    'COMMIT_WINDOW_S',
    1800
  );
  const revealWindowSeconds = parseSeconds(
    process.env.REVEAL_WINDOW_S,
    'REVEAL_WINDOW_S',
    1800
  );

  const treasury = assertAddress(
    process.env.TREASURY ?? '0x1111111111111111111111111111111111111111',
    'TREASURY'
  );

  const tokenScale = (BigInt(10) ** BigInt(decimals)).toString();

  const solidityOutput = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.25;\n\n// Shared AGI Jobs v2 constants.\n// @dev Auto-generated by scripts/generate-constants.ts\n// Canonical $AGIALPHA token on Ethereum mainnet.\naddress constant AGIALPHA = ${address};\n\n// Standard decimals for $AGIALPHA.\nuint8 constant AGIALPHA_DECIMALS = ${decimals};\n\n// ERC-20 metadata for $AGIALPHA.\nstring constant AGIALPHA_SYMBOL = ${JSON.stringify(symbol)};\nstring constant AGIALPHA_NAME = ${JSON.stringify(name)};\n\n// Base unit scaling factor for $AGIALPHA (10 ** decimals).\nuint256 constant TOKEN_SCALE = ${tokenScale};\n\n// Address used for burning tokens.\naddress constant BURN_ADDRESS = ${burnAddress};\n`;

  writeFileSync(path.join(__dirname, '..', 'contracts', 'v2', 'Constants.sol'), solidityOutput);

  const protocolDefaults = {
    feePct,
    feePctPercent: feePct,
    feePctBasisPoints: feePct * 100,
    burnPct,
    burnPctPercent: burnPct,
    burnPctBasisPoints: burnPct * 100,
    treasury,
    validatorsPerJob,
    requiredApprovals,
    commitWindowSeconds,
    revealWindowSeconds,
  } as const;

  const tsOutput = `// Auto-generated by scripts/generate-constants.ts\n// Do not edit manually.\n\nexport interface ProtocolDefaults {\n  feePct: number;\n  feePctPercent: number;\n  feePctBasisPoints: number;\n  burnPct: number;\n  burnPctPercent: number;\n  burnPctBasisPoints: number;\n  treasury: string;\n  validatorsPerJob: number;\n  requiredApprovals: number;\n  commitWindowSeconds: number;\n  revealWindowSeconds: number;\n}\n\nexport const PROTOCOL_DEFAULTS: ProtocolDefaults = ${JSON.stringify(
    protocolDefaults,
    null,
    2
  )} as const;\n`;

  writeFileSync(path.join(__dirname, 'generated', 'protocol-defaults.ts'), tsOutput);

  const jsonOutput = `${JSON.stringify(protocolDefaults, null, 2)}\n`;
  writeFileSync(
    path.join(__dirname, '..', 'deployment-config', 'generated', 'protocol-defaults.json'),
    jsonOutput
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
