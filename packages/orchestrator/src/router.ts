import { z } from "zod";
import * as job from "./tools/job";
import * as stake from "./tools/stake";
import * as validation from "./tools/validation";
import * as dispute from "./tools/dispute";

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
    "clarify"
  ]),
  params: z.record(z.any()).default({}),
  confirm: z.boolean().optional(),
  meta: z
    .object({
      traceId: z.string().optional(),
      userId: z.string().optional()
    })
    .optional()
});

export type ICSType = z.infer<typeof ICSSchema>;

export function validateICS(payload: string): ICSType {
  return ICSSchema.parse(JSON.parse(payload));
}

export async function* route(ics: ICSType): AsyncGenerator<string> {
  switch (ics.intent) {
    case "create_job":
      yield* job.createJob(ics);
      return;
    case "apply_job":
      yield* job.applyJob(ics);
      return;
    case "submit_work":
      yield* job.submitWork(ics);
      return;
    case "finalize":
      yield* job.finalize(ics);
      return;
    case "validate":
      yield* validation.commitReveal(ics);
      return;
    case "dispute":
      yield* dispute.raise(ics);
      return;
    case "stake":
      yield* stake.deposit(ics);
      return;
    case "withdraw":
      yield* stake.withdraw(ics);
      return;
    case "admin_set":
      yield "Admin actions are not yet implemented.\n";
      return;
    case "clarify":
      yield "Could you clarify the amount, deadline, or job id?\n";
      return;
    default:
      yield `Unsupported intent: ${ics.intent}.\n`;
      return;
  }
}
