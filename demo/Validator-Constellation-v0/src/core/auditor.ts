import { computeCommitment } from './commitReveal';
import { ZkBatchProver, computeJobRoot } from './zk';
import { selectCommittee } from './vrf';
import {
  AuditContext,
  AuditFinding,
  AuditFindingSeverity,
  AuditReport,
  GovernanceParameters,
  JobResult,
  ValidatorIdentity,
} from './types';

function createFinding(
  severity: AuditFindingSeverity,
  title: string,
  details?: Record<string, unknown>,
): AuditFinding {
  return {
    id: `${severity}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    severity,
    title,
    details,
  };
}

function quorumAchieved(report: AuditContext['report'], governance: GovernanceParameters): boolean {
  return report.reveals.length * 100 >= report.committee.length * governance.quorumPercentage;
}

function computeMajorityVote(report: AuditContext['report']): 'APPROVE' | 'REJECT' {
  const approvals = report.reveals.filter((reveal) => reveal.vote === 'APPROVE').length;
  const rejects = report.reveals.length - approvals;
  return approvals >= rejects ? 'APPROVE' : 'REJECT';
}

function verifyCommitIntegrity(context: AuditContext, findings: AuditFinding[]): boolean {
  const commitMap = new Map(context.report.commits.map((commit) => [commit.validator.address, commit] as const));
  const revealMap = new Map(context.report.reveals.map((reveal) => [reveal.validator.address, reveal] as const));
  let ok = true;

  for (const validator of context.report.committee) {
    if (!commitMap.has(validator.address)) {
      findings.push(
        createFinding('CRITICAL', 'Missing commit for committee member', {
          validator: validator.ensName,
          address: validator.address,
        }),
      );
      ok = false;
    }
  }

  for (const reveal of context.report.reveals) {
    const commit = commitMap.get(reveal.validator.address);
    if (!commit) {
      findings.push(
        createFinding('CRITICAL', 'Reveal without prior commit', {
          validator: reveal.validator.ensName,
          address: reveal.validator.address,
        }),
      );
      ok = false;
      continue;
    }
    const expected = computeCommitment(reveal.vote, reveal.salt);
    if (expected !== commit.commitment) {
      findings.push(
        createFinding('CRITICAL', 'Commitment mismatch detected', {
          validator: reveal.validator.ensName,
          address: reveal.validator.address,
          expected,
          actual: commit.commitment,
        }),
      );
      ok = false;
    }
  }

  return ok;
}

function verifySlashingCoverage(context: AuditContext, findings: AuditFinding[]): boolean {
  const commitAddresses = new Set(context.report.commits.map((commit) => commit.validator.address));
  const revealAddresses = new Set(context.report.reveals.map((reveal) => reveal.validator.address));
  const slashedAddresses = new Set(context.report.slashingEvents.map((event) => event.validator.address));
  let ok = true;

  for (const validator of context.report.committee) {
    if (!revealAddresses.has(validator.address)) {
      if (!slashedAddresses.has(validator.address)) {
        findings.push(
          createFinding('WARNING', 'Non-revealing validator escaped slash', {
            validator: validator.ensName,
            address: validator.address,
          }),
        );
        ok = false;
      }
    }
  }

  const truthful = context.truthfulVote;
  for (const reveal of context.report.reveals) {
    if (reveal.vote !== truthful && !slashedAddresses.has(reveal.validator.address)) {
      findings.push(
        createFinding('WARNING', 'False attestation not slashed', {
          validator: reveal.validator.ensName,
          address: reveal.validator.address,
          vote: reveal.vote,
          truthful,
        }),
      );
      ok = false;
    }
  }

  if (context.report.slashingEvents.length === 0) {
    findings.push(createFinding('INFO', 'No slashing events recorded in round'));
  }

  if (commitAddresses.size !== context.report.committee.length) {
    findings.push(
      createFinding('WARNING', 'Commit count differs from committee size', {
        expected: context.report.committee.length,
        actual: commitAddresses.size,
      }),
    );
    ok = false;
  }

  return ok;
}

function verifyTimeline(context: AuditContext, findings: AuditFinding[]): boolean {
  const { timeline } = context.report;
  let ok = true;
  if (timeline.commitDeadlineBlock < timeline.commitStartBlock) {
    findings.push(
      createFinding('CRITICAL', 'Commit deadline precedes start', {
        start: timeline.commitStartBlock,
        deadline: timeline.commitDeadlineBlock,
      }),
    );
    ok = false;
  }
  if (timeline.revealStartBlock === undefined || timeline.revealDeadlineBlock === undefined) {
    findings.push(createFinding('CRITICAL', 'Reveal window not fully populated'));
    return false;
  }
  if (timeline.revealStartBlock < timeline.commitDeadlineBlock) {
    findings.push(
      createFinding('WARNING', 'Reveal phase began before commit deadline elapsed', {
        revealStart: timeline.revealStartBlock,
        commitDeadline: timeline.commitDeadlineBlock,
      }),
    );
    ok = false;
  }
  if (timeline.revealDeadlineBlock < timeline.revealStartBlock) {
    findings.push(
      createFinding('CRITICAL', 'Reveal deadline precedes start', {
        start: timeline.revealStartBlock,
        deadline: timeline.revealDeadlineBlock,
      }),
    );
    ok = false;
  }
  return ok;
}

function verifySentinelCoverage(context: AuditContext, findings: AuditFinding[]): boolean {
  if (context.report.sentinelAlerts.length === 0) {
    return true;
  }
  const pausedDomains = new Set(context.report.pauseRecords.map((record) => record.domainId));
  let ok = true;
  for (const alert of context.report.sentinelAlerts) {
    if (!pausedDomains.has(alert.domainId)) {
      findings.push(
        createFinding('WARNING', 'Sentinel alert without matching domain pause', {
          domainId: alert.domainId,
          rule: alert.rule,
        }),
      );
      ok = false;
    }
  }
  return ok;
}

function verifyProof(jobBatch: JobResult[], verifyingKey: string, report: AuditContext['report'], findings: AuditFinding[]): boolean {
  const verifier = new ZkBatchProver(verifyingKey as `0x${string}`);
  const verified = verifier.verify(jobBatch, report.proof);
  if (!verified) {
    findings.push(
      createFinding('CRITICAL', 'Zero-knowledge proof failed secondary verification', {
        proofId: report.proof.proofId,
      }),
    );
    return false;
  }
  const root = computeJobRoot(jobBatch);
  if (root !== report.proof.jobRoot) {
    findings.push(
      createFinding('CRITICAL', 'Job root mismatch detected during audit', {
        expected: root,
        actual: report.proof.jobRoot,
      }),
    );
    return false;
  }
  if (jobBatch.length !== report.proof.attestedJobCount) {
    findings.push(
      createFinding('WARNING', 'Attested job count differs from batch length', {
        attested: report.proof.attestedJobCount,
        batchLength: jobBatch.length,
      }),
    );
    return false;
  }
  return true;
}

function verifyVrf(
  context: AuditContext,
  activeValidators: ValidatorIdentity[],
  findings: AuditFinding[],
): boolean {
  const selection = selectCommittee(
    activeValidators,
    context.report.domainId,
    context.report.round,
    context.governance,
    context.onChainEntropy,
    context.recentBeacon,
  );
  const expectedAddresses = selection.committee.map((validator) => validator.address);
  const actualAddresses = context.report.committee.map((validator) => validator.address);
  const vrfSeedMatches = selection.seed === context.report.vrfSeed;
  if (!vrfSeedMatches) {
    findings.push(
      createFinding('CRITICAL', 'VRF seed mismatch', {
        expected: selection.seed,
        actual: context.report.vrfSeed,
      }),
    );
  }
  const committeeMatches = expectedAddresses.every((address, idx) => actualAddresses[idx] === address);
  if (!committeeMatches) {
    findings.push(
      createFinding('CRITICAL', 'Committee order mismatch versus VRF selection', {
        expected: expectedAddresses,
        actual: actualAddresses,
      }),
    );
  }
  return vrfSeedMatches && committeeMatches;
}

export function auditRound(context: AuditContext): AuditReport {
  const findings: AuditFinding[] = [];
  const metrics = {
    committeeSize: context.report.committee.length,
    commitCount: context.report.commits.length,
    revealCount: context.report.reveals.length,
    slashingCount: context.report.slashingEvents.length,
    sentinelAlerts: context.report.sentinelAlerts.length,
    quorumPercentage: context.governance.quorumPercentage,
    attestedJobs: context.report.proof.attestedJobCount,
  };

  const quorumOk = quorumAchieved(context.report, context.governance);
  if (!quorumOk) {
    findings.push(
      createFinding('CRITICAL', 'Quorum threshold not met', {
        quorumPercentage: context.governance.quorumPercentage,
        committeeSize: context.report.committee.length,
        reveals: context.report.reveals.length,
      }),
    );
  }

  const majority = computeMajorityVote(context.report);
  if (majority !== context.report.voteOutcome) {
    findings.push(
      createFinding('CRITICAL', 'Final outcome deviates from majority vote', {
        majority,
        outcome: context.report.voteOutcome,
      }),
    );
  }

  const commitIntegrity = verifyCommitIntegrity(context, findings);
  const slashingIntegrity = verifySlashingCoverage(context, findings);
  const timelineIntegrity = verifyTimeline(context, findings);
  const sentinelIntegrity = verifySentinelCoverage(context, findings);
  const proofIntegrity = verifyProof(context.jobBatch, context.verifyingKey, context.report, findings);
  const vrfIntegrity = verifyVrf(context, context.activeValidators, findings);

  const pass = findings.every((finding) => finding.severity !== 'CRITICAL');

  return {
    pass,
    findings,
    metrics: {
      ...metrics,
      quorumAchieved: quorumOk,
    },
    crossChecks: {
      commitIntegrity,
      slashingIntegrity,
      timelineIntegrity,
      sentinelIntegrity,
      proofIntegrity,
      vrfIntegrity,
    },
    summary: {
      outcome: context.report.voteOutcome,
      majority,
    },
  };
}
