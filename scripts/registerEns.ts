import { ethers } from 'ethers';
import { config as dotenvConfig } from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenvConfig();

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const REVERSE_REGISTRAR = '0x084b1c3C81545d370f3634392De611CaaBFf8148';

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

const PARENT_CONFIG: Record<EnsSpace, ParentConfig> = {
  agent: {
    node: ethers.namehash('agent.agi.eth'),
    name: 'agent.agi.eth',
    role: 'agent',
  },
  club: {
    node: ethers.namehash('club.agi.eth'),
    name: 'club.agi.eth',
    role: 'validator',
  },
};

interface CliOptions {
  label: string;
  space: EnsSpace;
  rpcUrl: string;
  ownerKey: string;
  force: boolean;
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
  for (const arg of rest) {
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
  };
}

async function registerEns(
  options: CliOptions,
  provider: ethers.JsonRpcProvider
): Promise<{
  ensName: string;
  wallet: ethers.Wallet;
  resolver: string;
}> {
  const parent = PARENT_CONFIG[options.space];
  const registry = new ethers.Contract(ENS_REGISTRY, REGISTRY_ABI, provider);

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

  const reverse = new ethers.Contract(REVERSE_REGISTRAR, REVERSE_ABI, wallet);
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
  networkName?: string
): string {
  const outputDir = path.resolve(__dirname, '../config/agents');
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `${options.label}.json`);
  if (!options.force && fs.existsSync(filePath)) {
    throw new Error(
      `Identity file already exists at ${filePath}. Use --force to overwrite.`
    );
  }
  const record = {
    label: options.label,
    ens: ensName,
    address: wallet.address,
    privateKey: wallet.privateKey,
    role: PARENT_CONFIG[options.space].role,
    parent: PARENT_CONFIG[options.space].name,
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
  const network = await provider.getNetwork();
  const { ensName, wallet, resolver } = await registerEns(options, provider);
  const filePath = persistIdentity(
    options,
    ensName,
    wallet,
    resolver,
    network.chainId,
    network.name
  );
  console.log(`Saved identity file to ${filePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
