import { z } from "zod";
import * as job from "./tools/job";
import * as stake from "./tools/stake";
import * as validation from "./tools/validation";
import * as dispute from "./tools/dispute";

type AsyncGeneratorString = AsyncGenerator<string, void, unknown>;

export const ICSSchema = z.object({
  intent: z.enum([
    "create_job",
    "apply_job",
    "submit_work",
    "validate",
    "finalize",
    "dispute",
    "stake",
    "withdraw",
    "admin_set",
  ]),
  params: z.record(z.any()).default({}),
  confirm: z.boolean().optional(),
  meta: z
    .object({
      traceId: z.string().uuid().optional(),
      userId: z.string().optional(),
    })
    .optional(),
});

export type ICSType = z.infer<typeof ICSSchema>;

export function validateICS(payload: string): ICSType {
  return ICSSchema.parse(JSON.parse(payload));
}

export function route(ics: ICSType): AsyncGeneratorString {
  switch (ics.intent) {
    case "create_job":
      return job.createJob(ics);
    case "apply_job":
      return job.applyJob(ics);
    case "submit_work":
      return job.submitWork(ics);
    case "finalize":
      return job.finalize(ics);
    case "validate":
      return validation.commitReveal(ics);
    case "dispute":
      return dispute.raise(ics);
    case "stake":
      return stake.deposit(ics);
    case "withdraw":
      return stake.withdraw(ics);
    default:
      return (async function* unsupported() {
        yield `Unsupported intent: ${ics.intent}\n`;
      })();
  }
}
