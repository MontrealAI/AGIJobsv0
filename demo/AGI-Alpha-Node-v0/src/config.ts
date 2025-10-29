import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { parseEther } from 'ethers';

const rewardSplitSchema = z
  .object({
    operator: z.number().min(0).max(1),
    treasury: z.number().min(0).max(1),
    specialists: z.number().min(0).max(1)
  })
  .refine((value) => Math.abs(value.operator + value.treasury + value.specialists - 1) < 1e-6, {
    message: 'Reward split must add up to 1.0'
  });

const hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

const configSchema = z.object({
  operator: z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    ensLabel: z.string().min(1),
    ensRoot: z.string().min(3),
    minimumStake: z.string().regex(/^\d+(\.\d+)?$/),
    heartbeatIntervalSeconds: z.number().int().min(60)
  }),
  network: z.object({
    name: z.string().min(1),
    rpcUrl: z.string().url(),
    chainId: z.number().int().min(1)
  }),
  contracts: z.object({
    stakeManager: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    platformIncentives: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    platformRegistry: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    jobRegistry: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    feePool: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    agialphaToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    identityRegistry: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    systemPause: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    ens: z.object({
      registry: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      nameWrapper: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      publicResolver: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
    })
  }),
  ai: z.object({
    planner: z.object({
      planningHorizon: z.number().int().min(1),
      explorationWeight: z.number().min(0),
      curriculum: z.object({
        initialDifficulty: z.number().min(0),
        escalationRate: z.number().min(0)
      })
    }),
    specialists: z
      .array(
        z.object({
          id: z.string().min(1),
          description: z.string().min(1),
          capabilities: z.array(z.string().min(1)).min(1)
        })
      )
      .min(1),
    economicPolicy: z.object({
      reinvestThreshold: z.string().regex(/^\d+(\.\d+)?$/),
      maxGasPriceGwei: z.number().min(0),
      rewardSplit: rewardSplitSchema
    }),
    worldModel: z.object({
      horizon: z.number().int().min(1).max(64),
      simulations: z.number().int().min(1).max(4096),
      discountFactor: z.number().min(0).max(1),
      riskAversion: z.number().min(0).max(1),
      seed: z.number().int().min(1).max(0xffffffff).optional()
    })
  }),
  jobs: z.object({
    discovery: z.object({
      lookbackBlocks: z.number().int().min(1),
      maxJobs: z.number().int().min(1),
      includeCompleted: z.boolean().default(false)
    }),
    execution: z.object({
      defaultResultUri: z.string().url().optional(),
      resultHashAlgorithm: z.enum(['keccak256', 'sha256']).default('keccak256')
    }),
    identityProof: z.array(hex32).default([])
  }),
  governance: z.object({
    systemPauseGuardian: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
  }),
  monitoring: z.object({
    metricsPort: z.number().int().min(1),
    dashboardPort: z.number().int().min(1),
    logFile: z.string().min(1)
  })
});

export type AlphaNodeConfig = z.infer<typeof configSchema>;

export interface NormalisedAlphaNodeConfig extends AlphaNodeConfig {
  operator: AlphaNodeConfig['operator'] & { minimumStakeWei: bigint };
  ai: AlphaNodeConfig['ai'] & {
    reinvestThresholdWei: bigint;
    economicPolicy: AlphaNodeConfig['ai']['economicPolicy'];
    worldModel: AlphaNodeConfig['ai']['worldModel'] & { seed: number };
  };
  jobs: AlphaNodeConfig['jobs'] & {
    identityProof: readonly string[];
  };
}

export async function loadAlphaNodeConfig(configPath: string): Promise<NormalisedAlphaNodeConfig> {
  const resolved = path.resolve(configPath);
  const raw = await fs.readFile(resolved, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse configuration JSON (${resolved}): ${(error as Error).message}`);
  }
  const config = configSchema.parse(parsed);
  const minimumStakeWei = parseEther(config.operator.minimumStake);
  const reinvestThresholdWei = parseEther(config.ai.economicPolicy.reinvestThreshold);
  const worldModel = {
    ...config.ai.worldModel,
    seed: config.ai.worldModel.seed ?? 1337
  };

  return {
    ...config,
    operator: {
      ...config.operator,
      minimumStakeWei
    },
    ai: {
      ...config.ai,
      economicPolicy: {
        ...config.ai.economicPolicy
      },
      reinvestThresholdWei,
      worldModel
    },
    jobs: {
      ...config.jobs,
      identityProof: config.jobs.identityProof
    }
  };
}

export function makeEnsName(config: AlphaNodeConfig): string {
  return `${config.operator.ensLabel}.${config.operator.ensRoot}`;
}
