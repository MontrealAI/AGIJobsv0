import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const DEFAULT_CONFIG_PATH = path.resolve('demo/CULTURE-v0/config/culture.json');

export const DeploymentsSchema = z.object({
  network: z.string(),
  chainId: z.number(),
  cultureRegistry: z.string().optional(),
  selfPlayArena: z.string().optional(),
  identityRegistry: z.string().optional(),
  jobRegistry: z.string().optional(),
  stakeManager: z.string().optional(),
  validationModule: z.string().optional()
});

export type DeploymentsRecord = z.infer<typeof DeploymentsSchema>;

export const CultureConfigSchema = z.object({
  network: z.string(),
  owner: z.object({
    address: z.string(),
    pauseGuardian: z.string().optional()
  }),
  dependencies: z.object({
    identityRegistry: z.string(),
    jobRegistry: z.string(),
    stakeManager: z.string(),
    validationModule: z.string().optional(),
    feePool: z.string().optional()
  }),
  culture: z.object({
    kinds: z.array(z.string()),
    maxCitations: z.number()
  }),
  arena: z.object({
    teacherReward: z.string(),
    studentReward: z.string(),
    validatorReward: z.string(),
    committeeSize: z.number(),
    validatorStake: z.string(),
    targetSuccessRateBps: z.number(),
    maxDifficultyStep: z.number().default(1),
    defaultDifficulty: z.number().default(1)
  }),
  orchestrators: z.array(z.string()).default([]),
  roles: z
    .object({
      authors: z.array(z.string()).default([]),
      teachers: z.array(z.string()).default([]),
      students: z.array(z.string()).default([]),
      validators: z.array(z.string()).default([]),
      orchestrators: z.array(z.string()).default([])
    })
    .default({ authors: [], teachers: [], students: [], validators: [], orchestrators: [] }),
  contracts: z
    .object({
      cultureRegistry: z.string().optional(),
      selfPlayArena: z.string().optional()
    })
    .default({}),
  seed: z.record(z.any()).optional(),
  sampleRound: z.record(z.any()).optional()
});

export type CultureConfig = z.infer<typeof CultureConfigSchema>;

export async function loadCultureConfig(configPath = DEFAULT_CONFIG_PATH): Promise<CultureConfig> {
  const file = await fs.readFile(configPath, 'utf-8');
  return CultureConfigSchema.parse(JSON.parse(file));
}

export async function writeDeployments(outputPath: string, payload: DeploymentsRecord): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
}

export async function updateEnvFile(envPath: string, updates: Record<string, string>): Promise<void> {
  const resolved = path.resolve(envPath);
  let existing = '';
  try {
    existing = await fs.readFile(resolved, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  const lines = existing.split(/\r?\n/).filter(Boolean);
  const state = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    state.set(key, value);
  }
  for (const [key, value] of Object.entries(updates)) {
    state.set(key, value);
  }
  const content = Array.from(state.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  await fs.writeFile(resolved, `${content}\n`);
}

export function formatChecksum(address: string): string {
  if (!address) return address;
  if (address.startsWith('0x') && address.length === 42) {
    return address;
  }
  throw new Error(`Invalid address provided: ${address}`);
}

export function parseAddressesBlob(blob: string | undefined): Record<string, string> {
  if (!blob) {
    return {};
  }
  try {
    return JSON.parse(blob) as Record<string, string>;
  } catch (error) {
    throw new Error(`Failed to parse AGI_JOBS_CORE_ADDRESSES: ${(error as Error).message}`);
  }
}
