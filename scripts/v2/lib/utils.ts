import { ethers } from 'ethers';

export function describeArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'bigint') {
        return arg.toString();
      }
      if (typeof arg === 'string') {
        return arg;
      }
      if (typeof arg === 'boolean') {
        return arg ? 'true' : 'false';
      }
      if (Array.isArray(arg)) {
        return `[${arg.map((value) => describeArgs([value])).join(', ')}]`;
      }
      return JSON.stringify(arg);
    })
    .join(', ');
}

export function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) {
    return false;
  }
  return ethers.getAddress(a) === ethers.getAddress(b);
}

export function normaliseAddress(
  value: string | null | undefined,
  { allowZero = true }: { allowZero?: boolean } = {}
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return allowZero ? ethers.ZeroAddress : undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return allowZero ? ethers.ZeroAddress : undefined;
  }
  const address = ethers.getAddress(trimmed);
  if (!allowZero && address === ethers.ZeroAddress) {
    return undefined;
  }
  return address;
}

export function formatToken(
  value: bigint,
  decimals: number,
  symbol: string
): string {
  return `${ethers.formatUnits(value, decimals)} ${symbol}`.trim();
}

export function parseBigInt(
  value: unknown,
  label: string,
  { allowNegative = false }: { allowNegative?: boolean } = {}
): bigint | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const asString = typeof value === 'string' ? value.trim() : String(value);
  if (!asString) {
    return undefined;
  }
  if (!/^[-+]?\d+$/.test(asString)) {
    throw new Error(`${label} must be an integer`);
  }
  const parsed = BigInt(asString);
  if (!allowNegative && parsed < 0n) {
    throw new Error(`${label} cannot be negative`);
  }
  return parsed;
}

export function parsePercentage(
  value: unknown,
  label: string,
  { max = 100 }: { max?: number } = {}
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${label} must be an integer between 0 and ${max}`);
  }
  if (numberValue < 0 || numberValue > max) {
    throw new Error(`${label} must be between 0 and ${max}`);
  }
  return numberValue;
}

export function parseBoolean(
  value: unknown,
  label: string
): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const asString = String(value).trim().toLowerCase();
  if (!asString) {
    return undefined;
  }
  if (['true', '1', 'yes', 'y', 'on', 'enable', 'enabled'].includes(asString)) {
    return true;
  }
  if (
    ['false', '0', 'no', 'n', 'off', 'disable', 'disabled'].includes(asString)
  ) {
    return false;
  }
  throw new Error(`${label} must be a boolean value`);
}

export function parseTokenAmount(
  rawValue: unknown,
  tokensValue: unknown,
  decimals: number,
  label: string
): bigint | undefined {
  const direct = parseBigInt(rawValue, label);
  if (direct !== undefined) {
    return direct;
  }
  if (tokensValue === undefined || tokensValue === null) {
    return undefined;
  }
  const asString =
    typeof tokensValue === 'string' ? tokensValue.trim() : String(tokensValue);
  if (!asString) {
    return undefined;
  }
  const parsed = ethers.parseUnits(asString, decimals);
  if (parsed < 0n) {
    throw new Error(`${label}Tokens cannot be negative`);
  }
  return parsed;
}

export function normaliseBytes32(
  value: string | Uint8Array | null | undefined,
  { allowZero = true }: { allowZero?: boolean } = {}
): string | undefined {
  if (value === undefined || value === null) {
    return allowZero ? ethers.ZeroHash : undefined;
  }
  const bytes = ethers.getBytes(value);
  if (bytes.length !== 32) {
    throw new Error(`Expected 32-byte value, received ${bytes.length}`);
  }
  const hex = ethers.hexlify(bytes).toLowerCase();
  if (!allowZero && hex === ethers.ZeroHash) {
    return undefined;
  }
  return hex;
}

export function sameBytes32(a?: string | null, b?: string | null): boolean {
  if (!a || !b) {
    return false;
  }
  try {
    return (
      ethers.hexlify(ethers.getBytes(a)).toLowerCase() ===
      ethers.hexlify(ethers.getBytes(b)).toLowerCase()
    );
  } catch (_) {
    return false;
  }
}

export function formatBytes32List(values: Iterable<string>): string {
  return Array.from(values)
    .map((value) => value.toLowerCase())
    .join(', ');
}

export function stringifyWithBigint(value: unknown, space = 2): string {
  return JSON.stringify(
    value,
    (_key, innerValue) =>
      typeof innerValue === 'bigint' ? innerValue.toString() : innerValue,
    space,
  );
}
