import { ethers } from 'ethers';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { loadEnsConfig } from './config';

dotenvConfig();

const REGISTRY_ABI = [
  'function resolver(bytes32 node) view returns (address)',
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
];

const RESOLVER_ABI = [
  'function setAddr(bytes32 node, address addr) external',
  'function addr(bytes32 node) view returns (address)',
];

const REVERSE_ABI = [
  'function setName(string name) external returns (bytes32)',
];

type EnsSpace = 'agent' | 'club';

type ParentConfig = {
  node: string;
  name: string;
  role: 'agent' | 'validator';
};

interface CliOptions {
  label: string;
  space: EnsSpace;
  rpcUrl: string;
  ownerKey: string;
  force: boolean;
  network?: string;
}

function normalizeLabel(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('Label is required');
  }
  if (!/^[a-z0-9-]+$/i.test(trimmed)) {
    throw new Error(
      'Label may only contain alphanumeric characters and hyphens'
    );
  }
  if (trimmed.includes('--')) {
    throw new Error('Label cannot contain consecutive hyphens');
  }
  return trimmed;
}

function normaliseConfigAddress(
  value: string | undefined,
  label: string,
  { allowZero = false }: { allowZero?: boolean } = {}
): string {
  if (value === undefined || value === null) {
    if (allowZero) {
      return ethers.ZeroAddress;
    }
    throw new Error(`${label} is not configured`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (allowZero) {
      return ethers.ZeroAddress;
    }
    throw new Error(`${label} is not configured`);
  }
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  const address = ethers.getAddress(prefixed);
  if (!allowZero && address === ethers.ZeroAddress) {
    throw new Error(`${label} cannot be the zero address`);
  }
  return address;
}

function parseArgs(): CliOptions {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(
      'Usage: ts-node scripts/registerEns.ts <label> [--club|--validator|--role=validator] [--rpc=<url>] [--owner-key=<hex>] [--force]'
    );
    process.exit(1);
  }
  const [label, ...rest] = argv;
  let space: EnsSpace = 'agent';
  let rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  let ownerKey = process.env.ENS_OWNER_KEY || '';
  let force = false;
  let network = process.env.ENS_NETWORK || process.env.NETWORK;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--club' || arg === '--validator') {
      space = 'club';
      continue;
    }
    if (arg === '--agent') {
      space = 'agent';
      continue;
    }
    if (arg.startsWith('--role=')) {
      const value = arg.split('=')[1];
      if (value === 'validator' || value === 'club') {
        space = 'club';
      } else if (value === 'agent') {
        space = 'agent';
      }
      continue;
    }
    if (arg.startsWith('--rpc=')) {
      rpcUrl = arg.slice('--rpc='.length);
      continue;
    }
    if (arg.startsWith('--owner-key=')) {
      ownerKey = arg.slice('--owner-key='.length);
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--network') {
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        network = next;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--network=')) {
      network = arg.slice('--network='.length);
      continue;
    }
  }
  if (!ownerKey) {
    throw new Error(
      'ENS owner private key must be provided via ENS_OWNER_KEY env var or --owner-key'
    );
  }
  return {
    label: normalizeLabel(label),
    space,
    rpcUrl,
    ownerKey,
    force,
    network,
  };
}

function buildParentMap(
  roots: Record<string, any>
): Record<EnsSpace, ParentConfig> {
  const agentRoot = roots.agent;
  const clubRoot = roots.club;
  if (!agentRoot || !agentRoot.node || !agentRoot.name) {
    throw new Error('ENS configuration is missing the agent.agi.eth root');
  }
  if (!clubRoot || !clubRoot.node || !clubRoot.name) {
    throw new Error('ENS configuration is missing the club.agi.eth root');
  }
  const normaliseNode = (node: string) => ethers.hexlify(ethers.getBytes(node));
  return {
    agent: {
      node: normaliseNode(agentRoot.node),
      name: String(agentRoot.name).toLowerCase(),
      role: 'agent',
    },
    club: {
      node: normaliseNode(clubRoot.node),
      name: String(clubRoot.name).toLowerCase(),
      role: 'validator',
    },
  };
}

async function registerEns(
  options: CliOptions,
  provider: ethers.JsonRpcProvider,
  registryAddress: string,
  reverseRegistrar: string,
  parents: Record<EnsSpace, ParentConfig>
): Promise<{
  ensName: string;
  wallet: ethers.Wallet;
  resolver: string;
}> {
  const parent = parents[options.space];
  if (!parent) {
    throw new Error(`ENS parent configuration missing for ${options.space}`);
  }
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);

  const rootWallet = new ethers.Wallet(options.ownerKey, provider);
  const signerRegistry = registry.connect(rootWallet);

  const resolverAddress: string = await signerRegistry.resolver(parent.node);
  if (!resolverAddress || resolverAddress === ethers.ZeroAddress) {
    throw new Error(`Resolver is not configured for ${parent.name}`);
  }

  const wallet = ethers.Wallet.createRandom().connect(provider);
  const labelHash = ethers.id(options.label);
  const ensName = `${options.label}.${parent.name}`;
  const node = ethers.namehash(ensName);

  console.log(`Registering ${ensName} for ${wallet.address}`);
  const tx = await signerRegistry.setSubnodeRecord(
    parent.node,
    labelHash,
    wallet.address,
    resolverAddress,
    0
  );
  console.log(`setSubnodeRecord tx: ${tx.hash}`);
  await tx.wait();

  const resolver = new ethers.Contract(resolverAddress, RESOLVER_ABI, wallet);
  const addrTx = await resolver.setAddr(node, wallet.address);
  console.log(`setAddr tx: ${addrTx.hash}`);
  await addrTx.wait();

  const reverse = new ethers.Contract(reverseRegistrar, REVERSE_ABI, wallet);
  const reverseTx = await reverse.setName(ensName);
  console.log(`setName tx: ${reverseTx.hash}`);
  await reverseTx.wait();

  const lookup = await provider.lookupAddress(wallet.address);
  if (!lookup || lookup.toLowerCase() !== ensName.toLowerCase()) {
    throw new Error(
      `ENS reverse lookup mismatch: expected ${ensName}, got ${
        lookup ?? 'null'
      }`
    );
  }

  console.log(`Verified reverse record ${lookup}`);

  return { ensName, wallet, resolver: resolverAddress };
}

function persistIdentity(
  options: CliOptions,
  ensName: string,
  wallet: ethers.Wallet,
  resolver: string,
  chainId: bigint,
  networkName: string | undefined,
  parents: Record<EnsSpace, ParentConfig>
): string {
  const outputDir = path.resolve(__dirname, '../config/agents');
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${options.label}.json`);
  if (!options.force && fs.existsSync(filePath)) {
    throw new Error(
      `Identity file already exists at ${filePath}. Use --force to overwrite.`
    );
  }
  const parent = parents[options.space];
  const record = {
    label: options.label,
    ens: ensName,
    address: wallet.address,
    privateKey: wallet.privateKey,
    role: parent.role,
    parent: parent.name,
    resolver,
    chainId: Number(chainId),
    network: networkName ?? 'unknown',
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
  return filePath;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const provider = new ethers.JsonRpcProvider(options.rpcUrl);
  const { config: ensConfig } = loadEnsConfig({
    network: options.network,
  });
  const parents = buildParentMap(ensConfig.roots || {});
  const registryAddress = normaliseConfigAddress(
    process.env.ENS_REGISTRY_ADDRESS ?? ensConfig.registry,
    'ENS registry'
  );
  const reverseRegistrar = normaliseConfigAddress(
    process.env.ENS_REVERSE_REGISTRAR_ADDRESS ?? ensConfig.reverseRegistrar,
    'ENS reverse registrar'
  );
  const network = await provider.getNetwork();
  const { ensName, wallet, resolver } = await registerEns(
    options,
    provider,
    registryAddress,
    reverseRegistrar,
    parents
  );
  const filePath = persistIdentity(
    options,
    ensName,
    wallet,
    resolver,
    network.chainId,
    network.name,
    parents
  );
  console.log(`Saved identity file to ${filePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
