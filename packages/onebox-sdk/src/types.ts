import { z } from 'zod';

export const AttachmentSchema = z.object({
  name: z.string(),
  cid: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
});

export const JobIntentSchema = z.object({
  kind: z.enum(['post_job', 'apply', 'submit', 'finalize', 'custom']),
  title: z.string().optional(),
  description: z.string().optional(),
  reward_agialpha: z.string().optional(),
  deadline_days: z.number().int().nonnegative().optional(),
  job_id: z.number().int().optional(),
  attachments: z.array(AttachmentSchema).default([]),
  constraints: z.record(z.any()).default({}),
});

export const StepOutputSchema = z.object({
  cid: z.string().optional(),
  tx: z.string().optional(),
  data: z.record(z.any()).optional(),
});

export const StepSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['plan', 'pin', 'chain', 'llm', 'code', 'fetch', 'validate', 'finalize']),
  tool: z.string().optional(),
  params: z.record(z.any()).default({}),
  needs: z.array(z.string()).default([]),
  out: StepOutputSchema.optional(),
});

export const BudgetSchema = z.object({
  token: z.literal('AGIALPHA').default('AGIALPHA'),
  max: z.string().default('0'),
});

export const PoliciesSchema = z.object({
  allowTools: z.array(z.string()).default([]),
  denyTools: z.array(z.string()).default([]),
  requireValidator: z.boolean().default(true),
});

export const OrchestrationPlanSchema = z.object({
  plan_id: z.string(),
  steps: z.array(StepSchema),
  budget: BudgetSchema,
  policies: PoliciesSchema,
});

export const PlanResponseSchema = z.object({
  intent: JobIntentSchema,
  plan: OrchestrationPlanSchema,
  missing_fields: z.array(z.string()).default([]),
  preview_summary: z.string(),
});

export const SimulationResponseSchema = z.object({
  est_budget: z.string(),
  est_fees: z.string(),
  est_duration: z.number().int(),
  risks: z.array(z.string()).default([]),
  confirmations: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
});

export const StepStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  state: z.enum(['pending', 'running', 'completed', 'failed']),
  started_at: z.number().optional(),
  completed_at: z.number().optional(),
  message: z.string().optional(),
});

export const RunInfoSchema = z.object({
  id: z.string(),
  plan_id: z.string(),
  state: z.enum(['pending', 'running', 'succeeded', 'failed']),
  created_at: z.number(),
  started_at: z.number().optional(),
  completed_at: z.number().optional(),
  est_budget: z.string().optional(),
});

export const ReceiptSchema = z.object({
  plan_id: z.string(),
  job_id: z.number().optional(),
  txes: z.array(z.string()).default([]),
  cids: z.array(z.string()).default([]),
  payouts: z.array(z.record(z.any())).default([]),
  timings: z.record(z.any()).default({}),
});

export const StatusResponseSchema = z.object({
  run: RunInfoSchema,
  steps: z.array(StepStatusSchema),
  current: z.string().nullable().optional(),
  logs: z.array(z.string()).default([]),
  receipts: ReceiptSchema.optional(),
});

export const PlanRequestSchema = z.object({
  input_text: z.string(),
  attachments: z.array(AttachmentSchema).optional(),
});

export const SimulateRequestSchema = z.object({
  plan: OrchestrationPlanSchema,
});

export const ExecuteRequestSchema = z.object({
  plan: OrchestrationPlanSchema,
  approvals: z.array(z.string()).default([]),
});

export type Attachment = z.infer<typeof AttachmentSchema>;
export type JobIntent = z.infer<typeof JobIntentSchema>;
export type StepOutput = z.infer<typeof StepOutputSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type Policies = z.infer<typeof PoliciesSchema>;
export type OrchestrationPlan = z.infer<typeof OrchestrationPlanSchema>;
export type PlanResponse = z.infer<typeof PlanResponseSchema>;
export type SimulationResponse = z.infer<typeof SimulationResponseSchema>;
export type StepStatus = z.infer<typeof StepStatusSchema>;
export type RunInfo = z.infer<typeof RunInfoSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
export type StatusResponse = z.infer<typeof StatusResponseSchema>;
export type PlanRequest = z.infer<typeof PlanRequestSchema>;
export type SimulateRequest = z.infer<typeof SimulateRequestSchema>;
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;

export function parsePlanResponse(value: unknown): PlanResponse {
  return PlanResponseSchema.parse(value);
}

export function parseSimulationResponse(value: unknown): SimulationResponse {
  return SimulationResponseSchema.parse(value);
}

export function parseStatusResponse(value: unknown): StatusResponse {
  return StatusResponseSchema.parse(value);
}

