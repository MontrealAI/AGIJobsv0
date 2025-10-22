import { z } from 'zod';

export const startRoundSchema = z.object({
  contestantIds: z.array(z.string().min(1)).min(1),
  validatorIds: z.array(z.string().min(1)).min(1),
  roundMetadata: z.record(z.any()).optional(),
  targetDurationSeconds: z.number().int().positive().max(3600).optional()
});

export const commitSchema = z.object({
  roundId: z.string().min(1),
  agentId: z.string().min(1),
  commitHash: z.string().regex(/^0x[0-9a-fA-F]+$/)
});

export const revealSchema = z.object({
  roundId: z.string().min(1),
  agentId: z.string().min(1),
  submission: z.any(),
  proof: z.string().min(5)
});
