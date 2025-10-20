#!/usr/bin/env ts-node

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

interface PlanAgent {
  handle: string;
  role: string;
  capabilities?: string[];
  wallet?: string;
  sovereign?: string;
}

interface PlanValidator {
  handle: string;
  stake: string;
  mandate?: string;
  wallet?: string;
}

interface PlanNode {
  id: string;
  label: string;
  type: string;
  region?: string;
  capacityTonnesPerDay?: number;
  controlSurfaces?: string[];
  description?: string;
}

interface PlanCorridor {
  id: string;
  from: string;
  to: string;
  mode: string;
  capacityTonnesPerDay: number;
  latencyHours: number;
  resilience: string;
}

interface PlanPhase {
  id: string;
  title: string;
  windowDays: number;
  focus: string[];
  ownerControls: string[];
  deliverables: string[];
}

interface PlanJobAssignment {
  agent: string;
  responsibility: string;
}

interface PlanJob {
  id: string;
  title: string;
  phase: string;
  reward: string;
  deadlineDays: number;
  durationDays: number;
  dependencies: string[];
  energyBudget: string;
  thermodynamicProfile?: Record<string, unknown>;
  corridors: string[];
  assigned: PlanJobAssignment[];
  validatorFocus: string[];
  brief?: string[];
}

interface Plan {
  initiative: string;
  objective: string;
  metadata: {
    version: string;
    generatedAt: string;
    launchDate: string;
    timezone?: string;
    ownerEns?: string;
    missionTag?: string;
  };
  budget: {
    currency: string;
    total: string;
    operatorReserve?: string;
    validatorPool?: string;
  };
  governance: {
    owner: string;
    pauseAuthority: string;
    treasury: string;
    thermostat?: Record<string, unknown>;
    ownerPlaybooks?: string[];
  };
  participants: {
    agents: PlanAgent[];
    validators: PlanValidator[];
    humanOversight?: Array<{ name: string; responsibility: string }>;
  };
  supplyNetwork: {
    nodes: PlanNode[];
    corridors: PlanCorridor[];
    resilienceProfiles?: Array<{ id: string; description: string; recommendedControls: string[] }>;
  };
  operations: {
    phases: PlanPhase[];
  };
  jobs: PlanJob[];
  reporting?: Record<string, unknown>;
}

interface DerivedJob {
  id: string;
  title: string;
  phase: string;
  phaseTitle: string;
  reward: number;
  startOffset: number;
  endOffset: number;
  startDate: string;
  endDate: string;
  deadlineDate: string;
  slackDays: number;
  corridors: string[];
  assigned: PlanJobAssignment[];
  validators: string[];
  brief: string[];
  critical: boolean;
}

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_PLAN_PATH = path.join(ROOT, 'demo', 'National-Supply-Chain-v0', 'project-plan.national-supply-chain.json');
const DEFAULT_REPORT_DIR = path.join(ROOT, 'reports', 'national-supply-chain');
const DEFAULT_UI_EXPORT = path.join(ROOT, 'demo', 'National-Supply-Chain-v0', 'ui', 'export', 'latest.json');

function resolvePath(envKey: string, defaultPath: string): string {
  const override = process.env[envKey];
  if (!override || override.trim().length === 0) {
    return defaultPath;
  }
  const trimmed = override.trim();
  if (path.isAbsolute(trimmed)) return trimmed;
  return path.join(ROOT, trimmed);
}

function readJsonSync<T>(value: string): T {
  return JSON.parse(value) as T;
}

function parsePlan(raw: string): Plan {
  try {
    return readJsonSync<Plan>(raw);
  } catch (error) {
    throw new Error(`Failed to parse plan JSON: ${(error as Error).message}`);
  }
}

function ensureUniqueIds(jobs: PlanJob[]): void {
  const seen = new Set<string>();
  for (const job of jobs) {
    if (seen.has(job.id)) {
      throw new Error(`Duplicate job id detected: ${job.id}`);
    }
    seen.add(job.id);
  }
}

function detectCycles(jobs: PlanJob[]): void {
  const jobMap = new Map<string, PlanJob>(jobs.map((job) => [job.id, job]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Cyclic dependency detected at job ${id}`);
    }
    visiting.add(id);
    const job = jobMap.get(id);
    if (!job) {
      throw new Error(`Missing job referenced in dependency graph: ${id}`);
    }
    for (const dep of job.dependencies) {
      if (!jobMap.has(dep)) {
        throw new Error(`Job ${job.id} references unknown dependency ${dep}`);
      }
      visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const job of jobs) {
    visit(job.id);
  }
}

function toNumber(label: string, value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid numeric value for ${label}: ${value}`);
    }
    return parsed;
  }
  throw new Error(`Missing numeric value for ${label}`);
}

function createCurrencyFormatter(currency: string): (value: number) => string {
  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    return (value: number) => formatter.format(value);
  } catch {
    const fallback = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    return (value: number) => `${fallback.format(value)} ${currency}`.trim();
  }
}

function computeSchedule(plan: Plan, launchDateIso: string): { jobs: DerivedJob[]; criticalPathDays: number; criticalJobIds: Set<string>; maxConcurrency: number } {
  ensureUniqueIds(plan.jobs);
  detectCycles(plan.jobs);

  const phaseMap = new Map<string, PlanPhase>(plan.operations.phases.map((phase) => [phase.id, phase]));
  const jobMap = new Map<string, PlanJob>(plan.jobs.map((job) => [job.id, job]));

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const job of plan.jobs) {
    inDegree.set(job.id, 0);
    adjacency.set(job.id, []);
  }

  for (const job of plan.jobs) {
    for (const dep of job.dependencies) {
      adjacency.get(dep)?.push(job.id);
      inDegree.set(job.id, (inDegree.get(job.id) || 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(id);
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const nextDegree = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  if (ordered.length !== plan.jobs.length) {
    throw new Error('Failed to compute topological order; dependency graph malformed.');
  }

  const startDate = new Date(launchDateIso);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`Invalid launchDate in plan metadata: ${launchDateIso}`);
  }

  const startOffsets = new Map<string, number>();
  const endOffsets = new Map<string, number>();
  const slackDays = new Map<string, number>();
  const distance = new Map<string, number>();
  const predecessor = new Map<string, string | null>();

  for (const id of ordered) {
    const job = jobMap.get(id);
    if (!job) throw new Error(`Job not found during schedule computation: ${id}`);
    const duration = toNumber(`${job.id}.durationDays`, job.durationDays);
    const deadline = toNumber(`${job.id}.deadlineDays`, job.deadlineDays);

    let earliestStart = 0;
    let bestPred: string | null = null;
    let bestDistance = 0;

    for (const dep of job.dependencies) {
      const depEnd = endOffsets.get(dep);
      if (depEnd == null) {
        throw new Error(`Dependency ${dep} missing end offset for job ${job.id}`);
      }
      if (depEnd > earliestStart) {
        earliestStart = depEnd;
      }
      const depDistance = distance.get(dep) ?? 0;
      if (depDistance > bestDistance) {
        bestDistance = depDistance;
        bestPred = dep;
      }
    }

    const endOffset = earliestStart + duration;
    const slack = deadline - endOffset;

    startOffsets.set(id, earliestStart);
    endOffsets.set(id, endOffset);
    slackDays.set(id, slack);
    distance.set(id, duration + bestDistance);
    predecessor.set(id, bestPred);

    if (slack < 0) {
      console.warn(`⚠️  Job ${id} misses its deadline by ${Math.abs(slack)} day(s).`);
    }
  }

  let criticalJobId: string | null = null;
  let criticalDistance = -Infinity;
  for (const [id, dist] of distance.entries()) {
    if (dist > criticalDistance) {
      criticalDistance = dist;
      criticalJobId = id;
    }
  }

  const criticalJobIds = new Set<string>();
  while (criticalJobId) {
    criticalJobIds.add(criticalJobId);
    criticalJobId = predecessor.get(criticalJobId) ?? null;
  }

  const jobs: DerivedJob[] = [];
  for (const job of plan.jobs) {
    const phase = phaseMap.get(job.phase);
    if (!phase) {
      throw new Error(`Job ${job.id} references unknown phase ${job.phase}`);
    }
    const startOffset = startOffsets.get(job.id)!;
    const endOffset = endOffsets.get(job.id)!;
    const slack = slackDays.get(job.id)!;
    const startDateIso = new Date(startDate.getTime() + startOffset * 24 * 60 * 60 * 1000).toISOString();
    const endDateIso = new Date(startDate.getTime() + endOffset * 24 * 60 * 60 * 1000).toISOString();
    const deadlineIso = new Date(startDate.getTime() + toNumber(`${job.id}.deadlineDays`, job.deadlineDays) * 24 * 60 * 60 * 1000).toISOString();

    jobs.push({
      id: job.id,
      title: job.title,
      phase: job.phase,
      phaseTitle: phase.title,
      reward: toNumber(`${job.id}.reward`, job.reward),
      startOffset,
      endOffset,
      startDate: startDateIso,
      endDate: endDateIso,
      deadlineDate: deadlineIso,
      slackDays: slack,
      corridors: job.corridors,
      assigned: job.assigned,
      validators: job.validatorFocus,
      brief: job.brief ?? [],
      critical: criticalJobIds.has(job.id),
    });
  }

  const events: Array<{ time: number; delta: number }> = [];
  for (const job of jobs) {
    events.push({ time: job.startOffset, delta: 1 });
    events.push({ time: job.endOffset, delta: -1 });
  }
  events.sort((a, b) => (a.time === b.time ? a.delta - b.delta : a.time - b.time));

  let current = 0;
  let maxConcurrency = 0;
  for (const event of events) {
    current += event.delta;
    if (current > maxConcurrency) maxConcurrency = current;
  }

  return {
    jobs,
    criticalPathDays: Math.round(criticalDistance),
    criticalJobIds,
    maxConcurrency,
  };
}

function computeMermaid(plan: Plan, derived: DerivedJob[]): { network: string; gantt: string } {
  const nodeClass: Record<string, string> = {
    command: 'command',
    port: 'port',
    hub: 'hub',
    storage: 'storage',
    distribution: 'distribution',
    relief: 'relief',
    sensor: 'sensor',
  };

  const lines: string[] = ['flowchart LR'];
  for (const node of plan.supplyNetwork.nodes) {
    const klass = nodeClass[node.type] ?? 'command';
    const label = `${node.label}${node.region ? `\\n${node.region}` : ''}`;
    lines.push(`  ${node.id}["${label}"]:::${klass}`);
  }

  for (const corridor of plan.supplyNetwork.corridors) {
    lines.push(`  ${corridor.from} -->|${corridor.mode}| ${corridor.to}`);
  }

  lines.push('  classDef command fill:#0f172a,stroke:#38bdf8,stroke-width:2,color:#e2e8f0;');
  lines.push('  classDef port fill:#1e3a8a,stroke:#38bdf8,color:#f8fafc;');
  lines.push('  classDef hub fill:#312e81,stroke:#c084fc,color:#f5f3ff;');
  lines.push('  classDef storage fill:#064e3b,stroke:#34d399,color:#ecfdf5;');
  lines.push('  classDef distribution fill:#7c2d12,stroke:#fb923c,color:#ffedd5;');
  lines.push('  classDef relief fill:#7f1d1d,stroke:#fca5a5,color:#fee2e2;');
  lines.push('  classDef sensor fill:#3f3f46,stroke:#facc15,color:#fef9c3;');

  const ganttLines: string[] = [
    'gantt',
    '  title National Supply Chain Critical Path',
    '  dateFormat  YYYY-MM-DD',
    '  axisFormat  %b %d',
  ];

  const phases = new Map<string, PlanPhase>(plan.operations.phases.map((phase) => [phase.id, phase]));

  for (const job of derived) {
    const phase = phases.get(job.phase);
    if (phase) {
      ganttLines.push(`  section ${phase.title}`);
    }
    const start = job.startDate.slice(0, 10);
    const end = job.endDate.slice(0, 10);
    const slug = job.id.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const critFlag = job.critical ? 'crit,' : '';
    ganttLines.push(`  ${job.title.replace(/:/g, '-')}: ${critFlag} ${slug}, ${start}, ${end}`);
  }

  return { network: lines.join('\n'), gantt: ganttLines.join('\n') };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDashboard(plan: Plan, derived: DerivedJob[], metrics: Record<string, number>, mermaidDiagrams: { network: string; gantt: string }): string {
  const currency = plan.budget.currency;
  const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const formatCurrency = createCurrencyFormatter(currency);

  const jobRows = derived
    .map((job) => {
      const corridors = job.corridors.join(', ');
      const agents = job.assigned
        .map((assignment) => `${escapeHtml(assignment.agent)}<div class="hint">${escapeHtml(assignment.responsibility)}</div>`)
        .join('');
      const validators = job.validators.map(escapeHtml).join(', ');
      const slack = `${job.slackDays} day(s)`;
      return `<tr class="${job.critical ? 'critical' : ''}"><td>${escapeHtml(job.id)}</td><td>${escapeHtml(job.title)}</td><td>${escapeHtml(job.phaseTitle)}</td><td>${job.startDate.slice(0, 10)} → ${job.endDate.slice(0, 10)}</td><td>${formatCurrency(job.reward)}</td><td>${slack}</td><td>${escapeHtml(corridors)}</td><td>${agents}</td><td>${escapeHtml(validators)}</td></tr>`;
    })
    .join('\n');

  const corridorCards = plan.supplyNetwork.corridors
    .map((corridor) => {
      const controls = new Set<string>();
      const fromNode = plan.supplyNetwork.nodes.find((node) => node.id === corridor.from);
      const toNode = plan.supplyNetwork.nodes.find((node) => node.id === corridor.to);
      for (const control of fromNode?.controlSurfaces ?? []) controls.add(control);
      for (const control of toNode?.controlSurfaces ?? []) controls.add(control);
      return `<article class="corridor"><h3>${escapeHtml(corridor.id)}</h3><p>${escapeHtml(corridor.mode)}</p><p>${formatter.format(corridor.capacityTonnesPerDay)} t/day · Latency ${corridor.latencyHours} h</p><p>${escapeHtml(corridor.resilience)}</p><p class="hint">Owner controls: ${Array.from(controls).map(escapeHtml).join(', ') || '—'}</p></article>`;
    })
    .join('\n');

  const ownerCommands = (plan.governance.ownerPlaybooks ?? [])
    .map((command) => `<li><code>${escapeHtml(command)}</code></li>`)
    .join('\n');

  const validatorCards = plan.participants.validators
    .map((validator) => {
      const stake = formatCurrency(toNumber(`${validator.handle}.stake`, validator.stake));
      return `<article class="validator"><h3>${escapeHtml(validator.handle)}</h3><p>${escapeHtml(validator.mandate ?? 'Validator')}</p><p class="hint">Stake ${stake}</p></article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>National Supply Chain Intelligence Kit</title>
    <style>
      :root { color-scheme: dark; font-family: 'Inter', system-ui, sans-serif; background:#020617; color:#e2e8f0; }
      body { margin:0; background:radial-gradient(circle at top left,#0f172a,#020617 55%); padding:2.5rem; }
      header { max-width:960px; margin:0 auto 2rem; }
      h1 { font-size:2.8rem; margin:0; }
      p.lede { color:#94a3b8; font-size:1.1rem; max-width:70ch; }
      .grid { display:grid; gap:1.5rem; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); max-width:1200px; margin:0 auto; }
      .card { background:rgba(15,23,42,0.72); border:1px solid rgba(148,163,184,0.3); border-radius:1.25rem; padding:1.5rem; box-shadow:0 20px 40px rgba(2,6,23,0.45); backdrop-filter:blur(18px); }
      .card h2 { margin:0 0 1rem; font-size:1.4rem; }
      .stats { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); }
      .stat { background:rgba(15,23,42,0.6); border:1px solid rgba(148,163,184,0.2); border-radius:1rem; padding:1rem; }
      .stat span { display:block; }
      .stat .label { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; }
      .stat .value { font-size:1.25rem; margin-top:0.5rem; font-weight:600; }
      table { width:100%; border-collapse:collapse; font-size:0.92rem; }
      thead { background:rgba(30,41,59,0.75); }
      thead th { text-transform:uppercase; letter-spacing:0.08em; font-size:0.72rem; padding:0.75rem; color:#94a3b8; }
      tbody td { padding:0.85rem 0.75rem; border-bottom:1px solid rgba(148,163,184,0.15); vertical-align:top; }
      tbody tr.critical { background:rgba(236,72,153,0.12); }
      code { background:rgba(15,23,42,0.65); padding:0.25rem 0.45rem; border-radius:0.5rem; border:1px solid rgba(148,163,184,0.25); }
      ul { margin:0; padding-left:1.2rem; display:grid; gap:0.5rem; }
      .corridor-grid, .validator-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
      .corridor, .validator { background:rgba(15,23,42,0.55); border:1px solid rgba(148,163,184,0.25); border-radius:1rem; padding:1rem; }
      .hint { color:#94a3b8; font-size:0.78rem; margin-top:0.35rem; }
      .mermaid { background:rgba(15,23,42,0.65); border-radius:1rem; border:1px solid rgba(148,163,184,0.25); padding:1rem; overflow-x:auto; }
      footer { max-width:960px; margin:2rem auto 0; text-align:center; color:#94a3b8; font-size:0.85rem; }
      @media (max-width:720px) { body { padding:1.5rem; } }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
  </head>
  <body>
    <header>
      <span class="hint">${escapeHtml(plan.metadata.missionTag ?? 'NATIONAL-SUPPLY-CHAIN')}</span>
      <h1>${escapeHtml(plan.initiative)}</h1>
      <p class="lede">${escapeHtml(plan.objective)}</p>
    </header>
    <section class="card" style="max-width:1200px;margin:0 auto 1.5rem;">
      <h2>Mission Metrics</h2>
      <div class="stats">
        <div class="stat"><span class="label">Jobs orchestrated</span><span class="value">${formatter.format(metrics.jobCount)}</span></div>
        <div class="stat"><span class="label">Phases</span><span class="value">${formatter.format(metrics.phaseCount)}</span></div>
        <div class="stat"><span class="label">Agents</span><span class="value">${formatter.format(metrics.agentCount)}</span></div>
        <div class="stat"><span class="label">Validators</span><span class="value">${formatter.format(metrics.validatorCount)}</span></div>
        <div class="stat"><span class="label">Total reward</span><span class="value">${formatCurrency(metrics.totalReward)}</span></div>
        <div class="stat"><span class="label">Operator reserve</span><span class="value">${formatCurrency(metrics.operatorReserve)}</span></div>
        <div class="stat"><span class="label">Validator pool</span><span class="value">${formatCurrency(metrics.validatorPool)}</span></div>
        <div class="stat"><span class="label">Critical path (days)</span><span class="value">${formatter.format(metrics.criticalPathDays)}</span></div>
        <div class="stat"><span class="label">Max concurrency</span><span class="value">${formatter.format(metrics.maxConcurrency)}</span></div>
        <div class="stat"><span class="label">Corridor capacity</span><span class="value">${formatter.format(metrics.corridorCapacity)} t/day</span></div>
        <div class="stat"><span class="label">Validator stake</span><span class="value">${formatCurrency(metrics.validatorStake)}</span></div>
      </div>
    </section>
    <section class="card" style="max-width:1200px;margin:0 auto 1.5rem;">
      <h2>Jobs & Critical Path</h2>
      <table>
        <thead><tr><th>ID</th><th>Title</th><th>Phase</th><th>Window</th><th>Reward</th><th>Slack</th><th>Corridors</th><th>Agents</th><th>Validators</th></tr></thead>
        <tbody>${jobRows}</tbody>
      </table>
    </section>
    <section class="card" style="max-width:1200px;margin:0 auto 1.5rem;">
      <h2>Corridor Intelligence</h2>
      <div class="corridor-grid">${corridorCards}</div>
    </section>
    <section class="card" style="max-width:1200px;margin:0 auto 1.5rem;">
      <h2>Owner Playbooks</h2>
      <ul>${ownerCommands}</ul>
    </section>
    <section class="card" style="max-width:1200px;margin:0 auto 1.5rem;">
      <h2>Validator Coalition</h2>
      <div class="validator-grid">${validatorCards}</div>
    </section>
    <section class="card" style="max-width:1200px;margin:0 auto 1.5rem;">
      <h2>Mermaid Atlas</h2>
      <div class="mermaid">${escapeHtml(mermaidDiagrams.network)}</div>
      <div class="mermaid" style="margin-top:1rem;">${escapeHtml(mermaidDiagrams.gantt)}</div>
    </section>
    <footer>
      Generated ${escapeHtml(plan.metadata.generatedAt)} · Plan version ${escapeHtml(plan.metadata.version)} · Owner ${escapeHtml(plan.metadata.ownerEns ?? 'N/A')}
    </footer>
  </body>
</html>`;
}

function renderSummaryMarkdown(plan: Plan, metrics: Record<string, number>, derived: DerivedJob[], criticalJobIds: Set<string>): string {
  const currency = plan.budget.currency;
  const formatCurrency = createCurrencyFormatter(currency);
  const lines: string[] = [];
  lines.push(`# ${plan.initiative}`);
  lines.push('');
  lines.push(`**Objective:** ${plan.objective}`);
  lines.push('');
  lines.push('## Mission metrics');
  lines.push('');
  lines.push(`- Jobs orchestrated: ${metrics.jobCount}`);
  lines.push(`- Critical path: ${metrics.criticalPathDays} days`);
  lines.push(`- Max concurrency: ${metrics.maxConcurrency}`);
  lines.push(`- Total reward: ${formatCurrency(metrics.totalReward)}`);
  lines.push(`- Validator stake: ${formatCurrency(metrics.validatorStake)}`);
  lines.push(`- Corridor capacity: ${metrics.corridorCapacity} tonnes/day`);
  lines.push('');
  lines.push('## Jobs');
  lines.push('');
  for (const job of derived) {
    lines.push(`### ${job.title}`);
    lines.push(`- Phase: ${job.phaseTitle}`);
    lines.push(`- Schedule: ${job.startDate.slice(0, 10)} → ${job.endDate.slice(0, 10)} (deadline ${job.deadlineDate.slice(0, 10)})`);
    lines.push(`- Reward: ${formatCurrency(job.reward)} · Slack: ${job.slackDays} days`);
    lines.push(`- Corridors: ${job.corridors.join(', ') || '—'}`);
    lines.push(`- Agents: ${job.assigned.map((assignment) => `${assignment.agent} (${assignment.responsibility})`).join('; ')}`);
    lines.push(`- Validators: ${job.validators.join(', ') || '—'}`);
    if (job.brief.length) {
      lines.push('  - Brief:');
      for (const item of job.brief) {
        lines.push(`    - ${item}`);
      }
    }
    if (criticalJobIds.has(job.id)) {
      lines.push('  - **Critical path node**');
    }
    lines.push('');
  }
  lines.push('## Owner playbooks');
  lines.push('');
  for (const command of plan.governance.ownerPlaybooks ?? []) {
    lines.push(`- \`${command}\``);
  }
  return `${lines.join('\n')}\n`;
}

function renderOwnerPlaybook(plan: Plan): string {
  const lines: string[] = [];
  lines.push('# Owner Command Centre Checklist');
  lines.push('');
  lines.push('Execute the following commands after each launch to assert sovereign control:');
  lines.push('');
  const commands = plan.governance.ownerPlaybooks ?? [];
  const annotated: Record<string, string> = {
    'npm run owner:command-center': 'Render live state of every owner module.',
    'npm run owner:parameters': 'Inspect configurable parameters (fees, stake thresholds, thermostat).',
    'npm run owner:system-pause -- --action pause': 'Engage the global pause valve for drills or incidents.',
    'npm run owner:system-pause -- --action unpause': 'Resume operations after validation.',
    'npm run owner:upgrade-status': 'Review timelocked governance proposals before execution.',
    'npm run owner:verify-control': 'Cryptographically verify owner supremacy across modules.',
    'npm run owner:mission-control': 'Summarise treasury balances and mission spend.',
    'npm run reward-engine:update': 'Apply incentive changes after `owner:mission-control` review.',
    'npm run thermostat:update': 'Broadcast thermostat adjustments to the protocol.',
  };
  for (const command of commands) {
    const description = annotated[command] ?? 'See CLI output for detailed guidance.';
    lines.push(`- \`${command}\` — ${description}`);
  }
  lines.push('');
  lines.push('For emergency response run: `npm run owner:emergency` and follow the generated playbook.');
  return `${lines.join('\n')}\n`;
}

function computeMetrics(plan: Plan, derived: DerivedJob[], maxConcurrency: number): Record<string, number> {
  const rewardSum = derived.reduce((sum, job) => sum + job.reward, 0);
  const corridorCapacity = plan.supplyNetwork.corridors.reduce((sum, corridor) => sum + corridor.capacityTonnesPerDay, 0);
  const validatorStake = plan.participants.validators.reduce(
    (sum, validator) => sum + toNumber(`${validator.handle}.stake`, validator.stake),
    0,
  );
  return {
    jobCount: derived.length,
    phaseCount: plan.operations.phases.length,
    agentCount: plan.participants.agents.length,
    validatorCount: plan.participants.validators.length,
    totalReward: rewardSum,
    operatorReserve: toNumber('budget.operatorReserve', plan.budget.operatorReserve ?? '0'),
    validatorPool: toNumber('budget.validatorPool', plan.budget.validatorPool ?? '0'),
    criticalPathDays: Math.max(...derived.map((job) => job.endOffset)),
    maxConcurrency,
    corridorCapacity,
    validatorStake,
  };
}

async function writeFileRelative(relPath: string, contents: string, outputs: Array<{ relPath: string; data: Buffer }>): Promise<void> {
  const absolute = path.join(ROOT, relPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const buffer = Buffer.from(contents);
  await fs.writeFile(absolute, buffer);
  outputs.push({ relPath, data: buffer });
}

async function main(): Promise<void> {
  const planPath = resolvePath('NATIONAL_SUPPLY_CHAIN_PLAN_PATH', DEFAULT_PLAN_PATH);
  const reportDir = resolvePath('NATIONAL_SUPPLY_CHAIN_REPORT_DIR', DEFAULT_REPORT_DIR);
  const uiExportPath = resolvePath('NATIONAL_SUPPLY_CHAIN_UI_EXPORT', DEFAULT_UI_EXPORT);

  const planRaw = await fs.readFile(planPath, 'utf8');
  const plan = parsePlan(planRaw);

  const schedule = computeSchedule(plan, plan.metadata.launchDate);
  const metrics = computeMetrics(plan, schedule.jobs, schedule.maxConcurrency);
  const mermaid = computeMermaid(plan, schedule.jobs);

  const outputs: Array<{ relPath: string; data: Buffer }> = [];

  const reportPrefix = path.relative(ROOT, reportDir) || 'reports/national-supply-chain';
  await fs.mkdir(reportDir, { recursive: true });

  const dashboardHtml = renderDashboard(plan, schedule.jobs, metrics, mermaid);
  await writeFileRelative(path.join(reportPrefix, 'dashboard.html'), dashboardHtml, outputs);

  const summaryMd = renderSummaryMarkdown(plan, metrics, schedule.jobs, schedule.criticalJobIds);
  await writeFileRelative(path.join(reportPrefix, 'summary.md'), summaryMd, outputs);

  await writeFileRelative(path.join(reportPrefix, 'mermaid.mmd'), `${mermaid.network}\n\n${mermaid.gantt}\n`, outputs);

  const ledger = {
    initiative: plan.initiative,
    objective: plan.objective,
    missionTag: plan.metadata.missionTag,
    generatedAt: plan.metadata.generatedAt,
    launchDate: plan.metadata.launchDate,
    network: 'Hardhat localhost (31337)',
    ownerEns: plan.metadata.ownerEns,
    budget: {
      currency: plan.budget.currency,
      total: toNumber('budget.total', plan.budget.total),
      operatorReserve: metrics.operatorReserve,
      validatorPool: metrics.validatorPool,
    },
    metrics,
    phases: plan.operations.phases,
    jobs: schedule.jobs,
    corridors: plan.supplyNetwork.corridors.map((corridor) => {
      const fromNode = plan.supplyNetwork.nodes.find((node) => node.id === corridor.from);
      const toNode = plan.supplyNetwork.nodes.find((node) => node.id === corridor.to);
      const ownerControls = Array.from(
        new Set([...(fromNode?.controlSurfaces ?? []), ...(toNode?.controlSurfaces ?? [])]),
      );
      return { ...corridor, ownerControls };
    }),
    validators: plan.participants.validators.map((validator) => ({
      handle: validator.handle,
      stake: toNumber(`${validator.handle}.stake`, validator.stake),
      mandate: validator.mandate,
      wallet: validator.wallet,
    })),
    agents: plan.participants.agents,
    ownerPlaybooks: plan.governance.ownerPlaybooks ?? [],
    mermaid,
    criticalJobs: Array.from(schedule.criticalJobIds),
  };
  await writeFileRelative(
    path.join(reportPrefix, 'mission-ledger.json'),
    `${JSON.stringify(ledger, null, 2)}\n`,
    outputs,
  );

  const ownerPlaybookMd = renderOwnerPlaybook(plan);
  await writeFileRelative(path.join(reportPrefix, 'owner-command-center.md'), ownerPlaybookMd, outputs);

  await writeFileRelative(
    path.relative(ROOT, uiExportPath),
    `${JSON.stringify({ ...ledger, mermaid }, null, 2)}\n`,
    outputs,
  );

  const manifestEntries = outputs.map(({ relPath, data }) => ({
    path: relPath,
    sha256: createHash('sha256').update(data).digest('hex'),
    bytes: data.byteLength,
  }));
  const manifest = {
    generatedAt: plan.metadata.generatedAt,
    planVersion: plan.metadata.version,
    files: manifestEntries,
  };
  await writeFileRelative(path.join(reportPrefix, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, outputs);

  console.log('National Supply Chain intelligence kit generated:');
  for (const entry of manifestEntries) {
    console.log(`  • ${entry.path} (${entry.bytes} bytes)`);
  }
  console.log(`Critical path length: ${metrics.criticalPathDays} days · Max concurrency ${metrics.maxConcurrency}`);
}

main().catch((error) => {
  console.error(`National Supply Chain demo failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
