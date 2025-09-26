import { z } from 'zod';

export const INTENT_VALUES = [
  'create_job',
  'apply_job',
  'submit_work',
  'validate',
  'finalize',
  'dispute',
  'stake',
  'withdraw',
  'admin_set',
] as const;

const amountSchema = z
  .string()
  .or(z.number())
  .or(z.bigint())
  .transform((value) => (typeof value === 'string' ? value : value.toString()))
  .pipe(
    z
      .string()
      .trim()
      .refine((value) => value.length > 0, {
        message: 'Amount must not be empty',
      })
  );

const deadlineDaysSchema = z
  .number({ invalid_type_error: 'Deadline must be a number of days' })
  .int('Deadline must be a whole number of days')
  .positive('Deadline must be at least one day');

const jobTitleSchema = z
  .string({ invalid_type_error: 'Job title must be a string' })
  .min(3, 'Job title must be at least 3 characters long')
  .max(120, 'Job title must be at most 120 characters long');

const jobDescriptionSchema = z
  .string({ invalid_type_error: 'Job description must be a string' })
  .min(12, 'Describe the job in at least one sentence');

const attachmentSchema = z
  .string()
  .url('Attachments must be valid URLs (e.g. ipfs:// or https://)')
  .or(
    z
      .string()
      .regex(/^ipfs:\/\/[a-zA-Z0-9/._-]+$/u, 'Attachments must be ipfs:// URIs')
  );

const ensNameSchema = z
  .string({ invalid_type_error: 'ENS name must be a string' })
  .min(3, 'ENS name must be at least 3 characters long')
  .max(253, 'ENS name must be shorter than 253 characters')
  .regex(/^[a-z0-9-_.]+\.(eth|agi\.eth)$/u, 'ENS name must use .eth or .agi.eth');

const stakeRoleSchema = z.enum(['agent', 'validator', 'platform', 'employer']);

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/u, 'Value must be a 32-byte hex string');

const jobIdentifierSchema = z.union([
  z.bigint(),
  z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/u, 'Job id must be a hex string')
    .or(z.string().regex(/^\d+$/u, 'Job id must be numeric')),
  z.number().int().nonnegative(),
]);

const metaSchema = z
  .object({
    traceId: z.string().uuid().optional(),
    userId: z.string().min(1).optional(),
    planner: z.string().optional(),
  })
  .optional();

const baseIntentSchema = z.object({
  intent: z.enum(INTENT_VALUES),
  meta: metaSchema,
  confirm: z.boolean().optional(),
  confirmationText: z
    .string()
    .trim()
    .max(140, 'Confirmation text should be 140 characters or fewer')
    .optional(),
});

const CreateJobIntentSchema = baseIntentSchema.extend({
  intent: z.literal('create_job'),
  params: z.object({
    job: z.object({
      title: jobTitleSchema,
      description: jobDescriptionSchema,
      rewardAmount: amountSchema,
      rewardTokenSymbol: z.string().default('AGIALPHA'),
      deadlineDays: deadlineDaysSchema,
      attachments: z.array(attachmentSchema).default([]),
    }),
    autoApprove: z.boolean().optional(),
  }),
});

const ApplyJobIntentSchema = baseIntentSchema.extend({
  intent: z.literal('apply_job'),
  params: z.object({
    jobId: jobIdentifierSchema,
    ensName: ensNameSchema.optional(),
    stakeAmount: amountSchema.optional(),
  }),
});

const SubmitWorkIntentSchema = baseIntentSchema.extend({
  intent: z.literal('submit_work'),
  params: z.object({
    jobId: jobIdentifierSchema,
    result: z.object({
      uri: z.string().url('Result URI must be a valid URL').optional(),
      description: z
        .string({ invalid_type_error: 'Result description must be a string' })
        .max(2000)
        .optional(),
      hash: bytes32Schema.optional(),
    }),
  }),
});

const ValidateIntentSchema = baseIntentSchema.extend({
  intent: z.literal('validate'),
  params: z.object({
    jobId: jobIdentifierSchema,
    outcome: z.enum(['approve', 'reject']).default('approve'),
    notes: z.string().max(2000).optional(),
  }),
});

const FinalizeIntentSchema = baseIntentSchema.extend({
  intent: z.literal('finalize'),
  params: z.object({
    jobId: jobIdentifierSchema,
  }),
});

const DisputeIntentSchema = baseIntentSchema.extend({
  intent: z.literal('dispute'),
  params: z.object({
    jobId: jobIdentifierSchema,
    reason: z.string().min(10, 'Explain the dispute in at least one sentence'),
    evidenceUri: attachmentSchema.optional(),
  }),
});

const StakeIntentSchema = baseIntentSchema.extend({
  intent: z.literal('stake'),
  params: z.object({
    amount: amountSchema,
    role: stakeRoleSchema,
  }),
});

const WithdrawIntentSchema = baseIntentSchema.extend({
  intent: z.literal('withdraw'),
  params: z.object({
    amount: amountSchema,
    role: stakeRoleSchema,
  }),
});

const AdminSetIntentSchema = baseIntentSchema.extend({
  intent: z.literal('admin_set'),
  params: z.object({
    key: z
      .string({ invalid_type_error: 'Admin setting key must be provided' })
      .min(1),
    value: z.any(),
  }),
});

export const IntentSchema = z.discriminatedUnion('intent', [
  CreateJobIntentSchema,
  ApplyJobIntentSchema,
  SubmitWorkIntentSchema,
  ValidateIntentSchema,
  FinalizeIntentSchema,
  DisputeIntentSchema,
  StakeIntentSchema,
  WithdrawIntentSchema,
  AdminSetIntentSchema,
]);

export const IntentConstraintSchema = IntentSchema;
