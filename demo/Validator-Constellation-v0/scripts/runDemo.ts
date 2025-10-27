import fs from 'fs';
import path from 'path';
import { ValidatorConstellationDemo } from '../src/core/constellation';
import { subgraphIndexer } from '../src/core/subgraph';
import { AgentAction, VoteValue } from '../src/core/types';
import { demoLeaves, demoSetup, demoJobBatch, budgetOverrunAction } from '../src/core/fixtures';

function resolveDir(...segments: string[]): string {
  return path.join(__dirname, '..', ...segments);
}

const JSON_REPLACER = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);

function writeJSON(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(data, JSON_REPLACER, 2);
  fs.writeFileSync(filePath, serialized);
}

function writeText(filePath: string, data: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data, 'utf8');
}

function renderDashboard(reportDir: string, roundResult: ReturnType<ValidatorConstellationDemo['runValidationRound']>) {
  const nodeBranch =
    roundResult.nodes.length > 0
      ? `\n  control["Node Orchestrators\n${roundResult.nodes.map((node) => node.ensName).join('\n')}"] --> owner;`
      : '';
  const mermaidCommittee = `graph LR\n  owner["👁️ Sentinel Governor"] --> committee;\n  committee["Validator Committee\n${roundResult.committee
    .map((v) => v.ensName)
    .join('\n')}"] --> zk["ZK Batch Proof\n${roundResult.proof.proofId}"];\n  committee --> commits;\n  commits --> reveals;\n  reveals --> outcome["Final Outcome: ${roundResult.voteOutcome}"];${nodeBranch}`;

  const mermaidSentinel = `sequenceDiagram\n  participant Agent as Agent Nova\n  participant Sentinel as Sentinel Guardian\n  participant Domain as Domain Controller\n  Agent->>Sentinel: Overspend transfer\n  Sentinel->>Domain: pause(deep-space-lab)\n  Domain-->>Agent: Execution Halted`;

  const jobSample = demoJobBatch('deep-space-lab', 5);

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Validator Constellation Demo Dashboard</title>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ startOnLoad: true, theme: 'dark' });
    </script>
    <style>
      body { font-family: 'Inter', Arial, sans-serif; background: #030712; color: #e0f2fe; margin: 0; padding: 2rem; }
      h1 { font-size: 2.5rem; margin-bottom: 1rem; }
      .grid { display: grid; gap: 2rem; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
      section { background: rgba(15, 118, 110, 0.18); border-radius: 16px; padding: 1.5rem; box-shadow: 0 0 40px rgba(14, 116, 144, 0.45); }
      pre { background: rgba(15, 23, 42, 0.8); padding: 1rem; border-radius: 12px; overflow-x: auto; }
      .metric { font-size: 1.2rem; margin-bottom: 0.25rem; }
    </style>
  </head>
  <body>
    <h1>Validator Constellation Guardian Deck</h1>
    <p>This dashboard demonstrates how a non-technical operator orchestrated a full validator round, cryptographic finality, and sentinel guardrails without manual coding.</p>
    <div class="grid">
      <section>
        <h2>Committee Pipeline</h2>
        <div class="mermaid">${mermaidCommittee}</div>
      </section>
      <section>
        <h2>Sentinel Guardrail</h2>
        <div class="mermaid">${mermaidSentinel}</div>
      </section>
      <section>
        <h2>Batch Metrics</h2>
        <div class="metric">Jobs attested: <strong>${roundResult.proof.attestedJobCount}</strong></div>
        <div class="metric">Validators slashed: <strong>${roundResult.slashingEvents.length}</strong></div>
        <div class="metric">Alerts triggered: <strong>${roundResult.sentinelAlerts.length}</strong></div>
        <div class="metric">Domain controllers online: <strong>${roundResult.nodes.length}</strong></div>
        <pre>${JSON.stringify({
          jobRoot: roundResult.proof.jobRoot,
          witness: roundResult.proof.witnessCommitment,
          sealedOutput: roundResult.proof.sealedOutput,
        }, null, 2)}</pre>
      </section>
      <section>
        <h2>Node Identities</h2>
        <pre>${JSON.stringify(roundResult.nodes, null, 2)}</pre>
      </section>
      <section>
        <h2>Job Sample</h2>
        <pre>${JSON.stringify(jobSample, null, 2)}</pre>
      </section>
    </div>
  </body>
</html>`;
  writeText(path.join(reportDir, 'dashboard.html'), html);
}

function main() {
  const leaves = demoLeaves();
  const setup = demoSetup(leaves);
  const demo = new ValidatorConstellationDemo(setup);

  const validatorAddresses = leaves.slice(0, 5);
  validatorAddresses.forEach((leaf) => demo.registerValidator(leaf.ensName, leaf.owner, 10_000_000_000_000_000_000n));

  const agentLeaf = leaves.find((leaf) => leaf.ensName === 'nova.agent.agi.eth');
  if (!agentLeaf) {
    throw new Error('agent leaf missing');
  }
  demo.registerAgent(agentLeaf.ensName, agentLeaf.owner, 'deep-space-lab', 1_000_000n);

  const nodeLeaves = leaves.filter((leaf) => leaf.ensName.includes('.node.agi.eth'));
  const registeredNodes = nodeLeaves.map((leaf) => demo.registerNode(leaf.ensName, leaf.owner));

  const maintenancePause = demo.pauseDomain('lunar-foundry', 'Scheduled maintenance window');
  const maintenanceResume = demo.resumeDomain('lunar-foundry', 'governance:maintenance-complete');
  const updatedSafety = demo.updateDomainSafety('deep-space-lab', {
    unsafeOpcodes: new Set(['SELFDESTRUCT', 'DELEGATECALL', 'STATICCALL']),
  });
  demo.updateSentinelConfig({ budgetGraceRatio: 0.07 });
  const agentIdentity = demo.setAgentBudget(agentLeaf.ensName, 1_200_000n);

  const jobBatch = demoJobBatch('deep-space-lab', 1000);
  const voteOverrides: Record<string, VoteValue> = {
    [leaves[1].owner]: 'REJECT',
  };

  const anomalies: AgentAction[] = [
    {
      agent: agentIdentity,
      domainId: 'deep-space-lab',
      type: 'CALL',
      amountSpent: 12_500n,
      opcode: 'STATICCALL',
      description: 'Unsafe opcode invoked during maintenance bypass',
    },
    {
      ...budgetOverrunAction(
        agentLeaf.ensName,
        agentLeaf.owner as `0x${string}`,
        'deep-space-lab',
        1_800_000n,
        agentIdentity.budget,
      ),
      description: 'Overspend attempt detected by sentinel',
      metadata: { invoice: 'INV-7788' },
    },
  ];

  const roundResult = demo.runValidationRound({
    round: 1,
    truthfulVote: 'APPROVE',
    jobBatch,
    committeeSignature: '0x777788889999aaaabbbbccccddddeeeeffff0000111122223333444455556666',
    voteOverrides,
    anomalies,
  });

  const reportDir = resolveDir('reports', 'latest');
  const domainState = demo.getDomainState('deep-space-lab');
  writeJSON(path.join(reportDir, 'summary.json'), {
    round: roundResult.round,
    outcome: roundResult.voteOutcome,
    committee: roundResult.committee.map((v) => ({ ens: v.ensName, stake: v.stake.toString() })),
    nodes: {
      registered: registeredNodes,
      active: roundResult.nodes,
    },
    proof: roundResult.proof,
    alerts: roundResult.sentinelAlerts,
    slashing: roundResult.slashingEvents,
    pauseRecords: roundResult.pauseRecords,
    governance: {
      parameters: demo.getGovernance(),
      sentinelGraceRatio: demo.getSentinelBudgetGraceRatio(),
      maintenance: { pause: maintenancePause, resume: maintenanceResume },
      domainSafety: {
        ...domainState,
        config: {
          ...domainState.config,
          unsafeOpcodes: Array.from(domainState.config.unsafeOpcodes),
        },
      },
      updatedSafety: {
        ...updatedSafety,
        unsafeOpcodes: Array.from(updatedSafety.unsafeOpcodes),
      },
    },
  });

  writeJSON(path.join(reportDir, 'subgraph.json'), subgraphIndexer.list());

  const events = [...roundResult.commits, ...roundResult.reveals].map((event) => JSON.stringify(event, JSON_REPLACER));
  writeText(path.join(reportDir, 'events.ndjson'), `${events.join('\n')}\n`);

  renderDashboard(reportDir, roundResult);

  console.log('Validator Constellation demo executed successfully.');
  console.log(`Nodes registered: ${registeredNodes.map((node) => node.ensName).join(', ')}`);
  console.log(`Reports written to ${reportDir}`);
}

main();
