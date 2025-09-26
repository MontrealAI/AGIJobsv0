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

export const IntentSchema = z.enum(INTENT_VALUES);

const decimalString = z
  .string()
  .trim()
  .min(1, 'Amount must be provided')
  .regex(/^\d+(\.\d+)?$/, 'Amount must be a positive decimal number')
  .transform((value) => {
    if (value.includes('.')) {
      const normalized = value.replace(/0+$/, '');
      return normalized.endsWith('.')
        ? normalized.slice(0, -1)
        : normalized || '0';
    }
    return value;
  })
  .refine((value) => value !== '0', 'Amount must be greater than zero');

const deadlineSchema = z
  .number({ invalid_type_error: 'Deadline must be a number' })
  .int('Deadline must be an integer number of days')
  .min(1, 'Deadline must be at least one day')
  .max(365, 'Deadline cannot exceed one year');

const jobDefinitionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(4, 'Title must be at least four characters long')
    .max(120, 'Title cannot exceed 120 characters'),
  description: z
    .string()
    .trim()
    .min(12, 'Description must provide sufficient detail'),
  rewardToken: z
    .string()
    .trim()
    .min(1, 'Reward token symbol or address required')
    .optional(),
  rewardAmount: decimalString,
  deadlineDays: deadlineSchema,
  attachments: z
    .array(z.string().url('Attachment must be a valid URL'))
    .max(10)
    .optional(),
  slots: z.number().int().positive().max(25).optional(),
  tags: z.array(z.string().trim().min(1)).max(12).optional(),
});

const jobReferenceSchema = z.object({
  jobId: z.union([
    z
      .string()
      .trim()
      .regex(/^[0-9]+$/, 'jobId must be a numeric string'),
    z.number().int().nonnegative(),
  ]),
});

const stakeRoleSchema = z.enum(['agent', 'validator', 'platform', 'operator']);

const confirmationSchema = z.object({
  confirm: z.boolean().optional(),
  confirmationText: z
    .string()
    .trim()
    .max(140, 'Confirmation text must be at most 140 characters')
    .optional(),
});

const metaSchema = z
  .object({
    traceId: z.string().uuid('traceId must be a valid UUID').optional(),
    requestId: z.string().trim().min(1).optional(),
    planner: z
      .object({
        model: z.string().trim().min(1).optional(),
        version: z.string().trim().min(1).optional(),
      })
      .optional(),
  })
  .optional();

const createJobSchema = z
  .object({
    intent: z.literal('create_job'),
    params: z.object({ job: jobDefinitionSchema }),
    context: z
      .object({
        employerEns: z.string().trim().min(1).optional(),
        preferredValidator: z.string().trim().optional(),
      })
      .optional(),
  })
  .merge(confirmationSchema)
  .extend({ meta: metaSchema });

const applyJobSchema = z
  .object({
    intent: z.literal('apply_job'),
    params: jobReferenceSchema.extend({
      proposal: z.string().trim().max(4096).optional(),
      stakeAmount: decimalString.optional(),
    }),
  })
  .merge(confirmationSchema)
  .extend({ meta: metaSchema });

const submitWorkSchema = z
  .object({
    intent: z.literal('submit_work'),
    params: jobReferenceSchema.extend({
      deliverableUri: z
        .string()
        .trim()
        .url('deliverableUri must be a valid URI'),
      notes: z.string().trim().max(4096).optional(),
    }),
  })
  .merge(confirmationSchema)
  .extend({ meta: metaSchema });

const validateSchema = z
  .object({
    intent: z.literal('validate'),
    params: jobReferenceSchema.extend({
      decision: z.enum(['approve', 'reject']),
      justification: z.string().trim().max(4096).optional(),
    }),
  })
  .merge(confirmationSchema)
  .extend({ meta: metaSchema });

const finalizeSchema = z
  .object({
    intent: z.literal('finalize'),
    params: jobReferenceSchema,
  })
  .merge(confirmationSchema)
  .extend({ meta: metaSchema });

const disputeSchema = z
  .object({
    intent: z.literal('dispute'),
    params: jobReferenceSchema.extend({
      reason: z.string().trim().min(8, 'Dispute reason must include detail'),
      evidenceUri: z.string().trim().url().optional(),
    }),
  })
  .merge(confirmationSchema)
  .extend({ meta: metaSchema });

const stakeSchema = z
  .object({
    intent: z.literal('stake'),
    params: z.object({
      role: stakeRoleSchema,
      amount: decimalString,
      warmupDays: deadlineSchema.optional(),
    }),
  })
  .merge(confirmationSchema)
  .extend({ meta: metaSchema });

const withdrawSchema = z
  .object({
    intent: z.literal('withdraw'),
    params: z.object({
      role: stakeRoleSchema,
      amount: decimalString.optional(),
      full: z.boolean().optional(),
    }),
  })
  .merge(confirmationSchema)
  .extend({ meta: metaSchema });

const adminSetSchema = z
  .object({
    intent: z.literal('admin_set'),
    params: z.object({
      target: z.enum([
        'burn_pct',
        'fee_pct',
        'pause_protocol',
        'unpause_protocol',
        'update_allowlist',
        'set_treasury',
      ]),
      value: z.union([decimalString, z.boolean(), z.string().trim()]),
    }),
    guard: z
      .object({
        requesterEns: z
          .string()
          .trim()
          .min(1, 'ENS name of requester required'),
        isAuthorized: z.boolean().optional(),
      })
      .optional(),
  })
  .merge(confirmationSchema)
  .extend({ meta: metaSchema });

export const IntentConstraintSchema = z.discriminatedUnion('intent', [
  createJobSchema,
  applyJobSchema,
  submitWorkSchema,
  validateSchema,
  finalizeSchema,
  disputeSchema,
  stakeSchema,
  withdrawSchema,
  adminSetSchema,
]);

export type IntentConstraint = z.infer<typeof IntentConstraintSchema>;

export const SupportedIntentSet: ReadonlySet<IntentConstraint['intent']> =
  new Set(INTENT_VALUES);
