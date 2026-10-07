import { Contract, Provider } from 'ethers';
import {
  classifyJob,
  fetchCommittedJobSpec,
} from '../apps/orchestrator/jobClassifier';
import { needsIndependentReview } from '../apps/orchestrator/validation';

export async function assertAutomaticValidationAllowed(
  registry: Contract,
  provider: Provider,
  jobId: string
): Promise<void> {
  const latest = await provider.getBlockNumber();
  const filter = registry.filters.JobCreated(jobId);
  const find = (events: any[]) =>
    events.find((event) => event.args && !event.removed);
  let event: any;
  try {
    event = find(await registry.queryFilter(filter, 0, latest));
  } catch {
    for (let to = latest; to >= 0 && !event; to -= 2000) {
      event = find(
        await registry.queryFilter(filter, Math.max(0, to - 1999), to)
      );
    }
  }
  if (!event) throw new Error('VALIDATION_SPECIFICATION_UNAVAILABLE');
  const specHash = await registry.getSpecHash(jobId);
  if (specHash !== (event.args.specHash ?? event.args[6])) {
    throw new Error('VALIDATION_SPECIFICATION_MISMATCH');
  }
  const uri = event.args.uri ?? event.args[7];
  const spec = await fetchCommittedJobSpec(
    uri,
    specHash,
    process.env.IPFS_GATEWAY_URL
  );
  if (!spec) throw new Error('VALIDATION_SPECIFICATION_UNAVAILABLE');
  if (
    needsIndependentReview(classifyJob({ jobId, uri }, spec ?? undefined), spec)
  ) {
    throw new Error('VALIDATION_INDEPENDENT_REVIEW_REQUIRED');
  }
}
