import { promises as fs } from 'fs';
import path from 'path';

import { ethers } from 'ethers';
const {
  deploymentNetwork,
  runtimeEnvironment,
  verifyRuntimeNetwork,
} = require('./lib/runtime-network.cjs');

interface AddressBook {
  network?: string;
  chainId?: string | number;
  token?: string;
  jobRegistry?: string;
  stakeManager?: string;
  validationModule?: string;
  disputeModule?: string;
  reputationEngine?: string;
  systemPause?: string;
  feePool?: string;
  identityRegistry?: string;
  certificateNFT?: string;
  taxPolicy?: string;
}

type Args = Record<string, string | boolean>;

const ADDRESS_FIELDS: Record<
  string,
  Exclude<keyof AddressBook, 'network' | 'chainId'>
> = {
  AGIALPHA_TOKEN: 'token',
  NEXT_PUBLIC_AGIALPHA_ADDRESS: 'token',
  NEXT_PUBLIC_STAKING_TOKEN_ADDRESS: 'token',
  NEXT_PUBLIC_JOB_REGISTRY_ADDRESS: 'jobRegistry',
  NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS: 'validationModule',
  NEXT_PUBLIC_STAKE_MANAGER_ADDRESS: 'stakeManager',
  NEXT_PUBLIC_TAX_POLICY_ADDRESS: 'taxPolicy',
  NEXT_PUBLIC_CERTIFICATE_NFT_ADDRESS: 'certificateNFT',
  JOB_REGISTRY: 'jobRegistry',
  JOB_REGISTRY_ADDRESS: 'jobRegistry',
  STAKE_MANAGER_ADDRESS: 'stakeManager',
  VALIDATION_MODULE_ADDRESS: 'validationModule',
  DISPUTE_MODULE_ADDRESS: 'disputeModule',
  REPUTATION_ENGINE_ADDRESS: 'reputationEngine',
  SYSTEM_PAUSE_ADDRESS: 'systemPause',
  FEE_POOL_ADDRESS: 'feePool',
  IDENTITY_REGISTRY_ADDRESS: 'identityRegistry',
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function readJson<T>(filePath: string): Promise<T> {
  const absolute = path.resolve(filePath);
  const raw = await fs.readFile(absolute, 'utf8');
  return JSON.parse(raw) as T;
}

async function loadAddressBook(candidatePaths: string[]): Promise<AddressBook> {
  for (const candidate of candidatePaths) {
    try {
      return await readJson<AddressBook>(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  throw new Error(
    `Unable to locate deployment address book. Checked: ${candidatePaths.join(
      ', '
    )}`
  );
}

function normaliseAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return ethers.getAddress(trimmed);
  } catch (error) {
    throw new Error(`Invalid address detected: ${value}`);
  }
}

async function ensureWritable(filePath: string, force: boolean) {
  try {
    await fs.access(filePath);
    if (!force) {
      throw new Error(
        `Output file ${filePath} already exists. Pass --force to overwrite or remove the file before generating a new one.`
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function main() {
  const args = parseArgs();
  const inputCandidates = [
    (args.input as string) ??
      path.join('deployment-config', 'latest-deployment.json'),
    ...(args.input === undefined
      ? [path.join('docs', 'deployment-addresses.json')]
      : []),
  ];
  const templatePath =
    (args.template as string) ?? path.join('deployment-config', 'oneclick.env');
  const outputPath =
    (args.output as string) ?? path.join('deployment-config', 'oneclick.env');
  const force = Boolean(args.force);

  const addresses = await loadAddressBook(inputCandidates);
  await ensureWritable(outputPath, force);

  let template = await fs.readFile(path.resolve(templatePath), 'utf8');
  const identity = deploymentNetwork(addresses, args.network);
  const environment = runtimeEnvironment(template, identity);
  const registry = normaliseAddress(addresses.jobRegistry);
  if (!registry || registry === ethers.ZeroAddress)
    throw new Error(
      'Deployment addressbook must contain a nonzero JobRegistry'
    );
  await verifyRuntimeNetwork(environment, identity, { registry });
  const lines = template.split(/\r?\n/);
  const setLine = (key: string, value: string) => {
    // Remove every previous declaration, including export/quoted forms, so
    // dotenv and Compose cannot disagree because of duplicate template keys.
    const declaration = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
    for (let index = lines.length - 1; index >= 0; index -= 1)
      if (declaration.test(lines[index])) lines.splice(index, 1);
    lines.push(`${key}=${value}`);
  };
  for (const key of [
    'CHAIN_ID',
    'NEXT_PUBLIC_CHAIN_ID',
    'AGJ_NETWORK',
    'RPC_URL',
    'NEXT_PUBLIC_RPC_URL',
  ])
    setLine(key, environment[key]);

  const updates: string[] = [];
  for (const [envKey, field] of Object.entries(ADDRESS_FIELDS)) {
    const address = normaliseAddress(addresses[field]);
    if (!address) {
      continue;
    }

    setLine(envKey, address);
    updates.push(`${envKey} -> ${address}`);
  }

  template = lines.join('\n');
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(path.resolve(outputPath), template, 'utf8');

  if (updates.length === 0) {
    console.warn(
      '⚠️  No address updates were applied; check that your deployment artefacts contain contract addresses.'
    );
  } else {
    console.log('✅ Updated environment file with the following addresses:');
    for (const update of updates) {
      console.log(`  • ${update}`);
    }
  }
  console.log(`ℹ️  Environment file written to ${path.resolve(outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
