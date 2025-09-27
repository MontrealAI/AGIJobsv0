import { z } from "zod";

const amountSchema = z.union([z.string(), z.number()]);
const deadlineSchema = z.union([z.number().int().nonnegative(), z.string(), z.date()]);
const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/u, "Invalid bytes32 value");
const jobIdSchema = z.union([z.string(), z.number().int().nonnegative(), z.bigint()]);
const ensSchema = z.object({
  subdomain: z.string().min(1),
  proof: z.array(bytes32Schema).optional(),
});

const txModeSchema = z
  .enum([
    "aa",
    "account-abstraction",
    "account_abstraction",
    "4337",
    "relayer",
    "2771",
    "meta-tx",
    "meta_tx",
    "direct",
    "raw",
  ])
  .optional();

const metaSchema = z
  .object({
    traceId: z.string().uuid().optional(),
    userId: z.string().min(1).optional(),
    txMode: txModeSchema,
  })
  .optional();

const baseFields = {
  confirm: z.boolean().optional(),
  meta: metaSchema,
};

const CreateJobIntentSchema = z
  .object({
    intent: z.literal("create_job"),
    params: z.object({
      job: z.object({
        rewardAGIA: amountSchema,
        deadline: deadlineSchema,
        spec: z.record(z.any()),
        title: z.string().optional(),
      }),
    }),
  })
  .extend(baseFields);

const ApplyJobIntentSchema = z
  .object({
    intent: z.literal("apply_job"),
    params: z.object({
      jobId: jobIdSchema,
      ens: ensSchema,
    }),
  })
  .extend(baseFields);

const SubmitWorkIntentSchema = z
  .object({
    intent: z.literal("submit_work"),
    params: z.object({
      jobId: jobIdSchema,
      result: z
        .object({
          payload: z.record(z.any()).optional(),
          uri: z.string().optional(),
          hash: bytes32Schema.optional(),
        })
        .refine(
          (value) => value.payload !== undefined || value.uri !== undefined,
          "Provide either a result payload or URI"
        ),
      ens: ensSchema,
    }),
  })
  .extend(baseFields);

const FinalizeIntentSchema = z
  .object({
    intent: z.literal("finalize"),
    params: z.object({
      jobId: jobIdSchema,
      success: z.boolean(),
    }),
  })
  .extend(baseFields);

const StakeIntentSchema = z
  .object({
    intent: z.literal("stake"),
    params: z.object({
      stake: z.object({
        amountAGIA: amountSchema,
        role: z.string().min(1),
      }),
    }),
  })
  .extend(baseFields);

const WithdrawIntentSchema = z
  .object({
    intent: z.literal("withdraw"),
    params: z.object({
      stake: z.object({
        amountAGIA: amountSchema,
        role: z.string().min(1),
      }),
    }),
  })
  .extend(baseFields);

const ValidateIntentSchema = z
  .object({
    intent: z.literal("validate"),
    params: z.record(z.any()).default({}),
  })
  .extend(baseFields);

const DisputeIntentSchema = z
  .object({
    intent: z.literal("dispute"),
    params: z.record(z.any()).default({}),
  })
  .extend(baseFields);

const AdminSetIntentSchema = z
  .object({
    intent: z.literal("admin_set"),
    params: z.record(z.any()).default({}),
  })
  .extend(baseFields);

export const ICSSchema = z.discriminatedUnion("intent", [
  CreateJobIntentSchema,
  ApplyJobIntentSchema,
  SubmitWorkIntentSchema,
  FinalizeIntentSchema,
  ValidateIntentSchema,
  DisputeIntentSchema,
  StakeIntentSchema,
  WithdrawIntentSchema,
  AdminSetIntentSchema,
]);

export type ICSType = z.infer<typeof ICSSchema>;
export type CreateJobIntent = z.infer<typeof CreateJobIntentSchema>;
export type ApplyJobIntent = z.infer<typeof ApplyJobIntentSchema>;
export type SubmitWorkIntent = z.infer<typeof SubmitWorkIntentSchema>;
export type FinalizeIntent = z.infer<typeof FinalizeIntentSchema>;
export type StakeIntent = z.infer<typeof StakeIntentSchema>;
export type WithdrawIntent = z.infer<typeof WithdrawIntentSchema>;

export function validateICS(payload: string): ICSType {
  return ICSSchema.parse(JSON.parse(payload));
}
