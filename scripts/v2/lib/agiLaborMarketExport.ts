import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

export type TimelineKind =
  | 'section'
  | 'step'
  | 'job-summary'
  | 'balance'
  | 'owner-action'
  | 'summary';

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

const ownerActionSchema = z.object({
  label: z.string().min(1),
  contract: z.string().min(1),
  method: z.string().min(1),
  parameters: z.record(z.any()).optional(),
  at: z.string().min(1),
});

export type OwnerActionRecord = z.infer<typeof ownerActionSchema>;

const timelineEntrySchema = z
  .object({
    kind: z.enum(['section', 'step', 'job-summary', 'balance', 'owner-action', 'summary']),
    label: z.string().min(1),
    at: z.string().min(1),
    scenario: z.string().optional(),
    meta: z.record(z.any()).optional(),
  })
  .strict();

export type TimelineEntry = z.infer<typeof timelineEntrySchema>;

const actorSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(['Owner', 'Nation', 'Agent', 'Validator', 'Moderator', 'Protocol']),
  address: z
    .string()
    .regex(addressRegex, 'Addresses must be 0x-prefixed 40 byte hex strings'),
});

export type ActorProfile = z.infer<typeof actorSchema>;

const scenarioSchema = z.object({
  title: z.string().min(1),
  jobId: z.string().min(1),
  timelineIndices: z.array(z.number().int().nonnegative()),
});

export type ScenarioExport = z.infer<typeof scenarioSchema>;

const certificateSchema = z.object({
  jobId: z.string().min(1),
  owner: z.string().regex(addressRegex),
  uri: z.string().optional(),
});

export type MintedCertificate = z.infer<typeof certificateSchema>;

const marketSummarySchema = z
  .object({
    totalJobs: z.string().min(1),
    totalBurned: z.string().min(1),
    finalSupply: z.string().min(1),
    feePct: z.number().nonnegative(),
    validatorRewardPct: z.number().nonnegative(),
    pendingFees: z.string().min(1),
    totalAgentStake: z.string().min(1),
    totalValidatorStake: z.string().min(1),
    mintedCertificates: z.array(certificateSchema),
  })
  .strict();

export type MarketSummary = z.infer<typeof marketSummarySchema>;

export const DemoExportSchema = z
  .object({
    generatedAt: z.string().min(1),
    network: z.string().min(1),
    actors: z.array(actorSchema).min(1),
    ownerActions: z.array(ownerActionSchema),
    timeline: z.array(timelineEntrySchema),
    scenarios: z.array(scenarioSchema),
    market: marketSummarySchema,
  })
  .strict();

export type DemoExportPayload = z.infer<typeof DemoExportSchema>;

interface DemoExportState {
  readonly timeline: TimelineEntry[];
  readonly ownerActions: OwnerActionRecord[];
  readonly scenarios: ScenarioExport[];
  enterScenario(title: string): void;
  exitScenario(): void;
  recordTimeline(kind: TimelineKind, label: string, meta?: Record<string, unknown>): number;
  recordOwnerAction(
    label: string,
    contract: string,
    method: string,
    parameters?: Record<string, unknown>
  ): void;
  registerScenario(title: string, jobId: bigint): void;
  buildPayload(meta: {
    generatedAt: string;
    network: string;
    actors: ActorProfile[];
    market: MarketSummary;
  }): DemoExportPayload;
}

export function createDemoExportState(): DemoExportState {
  const timeline: TimelineEntry[] = [];
  const ownerActions: OwnerActionRecord[] = [];
  const scenarios: ScenarioExport[] = [];
  const scenarioIndexMap = new Map<string, number[]>();
  let activeScenario: string | undefined;

  const recordTimeline = (
    kind: TimelineKind,
    label: string,
    meta?: Record<string, unknown>
  ): number => {
    const entry: TimelineEntry = {
      kind,
      label,
      at: new Date().toISOString(),
      scenario: activeScenario,
      meta,
    };
    timeline.push(entry);
    if (activeScenario) {
      if (!scenarioIndexMap.has(activeScenario)) {
        scenarioIndexMap.set(activeScenario, []);
      }
      scenarioIndexMap.get(activeScenario)!.push(timeline.length - 1);
    }
    return timeline.length - 1;
  };

  return {
    timeline,
    ownerActions,
    scenarios,
    enterScenario(title: string) {
      activeScenario = title;
      recordTimeline('section', title);
    },
    exitScenario() {
      activeScenario = undefined;
    },
    recordTimeline,
    recordOwnerAction(
      label: string,
      contract: string,
      method: string,
      parameters?: Record<string, unknown>
    ) {
      ownerActions.push({
        label,
        contract,
        method,
        parameters,
        at: new Date().toISOString(),
      });
      recordTimeline('owner-action', label, { contract, method, parameters });
    },
    registerScenario(title: string, jobId: bigint) {
      const timelineIndices = [...(scenarioIndexMap.get(title) ?? [])];
      scenarios.push({ title, jobId: jobId.toString(), timelineIndices });
    },
    buildPayload({ generatedAt, network, actors, market }) {
      const parsed = DemoExportSchema.parse({
        generatedAt,
        network,
        actors,
        ownerActions,
        timeline,
        scenarios,
        market,
      });
      return parsed;
    },
  };
}

export function persistDemoExport(filePath: string, payload: DemoExportPayload): void {
  const parsed = DemoExportSchema.parse(payload);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(parsed, null, 2));
}

export async function validateDemoExportFile(filePath: string): Promise<DemoExportPayload> {
  const resolved = resolve(filePath);
  const raw = await readFile(resolved, 'utf8');
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse demo export JSON at ${resolved}: ${error}`);
  }
  const payload = DemoExportSchema.parse(parsedJson);

  if (payload.timeline.length === 0) {
    throw new Error('Demo export must contain timeline entries.');
  }
  if (payload.ownerActions.length === 0) {
    throw new Error('Demo export must capture at least one owner action.');
  }
  if (payload.scenarios.length < 2) {
    throw new Error('Grand demo requires at least two scenarios to be recorded.');
  }
  const missingEvents = payload.scenarios.filter((scenario) => scenario.timelineIndices.length === 0);
  if (missingEvents.length > 0) {
    throw new Error(
      `Scenario timeline indices missing for: ${missingEvents.map((entry) => entry.title).join(', ')}`
    );
  }
  if (payload.market.mintedCertificates.length === 0) {
    throw new Error('At least one certificate must be minted to prove agent credentialing.');
  }
  const agentAddresses = new Set(
    payload.actors.filter((actor) => actor.role === 'Agent').map((actor) => actor.address.toLowerCase())
  );
  for (const certificate of payload.market.mintedCertificates) {
    if (!agentAddresses.has(certificate.owner.toLowerCase())) {
      throw new Error(`Certificate for job ${certificate.jobId} owned by unknown agent ${certificate.owner}.`);
    }
  }
  const jobIds = new Set(payload.scenarios.map((scenario) => scenario.jobId));
  for (const certificate of payload.market.mintedCertificates) {
    jobIds.delete(certificate.jobId);
  }
  if (jobIds.size > 0) {
    throw new Error(`No credential minted for job(s): ${[...jobIds].join(', ')}`);
  }
  return payload;
}

interface RunDemoOptions {
  network?: string;
  silent?: boolean;
  extraArgs?: string[];
}

export async function runAgiLaborMarketDemo(
  outputPath: string,
  options: RunDemoOptions = {}
): Promise<DemoExportPayload> {
  const network = options.network ?? 'hardhat';
  const hardhatArgs = [
    'hardhat',
    'run',
    '--no-compile',
    'scripts/v2/agiLaborMarketGrandDemo.ts',
    '--network',
    network,
    ...(options.extraArgs ?? []),
  ];
  const env = {
    ...process.env,
    AGI_JOBS_DEMO_EXPORT: outputPath,
  } as NodeJS.ProcessEnv;
  if (options.silent) {
    env.HARDHAT_SILENT = env.HARDHAT_SILENT ?? 'true';
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('npx', hardhatArgs, {
      stdio: 'inherit',
      env,
      cwd: process.cwd(),
    });
    child.on('error', (error) => {
      rejectPromise(error);
    });
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(
          new Error(`Hardhat grand demo exited with code ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}`)
        );
      }
    });
  });

  // Ensure write buffers are flushed before we read.
  const payload = await validateDemoExportFile(outputPath);
  return payload;
}

export function loadDemoExportSync(filePath: string): DemoExportPayload {
  const resolved = resolve(filePath);
  const raw = readFileSync(resolved, 'utf8');
  const payload = DemoExportSchema.parse(JSON.parse(raw));
  return payload;
}
