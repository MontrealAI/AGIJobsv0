import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import type { JsonRpcProvider, Wallet } from 'ethers';
import { ethers } from 'hardhat';

export interface AgentSeed {
  address: string;
  subdomain?: string;
  profileURI?: string;
}

export interface ParticipantSeed {
  address: string;
  jobId: number;
  subdomain?: string;
  proof?: string[];
}

export interface ArtifactSeed {
  kind: string;
  uri: string;
  parentId?: number;
  citations?: number[];
  subdomain?: string;
  proof?: string[];
  mintedId?: number;
}

export interface FeePoolSeedConfig {
  contributor: string;
  amount: string;
  token?: string;
}

export interface CultureContractsConfig {
  identityRegistry: string;
  jobRegistry: string;
  stakeManager: string;
  feePool: string;
  cultureRegistry?: string;
  selfPlayArena?: string;
}

export interface CultureConfig {
  network: string;
  owner: {
    address: string;
    pauseGuardian?: string;
  };
  dependencies: CultureContractsConfig;
  culture: {
    kinds: string[];
    maxCitations: number;
  };
  arena: {
    teacherReward: string;
    studentReward: string;
    validatorReward: string;
    committeeSize: number;
    validatorStake: string;
    targetSuccessRateBps: number;
    defaultDifficulty: number;
  };
  orchestrators?: string[];
  contracts?: {
    cultureRegistry?: string;
    selfPlayArena?: string;
  };
  seed?: {
    agents?: {
      authors?: AgentSeed[];
      teachers?: AgentSeed[];
      students?: AgentSeed[];
      validators?: AgentSeed[];
      orchestrators?: string[];
    };
    artifacts?: ArtifactSeed[];
    feePool?: FeePoolSeedConfig;
  };
  sampleRound?: {
    mode?: 'onchain' | 'stub';
    difficulty?: number;
    teacher: ParticipantSeed;
    students?: ParticipantSeed[];
    validators?: ParticipantSeed[];
    winners?: string[];
  };
}

export const CONFIG_PATH = path.resolve(__dirname, '../../config/culture.json');

export async function loadCultureConfig(): Promise<CultureConfig> {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  return JSON.parse(raw) as CultureConfig;
}

export async function saveCultureConfig(config: CultureConfig): Promise<void> {
  const serialised = `${JSON.stringify(config, null, 2)}\n`;
  await fs.writeFile(CONFIG_PATH, serialised, 'utf8');
}

async function fetchVaultSecret(pathSuffix: string): Promise<string | null> {
  const vaultAddr = process.env.VAULT_ADDR;
  const token = process.env.VAULT_TOKEN;
  if (!vaultAddr || !token || !pathSuffix) {
    return null;
  }
  const normalised = pathSuffix.replace(/^\/+/, '');
  const url = new URL(`/v1/${normalised}`, vaultAddr);
  const response = await fetch(url, {
    headers: {
      'X-Vault-Token': token,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch secret from Vault path ${normalised}: ${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as any;
  return (
    payload?.data?.privateKey ??
    payload?.data?.value ??
    payload?.data?.data?.privateKey ??
    payload?.data?.data?.value ??
    null
  );
}

export async function resolvePrivateKey(envVar: string, vaultVar: string): Promise<string | null> {
  const raw = process.env[envVar];
  if (raw && raw.trim()) {
    return normalisePrivateKey(raw);
  }
  const vaultPath = process.env[vaultVar];
  if (vaultPath) {
    const secret = await fetchVaultSecret(vaultPath);
    if (secret && secret.trim()) {
      return normalisePrivateKey(secret);
    }
  }
  return null;
}

function normalisePrivateKey(value: string): string {
  let hex = value.trim();
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    hex = hex.slice(2);
  }
  if (!/^[0-9a-fA-F]{1,64}$/.test(hex)) {
    throw new Error('Private key must be a hex string of up to 32 bytes.');
  }
  const padded = hex.padStart(64, '0');
  if (/^0+$/.test(padded)) {
    throw new Error('Private key cannot be zero.');
  }
  return `0x${padded}`;
}

export async function resolveSigner(
  provider: JsonRpcProvider,
  options: {
    envVar: string;
    vaultVar: string;
    fallbackIndex?: number;
    label: string;
  }
): Promise<Wallet> {
  const key = await resolvePrivateKey(options.envVar, options.vaultVar);
  if (key) {
    return new ethers.Wallet(key, provider);
  }
  const signers = await ethers.getSigners();
  const index = options.fallbackIndex ?? 0;
  if (!signers[index]) {
    throw new Error(`No default signer available for ${options.label}. Provide ${options.envVar} or configure Vault.`);
  }
  console.warn(
    `⚠️ Using Hardhat signer[${index}] (${await signers[index].getAddress()}) for ${options.label}. ` +
      'Provide an explicit private key via environment variables or Vault for production operations.'
  );
  return signers[index] as Wallet;
}

export async function resolveSignerForAddress(
  provider: JsonRpcProvider,
  expected: string,
  options: { envVar: string; vaultVar: string; fallbackIndex?: number; label: string }
): Promise<Wallet> {
  const signer = await resolveSigner(provider, options);
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `${options.label} signer (${signerAddress}) does not match expected address ${expected}. Provide the correct key via environment variables.`
    );
  }
  return signer;
}

export function ensureAddress(label: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${label} must be configured in config/culture.json`);
  }
  const normalised = value.trim();
  if (!ethers.isAddress(normalised)) {
    throw new Error(`${label} is not a valid address: ${value}`);
  }
  if (normalised === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return normalised;
}

export async function confirmBytecode(label: string, address: string): Promise<void> {
  const code = await ethers.provider.getCode(address);
  if (!code || code === '0x') {
    throw new Error(`No bytecode found for ${label} at ${address}`);
  }
  console.log(`🔍 Verified bytecode for ${label} at ${address}`);
}

export function toBytes32Array(values?: string[]): string[] {
  if (!values) {
    return [];
  }
  return values.map((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) {
      throw new Error('Empty proof entry encountered.');
    }
    return trimmed;
  });
}
