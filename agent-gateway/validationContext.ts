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
  if (!Number.isSafeInteger(latest) || latest < 0)
    throw new Error('VALIDATION_BLOCK_UNAVAILABLE');
  const filter = registry.filters.JobCreated(jobId);
  const find = (events: any[]) =>
    events.find((event) => event.args && !event.removed);
  let event: any;
  try {
    event = find(await registry.queryFilter(filter, 0, latest));
  } catch {
    let to = latest;
    let pageSize = 2000;
    while (to >= 0 && !event) {
      const from = Math.max(0, to - pageSize + 1);
      try {
        event = find(await registry.queryFilter(filter, from, to));
      } catch (error) {
        if (pageSize === 1) throw error;
        pageSize = Math.max(1, Math.floor(pageSize / 2));
        continue;
      }
      to = from - 1;
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
