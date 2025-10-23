import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ethers } from 'ethers';
import { z } from 'zod';
import { DEFAULT_CONFIG_PATH, loadCultureConfig } from './utils';

const EnvSchema = z.object({
  RPC_URL: z.string().min(1),
  CULTURE_CONFIG_PATH: z.string().optional(),
  CULTURE_DEPLOYMENTS_PATH: z.string().optional(),
  CULTURE_REGISTRY_ADDRESS: z.string().optional(),
  SELF_PLAY_ARENA_ADDRESS: z.string().optional()
});

const DeploymentsFileSchema = z
  .object({
    cultureRegistry: z.string().optional(),
    selfPlayArena: z.string().optional()
  })
  .partial();

async function readDeployments(filePath: string): Promise<Record<string, string>> {
  try {
    const payload = await fs.readFile(filePath, 'utf-8');
    const parsed = DeploymentsFileSchema.parse(JSON.parse(payload));
    return parsed as Record<string, string>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function verifyContract(provider: ethers.JsonRpcProvider, address: string, label: string) {
  const code = await provider.getCode(address);
  if (!code || code === '0x') {
    throw new Error(`${label} at ${address} has no deployed code on ${await provider.getNetwork().then((n) => n.name)}.`);
  }
}

async function main() {
  const env = EnvSchema.parse(process.env);
  const configPath = env.CULTURE_CONFIG_PATH ? path.resolve(env.CULTURE_CONFIG_PATH) : DEFAULT_CONFIG_PATH;
  const deploymentsPath = env.CULTURE_DEPLOYMENTS_PATH
    ? path.resolve(env.CULTURE_DEPLOYMENTS_PATH)
    : path.resolve('demo/CULTURE-v0/config/deployments.local.json');

  const [config, deployments] = await Promise.all([loadCultureConfig(configPath), readDeployments(deploymentsPath)]);

  const cultureRegistry = env.CULTURE_REGISTRY_ADDRESS ?? deployments.cultureRegistry ?? config.contracts?.cultureRegistry;
  const selfPlayArena = env.SELF_PLAY_ARENA_ADDRESS ?? deployments.selfPlayArena ?? config.contracts?.selfPlayArena;

  if (!cultureRegistry || !selfPlayArena) {
    throw new Error('CultureRegistry and SelfPlayArena addresses must be provided via env or deployments manifest.');
  }

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  await verifyContract(provider, cultureRegistry, 'CultureRegistry');
  await verifyContract(provider, selfPlayArena, 'SelfPlayArena');

  const raw = JSON.parse(await fs.readFile(configPath, 'utf-8')) as Record<string, any>;
  raw.contracts = { ...(raw.contracts ?? {}), cultureRegistry, selfPlayArena };
  await fs.writeFile(configPath, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`✅ Updated ${configPath} with CultureRegistry=${cultureRegistry} and SelfPlayArena=${selfPlayArena}`);
}

main().catch((error) => {
  console.error('Failed to register contract addresses:', error);
  process.exitCode = 1;
});

