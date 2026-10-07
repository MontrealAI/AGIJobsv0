#!/usr/bin/env ts-node
/*
 * Simulates IoT + external system events and produces actionable rollout guidance
 * for the Phase 6 expansion plan. Designed for non-technical operators so they
 * can preview how the platform responds across multiple domains.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePhase6Args } from './phase6-cli';
import { parsePhase6Json } from '../../../scripts/phase6/config-validation';

import {
  buildPhase6Blueprint,
  loadPhase6Config,
  Phase6Blueprint,
  DomainBlueprint,
} from './phase6-blueprint';

export interface EventPayload {
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

export interface EvaluatedEvent {
  event: EventPayload;
  status: 'proposal' | 'blocked';
  executionAuthorized: false;
  recommendedDomain: DomainBlueprint | null;
  rationale: string[];
  scorecard: Array<{
    domain: string;
    score: number;
    reasons: string[];
    blockers: string[];
  }>;
  bridgePlan?: {
    l2Gateway?: string | null;
    settlementLayer: string;
    autopilot: string;
    requiresHumanValidation: boolean;
  };
  guardRails?: {
    minStakeDisplay: string;
    treasuryShareBps: number;
    circuitBreakerBps: number;
  };
  credentialPlan?: {
    requirements: string[];
    issuers: string[];
    verifiers: string[];
    notes: string[];
  };
}

const DEFAULT_CONFIG_PATH = join(
  __dirname,
  '..',
  'config',
  'domains.phase6.json'
);
const DEFAULT_EVENTS: EventPayload[] = [
  {
    id: 'finance-liquidity-shock',
    domainHint: 'finance',
    summary:
      'High-volatility window detected by risk oracle – synthesize hedge routing and deploy treasury buffers.',
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
    summary:
      'Remote clinic telemetry flagged inconsistent vitals across 11 nodes – dispatch oversight + DID verification.',
    type: 'iot.vitals.alert',
    severity: 'high',
    requiredSkills: ['healthcare', 'diagnostics', 'compliance'],
    requiredCapabilities: { compliance: 4 },
    metadata: {
      regions: ['Nairobi', 'Lagos'],
      requiresHumanInLoop: true,
    },
  },
  {
    id: 'logistics-delay',
    summary:
      'Hyper-port sensor mesh reports 7-hour delay for a climate-sensitive shipment – reroute and notify operators.',
    type: 'iot.logistics.delay',
    severity: 'medium',
    requiredSkills: ['logistics', 'iot', 'routing'],
    requiredCapabilities: { routing: 3 },
    metadata: {
      cargo: 'Biopharma cold-chain',
      temperatureSpike: '2.3°C',
      port: 'Singapore',
    },
  },
  {
    id: 'education-accreditation',
    domainHint: 'education',
    summary:
      'Incoming cohort requests verifiable credential issuance mapped to DID wallet distribution.',
    type: 'identity.credential.issue',
    severity: 'low',
    requiredSkills: ['education', 'research', 'training'],
    requiredCapabilities: { curriculum: 3 },
    metadata: {
      cohortSize: 5400,
      requiresOnChainProof: true,
    },
  },
];

function parseArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  return parsePhase6Args(
    argv,
    DEFAULT_CONFIG_PATH,
    ['json', 'events'],
    printUsage
  );
}

function printUsage(): void {
  console.log(
    `Phase 6 IoT simulator\n\n` +
      `Usage: npm run demo:phase6:iot -- [options]\n\n` +
      `Options:\n` +
      `  --config <path>         Use a custom Phase 6 config file (default: ${DEFAULT_CONFIG_PATH})\n` +
      `  --events <path>         Load events from a JSON file instead of built-in samples\n` +
      `  --json [path|-]         Emit JSON output to <path>; use '-' for stdout\n` +
      `  -h, --help              Show this message\n`
  );
}

export function validateEvents(
  value: unknown
): asserts value is EventPayload[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000)
    throw new Error('Events must contain 1–1000 records.');
  const ids = new Set<string>();
  value.forEach((event, index) => {
    const fail = (field: string) => {
      throw new Error(`events[${index}].${field} is invalid.`);
    };
    if (!event || typeof event !== 'object' || Array.isArray(event))
      fail('record');
    ['id', 'summary', 'type'].forEach((key) => {
      if (
        typeof event[key] !== 'string' ||
        !event[key].trim() ||
        /[\u0000-\u001f\u007f]/.test(event[key])
      )
        fail(key);
    });
    if (ids.has(event.id)) fail('id (duplicate)');
    ids.add(event.id);
    if (!['low', 'medium', 'high', 'critical'].includes(event.severity))
      fail('severity');
    if (
      event.domainHint !== undefined &&
      (typeof event.domainHint !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.domainHint))
    )
      fail('domainHint');
    if (
      event.requiredSkills !== undefined &&
      (!Array.isArray(event.requiredSkills) ||
        event.requiredSkills.some(
          (skill: unknown) => typeof skill !== 'string' || !skill.trim()
        ))
    )
      fail('requiredSkills');
    if (event.requiredCapabilities !== undefined) {
      if (
        !event.requiredCapabilities ||
        typeof event.requiredCapabilities !== 'object' ||
        Array.isArray(event.requiredCapabilities)
      )
        fail('requiredCapabilities');
      Object.entries(event.requiredCapabilities).forEach(([key, minimum]) => {
        if (
          !key.trim() ||
          typeof minimum !== 'number' ||
          !Number.isFinite(minimum) ||
          minimum <= 0 ||
          minimum > Number.MAX_SAFE_INTEGER
        )
          fail('requiredCapabilities');
      });
    }
    if (event.metadata !== undefined) {
      if (
        !event.metadata ||
        typeof event.metadata !== 'object' ||
        Array.isArray(event.metadata)
      )
        fail('metadata');
      if (
        event.metadata.requiresHumanInLoop !== undefined &&
        typeof event.metadata.requiresHumanInLoop !== 'boolean'
      )
        fail('metadata.requiresHumanInLoop');
    }
  });
}

function loadEvents(path?: string): EventPayload[] {
  const value = path
    ? parsePhase6Json(readFileSync(path, 'utf-8'))
    : DEFAULT_EVENTS;
  validateEvents(value);
  return value;
}

function eligibility(domain: DomainBlueprint, event: EventPayload): string[] {
  const blockers: string[] = [];
  if (!domain.active || domain.lifecycle !== 'active')
    blockers.push('Domain is inactive or not commissioned as active');
  if (event.domainHint && event.domainHint !== domain.slug)
    blockers.push('Outside requested domain');
  const skills = normaliseSkills(event.requiredSkills);
  const missing = skills.filter((skill) => !domain.skillTags.includes(skill));
  if (missing.length)
    blockers.push(`Missing required skills: ${missing.join(', ')}`);
  Object.entries(event.requiredCapabilities ?? {}).forEach(
    ([capability, minimum]) => {
      if ((domain.capabilities[capability.trim().toLowerCase()] ?? 0) < minimum)
        blockers.push(`Capability ${capability} below required ${minimum}`);
    }
  );
  if (
    event.metadata?.requiresHumanInLoop === true &&
    !domain.operations.requiresHumanValidation
  )
    blockers.push('Required human validation is not configured');
  if (
    !event.domainHint &&
    !skills.length &&
    !Object.keys(event.requiredCapabilities ?? {}).length
  )
    blockers.push('No domain selection requirements supplied');
  return blockers;
}

export function evaluateEvents(
  blueprint: Phase6Blueprint,
  events: EventPayload[]
): EvaluatedEvent[] {
  validateEvents(events);
  return events.map((event) => {
    const scorecard = blueprint.domains
      .map((domain) => ({
        domain: domain.slug,
        score: scoreDomain(domain, event),
        reasons: buildReasons(domain, event),
        blockers: eligibility(domain, event),
      }))
      .sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain));
    const top = scorecard.find((entry) => entry.blockers.length === 0);
    if (!top)
      return {
        event,
        status: 'blocked',
        executionAuthorized: false,
        recommendedDomain: null,
        rationale: [
          'No configured active domain satisfies all requirements. Revise the task or commission an appropriate domain; do not dispatch.',
        ],
        scorecard,
      };
    const recommendedDomain = blueprint.domains.find(
      (domain) => domain.slug === top.domain
    )!;
    return {
      event,
      status: 'proposal',
      executionAuthorized: false,
      recommendedDomain,
      rationale: [
        ...top.reasons,
        'Configuration-based proposal only; authorization, provider commissioning and independent verification remain required.',
      ],
      scorecard,
      bridgePlan: buildBridgePlan(blueprint, recommendedDomain),
      guardRails: {
        minStakeDisplay: recommendedDomain.operations.minStakeDisplay,
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

  if (
    event.domainHint &&
    event.domainHint.toLowerCase() === domain.slug.toLowerCase()
  ) {
    score += 25;
  }

  const skills = normaliseSkills(event.requiredSkills);
  const matchedSkills = skills.filter((skill) =>
    domain.skillTags.includes(skill)
  );
  score += matchedSkills.length * 12;

  const requiredCaps = event.requiredCapabilities ?? {};
  const capabilityScore = Object.entries(requiredCaps).reduce(
    (acc, [cap, weight]) => {
      const domainCap = domain.capabilities[cap.toLowerCase()] ?? 0;
      return acc + domainCap * Number(weight ?? 1);
    },
    0
  );
  score += capabilityScore * 6;

  if (domain.telemetry.usesL2Settlement && event.type.startsWith('iot.')) {
    score += 8;
  }

  if (
    domain.operations.requiresHumanValidation &&
    event.metadata?.requiresHumanInLoop
  ) {
    score += 6;
  }

  if (
    !domain.operations.requiresHumanValidation &&
    event.metadata?.requiresHumanInLoop
  ) {
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
  if (
    event.domainHint &&
    event.domainHint.toLowerCase() === domain.slug.toLowerCase()
  ) {
    reasons.push('Domain hint matches');
  }
  const skills = normaliseSkills(event.requiredSkills);
  const matchedSkills = skills.filter((skill) =>
    domain.skillTags.includes(skill)
  );
  if (matchedSkills.length) {
    reasons.push(`Skill alignment: ${matchedSkills.join(', ')}`);
  }
  const requiredCaps = event.requiredCapabilities ?? {};
  Object.entries(requiredCaps).forEach(([cap, weight]) => {
    const domainCap = domain.capabilities[cap.toLowerCase()];
    if (domainCap) {
      reasons.push(
        `Capability ${cap}: ${domainCap.toFixed(1)} x weight ${Number(
          weight ?? 1
        ).toFixed(1)}`
      );
    }
  });
  if (domain.telemetry.usesL2Settlement && event.type.startsWith('iot.')) {
    reasons.push('L2 settlement configured (unverified)');
  }
  if (domain.operations.requiresHumanValidation) {
    reasons.push('Human validation configured (unverified)');
  }
  if (domain.infrastructureControl.autopilotEnabled) {
    reasons.push(
      `Autopilot cadence ${
        domain.infrastructureControl.autopilotCadenceSeconds || 0
      }s`
    );
  }
  return reasons;
}

function buildBridgePlan(blueprint: Phase6Blueprint, domain: DomainBlueprint) {
  const autopilot = domain.infrastructureControl.autopilotEnabled
    ? `autopilot enabled @ ${
        domain.infrastructureControl.autopilotCadenceSeconds || 0
      }s`
    : 'autopilot standby';
  return {
    l2Gateway: domain.addresses.l2Gateway ?? blueprint.global.defaultL2Gateway,
    settlementLayer: domain.telemetry.usesL2Settlement
      ? 'Layer-2 accelerated'
      : 'Layer-1 anchor',
    autopilot,
    requiresHumanValidation: domain.operations.requiresHumanValidation,
  };
}

function buildCredentialPlan(domain: DomainBlueprint, event: EventPayload) {
  if (!domain.credentials.length) {
    return { requirements: [], issuers: [], verifiers: [], notes: [] };
  }
  const prioritized = domain.credentials;
  const unique = (values: string[]) =>
    Array.from(new Set(values.filter((value) => value && value.length)));
  const notes = prioritized
    .map((credential) => credential.notes)
    .filter(
      (note): note is string => typeof note === 'string' && note.length > 0
    );
  return {
    requirements: prioritized.map((credential) => credential.name),
    issuers: unique(prioritized.flatMap((credential) => credential.issuers)),
    verifiers: unique(
      prioritized.flatMap((credential) => credential.verifiers)
    ),
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
  if (!result.recommendedDomain) {
    console.log('  BLOCKED: no eligible domain; no execution authorized.');
    result.scorecard.forEach((entry) =>
      console.log(`    ${entry.domain}: ${entry.blockers.join('; ')}`)
    );
    return;
  }
  console.log(
    `\n  \x1b[32mRecommended domain:\x1b[0m ${result.recommendedDomain.name} (${result.recommendedDomain.slug})`
  );
  console.log(`    manifest: ${result.recommendedDomain.manifestURI}`);
  console.log(`    subgraph: ${result.recommendedDomain.subgraph}`);
  console.log(
    `    guard rails: min stake ${result.guardRails.minStakeDisplay}, treasury share ${result.guardRails.treasuryShareBps} bps, circuit breaker ${result.guardRails.circuitBreakerBps} bps`
  );
  console.log(
    `    bridge plan: ${result.bridgePlan.settlementLayer} via ${
      result.bridgePlan.l2Gateway ?? '—'
    } (${result.bridgePlan.autopilot})`
  );
  if (result.bridgePlan.requiresHumanValidation) {
    console.log(
      '    ⚠ Requires human validation – route through credential verifier.'
    );
  }
  if (result.credentialPlan.requirements.length) {
    console.log(
      `    credential plan: ${result.credentialPlan.requirements.join(
        ', '
      )} | issuers ${
        result.credentialPlan.issuers.join(', ') || '—'
      } | verifiers ${result.credentialPlan.verifiers.join(', ') || '—'}`
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
    const indicator =
      entry.domain === result.recommendedDomain?.slug
        ? '★'
        : entry.blockers.length
        ? '×'
        : '•';
    console.log(
      `    ${indicator} ${entry.domain.padEnd(12)} ${entry.score.toFixed(2)}`
    );
  });
}

function emitJson(results: EvaluatedEvent[], path?: string) {
  const payload = results.map((result) => ({
    event: result.event,
    status: result.status,
    executionAuthorized: false,
    recommendedDomain: result.recommendedDomain
      ? {
          slug: result.recommendedDomain.slug,
          name: result.recommendedDomain.name,
          manifestURI: result.recommendedDomain.manifestURI,
          subgraph: result.recommendedDomain.subgraph,
        }
      : null,
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
  const blueprint = buildPhase6Blueprint(config, {
    configPath: options.configPath,
  });
  const events = loadEvents(options.eventPath);

  const evaluations = evaluateEvents(blueprint, events);
  if (options.jsonOutput === '-') {
    emitJson(evaluations, '-');
    return;
  }

  console.log('\x1b[38;5;117mPhase 6 IoT & external signal simulator\x1b[0m');
  console.log(
    'Planning only. No task authorization, work execution, identity checks or settlement occurs.'
  );
  console.log(`Spec version: ${blueprint.specVersion}`);
  console.log(`Config hash: ${blueprint.configHash}`);
  console.log(
    `Loaded ${events.length} event${events.length === 1 ? '' : 's'}.`
  );

  evaluations.forEach(summariseEvent);

  if (options.jsonOutput) {
    emitJson(evaluations, options.jsonOutput);
  }

  console.log(
    '\nAll events evaluated. Review proposals and resolve blocked requirements before worker admission.'
  );
}

if (require.main === module) main();
