#!/usr/bin/env ts-node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

interface CliOptions {
  input: string;
  output?: string;
}

const DEFAULT_INPUT = 'demo/National-Supply-Chain-v0/ui/export/latest.json';

function parseArgs(argv: string[]): CliOptions {
  let input = DEFAULT_INPUT;
  let output: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      input = argv[i + 1] ?? input;
      i++;
    } else if (arg.startsWith('--input=')) {
      input = arg.split('=')[1] ?? input;
    } else if (arg === '--output' || arg === '-o') {
      output = argv[i + 1];
      i++;
    } else if (arg.startsWith('--output=')) {
      output = arg.split('=')[1];
    }
  }
  return { input, output };
}

const directiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  priority: z.union([z.literal('critical'), z.literal('high'), z.literal('normal')]),
  recommendedAction: z.string().optional(),
  metrics: z.record(z.string()).optional(),
});

const automationSchema = z
  .object({
    headline: z.string(),
    missionSummary: z.string(),
    resilienceScore: z.number(),
    unstoppableScore: z.number(),
    autopilot: z.object({
      ownerDirectives: z.array(directiveSchema),
      agentOpportunities: z.array(directiveSchema),
      validatorSignals: z.array(directiveSchema),
      treasuryAlerts: z.array(directiveSchema),
    }),
    telemetry: z.object({
      totalJobs: z.string(),
      mintedCertificates: z.number(),
      totalBurned: z.string(),
      finalSupply: z.string(),
      totalAgentStake: z.string(),
      totalValidatorStake: z.string(),
      pendingFees: z.string(),
    }),
    verification: z.object({
      requiredChecks: z.array(z.string()),
      docs: z.array(z.string()),
      recommendedCommands: z.array(z.string()),
      lastUpdated: z.string(),
    }),
    commands: z.object({
      replayDemo: z.string(),
      exportTranscript: z.string(),
      launchControlRoom: z.string(),
      ownerDashboard: z.string(),
    }),
  })
  .optional();

const pauseStatusSchema = z.object({
  registry: z.boolean(),
  stake: z.boolean(),
  validation: z.boolean(),
});

const ownerControlStateSchema = z.object({
  feePct: z.number(),
  validatorRewardPct: z.number(),
  burnPct: z.number(),
  commitWindowSeconds: z.number(),
  revealWindowSeconds: z.number(),
  commitWindowFormatted: z.string(),
  revealWindowFormatted: z.string(),
  revealQuorumPct: z.number(),
  minRevealers: z.number(),
  nonRevealPenaltyBps: z.number(),
  nonRevealBanBlocks: z.number(),
  registryPauser: z.string(),
  stakePauser: z.string(),
  validationPauser: z.string(),
  minStake: z.string(),
  minStakeRaw: z.string().optional(),
  maxStakePerAddress: z.string(),
  maxStakePerAddressRaw: z.string().optional(),
  unbondingPeriodSeconds: z.number(),
  unbondingPeriodFormatted: z.string(),
  stakeTreasury: z.string(),
  stakeTreasuryAllowed: z.boolean(),
  stakePauserManager: z.string(),
  feePoolTreasury: z.string(),
  feePoolTreasuryAllowed: z.boolean(),
});

const transcriptSchema = z.object({
  generatedAt: z.string(),
  network: z.string(),
  actors: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      role: z.string(),
      address: z.string(),
    })
  ),
  ownerActions: z.array(
    z.object({
      label: z.string(),
      contract: z.string(),
      method: z.string(),
      parameters: z.record(z.unknown()).optional(),
      at: z.string(),
    })
  ),
  timeline: z.array(
    z.object({
      kind: z.string(),
      label: z.string(),
      at: z.string(),
      scenario: z.string().optional(),
      meta: z
        .object({
          jobId: z.string().optional(),
          context: z.string().optional(),
          state: z.string().optional(),
          success: z.union([z.boolean(), z.string()]).optional(),
          burnConfirmed: z.union([z.boolean(), z.string()]).optional(),
          reward: z.string().optional(),
          employer: z.string().optional(),
          agent: z.string().optional(),
        })
        .optional(),
    })
  ),
  scenarios: z.array(
    z.object({
      title: z.string(),
      jobId: z.string(),
      timelineIndices: z.array(z.number()),
    })
  ),
  market: z.object({
    totalJobs: z.string(),
    totalBurned: z.string(),
    finalSupply: z.string(),
    feePct: z.number(),
    validatorRewardPct: z.number(),
    pendingFees: z.string(),
    totalAgentStake: z.string(),
    totalValidatorStake: z.string(),
    mintedCertificates: z.array(
      z.object({
        jobId: z.string(),
        owner: z.string(),
        uri: z.string().optional(),
      })
    ),
    agentPortfolios: z.array(
      z.object({
        name: z.string(),
        address: z.string(),
        liquid: z.string(),
        staked: z.string(),
        locked: z.string(),
        reputation: z.string(),
        certificates: z.array(
          z.object({ jobId: z.string(), uri: z.string().optional() })
        ),
      })
    ),
    validatorCouncil: z.array(
      z.object({
        name: z.string(),
        address: z.string(),
        liquid: z.string(),
        staked: z.string(),
        locked: z.string(),
        reputation: z.string(),
      })
    ),
  }),
  ownerControl: z.object({
    ownerAddress: z.string(),
    moderatorAddress: z.string(),
    modules: z.object({
      registry: z.string(),
      stake: z.string(),
      validation: z.string(),
      feePool: z.string(),
      dispute: z.string(),
      certificate: z.string(),
      reputation: z.string(),
      identity: z.string(),
    }),
    baseline: ownerControlStateSchema,
    upgraded: ownerControlStateSchema,
    restored: ownerControlStateSchema,
    pauseDrill: z.object({
      owner: pauseStatusSchema,
      moderator: pauseStatusSchema,
    }),
    drillCompletedAt: z.string(),
    controlMatrix: z
      .array(
        z.object({
          module: z.string(),
          address: z.string(),
          delegatedTo: z.string(),
          capabilities: z.array(z.string()),
          status: z.string(),
        })
      )
      .optional(),
  }),
  insights: z.array(
    z.object({
      category: z.string(),
      title: z.string(),
      detail: z.string(),
      at: z.string(),
      meta: z.record(z.unknown()).optional(),
      timelineIndex: z.number().optional(),
    })
  ),
  automation: automationSchema,
});

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

type Transcript = z.infer<typeof transcriptSchema>;

type JobInsight = {
  scenario: Transcript['scenarios'][number];
  employer?: string;
  employerName?: string;
  agent?: string;
  agentName?: string;
  reward?: string;
  states: string[];
  credentialUri?: string;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) {
    return iso;
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '\\"');
}

function sanitizeNodeId(prefix: string, value: string): string {
  return `${prefix}_${value.replace(/[^a-zA-Z0-9]/g, '')}`;
}

function collectJobInsights(transcript: Transcript): JobInsight[] {
  const actorLookup = new Map(
    transcript.actors.map((actor) => [actor.address.toLowerCase(), actor])
  );
  const jobCertificates = new Map(
    transcript.market.mintedCertificates.map((cert) => [cert.jobId, cert])
  );

  const result: JobInsight[] = [];
  for (const scenario of transcript.scenarios) {
    const jobEvents = transcript.timeline.filter(
      (entry) => entry.meta?.jobId === scenario.jobId
    );
    const states: string[] = [];
    let employer: string | undefined;
    let agent: string | undefined;
    let reward: string | undefined;

    for (const event of jobEvents) {
      if (event.meta?.state && !states.includes(event.meta.state)) {
        states.push(event.meta.state);
      }
      if (!employer && event.meta?.employer) {
        employer = event.meta.employer;
      }
      if (event.meta?.agent && event.meta.agent !== ZERO_ADDRESS) {
        agent = event.meta.agent;
      }
      if (!reward && event.meta?.reward) {
        reward = event.meta.reward;
      }
    }

    const certificate = jobCertificates.get(scenario.jobId);
    const agentActor = agent
      ? actorLookup.get(agent.toLowerCase())
      : undefined;
    const employerActor = employer
      ? actorLookup.get(employer.toLowerCase())
      : undefined;

    result.push({
      scenario,
      employer,
      employerName: employerActor?.name,
      agent,
      agentName: agentActor?.name,
      reward,
      states,
      credentialUri: certificate?.uri,
    });
  }

  return result;
}

function renderMermaid(transcript: Transcript, jobs: JobInsight[]): string {
  const ownerLabel =
    transcript.actors.find((actor) => actor.address === transcript.ownerControl.ownerAddress)?.name ??
    'Owner';
  const validatorNodeId = 'validatorCouncil';
  const labelBreak = '<br/>';
  const lines: string[] = [];
  lines.push('```mermaid');
  lines.push('flowchart LR');
  lines.push('    classDef owner fill:#ffe4e6,stroke:#db2777,stroke-width:2px,color:#4a044e;');
  lines.push('    classDef employer fill:#e7f0fe,stroke:#1f6feb,stroke-width:2px,color:#08264c;');
  lines.push('    classDef agent fill:#fdf5ff,stroke:#7e22ce,stroke-width:2px,color:#3b0764;');
  lines.push('    classDef job fill:#ecfdf3,stroke:#047857,stroke-width:2px,color:#064e3b;');
  lines.push('    classDef validators fill:#fff7ed,stroke:#d97706,stroke-width:2px,color:#7c2d12;');
  const ownerDisplay = `${escapeLabel(ownerLabel)}${labelBreak}${escapeLabel(transcript.ownerControl.ownerAddress)}`;
  lines.push(`    ownerMain["${ownerDisplay}"]:::owner`);
  const validatorDisplay = `Validator council${labelBreak}${escapeLabel(
    transcript.market.validatorCouncil.map((entry) => entry.name).join(', ')
  )}`;
  lines.push(`    ${validatorNodeId}["${validatorDisplay}"]:::validators`);

  const declaredNodes = new Map<string, string>();

  for (const job of jobs) {
    const jobNodeId = sanitizeNodeId('job', job.scenario.jobId);
    const jobLabel = `Job #${job.scenario.jobId}${labelBreak}${escapeLabel(job.scenario.title)}`;
    if (!declaredNodes.has(jobNodeId)) {
      declaredNodes.set(jobNodeId, `    ${jobNodeId}["${jobLabel}"]:::job`);
    }
    const employerAddress = job.employer ?? transcript.ownerControl.ownerAddress;
    const employerId = sanitizeNodeId('employer', employerAddress);
    const employerLabel = escapeLabel(job.employerName ?? employerAddress);
    if (!declaredNodes.has(employerId)) {
      declaredNodes.set(
        employerId,
        `    ${employerId}["${employerLabel}${labelBreak}${escapeLabel(employerAddress)}"]:::employer`
      );
    }
    const agentAddress = job.agent ?? transcript.market.agentPortfolios[0]?.address;
    const agentId = sanitizeNodeId('agent', agentAddress ?? 'unknown');
    const agentLabel = escapeLabel(job.agentName ?? agentAddress ?? 'Agent');
    if (!declaredNodes.has(agentId)) {
      declaredNodes.set(
        agentId,
        `    ${agentId}["${agentLabel}${labelBreak}${escapeLabel(agentAddress ?? 'n/a')}"]:::agent`
      );
    }
    lines.push(`    ownerMain -->|Missions orchestrated| ${jobNodeId}`);
    lines.push(`    ${employerId} -->|Escrows ${escapeLabel(job.reward ?? 'task')}| ${jobNodeId}`);
    lines.push(`    ${jobNodeId} -->|Delegates| ${agentId}`);
    lines.push(`    ${jobNodeId} -->|Validator quorum| ${validatorNodeId}`);
    if (job.credentialUri) {
      lines.push(
        `    ${validatorNodeId} -->|Credential minted (${escapeLabel(job.credentialUri)})| ${agentId}`
      );
    }
  }

  for (const node of declaredNodes.values()) {
    lines.push(node);
  }

  lines.push('```');
  return lines.join('\n');
}

function renderOwnerActionTable(transcript: Transcript): string {
  const header = `| Time | Action | Method | Contract | Parameters |
| --- | --- | --- | --- | --- |`;
  const rows = transcript.ownerActions.map((action) => {
    const params = action.parameters ? JSON.stringify(action.parameters) : '—';
    return `| ${formatDate(action.at)} | ${action.label} | ${action.method} | ${action.contract} | ${params} |`;
  });
  return [header, ...rows].join('\n');
}

function renderPortfolioTable(transcript: Transcript): string {
  const header = '| Role | Name | Liquid | Stake | Locked | Reputation | Credentials |';
  const rows: string[] = [];
  for (const agent of transcript.market.agentPortfolios) {
    rows.push(
      `| Agent | ${agent.name} | ${agent.liquid} | ${agent.staked} | ${agent.locked} | ${agent.reputation} | ${
        agent.certificates.length > 0
          ? agent.certificates
              .map((cert) => (cert.uri ? `${cert.jobId} (${cert.uri})` : cert.jobId))
              .join(', ')
          : 'None'
      } |`
    );
  }
  for (const validator of transcript.market.validatorCouncil) {
    rows.push(
      `| Validator | ${validator.name} | ${validator.liquid} | ${validator.staked} | ${validator.locked} | ${validator.reputation} | — |`
    );
  }
  return [header, ...rows].join('\n');
}

function renderOwnerControlSection(transcript: Transcript): string {
  const states = [
    { label: 'Baseline', state: transcript.ownerControl.baseline },
    { label: 'Live drill', state: transcript.ownerControl.upgraded },
    { label: 'Restored', state: transcript.ownerControl.restored },
  ];
  const header = '| Setting | Baseline | Live drill | Restored |';
  const keys: Array<{ key: keyof typeof transcript.ownerControl.baseline; label: string; formatter?: (value: unknown) => string }> = [
    { key: 'feePct', label: 'Protocol fee', formatter: (value) => `${value}%` },
    { key: 'validatorRewardPct', label: 'Validator reward', formatter: (value) => `${value}%` },
    { key: 'burnPct', label: 'Fee burn', formatter: (value) => `${value}%` },
    { key: 'commitWindowFormatted', label: 'Commit window' },
    { key: 'revealWindowFormatted', label: 'Reveal window' },
    { key: 'revealQuorumPct', label: 'Reveal quorum', formatter: (value) => `${value}%` },
    { key: 'minRevealers', label: 'Minimum revealers' },
    { key: 'nonRevealPenaltyBps', label: 'Non-reveal penalty', formatter: (value) => `${value} bps` },
    { key: 'nonRevealBanBlocks', label: 'Non-reveal ban' },
    { key: 'minStake', label: 'Minimum stake' },
    { key: 'maxStakePerAddress', label: 'Max stake per address' },
    { key: 'unbondingPeriodFormatted', label: 'Unbonding period' },
  ];
  const rows = keys.map((entry) => {
    const values = states.map(({ state }) => {
      const raw = state[entry.key];
      if (entry.formatter) {
        return entry.formatter(raw);
      }
      return String(raw);
    });
    return `| ${entry.label} | ${values.join(' | ')} |`;
  });
  return [header, ...rows].join('\n');
}

function renderTimelineSnippet(transcript: Transcript, limit = 12): string {
  const entries = transcript.timeline.slice(0, limit).map((entry) => {
    const time = formatDate(entry.at);
    const context = entry.scenario ? ` (${entry.scenario})` : '';
    return `- ${time}${context}: ${entry.label}`;
  });
  return entries.join('\n');
}

function buildReport(transcript: Transcript): string {
  const jobs = collectJobInsights(transcript);
  const lines: string[] = [];
  lines.push('# National Supply Chain Sovereign Mission Report');
  lines.push('');
  lines.push(`- **Generated:** ${formatDate(transcript.generatedAt)}`);
  lines.push(`- **Network:** ${transcript.network}`);
  lines.push(`- **Jobs orchestrated:** ${transcript.market.totalJobs}`);
  lines.push(`- **Total AGIα burned:** ${transcript.market.totalBurned}`);
  lines.push(`- **Circulating supply:** ${transcript.market.finalSupply}`);
  lines.push('');
  lines.push('## Strategic orchestration map');
  lines.push(renderMermaid(transcript, jobs));
  lines.push('');
  lines.push('## Executive pulse');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Protocol fee | ${transcript.market.feePct}% |`);
  lines.push(`| Validator reward | ${transcript.market.validatorRewardPct}% |`);
  lines.push(`| Fee pool pending | ${transcript.market.pendingFees} |`);
  lines.push(`| Agent stake | ${transcript.market.totalAgentStake} |`);
  lines.push(`| Validator stake | ${transcript.market.totalValidatorStake} |`);
  lines.push('');
  if (transcript.automation) {
    lines.push('## Mission automation highlights');
    lines.push(transcript.automation.missionSummary);
    lines.push('');
    lines.push('| Score | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Resilience score | ${transcript.automation.resilienceScore} |`);
    lines.push(`| Unstoppable index | ${transcript.automation.unstoppableScore} |`);
    lines.push(`| Jobs tracked | ${transcript.automation.telemetry.totalJobs} |`);
    lines.push('');
    lines.push('### Owner directives');
    if (transcript.automation.autopilot.ownerDirectives.length === 0) {
      lines.push('No outstanding owner directives.');
    } else {
      for (const directive of transcript.automation.autopilot.ownerDirectives) {
        lines.push(
          `- **${directive.title}** (${directive.priority}): ${directive.summary}${
            directive.recommendedAction ? ` → \`${directive.recommendedAction}\`` : ''
          }`
        );
      }
    }
    lines.push('');
    lines.push('### Automation commands');
    lines.push(
      `- Replay: \`${transcript.automation.commands.replayDemo}\`
- Export: \`${transcript.automation.commands.exportTranscript}\`
- Control room: \`${transcript.automation.commands.launchControlRoom}\`
- Owner dashboard: \`${transcript.automation.commands.ownerDashboard}\``
    );
    lines.push('');
    lines.push('### Verification guardrails');
    for (const check of transcript.automation.verification.requiredChecks) {
      lines.push(`- ${check}`);
    }
    lines.push('');
  }
  lines.push('## Owner action log');
  lines.push(renderOwnerActionTable(transcript));
  lines.push('');
  lines.push('## Agent and validator capital');
  lines.push(renderPortfolioTable(transcript));
  lines.push('');
  lines.push('## Owner control drill outcomes');
  lines.push(renderOwnerControlSection(transcript));
  lines.push('');
  lines.push('### Pause drills');
  lines.push(
    `- Owner drill: ${transcript.ownerControl.pauseDrill.owner.registry ? '✅ registry' : '⚠️ registry idle'}, ${
      transcript.ownerControl.pauseDrill.owner.stake ? '✅ stake' : '⚠️ stake idle'
    }, ${transcript.ownerControl.pauseDrill.owner.validation ? '✅ validation' : '⚠️ validation idle'}`
  );
  lines.push(
    `- Moderator drill: ${transcript.ownerControl.pauseDrill.moderator.registry ? '✅ registry' : '⚠️ registry idle'}, ${
      transcript.ownerControl.pauseDrill.moderator.stake ? '✅ stake' : '⚠️ stake idle'
    }, ${
      transcript.ownerControl.pauseDrill.moderator.validation ? '✅ validation' : '⚠️ validation idle'
    }`
  );
  if (transcript.ownerControl.controlMatrix && transcript.ownerControl.controlMatrix.length > 0) {
    lines.push('');
    lines.push('### Sovereign control matrix');
    for (const card of transcript.ownerControl.controlMatrix) {
      lines.push(
        `- **${card.module}** at ${card.address} → delegated to ${card.delegatedTo}. Capabilities: ${card.capabilities.join(', ')}. Status: ${card.status}.`
      );
    }
    lines.push('');
  }
  lines.push('## Insights timeline snapshot');
  if (transcript.insights.length === 0) {
    lines.push('No insights recorded – rerun the transcript export.');
  } else {
    for (const insight of transcript.insights) {
      lines.push(`- **${insight.category}: ${insight.title}** (${formatDate(insight.at)}) – ${insight.detail}`);
    }
  }
  lines.push('');
  lines.push('## Initial timeline excerpt');
  lines.push(renderTimelineSnippet(transcript));
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const resolvedInput = resolve(process.cwd(), input);
  let raw: string;
  try {
    raw = readFileSync(resolvedInput, 'utf8');
  } catch (error) {
    console.error(`Failed to read transcript at ${resolvedInput}:`, error);
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error('Transcript is not valid JSON:', error);
    process.exit(1);
  }
  let transcript: Transcript;
  try {
    transcript = transcriptSchema.parse(parsed);
  } catch (error) {
    console.error('Transcript schema validation failed:', error);
    process.exit(1);
  }

  const report = buildReport(transcript);
  if (output) {
    const resolvedOutput = resolve(process.cwd(), output);
    mkdirSync(dirname(resolvedOutput), { recursive: true });
    writeFileSync(resolvedOutput, report, 'utf8');
    console.log(`Saved report to ${resolvedOutput}`);
  } else {
    console.log(report);
  }
}

main();
