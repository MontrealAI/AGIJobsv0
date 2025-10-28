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
} from './types';

export const JSON_REPLACER = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

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
    },
    pauseReason: state.pauseReason ? { ...state.pauseReason } : undefined,
  };
}

function cloneDomainConfig(config: DomainConfig): DomainConfig {
  return {
    ...config,
    unsafeOpcodes: new Set(config.unsafeOpcodes),
    allowedTargets: new Set(config.allowedTargets),
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
  const allowedTargets = Array.from(context.primaryDomain.config.allowedTargets);
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
          },
          null,
          2,
        )}</pre>
      </section>
      <section>
        <h2>Domain Guardrails</h2>
        <pre>${JSON.stringify(
          {
            domain: context.primaryDomain.config.id,
            unsafeOpcodes: Array.from(context.primaryDomain.config.unsafeOpcodes),
            allowedTargets,
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
}

export function writeReportArtifacts(input: ArtifactInput): void {
  const { reportDir, roundResult, subgraphRecords, events, context } = input;
  const formattedDomain = formatDomainState(context.primaryDomain);
  const updatedSafety = context.updatedSafety ? cloneDomainConfig(context.updatedSafety) : undefined;
  const summary = {
    scenarioName: context.scenarioName ?? 'default',
    round: roundResult.round,
    outcome: roundResult.voteOutcome,
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
        },
      },
      updatedSafety: updatedSafety
        ? {
            ...updatedSafety,
            unsafeOpcodes: Array.from(updatedSafety.unsafeOpcodes),
            allowedTargets: Array.from(updatedSafety.allowedTargets),
          }
        : undefined,
    },
    ownerNotes: context.ownerNotes ?? {},
  };

  if (context.jobSample) {
    Object.assign(summary, { jobSample: context.jobSample });
  }

  writeJSON(path.join(reportDir, 'summary.json'), summary);
  writeJSON(path.join(reportDir, 'subgraph.json'), subgraphRecords);

  const ndjson = events.map((event) => JSON.stringify(event, JSON_REPLACER)).join('\n');
  writeText(path.join(reportDir, 'events.ndjson'), ndjson ? `${ndjson}\n` : '');

  const dashboardHtml = generateDashboardHTML(roundResult, context);
  writeText(path.join(reportDir, 'dashboard.html'), dashboardHtml);
}
