import fs from 'fs';
import path from 'path';
import {
  DemoOrchestrationReport,
  DomainConfig,
  DomainState,
  GovernanceParameters,
  Hex,
  JobResult,
  NodeIdentity,
  PauseRecord,
  SubgraphRecord,
  VoteValue,
} from './types';
import { auditRound } from './auditor';

export const JSON_REPLACER = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

const WEI_PER_ETH = 10n ** 18n;

function writeJSON(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(data, JSON_REPLACER, 2);
  fs.writeFileSync(filePath, serialized);
}

function writeText(filePath: string, data: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data, 'utf8');
}

function formatDomainState(state: DomainState): DomainState {
  return {
    ...state,
    config: {
      ...state.config,
      unsafeOpcodes: new Set(state.config.unsafeOpcodes),
      allowedTargets: new Set(state.config.allowedTargets),
      forbiddenSelectors: new Set(state.config.forbiddenSelectors),
    },
    pauseReason: state.pauseReason ? { ...state.pauseReason } : undefined,
  };
}

function cloneDomainConfig(config: DomainConfig): DomainConfig {
  return {
    ...config,
    unsafeOpcodes: new Set(config.unsafeOpcodes),
    allowedTargets: new Set(config.allowedTargets),
    forbiddenSelectors: new Set(config.forbiddenSelectors),
  };
}

export interface ReportContext {
  verifyingKey: Hex;
  entropyBefore: { onChainEntropy: Hex; recentBeacon: Hex };
  entropyAfter: { onChainEntropy: Hex; recentBeacon: Hex };
  governance: GovernanceParameters;
  sentinelGraceRatio: number;
  nodesRegistered: NodeIdentity[];
  primaryDomain: DomainState;
  updatedSafety?: DomainConfig;
  maintenance?: { pause?: PauseRecord; resume?: PauseRecord };
  scenarioName?: string;
  ownerNotes?: Record<string, unknown>;
  jobSample?: JobResult[];
}

function truncateHex(value: Hex, length = 14): string {
  return value.length > length + 2 ? `${value.slice(0, length + 2)}…` : value;
}

function formatBigint(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${digits}`;
}

function formatEth(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const integer = absolute / WEI_PER_ETH;
  const remainder = absolute % WEI_PER_ETH;
  if (remainder === 0n) {
    return `${negative ? '-' : ''}${integer.toString()} ETH`;
  }
  const fractional = remainder
    .toString()
    .padStart(18, '0')
    .replace(/0+$/, '')
    .slice(0, 6);
  const formatted = fractional.length > 0 ? `${integer.toString()}.${fractional}` : integer.toString();
  return `${negative ? '-' : ''}${formatted} ETH`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function summarizeAlerts(alerts: DemoOrchestrationReport['sentinelAlerts']): string {
  if (alerts.length === 0) {
    return '_No sentinel anomalies were detected in this round._';
  }
  return alerts
    .map((alert, index) => {
      const offender = alert.offender ? `${alert.offender.ensName} (${alert.offender.address})` : 'unknown actor';
      return `${index + 1}. **${alert.rule}** – ${alert.description} _(severity: ${alert.severity}, offender: ${offender})_`;
    })
    .join('\n');
}

function summarizeSlashing(events: DemoOrchestrationReport['slashingEvents']): string {
  if (events.length === 0) {
    return '_No slashing events were emitted in this round._';
  }
  return events
    .map((event, index) => {
      const penalty = formatEth(event.penalty);
      return `${index + 1}. ${event.validator.ensName} (${event.validator.address}) lost **${penalty}** for ${event.reason}.`;
    })
    .join('\n');
}

function summarizePauses(records: DemoOrchestrationReport['pauseRecords']): string {
  if (records.length === 0) {
    return '_No domain pauses were required._';
  }
  return records
    .map((record, index) => {
      const resumed = record.resumedAt ? ` → resumed at ${formatTimestamp(record.resumedAt)}` : ' → still paused';
      return `${index + 1}. ${record.domainId} paused for "${record.reason}" at ${formatTimestamp(record.timestamp)}${resumed}.`;
    })
    .join('\n');
}

function summarizeCommittee(report: DemoOrchestrationReport): string {
  return report.committee
    .map((member) => `- ${member.ensName} — ${formatEth(member.stake)}`)
    .join('\n');
}

function summarizeSubgraph(records: SubgraphRecord[]): string {
  if (records.length === 0) {
    return '_No subgraph telemetry was recorded._';
  }
  const typeCount = new Map<string, number>();
  for (const record of records) {
    typeCount.set(record.type, (typeCount.get(record.type) ?? 0) + 1);
  }
  return Array.from(typeCount.entries())
    .map(([type, count]) => `- ${type}: ${count}`)
    .join('\n');
}

function summarizeValidatorStatus(records: SubgraphRecord[]): string {
  const relevant = records.filter((record) => record.type === 'VALIDATOR_STATUS');
  if (relevant.length === 0) {
    return '_No validator status changes were recorded._';
  }
  return relevant
    .map((record, index) => {
      const payload = record.payload as {
        validator?: { ensName?: string; address?: string };
        status?: string;
        reason?: string;
        remainingStake?: string | number | bigint;
        timestamp?: number;
        txHash?: string;
      };
      const validator = payload.validator?.ensName ?? payload.validator?.address ?? 'unknown validator';
      const remaining =
        typeof payload.remainingStake === 'bigint'
          ? `${payload.remainingStake.toString()} wei`
          : payload.remainingStake !== undefined
            ? `${payload.remainingStake}`
            : 'unknown stake';
      const timestamp = payload.timestamp ? new Date(Number(payload.timestamp)).toISOString() : 'timestamp unavailable';
      const status = payload.status ?? 'STATUS_UNKNOWN';
      const reason = payload.reason ?? 'unspecified';
      const txHash = payload.txHash ? ` (${payload.txHash})` : '';
      return `${index + 1}. ${validator} → ${status} (${reason}) at ${timestamp}, remaining stake ${remaining}${txHash}`;
    })
    .join('\n');
}

function buildOwnerDigest(params: {
  report: DemoOrchestrationReport;
  context: ReportContext;
  audit: ReturnType<typeof auditRound>;
  truthfulVote: VoteValue;
  subgraphRecords: SubgraphRecord[];
}): string {
  const { report, context, audit, truthfulVote, subgraphRecords } = params;
  const pauseSummary = summarizePauses(report.pauseRecords);
  const alertsSummary = summarizeAlerts(report.sentinelAlerts);
  const slashingSummary = summarizeSlashing(report.slashingEvents);
  const committeeSummary = summarizeCommittee(report);
  const subgraphSummary = summarizeSubgraph(subgraphRecords);
  const statusEvents = subgraphRecords.filter((record) => record.type === 'VALIDATOR_STATUS');
  const validatorStatusSummary = summarizeValidatorStatus(subgraphRecords);
  const quorum = `${context.governance.quorumPercentage}%`; // ensure string formatting
  const revealCount = `${report.reveals.length} / ${report.committee.length}`;
  const metrics: Array<[string, string]> = [
    ['Truthful vote', `\`${truthfulVote}\``],
    ['Final outcome', `\`${report.voteOutcome}\``],
    ['Committee size', `${report.committee.length}`],
    ['Reveals received', revealCount],
    ['Quorum requirement', quorum],
    ['Jobs attested', `${report.proof.attestedJobCount}`],
    ['Slashing events', `${report.slashingEvents.length}`],
    ['Sentinel alerts', `${report.sentinelAlerts.length}`],
    ['Forbidden selectors', `${context.primaryDomain.config.forbiddenSelectors.size}`],
    ['Validator status events', `${statusEvents.length}`],
    ['Audit hash', audit.auditHash],
    ['Entropy transcript', report.vrfWitness.transcript],
    ['ZK verifying key', context.verifyingKey],
    ['Subgraph records', `${subgraphRecords.length}`],
  ];

  const checklist = [
    ['Commitments sealed', audit.commitmentsVerified],
    ['Quorum satisfied', audit.quorumSatisfied],
    ['Proof verified', audit.proofVerified],
    ['Entropy verified', audit.entropyVerified],
    ['Sentinel integrity', audit.sentinelIntegrity],
    ['Timeline integrity', audit.timelineIntegrity],
  ]
    .map(([label, ok]) => `- ${ok ? '✅' : '❌'} ${label}`)
    .join('\n');

  const domainBudget = formatBigint(context.primaryDomain.config.budgetLimit);

  const mermaid = `flowchart TD\n  Owner["Owner Control"] --> Governance["Governance ${quorum} quorum"];\n  Governance --> Committee["Committee\\n${report.committee
    .map((member) => member.ensName)
    .join('\\n')}"];\n  Committee --> Proof["ZK Proof\\n${report.proof.attestedJobCount} jobs"];\n  Committee --> Slashing["Slashing\\n${report.slashingEvents.length} events"];\n  Sentinel["Sentinel Monitors"] --> Alerts["Alerts\\n${report.sentinelAlerts.length}"];\n  Sentinel --> Pause["Domain Pause"];\n  Pause --> Domain["${context.primaryDomain.config.humanName}\\nBudget ${domainBudget}\\nSelectors ${Array.from(context.primaryDomain.config.forbiddenSelectors).length}"];`;

  const metricsTable = ['| Metric | Value |', '| --- | --- |', ...metrics.map(([label, value]) => `| ${label} | ${value} |`)].join('\n');

  return [
    '# Validator Constellation – Owner Mission Briefing',
    '',
    `**Round ${report.round} – ${context.primaryDomain.config.humanName} (${report.domainId})**`,
    '',
    metricsTable,
    '',
    '## Governance & Audit Checklist',
    checklist,
    '',
    '## Committee Stakes',
    committeeSummary || '_No committee members registered._',
    '',
    '## Sentinel Alerts',
    alertsSummary,
    '',
    '## Domain Pause Log',
    pauseSummary,
    '',
    '## Slashing Actions',
    slashingSummary,
    '',
    '## Validator Status Movements',
    validatorStatusSummary,
    '',
    '## Subgraph Telemetry Footprint',
    subgraphSummary,
    '',
    '```mermaid',
    mermaid,
    '```',
    '',
    '_Generated automatically by AGI Jobs v0 (v2) so non-technical owners can assert full control with cryptographic evidence._',
  ].join('\n');
}

function buildCommitteeDiagram(result: DemoOrchestrationReport): string {
  const nodeBranch =
    result.nodes.length > 0
      ? `\n  control["Node Orchestrators\\n${result.nodes
          .map((node) => node.ensName)
          .join('\\n')}"] --> owner;`
      : '';
  const seedLabel = truncateHex(result.vrfSeed, 20);
  const keccakLabel = truncateHex(result.vrfWitness.keccakSeed, 18);
  const shaLabel = truncateHex(result.vrfWitness.shaSeed, 18);
  return `graph LR\n  owner["👁️ Sentinel Governor"] --> committee;\n  witness["Entropy Witness\\nkeccak: ${keccakLabel}\\nsha: ${shaLabel}"] --> randomness;\n  randomness["VRF Transcript\\n${seedLabel}"] --> committee;\n  committee["Validator Committee\\n${result.committee
    .map((v) => v.ensName)
    .join('\\n')}"] --> zk["ZK Batch Proof\\n${result.proof.proofId}"];\n  committee --> commits;\n  commits --> reveals;\n  reveals --> outcome["Final Outcome: ${result.voteOutcome}"];${nodeBranch}`;
}

function buildSentinelDiagram(domainId: string): string {
  return `sequenceDiagram\n  participant Agent as Domain Agent\n  participant Sentinel as Sentinel Guardian\n  participant Domain as Domain Controller\n  Agent->>Sentinel: Overspend or unsafe call\n  Sentinel->>Domain: pause(${domainId})\n  Domain-->>Agent: Execution Halted`;
}

function generateDashboardHTML(result: DemoOrchestrationReport, context: ReportContext): string {
  const jobSample = context.jobSample ?? [];
  const committeeDiagram = buildCommitteeDiagram(result);
  const sentinelDiagram = buildSentinelDiagram(result.domainId);
  const scenarioTitle = context.scenarioName ?? 'Validator Constellation Guardian Deck';
  const ownerNotes = context.ownerNotes && Object.keys(context.ownerNotes).length > 0 ? context.ownerNotes : undefined;
  const timeline = {
    commitStartBlock: result.timeline.commitStartBlock,
    commitDeadlineBlock: result.timeline.commitDeadlineBlock,
    revealStartBlock: result.timeline.revealStartBlock,
    revealDeadlineBlock: result.timeline.revealDeadlineBlock,
  };
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${scenarioTitle}</title>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ startOnLoad: true, theme: 'dark' });
    </script>
    <style>
      body { font-family: 'Inter', Arial, sans-serif; background: #030712; color: #e0f2fe; margin: 0; padding: 2rem; }
      h1 { font-size: 2.5rem; margin-bottom: 0.75rem; }
      .subtitle { margin-bottom: 2rem; font-size: 1.1rem; opacity: 0.85; }
      .grid { display: grid; gap: 2rem; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
      section { background: rgba(15, 118, 110, 0.18); border-radius: 16px; padding: 1.5rem; box-shadow: 0 0 40px rgba(14, 116, 144, 0.45); }
      pre { background: rgba(15, 23, 42, 0.8); padding: 1rem; border-radius: 12px; overflow-x: auto; }
      .metric { font-size: 1.2rem; margin-bottom: 0.3rem; }
    </style>
  </head>
  <body>
    <h1>${scenarioTitle}</h1>
    <p class="subtitle">Autonomous validator governance run executed entirely through AGI Jobs v0 (v2).</p>
    <div class="grid">
      <section>
        <h2>Committee Pipeline</h2>
        <div class="mermaid">${committeeDiagram}</div>
      </section>
      <section>
        <h2>Sentinel Guardrail</h2>
        <div class="mermaid">${sentinelDiagram}</div>
      </section>
      <section>
        <h2>Batch Metrics</h2>
        <div class="metric">Jobs attested: <strong>${result.proof.attestedJobCount}</strong></div>
        <div class="metric">Validators slashed: <strong>${result.slashingEvents.length}</strong></div>
        <div class="metric">Alerts triggered: <strong>${result.sentinelAlerts.length}</strong></div>
        <div class="metric">Domain controllers online: <strong>${result.nodes.length}</strong></div>
        <div class="metric">VRF seed: <strong>${result.vrfSeed}</strong></div>
        <div class="metric">Entropy keccak: <strong>${result.vrfWitness.keccakSeed}</strong></div>
        <div class="metric">Entropy sha256: <strong>${result.vrfWitness.shaSeed}</strong></div>
        <div class="metric">ZK verifying key: <strong>${context.verifyingKey}</strong></div>
        <pre>${JSON.stringify(
          {
            jobRoot: result.proof.jobRoot,
            witness: result.proof.witnessCommitment,
            sealedOutput: result.proof.sealedOutput,
          },
          null,
          2,
        )}</pre>
      </section>
      <section>
        <h2>Node Identities</h2>
        <pre>${JSON.stringify(result.nodes, null, 2)}</pre>
      </section>
      <section>
        <h2>Entropy Rotation</h2>
        <pre>${JSON.stringify({ before: context.entropyBefore, after: context.entropyAfter }, null, 2)}</pre>
      </section>
      <section>
        <h2>Governance Parameters</h2>
        <pre>${JSON.stringify(
          {
            parameters: context.governance,
            sentinelGraceRatio: context.sentinelGraceRatio,
            domainCalldataLimit: context.primaryDomain.config.maxCalldataBytes,
          },
          null,
          2,
        )}</pre>
      </section>
      <section>
        <h2>Round Timeline</h2>
        <pre>${JSON.stringify(timeline, null, 2)}</pre>
      </section>
      <section>
        <h2>Job Sample</h2>
        <pre>${JSON.stringify(jobSample, null, 2)}</pre>
      </section>
      <section>
        <h2>Owner Notes</h2>
        <pre>${JSON.stringify(
          ownerNotes ?? {
            message: 'Provide scenario owner notes via context.ownerNotes',
          },
          null,
          2,
        )}</pre>
      </section>
      <section>
        <h2>Domain Guardrails</h2>
        <pre>${JSON.stringify(
          {
            unsafeOpcodes: Array.from(context.primaryDomain.config.unsafeOpcodes),
            allowedTargets: Array.from(context.primaryDomain.config.allowedTargets),
            maxCalldataBytes: context.primaryDomain.config.maxCalldataBytes,
            forbiddenSelectors: Array.from(context.primaryDomain.config.forbiddenSelectors),
          },
          null,
          2,
        )}</pre>
      </section>
    </div>
  </body>
</html>`;
}

export interface ArtifactInput {
  reportDir: string;
  roundResult: DemoOrchestrationReport;
  subgraphRecords: SubgraphRecord[];
  events: unknown[];
  context: ReportContext;
  jobBatch: JobResult[];
  truthfulVote: VoteValue;
}

export function writeReportArtifacts(input: ArtifactInput): void {
  const { reportDir, roundResult, subgraphRecords, events, context, jobBatch, truthfulVote } = input;
  const formattedDomain = formatDomainState(context.primaryDomain);
  const updatedSafety = context.updatedSafety ? cloneDomainConfig(context.updatedSafety) : undefined;
  const entropySources = context.entropyAfter ?? context.entropyBefore;
  const audit = auditRound({
    report: roundResult,
    jobBatch,
    governance: context.governance,
    verifyingKey: context.verifyingKey,
    truthfulVote,
    entropySources,
  });
  const summary: Record<string, unknown> = {
    scenarioName: context.scenarioName ?? 'default',
    round: roundResult.round,
    outcome: roundResult.voteOutcome,
    truthfulVote,
    committee: roundResult.committee.map((member) => ({
      ens: member.ensName,
      stake: member.stake.toString(),
    })),
    vrfSeed: roundResult.vrfSeed,
    vrfWitness: {
      ...roundResult.vrfWitness,
      sources: [...roundResult.vrfWitness.sources],
    },
    nodes: {
      registered: context.nodesRegistered,
      active: roundResult.nodes,
    },
    proof: roundResult.proof,
    alerts: roundResult.sentinelAlerts,
    slashing: roundResult.slashingEvents,
    timeline: roundResult.timeline,
    pauseRecords: roundResult.pauseRecords,
    governance: {
      parameters: context.governance,
      sentinelGraceRatio: context.sentinelGraceRatio,
      entropy: {
        before: context.entropyBefore,
        after: context.entropyAfter,
      },
      zkVerifyingKey: context.verifyingKey,
      maintenance: context.maintenance,
        domainSafety: {
          ...formattedDomain,
          config: {
            ...formattedDomain.config,
            unsafeOpcodes: Array.from(formattedDomain.config.unsafeOpcodes),
            allowedTargets: Array.from(formattedDomain.config.allowedTargets),
            maxCalldataBytes: formattedDomain.config.maxCalldataBytes,
            forbiddenSelectors: Array.from(formattedDomain.config.forbiddenSelectors),
          },
        },
        updatedSafety: updatedSafety
          ? {
              ...updatedSafety,
              unsafeOpcodes: Array.from(updatedSafety.unsafeOpcodes),
              allowedTargets: Array.from(updatedSafety.allowedTargets),
              maxCalldataBytes: updatedSafety.maxCalldataBytes,
              forbiddenSelectors: Array.from(updatedSafety.forbiddenSelectors),
            }
          : undefined,
    },
    ownerNotes: context.ownerNotes ?? {},
    audit,
  };

  if (context.jobSample) {
    Object.assign(summary, { jobSample: context.jobSample });
  }

  const validatorStatusEvents = subgraphRecords
    .filter((record) => record.type === 'VALIDATOR_STATUS')
    .map((record) => {
      const payload = record.payload as {
        validator?: { ensName?: string; address?: string };
        status?: string;
        reason?: string;
        remainingStake?: bigint | string | number;
        timestamp?: number;
        txHash?: string;
      };
      return {
        blockNumber: record.blockNumber,
        status: payload.status ?? 'UNKNOWN',
        reason: payload.reason ?? 'unspecified',
        remainingStake:
          typeof payload.remainingStake === 'bigint'
            ? payload.remainingStake.toString()
            : payload.remainingStake ?? 'unknown',
        validator: payload.validator?.ensName ?? payload.validator?.address ?? 'unknown',
        timestamp: payload.timestamp,
        txHash: payload.txHash,
      };
    });

  if (validatorStatusEvents.length > 0) {
    summary.validators = {
      ...(summary.validators as Record<string, unknown> | undefined),
      statusTransitions: validatorStatusEvents,
    };
  }

  writeJSON(path.join(reportDir, 'summary.json'), summary);
  writeJSON(path.join(reportDir, 'subgraph.json'), subgraphRecords);
  writeJSON(path.join(reportDir, 'audit.json'), audit);
  writeJSON(path.join(reportDir, 'jobs.json'), jobBatch);
  writeJSON(path.join(reportDir, 'round.json'), roundResult);

  const ndjson = events.map((event) => JSON.stringify(event, JSON_REPLACER)).join('\n');
  writeText(path.join(reportDir, 'events.ndjson'), ndjson ? `${ndjson}\n` : '');

  const dashboardHtml = generateDashboardHTML(roundResult, context);
  writeText(path.join(reportDir, 'dashboard.html'), dashboardHtml);

  const ownerDigest = buildOwnerDigest({
    report: roundResult,
    context,
    audit,
    truthfulVote,
    subgraphRecords,
  });
  writeText(path.join(reportDir, 'owner-digest.md'), ownerDigest);
}
