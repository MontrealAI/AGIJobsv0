import { keccak256, toUtf8Bytes } from 'ethers';
import { computeCommitment } from './commitReveal';
import { verifyEntropyWitness } from './entropy';
import { ZkBatchProver } from './zk';
import {
  DemoOrchestrationReport,
  GovernanceParameters,
  Hex,
  JobResult,
  VoteValue,
} from './types';

export interface RoundAuditInput {
  report: DemoOrchestrationReport;
  jobBatch: JobResult[];
  governance: GovernanceParameters;
  verifyingKey: Hex;
  truthfulVote: VoteValue;
  entropySources: { onChainEntropy: Hex; recentBeacon: Hex };
}

export interface RoundAuditResult {
  commitmentsVerified: boolean;
  quorumSatisfied: boolean;
  proofVerified: boolean;
  entropyVerified: boolean;
  sentinelIntegrity: boolean;
  sentinelSlaSatisfied: boolean;
  timelineIntegrity: boolean;
  nonRevealValidators: Hex[];
  dishonestValidators: Hex[];
  slashedValidators: Array<{ address: Hex; penalty: string; reason: string }>;
  recomputedVoteOutcome: VoteValue;
  issues: string[];
  auditHash: Hex;
}

function stringifyForHash(result: Omit<RoundAuditResult, 'auditHash'>): string {
  return JSON.stringify(
    {
      ...result,
      slashedValidators: result.slashedValidators.map((entry) => ({
        ...entry,
        penalty: entry.penalty.toString(),
      })),
    },
    null,
    2,
  );
}

export function auditRound(input: RoundAuditInput): RoundAuditResult {
  const { report, jobBatch, governance, verifyingKey, truthfulVote, entropySources } = input;
  const issues: string[] = [];

  const SENTINEL_SLA_MS = 1_000;

  const commitMap = new Map(report.commits.map((commit) => [commit.validator.address, commit]));
  const revealMap = new Map(report.reveals.map((reveal) => [reveal.validator.address, reveal]));
  const committeeAddresses = new Set(report.committee.map((member) => member.address));

  const voteTallies: Record<VoteValue, number> = { APPROVE: 0, REJECT: 0 };
  for (const reveal of report.reveals) {
    voteTallies[reveal.vote] += 1;
  }

  const recomputedVoteOutcome: VoteValue =
    voteTallies.APPROVE === voteTallies.REJECT
      ? truthfulVote
      : voteTallies.APPROVE > voteTallies.REJECT
        ? 'APPROVE'
        : 'REJECT';

  if (report.voteOutcome !== recomputedVoteOutcome) {
    issues.push(
      `reported outcome ${report.voteOutcome} does not match recomputed majority (${recomputedVoteOutcome})`,
    );
  }

  let commitmentsVerified = true;
  for (const reveal of report.reveals) {
    const commit = commitMap.get(reveal.validator.address);
    if (!commit) {
      commitmentsVerified = false;
      issues.push(`missing commit for reveal validator ${reveal.validator.address}`);
      continue;
    }
    const recomputed = computeCommitment(reveal.vote, reveal.salt);
    if (recomputed !== commit.commitment) {
      commitmentsVerified = false;
      issues.push(`commitment mismatch for ${reveal.validator.address}`);
    }
    if (commit.submittedAtBlock < report.timeline.commitStartBlock || commit.submittedAtBlock > report.timeline.commitDeadlineBlock) {
      commitmentsVerified = false;
      issues.push(`commit for ${reveal.validator.address} outside commit window`);
    }
    if (
      report.timeline.revealStartBlock === undefined ||
      report.timeline.revealDeadlineBlock === undefined ||
      reveal.submittedAtBlock < report.timeline.revealStartBlock ||
      reveal.submittedAtBlock > report.timeline.revealDeadlineBlock
    ) {
      commitmentsVerified = false;
      issues.push(`reveal for ${reveal.validator.address} outside reveal window`);
    }
  }

  const nonRevealValidators: Hex[] = [];
  for (const address of committeeAddresses) {
    if (!revealMap.has(address)) {
      nonRevealValidators.push(address);
    }
  }

  const dishonestValidators = report.reveals
    .filter((reveal) => reveal.vote !== truthfulVote)
    .map((reveal) => reveal.validator.address as Hex);

  const quorumSatisfied =
    revealMap.size * 100 >= Math.ceil(committeeAddresses.size * governance.quorumPercentage);
  if (!quorumSatisfied) {
    issues.push('quorum threshold not satisfied');
  }

  const expectedCommitWindow =
    report.timeline.commitDeadlineBlock - report.timeline.commitStartBlock;
  const expectedRevealWindow =
    (report.timeline.revealDeadlineBlock ?? 0) - (report.timeline.revealStartBlock ?? 0);
  const timelineIntegrity =
    expectedCommitWindow === governance.commitPhaseBlocks &&
    expectedRevealWindow === governance.revealPhaseBlocks;
  if (!timelineIntegrity) {
    issues.push('timeline does not align with governance parameters');
  }

  const auditor = new ZkBatchProver(verifyingKey);
  const proofVerified = auditor.verify(jobBatch, report.proof);
  if (!proofVerified) {
    issues.push('zk proof verification failed under audit');
  }

  const entropyVerified = verifyEntropyWitness(report.vrfWitness, {
    domainId: report.domainId,
    round: report.round,
    sources: [entropySources.onChainEntropy, entropySources.recentBeacon],
  });
  if (!entropyVerified) {
    issues.push('entropy witness verification failed under audit');
  }

  let sentinelIntegrity = true;
  let sentinelSlaSatisfied = true;
  if (report.sentinelAlerts.length > 0) {
    const pauseByDomain = new Map(report.pauseRecords.map((record) => [record.domainId, record]));
    for (const alert of report.sentinelAlerts) {
      const pause = pauseByDomain.get(alert.domainId);
      if (!pause) {
        sentinelIntegrity = false;
        sentinelSlaSatisfied = false;
        issues.push(`sentinel alert without matching pause for domain ${alert.domainId}`);
        continue;
      }
      const delta = Math.abs((pause.timestamp ?? 0) - alert.timestamp);
      if (delta > SENTINEL_SLA_MS) {
        sentinelSlaSatisfied = false;
        issues.push(
          `sentinel pause for ${alert.domainId} exceeded SLA (${delta}ms > ${SENTINEL_SLA_MS}ms)`,
        );
      }
    }
  }

  const slashedValidators = report.slashingEvents.map((event) => ({
    address: event.validator.address,
    penalty: event.penalty.toString(),
    reason: event.reason,
  }));

  const baseResult = {
    commitmentsVerified,
    quorumSatisfied,
    proofVerified,
    entropyVerified,
    sentinelIntegrity,
    sentinelSlaSatisfied,
    timelineIntegrity,
    nonRevealValidators,
    dishonestValidators,
    slashedValidators,
    recomputedVoteOutcome,
    issues,
  };

  const auditHash = keccak256(toUtf8Bytes(stringifyForHash(baseResult)));

  return {
    ...baseResult,
    auditHash: auditHash as Hex,
  };
}
