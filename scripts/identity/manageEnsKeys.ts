import { ethers } from 'ethers';
import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenvConfig();

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const REVERSE_REGISTRAR = '0x084b1c3C81545d370f3634392De611CaaBFf8148';

const REGISTRY_ABI = [
  'function resolver(bytes32 node) view returns (address)',
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
];

const RESOLVER_ABI = ['function setAddr(bytes32 node, address addr) external'];
const REVERSE_ABI = [
  'function setName(string name) external returns (bytes32)',
];

const AGENT_ROOT = ethers.namehash('agent.agi.eth');
const CLUB_ROOT = ethers.namehash('club.agi.eth');

const IDENTITY_STORAGE_ROOT = path.join(
  __dirname,
  '..',
  '..',
  'storage',
  'identity'
);

type Role = 'agent' | 'validator' | 'orchestrator';

type RoleConfig = {
  parentNode: string;
  parentName: string;
  storageDir: string;
  fileName(label: string): string;
};

type StoredIdentity = {
  address: string;
  privateKey: string;
  ens: string;
  label: string;
  role: Role;
  createdAt: string;
};

const ROLE_VALUES: Role[] = ['agent', 'validator', 'orchestrator'];

const ROLE_CONFIG: Record<Role, RoleConfig> = {
  agent: {
    parentNode: AGENT_ROOT,
    parentName: 'agent.agi.eth',
    storageDir: path.join(IDENTITY_STORAGE_ROOT, 'agents'),
    fileName: (label: string) => `${label}.json`,
  },
  validator: {
    parentNode: CLUB_ROOT,
    parentName: 'club.agi.eth',
    storageDir: path.join(IDENTITY_STORAGE_ROOT, 'validators'),
    fileName: (label: string) => `${label}.json`,
  },
  orchestrator: {
    parentNode: AGENT_ROOT,
    parentName: 'agent.agi.eth',
    storageDir: IDENTITY_STORAGE_ROOT,
    fileName: () => 'orchestrator.json',
  },
};

function parseArgs(): { name: string; role: Role } {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.error(
      'Usage: ts-node manageEnsKeys.ts <name> [--role=agent|validator|orchestrator]'
    );
    process.exit(1);
  }
  const name = argv[0];
  let role: Role = 'agent';
  for (const arg of argv.slice(1)) {
    if (arg === '--validator') role = 'validator';
    if (arg === '--business' || arg === '--orchestrator') role = 'orchestrator';
    if (arg.startsWith('--role=')) {
      const value = arg.split('=')[1] as Role;
      if (ROLE_VALUES.includes(value)) {
        role = value;
      }
    }
  }
  return { name, role };
}

function normalizeLabel(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Name/label must be non-empty');
  }
  const normalized = trimmed.toLowerCase();
  if (normalized.includes('/') || normalized.includes('\\')) {
    throw new Error('Name/label cannot contain path separators');
  }
  return normalized;
}

function resolveStoragePath(role: Role, label: string): string {
  const config = ROLE_CONFIG[role];
  fs.mkdirSync(config.storageDir, { recursive: true });
  const fileName = config.fileName(label);
  return path.join(config.storageDir, fileName);
}

function persistWalletRecord(
  role: Role,
  label: string,
  wallet: ethers.Wallet,
  ensName: string
): string {
  const outputPath = resolveStoragePath(role, label);
  const record: StoredIdentity = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    ens: ensName,
    label,
    role,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2));
  return outputPath;
}

async function verifyReverseResolution(
  provider: ethers.JsonRpcProvider,
  address: string,
  expectedEns: string
): Promise<void> {
  const resolved = await provider.lookupAddress(address);
  if (!resolved) {
    throw new Error(
      `ENS reverse lookup returned no result for ${address}; expected ${expectedEns}`
    );
  }
  if (resolved.toLowerCase() !== expectedEns.toLowerCase()) {
    throw new Error(
      `ENS reverse lookup mismatch for ${address}: expected ${expectedEns}, got ${resolved}`
    );
  }
}

async function registerEnsSubdomain(
  provider: ethers.JsonRpcProvider,
  rootWallet: ethers.Wallet,
  subWallet: ethers.Wallet,
  label: string,
  config: RoleConfig
): Promise<string> {
  const registry = new ethers.Contract(ENS_REGISTRY, REGISTRY_ABI, rootWallet);
  const resolverAddr = await registry.resolver(config.parentNode);
  if (resolverAddr === ethers.ZeroAddress) {
    throw new Error('Parent node has no resolver set');
  }

  const labelHash = ethers.id(label);
  const ensName = `${label}.${config.parentName}`;
  const node = ethers.namehash(ensName);

  await (
    await registry.setSubnodeRecord(
      config.parentNode,
      labelHash,
      subWallet.address,
      resolverAddr,
      0
    )
  ).wait();

  const resolver = new ethers.Contract(resolverAddr, RESOLVER_ABI, subWallet);
  await (await resolver.setAddr(node, subWallet.address)).wait();

  const reverse = new ethers.Contract(
    REVERSE_REGISTRAR,
    REVERSE_ABI,
    subWallet
  );
  await (await reverse.setName(ensName)).wait();

  await verifyReverseResolution(provider, subWallet.address, ensName);

  return ensName;
}

async function main() {
  const { name, role } = parseArgs();
  const normalizedLabel = normalizeLabel(name);
  const roleConfig = ROLE_CONFIG[role];
  const rpc = process.env.RPC_URL || 'http://localhost:8545';
  const provider = new ethers.JsonRpcProvider(rpc);

  const rootKey = process.env.ENS_OWNER_KEY;
  if (!rootKey) {
    throw new Error('ENS_OWNER_KEY env var required');
  }

  const rootWallet = new ethers.Wallet(rootKey, provider);
  const participantWallet = ethers.Wallet.createRandom().connect(provider);

  const ensName = await registerEnsSubdomain(
    provider,
    rootWallet,
    participantWallet,
    normalizedLabel,
    roleConfig
  );

  const outputPath = persistWalletRecord(
    role,
    normalizedLabel,
    participantWallet,
    ensName
  );

  console.log(`Registered ${ensName} -> ${participantWallet.address}`);
  console.log(`Keystore written to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
