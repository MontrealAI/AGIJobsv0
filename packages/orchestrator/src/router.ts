import * as job from "./tools/job.js";
import * as stake from "./tools/stake.js";
import * as validation from "./tools/validation.js";
import * as dispute from "./tools/dispute.js";
import type {
  ApplyJobIntent,
  CreateJobIntent,
  FinalizeIntent,
  ICSType,
  StakeIntent,
  SubmitWorkIntent,
  WithdrawIntent,
} from "./ics.js";

export { validateICS, ICSSchema } from "./ics.js";
export type {
  ApplyJobIntent,
  CreateJobIntent,
  FinalizeIntent,
  ICSType,
  StakeIntent,
  SubmitWorkIntent,
  WithdrawIntent,
} from "./ics.js";

export {
  createJobDryRun,
  createJobExecute,
  applyJobDryRun,
  applyJobExecute,
  submitWorkDryRun,
  submitWorkExecute,
  finalizeDryRun,
  finalizeExecute,
} from "./tools/job.js";

export {
  depositDryRun,
  depositExecute,
  withdrawDryRun,
  withdrawExecute,
} from "./tools/stake.js";

export { validateDryRun, validateExecute } from "./tools/validation.js";

export { disputeDryRun, disputeExecute } from "./tools/dispute.js";

type AsyncGeneratorString = AsyncGenerator<string, void, unknown>;

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
