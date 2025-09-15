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
const BUSINESS_ROOT = ethers.namehash('a.agi.eth');

type Role = 'agent' | 'validator' | 'business';

function parseArgs(): { name: string; role: Role } {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.error(
      'Usage: ts-node manageEnsKeys.ts <name> [--role=agent|validator|business]'
    );
    process.exit(1);
  }
  const name = argv[0];
  let role: Role = 'agent';
  for (const arg of argv.slice(1)) {
    if (arg === '--validator') role = 'validator';
    if (arg === '--business' || arg === '--orchestrator') role = 'business';
    if (arg.startsWith('--role=')) {
      const value = arg.split('=')[1] as Role;
      if (value === 'agent' || value === 'validator' || value === 'business') {
        role = value;
      }
    }
  }
  return { name, role };
}

async function registerEnsSubdomain(
  provider: ethers.JsonRpcProvider,
  rootWallet: ethers.Wallet,
  subWallet: ethers.Wallet,
  label: string,
  role: Role
) {
  const registry = new ethers.Contract(ENS_REGISTRY, REGISTRY_ABI, rootWallet);
  const parentNode =
    role === 'validator'
      ? CLUB_ROOT
      : role === 'business'
      ? BUSINESS_ROOT
      : AGENT_ROOT;
  const parent =
    role === 'validator'
      ? 'club.agi.eth'
      : role === 'business'
      ? 'a.agi.eth'
      : 'agent.agi.eth';
  const resolverAddr = await registry.resolver(parentNode);
  if (resolverAddr === ethers.ZeroAddress) {
    throw new Error('Parent node has no resolver set');
  }
  const labelHash = ethers.id(label);
  const node = ethers.namehash(`${label}.${parent}`);

  await (
    await registry.setSubnodeRecord(
      parentNode,
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
  await (await reverse.setName(`${label}.${parent}`)).wait();

  const lookup = await provider.lookupAddress(subWallet.address);
  if (lookup !== `${label}.${parent}`) {
    throw new Error('ENS reverse lookup failed');
  }

  return `${label}.${parent}`;
}

async function main() {
  const { name, role } = parseArgs();
  const rpc = process.env.RPC_URL || 'http://localhost:8545';
  const provider = new ethers.JsonRpcProvider(rpc);

  const rootKey = process.env.ENS_OWNER_KEY;
  if (!rootKey) {
    throw new Error('ENS_OWNER_KEY env var required');
  }

  const rootWallet = new ethers.Wallet(rootKey, provider);
  const agentWallet = ethers.Wallet.createRandom().connect(provider);

  const ensName = await registerEnsSubdomain(
    provider,
    rootWallet,
    agentWallet,
    name,
    role
  );

  const outDir = path.join(__dirname, '..', '..', 'config', 'agents');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${name}.json`);
  const data = {
    address: agentWallet.address,
    privateKey: agentWallet.privateKey,
    ens: ensName,
    role,
  };
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
  console.log(`Registered ${ensName} -> ${agentWallet.address}`);
  console.log(`Keystore written to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
