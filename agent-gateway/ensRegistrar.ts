import { Contract, Wallet, ethers } from 'ethers';
import { loadEnsConfig } from '../scripts/config';
import { provider } from './utils';
import { secureLogAction } from './security';

export type EnsSpace = 'agent' | 'club' | 'business';

interface ResolvedParentConfig {
  name: string;
  node: string;
  resolver: string;
  role: 'agent' | 'validator' | 'business';
}

const ENS_REGISTRY_ABI = [
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
];

const RESOLVER_ABI = [
  'function setAddr(bytes32 node, address addr) external',
  'function addr(bytes32 node) view returns (address)',
];

const REVERSE_ABI = [
  'function setName(string name) external returns (bytes32)',
];

function normaliseLabel(label: string): string {
  const trimmed = label.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('ENS label is required');
  }
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    throw new Error(
      'ENS label may only contain alphanumeric characters and hyphens'
    );
  }
  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    throw new Error('ENS label cannot start or end with a hyphen');
  }
  if (trimmed.includes('--')) {
    throw new Error('ENS label cannot contain consecutive hyphens');
  }
  return trimmed;
}

const {
  config: ensConfig,
} = loadEnsConfig({ network: process.env.ENS_NETWORK || process.env.NETWORK });

const ENS_ROOTS = (ensConfig.roots || {}) as Record<string, any>;

function ensureConfiguredAddress(
  value: string | undefined,
  name: string,
  { allowZero = false }: { allowZero?: boolean } = {}
): string {
  if (value === undefined || value === null) {
    if (allowZero) return ethers.ZeroAddress;
    throw new Error(`${name} is not configured`);
  }
  const address = value.trim();
  if (!address) {
    if (allowZero) return ethers.ZeroAddress;
    throw new Error(`${name} is not configured`);
  }
  const prefixed = address.startsWith('0x') ? address : `0x${address}`;
  const normalised = ethers.getAddress(prefixed);
  if (!allowZero && normalised === ethers.ZeroAddress) {
    throw new Error(`${name} cannot be the zero address`);
  }
  return normalised;
}

function resolveRegistryAddress(): string {
  return ensureConfiguredAddress(
    process.env.ENS_REGISTRY_ADDRESS ?? ensConfig.registry,
    'ENS registry'
  );
}

function resolveReverseRegistrarAddress(): string {
  return ensureConfiguredAddress(
    process.env.ENS_REVERSE_REGISTRAR_ADDRESS ?? ensConfig.reverseRegistrar,
    'ENS reverse registrar'
  );
}

function readParentConfig(space: EnsSpace): ResolvedParentConfig {
  const raw = ENS_ROOTS[space];
  if (!raw || !raw.name || !raw.node) {
    throw new Error(`ENS parent configuration missing for ${space}`);
  }
  const name = String(raw.name).trim().toLowerCase();
  const resolver = ensureConfiguredAddress(raw.resolver, `${space} resolver`, {
    allowZero: true,
  });
  const normalisedResolver =
    resolver === ethers.ZeroAddress
      ? ethers.ZeroAddress
      : ethers.getAddress(resolver);
  const node = ethers.hexlify(ethers.getBytes(raw.node));
  const role: 'agent' | 'validator' | 'business' =
    raw.role ?? (space === 'club' ? 'validator' : 'agent');
  return {
    name,
    node,
    resolver: normalisedResolver,
    role,
  };
}

function detectSpaceFromParent(parentName: string): EnsSpace | null {
  const normalised = parentName.trim().toLowerCase();
  if (ENS_ROOTS.agent?.name && String(ENS_ROOTS.agent.name).toLowerCase() === normalised) {
    return 'agent';
  }
  if (ENS_ROOTS.club?.name && String(ENS_ROOTS.club.name).toLowerCase() === normalised) {
    return 'club';
  }
  if (ENS_ROOTS.business?.name && String(ENS_ROOTS.business.name).toLowerCase() === normalised) {
    return 'business';
  }
  return null;
}

function parseEnsName(name: string): { label: string; parent: string } {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('ENS name is required');
  }
  const parts = trimmed.split('.');
  if (parts.length < 3) {
    throw new Error(`ENS name ${name} is missing parent domain segments`);
  }
  const label = parts[0];
  const parent = parts.slice(1).join('.');
  return { label, parent };
}

interface PreparedEnsName {
  label: string;
  ensName: string;
  parent: ResolvedParentConfig;
  space: EnsSpace;
}

interface PrepareOptions {
  label: string;
  ensName?: string;
  space?: EnsSpace;
}

function prepareEnsName(options: PrepareOptions): PreparedEnsName {
  const normalisedLabel = normaliseLabel(options.label);
  let resolvedSpace: EnsSpace | null = options.space ?? null;
  let providedParent: string | null = null;
  if (options.ensName) {
    const parsed = parseEnsName(options.ensName);
    if (parsed.label !== normalisedLabel) {
      throw new Error(
        `ENS name label ${parsed.label} does not match expected ${normalisedLabel}`
      );
    }
    providedParent = parsed.parent;
    const detected = detectSpaceFromParent(parsed.parent);
    if (!detected) {
      throw new Error(`ENS parent ${parsed.parent} is not supported`);
    }
    if (resolvedSpace && resolvedSpace !== detected) {
      throw new Error(
        `ENS space mismatch: expected ${resolvedSpace}, derived ${detected}`
      );
    }
    resolvedSpace = detected;
  }
  if (!resolvedSpace) {
    resolvedSpace = 'agent';
  }
  const parent = readParentConfig(resolvedSpace);
  if (providedParent && providedParent !== parent.name) {
    throw new Error(
      `ENS parent ${providedParent} does not match configured parent ${parent.name}`
    );
  }
  const ensName = `${normalisedLabel}.${parent.name}`;
  return {
    label: normalisedLabel,
    ensName,
    parent,
    space: resolvedSpace,
  };
}

export interface EnsRegistrationRequest {
  label: string;
  ensName?: string;
  space?: EnsSpace;
  targetAddress?: string;
  targetPrivateKey: string;
  ownerKey?: string;
}

export interface EnsRegistrationResult {
  label: string;
  ensName: string;
  node: string;
  parentName: string;
  parentNode: string;
  resolver: string;
  walletAddress: string;
  registrarOwner: string;
  space: EnsSpace;
  role: 'agent' | 'validator' | 'business';
  registryTxHash: string;
  forwardTxHash: string;
  reverseTxHash: string;
  chainId: number;
  network?: string;
}

export async function registerEnsSubdomain(
  options: EnsRegistrationRequest
): Promise<EnsRegistrationResult> {
  const prepared = prepareEnsName({
    label: options.label,
    ensName: options.ensName,
    space: options.space,
  });
  const targetWallet = new Wallet(options.targetPrivateKey, provider);
  if (options.targetAddress) {
    const expectedAddress = ethers.getAddress(options.targetAddress);
    if (expectedAddress !== targetWallet.address) {
      throw new Error(
        `ENS target address mismatch: expected ${expectedAddress}, derived ${targetWallet.address}`
      );
    }
  }
  const registryAddress = resolveRegistryAddress();
  const reverseRegistrar = resolveReverseRegistrarAddress();
  const ownerKey = options.ownerKey ?? process.env.ENS_OWNER_KEY;
  if (!ownerKey) {
    throw new Error('ENS_OWNER_KEY must be configured to claim subdomains');
  }
  const ownerWallet = new Wallet(ownerKey, provider);
  const registry = new Contract(registryAddress, ENS_REGISTRY_ABI, ownerWallet);
  const labelHash = ethers.id(prepared.label);
  const childNode = ethers.namehash(prepared.ensName);
  const setRecordTx = await registry.setSubnodeRecord(
    prepared.parent.node,
    labelHash,
    targetWallet.address,
    prepared.parent.resolver,
    0
  );
  const setRecordReceipt = await setRecordTx.wait();
  const resolver = new Contract(
    prepared.parent.resolver,
    RESOLVER_ABI,
    targetWallet
  );
  const setAddrTx = await resolver.setAddr(childNode, targetWallet.address);
  const setAddrReceipt = await setAddrTx.wait();
  const reverse = new Contract(reverseRegistrar, REVERSE_ABI, targetWallet);
  const setNameTx = await reverse.setName(prepared.ensName);
  const setNameReceipt = await setNameTx.wait();
  const network = await provider.getNetwork();
  return {
    label: prepared.label,
    ensName: prepared.ensName,
    node: childNode,
    parentName: prepared.parent.name,
    parentNode: prepared.parent.node,
    resolver: prepared.parent.resolver,
    walletAddress: targetWallet.address,
    registrarOwner: ownerWallet.address,
    space: prepared.space,
    role: prepared.parent.role,
    registryTxHash: setRecordReceipt?.hash ?? setRecordTx.hash,
    forwardTxHash: setAddrReceipt?.hash ?? setAddrTx.hash,
    reverseTxHash: setNameReceipt?.hash ?? setNameTx.hash,
    chainId: Number(network.chainId),
    network: network.name,
  };
}

export interface EnsVerificationResult {
  resolved: string | null;
  matches: boolean;
}

export interface EnsVerificationOptions {
  address: string;
  ensName: string;
  component?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export async function verifyEnsRegistration(
  options: EnsVerificationOptions
): Promise<EnsVerificationResult> {
  const address = ethers.getAddress(options.address);
  let resolved: string | null = null;
  try {
    const lookup = await provider.lookupAddress(address);
    resolved = lookup ? lookup.toLowerCase() : null;
  } catch (err) {
    console.warn('ENS reverse lookup failed', address, err);
  }
  const expected = options.ensName.trim().toLowerCase();
  const matches = resolved === expected;
  const metadata = {
    expected,
    resolved,
    address,
    label: options.label,
    ...options.metadata,
  };
  await secureLogAction({
    component: options.component ?? 'ens-registrar',
    action: 'verify-ens-resolution',
    success: matches,
    metadata,
  }).catch((err) => {
    console.warn('Failed to record ENS verification audit event', err);
  });
  return { resolved, matches };
}

export { normaliseLabel as ensureEnsLabel };
