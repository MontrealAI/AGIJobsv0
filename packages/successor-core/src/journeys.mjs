/** All public workbenches use the same constitution, sealed-job and portable-knowledge contracts. */
import {
  createInvoiceMission,
  createInvoiceSources,
  runInvoiceJourney,
} from './invoice.mjs';
import { validateMission, validateGraph, requireCondition } from './domain.mjs';
import { compileJobs, verifyWorkOrderSeal } from './compiler.mjs';
import { canonicalize, digestObject } from './integrity.mjs';
import { JOB_TEMPLATES } from './templates.mjs';
import { runWorldWorkbench, runResourceWorkbench } from './workbenches.mjs';
import { createMissionPack } from './pack.mjs';

export function createWorkbenchMission(name = 'invoice') {
  if (name === 'invoice') return createInvoiceMission();
  if (!['world', 'resources'].includes(name))
    throw Object.assign(new Error('Choose invoice, world or resources.'), {
      code: 'UNKNOWN_MISSION',
    });
  const base = createInvoiceMission();
  const world = name === 'world';
  const incumbent = world
    ? {
        id: 'incumbent_conservative',
        version: '1',
        description: 'Conservative fixed-loss deterministic incumbent',
      }
    : {
        id: 'no_research',
        version: '1',
        description: 'Retain the current situation without buying research',
      };
  const alternatives = world
    ? [
        {
          id: 'strong_conventional',
          version: '1',
          description: 'Equally informed conventional guarded-loss model',
        },
      ]
    : [
        {
          id: 'one_step',
          version: '1',
          description: 'Conventional policy limited to one experiment',
        },
        {
          id: 'conventional',
          version: '1',
          description:
            'Equally informed conventional finite sequential planner',
        },
      ];
  return validateMission({
    ...base,
    missionId: world
      ? 'symbolic-energy-discovery-synthetic-v1'
      : 'evidence-and-resource-planning-synthetic-v1',
    title: world
      ? 'Executable energy WORLD — synthetic rehearsal'
      : 'Sequential investigation and resource planning — synthetic rehearsal',
    beneficiary: 'Synthetic bounded-mission research principal',
    objective:
      name === 'world'
        ? 'Find a bounded executable transition hypothesis and compare downstream safe decisions against credible alternatives.'
        : 'Choose cost-aware sequential experiments and feasible resource plans, including no-build, under correlated measurement error.',
    incumbent,
    alternatives,
    rights: [
      {
        sourceId: `${name}-synthetic-evidence`,
        license: 'MIT authored synthetic fixtures',
        dataClass: 'synthetic',
        permittedUses: ['mission-evaluation', 'fixture-export'],
        expiresAt: base.expiresAt,
      },
    ],
    criticalFunctions: JOB_TEMPLATES.map((item) => item.coverageKey),
    budget: { ...base.budget, maxRetries: 0, unit: 'synthetic_utility_units' },
    allowedTools: world
      ? [
          'fixture-reader',
          'bounded-symbolic-interpreter',
          'finite-program-search',
          'residual-fit-proposer',
        ]
      : [
          'fixture-reader',
          'finite-joint-world-planner',
          'bounded-resource-scheduler',
        ],
    authorityCeiling: {
      ...base.authorityCeiling,
      prohibitedActions: [
        ...base.authorityCeiling.prohibitedActions,
        'physical-actuation',
      ],
    },
    rollback: {
      target: incumbent.id,
      available: true,
      reason:
        'Discard local derived proposals and retain the declared incumbent; no physical, financial or production effects exist.',
    },
    hardGates: [
      {
        id: 'no-external-action',
        description: 'No physical, financial or production effects.',
        maxViolations: 0,
      },
      {
        id: 'no-critical-miss',
        description:
          'Higher aggregate score cannot compensate unsafe downstream decisions.',
        maxViolations: 0,
      },
    ],
    proofProtocol: {
      ...base.proofProtocol,
      id: `${name}-fixture-protocol`,
      scope:
        'Public synthetic development cases only; fresh independent proof unavailable.',
    },
  });
}
export async function runMissionJourney(name = 'invoice', options = {}) {
  if (name === 'invoice') return runInvoiceJourney(options);
  const mission = createWorkbenchMission(name);
  requireCondition(
    options.criticalMissBudget === undefined ||
      options.criticalMissBudget === mission.proofProtocol.criticalErrorCeiling,
    'MISSION_POLICY_MISMATCH',
    'A run cannot weaken the constituted critical-error ceiling. Create a reviewed mission version instead.'
  );
  if (name === 'resources' && options.budget !== undefined)
    requireCondition(
      Number.isSafeInteger(options.budget) &&
        options.budget >= 0 &&
        BigInt(options.budget) <= BigInt(mission.budget.limitBaseUnits),
      'MISSION_BUDGET_EXCEEDED',
      'Research budget must remain inside the constituted mission ceiling.'
    );
  const compilation = await compileJobs(mission, {
    now: options.now ?? '2026-10-08T00:00:00Z',
  });
  const workbench =
    name === 'world'
      ? runWorldWorkbench({
          ...options,
          criticalMissBudget: mission.proofProtocol.criticalErrorCeiling,
        })
      : runResourceWorkbench(options);
  requireCondition(
    workbench.missionId === mission.missionId,
    'MISSION_BINDING_MISMATCH',
    'Workbench evidence must name the exact compiled mission.'
  );
  return {
    schemaVersion: '1.0.0',
    mode: 'SYNTHETIC_REHEARSAL',
    mission,
    compilation,
    workbench,
    status: 'AWAITING_HUMAN_REVIEW',
    authority: {
      level: 'A1',
      productionAuthority: false,
      externalEffects: false,
    },
    limitations: [
      'Compiled portfolio is a coverage plan, not 21 independently completed jobs.',
      'Computed workbench results are internal synthetic evidence.',
    ],
  };
}
/** Export permission comes from equality to authored public fixtures, not an imported label. */
export async function verifyPublicJourney(input) {
  const encoded = canonicalize(input);
  requireCondition(
    new TextEncoder().encode(encoded).byteLength <= 2 * 1024 * 1024,
    'JOURNEY_EXPORT_LIMIT',
    'Public fixture journey exceeds the 2 MiB export-verification limit.'
  );
  const journey = JSON.parse(encoded);
  const mission = validateMission(journey?.mission);
  const name =
    mission.missionId === 'invoice-integrity-synthetic-v1'
      ? 'invoice'
      : mission.missionId === 'symbolic-energy-discovery-synthetic-v1'
      ? 'world'
      : mission.missionId === 'evidence-and-resource-planning-synthetic-v1'
      ? 'resources'
      : null;
  requireCondition(
    name,
    'UNKNOWN_MISSION',
    'Only implemented mission journeys have an executable replay recipe.'
  );
  requireCondition(
    journey.schemaVersion === '1.0.0' && journey.mode === 'SYNTHETIC_REHEARSAL',
    'JOURNEY_MODE_MISMATCH',
    'Only public synthetic fixture journeys can use this export path.'
  );
  requireCondition(
    canonicalize(mission) === canonicalize(createWorkbenchMission(name)),
    'JOURNEY_PRESET_MISMATCH',
    'Mission rights, roles, objective and boundaries must exactly match an authored public preset. Custom missions require their own rights-aware export workflow.'
  );
  const compilation = journey.compilation;
  requireCondition(
    compilation &&
      canonicalize(compilation.constitution) === canonicalize(mission),
    'JOURNEY_CONSTITUTION_MISMATCH',
    'Compiled constitution must exactly match the exported mission.'
  );
  requireCondition(
    compilation.digest ===
      (await digestObject('successor.constitution.v1', mission)),
    'JOURNEY_CONSTITUTION_MISMATCH',
    'Compiled constitution digest does not match.'
  );
  const graph = validateGraph(compilation.graph);
  requireCondition(
    graph.missionId === mission.missionId && graph.version === mission.version,
    'JOURNEY_GRAPH_MISMATCH',
    'Sealed graph binds a different mission version.'
  );
  for (const job of graph.nodes)
    requireCondition(
      await verifyWorkOrderSeal(job),
      'JOB_SEAL_INVALID',
      'An exported work order does not match its seal.'
    );
  const { digest: graphDigest, ...graphBody } = graph;
  requireCondition(
    graphDigest === (await digestObject('successor.job-graph.v1', graphBody)),
    'JOURNEY_GRAPH_MISMATCH',
    'Compiled graph digest does not match.'
  );
  let options;
  if (name === 'invoice') {
    requireCondition(
      canonicalize(journey.sources) === canonicalize(createInvoiceSources()),
      'JOURNEY_SOURCE_MISMATCH',
      'Public export accepts only the exact authored synthetic invoice sources; source labels cannot license arbitrary content.'
    );
    requireCondition(
      Array.isArray(journey.receipts) &&
        journey.receipts.length === 10 &&
        typeof journey.receipts[0]?.timestamp === 'string',
      'JOURNEY_RECEIPT_MISMATCH',
      'Invoice export requires its complete fixture receipt set.'
    );
    options = { now: journey.receipts[0].timestamp };
  } else {
    const report = journey.workbench;
    requireCondition(
      report &&
        report.missionId === mission.missionId &&
        report.mode === 'SYNTHETIC_REHEARSAL' &&
        report.evidenceClass === 'PUBLIC_DEVELOPMENT_FIXTURE' &&
        report.independentProof === false &&
        report.activeProductionAuthority === false,
      'JOURNEY_EVIDENCE_MISMATCH',
      'Workbench evidence must bind this mission and remain public unprivileged development evidence.'
    );
    options =
      name === 'world'
        ? {
            seed: report.seed,
            maxCandidates: report.search?.budget?.maxCandidates,
            maxSteps: report.search?.budget?.maxSteps,
          }
        : {
            goodProbability: report.nominal?.goodProbability,
            stressGoodProbability: report.stress?.goodProbability,
            budget: report.nominal?.budget,
            horizon: report.nominal?.horizon,
          };
  }
  // Recompute only to compare; never substitute reconstructed content for the supplied record.
  const expected = await runMissionJourney(name, options);
  requireCondition(
    canonicalize(journey) === canonicalize(expected),
    'JOURNEY_REPLAY_MISMATCH',
    'Journey contains changed results, unsupported metadata or content that does not reproduce the exact public fixture. Nothing was exported or relabeled.'
  );
  return {
    journey,
    name,
    verified: true,
    provenance: 'AUTHORED_PUBLIC_FIXTURE_CONTENT_MATCH',
    limitation:
      'Content equivalence licenses only the bundled authored fixture material. It does not authenticate who ran it, its wall-clock time, customer rights, independent proof or authority.',
  };
}

export async function packJourney(input) {
  const { journey, name } = await verifyPublicJourney(input);
  const mission = journey.mission;
  const workbench = journey.workbench;
  const programArtifacts = (workbench?.candidates ?? []).map((candidate) => ({
    path: `programs/${candidate.id}.json`,
    kind: 'program',
    rights: 'owned',
    license: 'MIT synthetic program',
    content: {
      program: candidate.program,
      policy: candidate.policy,
      scope: mission.objective,
      status: 'UNPROVEN_DEVELOPMENT_CANDIDATE',
    },
  }));
  return createMissionPack({
    institutionId: mission.institutionId,
    missionId: mission.missionId,
    artifacts: [
      {
        path: 'constitution.json',
        kind: 'constitution',
        rights: 'owned',
        license: 'MIT synthetic fixture',
        content: mission,
      },
      {
        path: 'jobs/sealed-graph.json',
        kind: 'jobs',
        rights: 'owned',
        license: 'MIT synthetic fixture',
        content: journey.compilation,
      },
      {
        path: 'evidence/rehearsal.json',
        kind: 'evidence',
        rights: 'owned',
        license: 'MIT synthetic fixture',
        content: journey,
      },
      ...programArtifacts,
      ...(workbench?.supplierSubstitution
        ? [
            {
              path: 'evidence/local-supplier-substitution.json',
              kind: 'evidence',
              rights: 'owned',
              license: 'MIT synthetic fixture',
              content: workbench.supplierSubstitution,
            },
          ]
        : []),
      {
        path: 'knowledge/failure-boundaries.json',
        kind: 'negative-knowledge',
        rights: 'owned',
        license: 'MIT synthetic fixture',
        content: {
          scope: mission.objective,
          source: 'evidence/rehearsal.json',
          status: 'proposed',
          claim:
            'Rehearsal demonstrates no independent qualification. Failed candidates and comparator limitations must be retained.',
          counterexamples: workbench?.counterexamples ?? [],
          findings: workbench?.chronicleEvents ?? [],
        },
      },
      {
        path: 'restore.json',
        kind: 'replay-recipe',
        rights: 'owned',
        license: 'MIT',
        content: {
          command: `npm run successor -- mission run --mission ${name}`,
          execution: 'explicit-local-only',
          permissions: 'none',
          supplierSubstitution:
            'New candidate identity and fresh proof/admission required.',
        },
      },
    ],
    chronicle: journey.events ?? workbench?.chronicleEvents ?? [],
    exclusions: [
      'provider credentials',
      'wallet signing material',
      'protected examination cases',
      'production connections',
      'active authority',
    ],
  });
}
