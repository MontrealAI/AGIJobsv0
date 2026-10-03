import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getAddress } from 'ethers';

export const CULTURE_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_CONFIG_PATH =
  process.env.CULTURE_CONFIG_PATH ??
  path.join(CULTURE_ROOT, 'config/culture.json');

export const DeploymentsSchema = z.object({
  network: z.string(),
  chainId: z.number(),
  cultureRegistry: z.string().optional(),
  selfPlayArena: z.string().optional(),
  identityRegistry: z.string().optional(),
  jobRegistry: z.string().optional(),
  stakeManager: z.string().optional(),
  validationModule: z.string().optional(),
});

export type DeploymentsRecord = z.infer<typeof DeploymentsSchema>;

const positiveAmount = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine(
    (value) => /^[1-9][0-9]*$/.test(value) && BigInt(value) < 1n << 256n,
    'Amount must fit uint256'
  );

export const CultureConfigSchema = z.object({
  network: z.string(),
  owner: z.object({
    address: z.string(),
    pauseGuardian: z.string().optional(),
  }),
  dependencies: z.object({
    identityRegistry: z.string().default(''),
    jobRegistry: z.string().default(''),
    stakeManager: z.string().default(''),
    validationModule: z.string().optional(),
    feePool: z.string().optional(),
  }),
  culture: z.object({
    kinds: z.array(z.string()),
    maxCitations: z.number().int().positive(),
  }),
  arena: z.object({
    teacherReward: positiveAmount,
    studentReward: positiveAmount,
    validatorReward: positiveAmount,
    committeeSize: z.number().int().positive(),
    validatorStake: positiveAmount,
    targetSuccessRateBps: z.number().int().min(1).max(10_000),
    maxDifficultyStep: z.number().int().positive().max(0xffffffff).default(1),
    defaultDifficulty: z
      .number()
      .int()
      .nonnegative()
      .max(0xffffffff)
      .default(1),
  }),
  orchestrators: z.array(z.string()).default([]),
  roles: z
    .object({
      authors: z.array(z.string()).default([]),
      teachers: z.array(z.string()).default([]),
      students: z.array(z.string()).default([]),
      validators: z.array(z.string()).default([]),
      orchestrators: z.array(z.string()).default([]),
    })
    .default({
      authors: [],
      teachers: [],
      students: [],
      validators: [],
      orchestrators: [],
    }),
  contracts: z
    .object({
      cultureRegistry: z.string().optional(),
      selfPlayArena: z.string().optional(),
    })
    .default({}),
  seed: z.record(z.any()).optional(),
  sampleRound: z.record(z.any()).optional(),
});

export type CultureConfig = z.infer<typeof CultureConfigSchema>;

export async function loadCultureConfig(
  configPath = DEFAULT_CONFIG_PATH
): Promise<CultureConfig> {
  const file = await fs.readFile(configPath, 'utf-8');
  const source = JSON.parse(file);
  return CultureConfigSchema.parse({
    ...source,
    network: source.network ?? 'localhost',
    dependencies: source.dependencies ?? {},
    orchestrators: source.orchestrators ?? source.roles?.orchestrators ?? [],
    arena: {
      ...source.arena,
      teacherReward:
        source.arena?.teacherReward ?? source.arena?.baseRewards?.teacher,
      studentReward:
        source.arena?.studentReward ?? source.arena?.baseRewards?.student,
      validatorReward:
        source.arena?.validatorReward ?? source.arena?.baseRewards?.validator,
      targetSuccessRateBps:
        source.arena?.targetSuccessRateBps ??
        Math.round(source.arena?.targetSuccessRate * 10_000),
    },
  });
}

export async function writeDeployments(
  outputPath: string,
  payload: DeploymentsRecord
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
}

export async function updateEnvFile(
  envPath: string,
  updates: Record<string, string>
): Promise<void> {
  const resolved = path.resolve(envPath);
  let existing = '';
  try {
    existing = await fs.readFile(resolved, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  const pending = new Map(Object.entries(updates));
  const lines = existing.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !(match[1] in updates)) return line;
    pending.delete(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });
  while (lines.at(-1) === '') lines.pop();
  for (const [key, value] of pending) lines.push(`${key}=${value}`);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${lines.join('\n')}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await fs.rename(temporary, resolved);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export function formatChecksum(address: string): string {
  if (!address) return address;
  return getAddress(address);
}

export function parseAddressesBlob(
  blob: string | undefined
): Record<string, string> {
  if (!blob) {
    return {};
  }
  try {
    const addresses = z.record(z.string()).parse(JSON.parse(blob));
    return Object.fromEntries(
      Object.entries(addresses).map(([key, value]) => [
        key,
        formatChecksum(value),
      ])
    );
  } catch (error) {
    throw new Error(
      `Failed to parse AGI_JOBS_CORE_ADDRESSES: ${(error as Error).message}`
    );
  }
}
