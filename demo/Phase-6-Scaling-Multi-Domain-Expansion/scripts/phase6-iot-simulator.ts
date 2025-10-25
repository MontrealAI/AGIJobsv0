#!/usr/bin/env ts-node
/*
 * Simulates IoT + external system events and produces actionable rollout guidance
 * for the Phase 6 expansion plan. Designed for non-technical operators so they
 * can preview how the platform responds across multiple domains.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildPhase6Blueprint,
  loadPhase6Config,
  Phase6Blueprint,
  DomainBlueprint,
} from './phase6-blueprint';

interface EventPayload {
  id: string;
  domainHint?: string;
  summary: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  requiredSkills?: string[];
  requiredCapabilities?: Record<string, number>;
  metadata?: Record<string, unknown>;
}

interface CliOptions {
  configPath: string;
  eventPath?: string;
  jsonOutput?: string;
}

interface EvaluatedEvent {
  event: EventPayload;
  recommendedDomain: DomainBlueprint;
  rationale: string[];
  scorecard: Array<{ domain: string; score: number; reasons: string[] }>;
  bridgePlan: {
    l2Gateway?: string | null;
    settlementLayer: string;
    autopilot: string;
    requiresHumanValidation: boolean;
  };
  guardRails: {
    minStakeEth: string;
    treasuryShareBps: number;
    circuitBreakerBps: number;
  };
  credentialPlan: {
    requirements: string[];
    issuers: string[];
    verifiers: string[];
    notes: string[];
  };
}

const DEFAULT_CONFIG_PATH = join(__dirname, '..', 'config', 'domains.phase6.json');
const DEFAULT_EVENTS: EventPayload[] = [
  {
    id: 'finance-liquidity-shock',
    domainHint: 'finance',
    summary: 'High-volatility window detected by risk oracle – synthesize hedge routing and deploy treasury buffers.',
    type: 'market.oracle.alert',
    severity: 'critical',
    requiredSkills: ['finance', 'risk', 'defi'],
    requiredCapabilities: { treasury: 4, defi: 3 },
    metadata: {
      volatilityIndex: 0.87,
      affectedMarkets: ['ETH', 'stables', 'fx-baskets'],
    },
  },
  {
    id: 'health-telemetry-escalation',
    domainHint: 'health',
    summary: 'Remote clinic telemetry flagged inconsistent vitals across 11 nodes – dispatch oversight + DID verification.',
    type: 'iot.vitals.alert',
    severity: 'high',
    requiredSkills: ['health', 'compliance', 'regulation'],
    requiredCapabilities: { compliance: 4 },
    metadata: {
      regions: ['Nairobi', 'Lagos'],
      requiresHumanInLoop: true,
    },
  },
  {
    id: 'logistics-delay',
    summary: 'Hyper-port sensor mesh reports 7-hour delay for a climate-sensitive shipment – reroute and notify operators.',
    type: 'iot.logistics.delay',
    severity: 'medium',
    requiredSkills: ['logistics', 'climate', 'automation'],
    requiredCapabilities: { logistics: 3 },
    metadata: {
      cargo: 'Biopharma cold-chain',
      temperatureSpike: '2.3°C',
      port: 'Singapore',
    },
  },
  {
    id: 'education-accreditation',
    domainHint: 'education',
    summary: 'Incoming cohort requests verifiable credential issuance mapped to DID wallet distribution.',
    type: 'identity.credential.issue',
    severity: 'low',
    requiredSkills: ['education', 'identity', 'compliance'],
    requiredCapabilities: { credentials: 3 },
    metadata: {
      cohortSize: 5400,
      requiresOnChainProof: true,
    },
  },
];

function parseArgs(): CliOptions {
  const argv = process.argv.slice(2);
  const options: CliOptions = { configPath: DEFAULT_CONFIG_PATH };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') {
      const next = argv[++i];
      if (!next) {
        throw new Error('--config expects a path');
      }
      options.configPath = next;
      continue;
    }
    if (arg.startsWith('--config=')) {
      options.configPath = arg.split('=', 2)[1] ?? DEFAULT_CONFIG_PATH;
      continue;
    }
    if (arg === '--events') {
      const next = argv[++i];
      if (!next) {
        throw new Error('--events expects a path to a JSON file.');
      }
      options.eventPath = next;
      continue;
    }
    if (arg.startsWith('--events=')) {
      options.eventPath = arg.split('=', 2)[1];
      continue;
    }
    if (arg === '--json') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        options.jsonOutput = '-';
      } else {
        options.jsonOutput = next;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--json=')) {
      const value = arg.split('=', 2)[1];
      options.jsonOutput = value && value.length ? value : '-';
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    console.warn(`Unknown option: ${arg}`);
  }

  return options;
}

function printUsage(): void {
  console.log(
    `Phase 6 IoT simulator\n\n` +
      `Usage: npm run demo:phase6:iot -- [options]\n\n` +
      `Options:\n` +
      `  --config <path>         Use a custom Phase 6 config file (default: ${DEFAULT_CONFIG_PATH})\n` +
      `  --events <path>         Load events from a JSON file instead of built-in samples\n` +
      `  --json [path|-]         Emit JSON output to <path>; use '-' for stdout\n` +
      `  -h, --help              Show this message\n`,
  );
}

function loadEvents(path?: string): EventPayload[] {
  if (!path) {
    return DEFAULT_EVENTS;
  }
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  if (Array.isArray(raw)) {
    return raw as EventPayload[];
  }
  throw new Error(`Events file must contain an array – received ${typeof raw}`);
}

function evaluateEvents(blueprint: Phase6Blueprint, events: EventPayload[]): EvaluatedEvent[] {
  return events.map((event) => {
    const scorecard = blueprint.domains
      .map((domain) => ({
        domain: domain.slug,
        score: scoreDomain(domain, event),
        reasons: buildReasons(domain, event),
      }))
      .sort((a, b) => b.score - a.score);

    const top = scorecard[0];
    const recommendedDomain = blueprint.domains.find((domain) => domain.slug === top.domain)!;

    return {
      event,
      recommendedDomain,
      rationale: scorecard[0].reasons,
      scorecard,
      bridgePlan: buildBridgePlan(blueprint, recommendedDomain),
      guardRails: {
        minStakeEth: recommendedDomain.operations.minStakeEth,
        treasuryShareBps: recommendedDomain.operations.treasuryShareBps,
        circuitBreakerBps: recommendedDomain.operations.circuitBreakerBps,
      },
      credentialPlan: buildCredentialPlan(recommendedDomain, event),
    };
  });
}

function normaliseSkills(skills?: string[]): string[] {
  if (!skills) return [];
  return skills.map((skill) => skill.toLowerCase().trim()).filter(Boolean);
}

function scoreDomain(domain: DomainBlueprint, event: EventPayload): number {
  let score = domain.priority || 0;

  if (event.domainHint && event.domainHint.toLowerCase() === domain.slug.toLowerCase()) {
    score += 25;
  }

  const skills = normaliseSkills(event.requiredSkills);
  const matchedSkills = skills.filter((skill) => domain.skillTags.includes(skill));
  score += matchedSkills.length * 12;

  const requiredCaps = event.requiredCapabilities ?? {};
  const capabilityScore = Object.entries(requiredCaps).reduce((acc, [cap, weight]) => {
    const domainCap = domain.capabilities[cap.toLowerCase()] ?? 0;
    return acc + domainCap * Number(weight ?? 1);
  }, 0);
  score += capabilityScore * 6;

  if (domain.telemetry.usesL2Settlement && event.type.startsWith('iot.')) {
    score += 8;
  }

  if (domain.operations.requiresHumanValidation && event.metadata?.requiresHumanInLoop) {
    score += 6;
  }

  if (!domain.operations.requiresHumanValidation && event.metadata?.requiresHumanInLoop) {
    score -= 4;
  }

  if (domain.infrastructureControl.autopilotEnabled) {
    score += 5;
  }

  if (event.severity === 'critical') {
    score += 5;
  }

  if (event.severity === 'low') {
    score -= 2;
  }

  return score;
}

function buildReasons(domain: DomainBlueprint, event: EventPayload): string[] {
  const reasons: string[] = [];
  if (event.domainHint && event.domainHint.toLowerCase() === domain.slug.toLowerCase()) {
    reasons.push('Domain hint matches');
  }
  const skills = normaliseSkills(event.requiredSkills);
  const matchedSkills = skills.filter((skill) => domain.skillTags.includes(skill));
  if (matchedSkills.length) {
    reasons.push(`Skill alignment: ${matchedSkills.join(', ')}`);
  }
  const requiredCaps = event.requiredCapabilities ?? {};
  Object.entries(requiredCaps).forEach(([cap, weight]) => {
    const domainCap = domain.capabilities[cap.toLowerCase()];
    if (domainCap) {
      reasons.push(`Capability ${cap}: ${domainCap.toFixed(1)} x weight ${Number(weight ?? 1).toFixed(1)}`);
    }
  });
  if (domain.telemetry.usesL2Settlement && event.type.startsWith('iot.')) {
    reasons.push('IoT-ready L2 settlement');
  }
  if (domain.operations.requiresHumanValidation) {
    reasons.push('Human validation available');
  }
  if (domain.infrastructureControl.autopilotEnabled) {
    reasons.push(`Autopilot cadence ${domain.infrastructureControl.autopilotCadenceSeconds || 0}s`);
  }
  return reasons;
}

function buildBridgePlan(blueprint: Phase6Blueprint, domain: DomainBlueprint) {
  const autopilot = domain.infrastructureControl.autopilotEnabled
    ? `autopilot enabled @ ${domain.infrastructureControl.autopilotCadenceSeconds || 0}s`
    : 'autopilot standby';
  return {
    l2Gateway: domain.addresses.l2Gateway ?? blueprint.global.defaultL2Gateway,
    settlementLayer: domain.telemetry.usesL2Settlement ? 'Layer-2 accelerated' : 'Layer-1 anchor',
    autopilot,
    requiresHumanValidation: domain.operations.requiresHumanValidation,
  };
}

function buildCredentialPlan(domain: DomainBlueprint, event: EventPayload) {
  if (!domain.credentials.length) {
    return { requirements: [], issuers: [], verifiers: [], notes: [] };
  }
  const prioritized = event.metadata?.requiresHumanInLoop
    ? domain.credentials
    : domain.credentials.slice(0, Math.max(1, Math.min(2, domain.credentials.length)));
  const unique = (values: string[]) => Array.from(new Set(values.filter((value) => value && value.length)));
  const notes = prioritized
    .map((credential) => credential.notes)
    .filter((note): note is string => typeof note === 'string' && note.length > 0);
  return {
    requirements: prioritized.map((credential) => credential.name),
    issuers: unique(prioritized.flatMap((credential) => credential.issuers)),
    verifiers: unique(prioritized.flatMap((credential) => credential.verifiers)),
    notes,
  };
}

function summariseEvent(result: EvaluatedEvent) {
  console.log(`\n\x1b[38;5;105mEvent: ${result.event.summary}\x1b[0m`);
  console.log(`  id: ${result.event.id}`);
  console.log(`  type: ${result.event.type}`);
  console.log(`  severity: ${result.event.severity}`);
  if (result.event.requiredSkills?.length) {
    console.log(`  required skills: ${result.event.requiredSkills.join(', ')}`);
  }
  console.log(`\n  \x1b[32mRecommended domain:\x1b[0m ${result.recommendedDomain.name} (${result.recommendedDomain.slug})`);
  console.log(`    manifest: ${result.recommendedDomain.manifestURI}`);
  console.log(`    subgraph: ${result.recommendedDomain.subgraph}`);
  console.log(`    guard rails: min stake ${result.guardRails.minStakeEth}, treasury share ${result.guardRails.treasuryShareBps} bps, circuit breaker ${result.guardRails.circuitBreakerBps} bps`);
  console.log(`    bridge plan: ${result.bridgePlan.settlementLayer} via ${result.bridgePlan.l2Gateway ?? '—'} (${result.bridgePlan.autopilot})`);
  if (result.bridgePlan.requiresHumanValidation) {
    console.log('    ⚠ Requires human validation – route through credential verifier.');
  }
  if (result.credentialPlan.requirements.length) {
    console.log(
      `    credential plan: ${result.credentialPlan.requirements.join(', ')} | issuers ${
        result.credentialPlan.issuers.join(', ') || '—'
      } | verifiers ${result.credentialPlan.verifiers.join(', ') || '—'}`,
    );
    if (result.credentialPlan.notes.length) {
      console.log(`    notes: ${result.credentialPlan.notes.join(' | ')}`);
    }
  }
  console.log('    Rationale:');
  result.rationale.forEach((reason) => {
    console.log(`      • ${reason}`);
  });
  console.log('  Scorecard:');
  result.scorecard.slice(0, 4).forEach((entry, idx) => {
    const indicator = idx === 0 ? '★' : '•';
    console.log(`    ${indicator} ${entry.domain.padEnd(12)} ${entry.score.toFixed(2)}`);
  });
}

function emitJson(results: EvaluatedEvent[], path?: string) {
  const payload = results.map((result) => ({
    event: result.event,
    recommendedDomain: {
      slug: result.recommendedDomain.slug,
      name: result.recommendedDomain.name,
      manifestURI: result.recommendedDomain.manifestURI,
      subgraph: result.recommendedDomain.subgraph,
    },
    rationale: result.rationale,
    bridgePlan: result.bridgePlan,
    guardRails: result.guardRails,
    credentialPlan: result.credentialPlan,
    scorecard: result.scorecard,
  }));

  if (!path || path === '-') {
    process.stdout.write(JSON.stringify(payload, null, 2));
    return;
  }

  writeFileSync(path, JSON.stringify(payload, null, 2));
  console.log(`\nJSON report written to ${path}`);
}

function main() {
  const options = parseArgs();
  const config = loadPhase6Config(options.configPath);
  const blueprint = buildPhase6Blueprint(config, { configPath: options.configPath });
  const events = loadEvents(options.eventPath);

  console.log('\x1b[38;5;117mPhase 6 IoT & external signal simulator\x1b[0m');
  console.log(`Spec version: ${blueprint.specVersion}`);
  console.log(`Config hash: ${blueprint.configHash}`);
  console.log(`Loaded ${events.length} event${events.length === 1 ? '' : 's'}.`);

  const evaluations = evaluateEvents(blueprint, events);
  evaluations.forEach(summariseEvent);

  if (options.jsonOutput) {
    emitJson(evaluations, options.jsonOutput);
  }

  console.log('\nAll events processed. Phase 6 routing plan ready for execution.');
}

main();
