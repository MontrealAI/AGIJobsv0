import { keccak256, solidityPacked } from "ethers";
import type { JobResult } from "./zkBatchAggregator";

export interface JobSpec {
  readonly jobId: string;
  readonly domain: string;
  readonly payloadHash: string;
  readonly outcome: "success" | "failed";
}

export function generateJobResults(count: number, domain: string): JobResult[] {
  const results: JobResult[] = [];
  for (let i = 0; i < count; i += 1) {
    const jobId = `${domain}-job-${i + 1}`;
    const outcome = i % 97 === 0 ? "failed" : "success";
    const commitment = keccak256(
      solidityPacked([
        "string",
        "string",
        "string",
      ], [
        jobId,
        domain,
        outcome,
      ])
    );
    results.push({ jobId, verdict: outcome, commitment });
  }
  return results;
}
