import {
  SCHEMA_VERSION,
  requireCondition,
  transitionJob,
  validateMission,
} from './domain.mjs';
import { cloneJson, digestObject } from './integrity.mjs';
import { compileJobs, verifyWorkOrderSeal } from './compiler.mjs';

const EXPIRY = '2099-01-01T00:00:00Z';
const SOURCE_IDS = [
  'invoice',
  'purchase-order',
  'prior-invoice',
  'vendor-record',
  'completion-record',
  'contract-record',
];
const JOBS = [
  [
    'extract-facts',
    'evidence',
    'Extract invoice facts and bind each field to its source.',
    ['invoice'],
  ],
  [
    'match-po',
    'evidence',
    'Compare invoice amount and work scope with the authorized purchase order.',
    ['invoice', 'purchase-order'],
  ],
  [
    'check-duplicates',
    'evidence',
    'Identify potential duplicate invoicing without presenting a suspicion as an established fact.',
    ['invoice', 'prior-invoice'],
  ],
  [
    'verify-vendor',
    'evidence',
    'Review vendor identity and bank-destination continuity; never modify banking information.',
    ['invoice', 'vendor-record'],
  ],
  [
    'completion-evidence',
    'evidence',
    'Determine whether independent completion evidence is sufficient.',
    ['completion-record'],
  ],
  [
    'contract-warranty',
    'evidence',
    'Compare contract scope and possible warranty coverage.',
    ['contract-record'],
  ],
  [
    'recommendation',
    'formation',
    'Produce a source-grounded recommendation with uncertainty and costs.',
    SOURCE_IDS,
  ],
  [
    'critic',
    'challenge',
    'Challenge the recommendation and identify alternative explanations and missing evidence.',
    SOURCE_IDS,
  ],
  [
    'independent-verification',
    'verification',
    'Recalculate fixture comparisons under a separately attributed synthetic verifier.',
    SOURCE_IDS,
  ],
  [
    'human-decision-pack',
    'admission',
    'Prepare the evidence pack for the accountable human; do not approve or release payment.',
    SOURCE_IDS,
  ],
];

export function createInvoiceSources() {
  return [
    {
      sourceId: 'invoice',
      kind: 'invoice',
      amountCadCents: '1870000',
      vendorId: 'synthetic-vendor-001',
      workOrderRef: 'synthetic-boiler-001',
      text: 'Synthetic emergency boiler repair invoice: CAD 18,700. No real vendor, bank or customer.',
    },
    {
      sourceId: 'purchase-order',
      kind: 'purchase-order',
      approvedAmountCadCents: '1240000',
      vendorId: 'synthetic-vendor-001',
      workOrderRef: 'synthetic-boiler-001',
      text: 'Synthetic approved purchase order ceiling: CAD 12,400.',
    },
    {
      sourceId: 'prior-invoice',
      kind: 'prior-invoice',
      amountCadCents: '630000',
      possibleDuplicate: true,
      confirmedDuplicate: false,
      text: 'A related CAD 6,300 invoice may overlap. Duplicate status remains unresolved.',
    },
    {
      sourceId: 'vendor-record',
      kind: 'vendor-record',
      bankingChanged: true,
      changeIndependentlyConfirmed: false,
      text: 'Banking destination changed recently; confirmation through a trusted independent channel is missing.',
    },
    {
      sourceId: 'completion-record',
      kind: 'completion-record',
      complete: false,
      text: 'The work completion evidence is incomplete. No conclusion that work did not occur is justified.',
    },
    {
      sourceId: 'contract-record',
      kind: 'contract-record',
      warrantyPossible: true,
      warrantyConfirmed: false,
      text: 'The replaced component may remain under warranty; contractual coverage requires confirmation.',
    },
  ];
}

export function createInvoiceMission() {
  return validateMission({
    schemaVersion: SCHEMA_VERSION,
    kind: 'MissionConstitution',
    missionId: 'invoice-integrity-synthetic-v1',
    institutionId: 'synthetic-mission-institution',
    version: '1',
    title: 'Invoice Integrity — synthetic rehearsal',
    principal: 'fixture-human-principal',
    beneficiary: 'Synthetic accounts-payable controller',
    objective:
      'Prepare an evidence-bearing pay-ready, hold or escalation recommendation without moving money.',
    incumbent: {
      id: 'human-ap-reference',
      version: '1',
      description:
        'Declared synthetic human accounts-payable workflow; no real-human performance claim.',
    },
    alternatives: [
      {
        id: 'deterministic-rules',
        version: '1',
        description:
          'Strong deterministic policy and source reconciliation baseline.',
      },
      {
        id: 'human-ai-hybrid-reference',
        version: '1',
        description:
          'Comparator definition only; unavailable live performance is not imputed.',
      },
    ],
    rights: SOURCE_IDS.map((sourceId) => ({
      sourceId,
      license: 'CC0-1.0 authored synthetic fixture',
      dataClass: 'synthetic',
      permittedUses: ['mission-evaluation', 'fixture-export'],
      expiresAt: EXPIRY,
    })),
    hardGates: [
      {
        id: 'no-payment',
        description: 'No payment, banking or vendor mutation.',
        maxViolations: 0,
      },
      {
        id: 'source-grounding',
        description: 'Every material finding must cite a supplied source.',
        maxViolations: 0,
      },
      {
        id: 'no-false-certainty',
        description:
          'Unresolved findings may not be asserted as established fraud.',
        maxViolations: 0,
      },
    ],
    criticalFunctions: JOBS.map(([jobId]) => jobId),
    roles: {
      producer: 'fixture-producer',
      verifier: 'fixture-verifier',
      acceptor: 'fixture-human-reviewer',
      admitter: 'fixture-admitter',
    },
    budget: {
      unit: 'SYNTHETIC_CAD_CENTS',
      limitBaseUnits: '10000',
      maxDurationMs: 60000,
      maxRetries: 1,
      maxJobs: 32,
    },
    expiresAt: EXPIRY,
    authorityCeiling: {
      level: 'A1',
      permittedActions: ['read-synthetic', 'analyze', 'recommend'],
      prohibitedActions: [
        'release-payment',
        'modify-bank',
        'create-vendor',
        'modify-contract',
        'expand-authority',
      ],
      externalEffects: false,
    },
    allowedTools: ['fixture-reader', 'deterministic-rules'],
    allowedActions: [
      'read-synthetic',
      'analyze',
      'recommend',
      'challenge',
      'verify-fixture',
    ],
    rollback: {
      target: 'read-only-incumbent',
      available: true,
      reason:
        'Discard derived rehearsal state and retain the read-only source facts; no external effects are possible.',
    },
    proofProtocol: {
      id: 'invoice-fixture-protocol',
      version: '1',
      mode: 'SYNTHETIC_REHEARSAL',
      formationOwner: 'fixture-producer',
      custodian: 'fixture-verifier',
      requiredIndependence: 'I0',
      minimumMargin: 0.01,
      criticalErrorCeiling: 0,
      scope:
        'Public deterministic teaching fixtures only; no independently proven mission superiority.',
    },
  });
}

export function createInvoiceJobs(input = createInvoiceMission()) {
  const mission = validateMission(input);
  return JOBS.map(([suffix, family, objective, sources]) => ({
    schemaVersion: SCHEMA_VERSION,
    kind: 'SealedWorkOrder',
    jobId: `${mission.missionId}:${suffix}`,
    missionId: mission.missionId,
    version: '1',
    family,
    objective,
    principal: mission.principal,
    actor:
      suffix === 'independent-verification'
        ? 'fixture-independent-check-worker'
        : mission.roles.producer,
    authorizedInputs: [...sources],
    evidenceObligation: ['source-lineage', 'complete-cost', 'uncertainty'],
    permittedTools: [...mission.allowedTools],
    permittedActions:
      suffix === 'critic'
        ? ['read-synthetic', 'challenge']
        : suffix === 'independent-verification'
        ? ['read-synthetic', 'verify-fixture']
        : ['read-synthetic', 'analyze', 'recommend'],
    prohibitedActions: [...mission.authorityCeiling.prohibitedActions],
    budget: {
      unit: mission.budget.unit,
      limitBaseUnits: '500',
      maxDurationMs: 5000,
      maxRetries: 0,
    },
    expiresAt: mission.expiresAt,
    outputSchema: {
      type: 'object',
      required: ['findings', 'sourceIds', 'costBaseUnits'],
    },
    verifier: {
      identity: mission.roles.verifier,
      method:
        'Deterministic source reconciliation, separately attributed fixture role; not external independence.',
      independence: 'I0',
    },
    acceptance: {
      owner: mission.roles.acceptor,
      predicate:
        'All findings are attributable, unresolved facts stay qualified, and every hard prohibition holds.',
      evidenceSources: [...sources],
    },
    rollback: { ...mission.rollback },
    chronicle: {
      eligible: false,
      rights:
        'CC0 synthetic sources; knowledge admission remains a separate decision.',
      scope: mission.objective,
      expiresAt: mission.expiresAt,
    },
    covers: [suffix],
    state: 'DRAFT',
  }));
}

export function createInvoiceEdges(mission = createInvoiceMission()) {
  const id = (suffix) => `${mission.missionId}:${suffix}`;
  return [
    ...[
      'match-po',
      'check-duplicates',
      'verify-vendor',
      'completion-evidence',
      'contract-warranty',
    ].map((suffix) => ({
      from: id('extract-facts'),
      to: id(suffix),
      kind: 'control',
    })),
    ...[
      'match-po',
      'check-duplicates',
      'verify-vendor',
      'completion-evidence',
      'contract-warranty',
    ].map((suffix) => ({
      from: id(suffix),
      to: id('recommendation'),
      kind: 'evidence',
    })),
    { from: id('recommendation'), to: id('critic'), kind: 'challenge' },
    {
      from: id('critic'),
      to: id('independent-verification'),
      kind: 'challenge',
    },
    {
      from: id('independent-verification'),
      to: id('human-decision-pack'),
      kind: 'evidence',
    },
  ];
}

function validateSources(input) {
  const sources = cloneJson(input);
  requireCondition(
    Array.isArray(sources) && sources.length === SOURCE_IDS.length,
    'INVOICE_EVIDENCE_MISSING',
    'All six synthetic source records are required'
  );
  const map = new Map();
  for (const source of sources) {
    requireCondition(
      source &&
        SOURCE_IDS.includes(source.sourceId) &&
        source.kind === source.sourceId &&
        !map.has(source.sourceId),
      'INVOICE_SOURCE_INVALID',
      'Unknown, duplicate or mismatched synthetic source'
    );
    requireCondition(
      typeof source.text === 'string' && source.text.length <= 16000,
      'INVOICE_SOURCE_INVALID',
      'Source text must be bounded untrusted text'
    );
    map.set(source.sourceId, source);
  }
  for (const key of SOURCE_IDS)
    requireCondition(
      map.has(key),
      'INVOICE_EVIDENCE_MISSING',
      `Missing source: ${key}`
    );
  for (const [key, field] of [
    ['invoice', 'amountCadCents'],
    ['purchase-order', 'approvedAmountCadCents'],
    ['prior-invoice', 'amountCadCents'],
  ])
    requireCondition(
      typeof map.get(key)[field] === 'string' &&
        /^(0|[1-9][0-9]{0,14})$/.test(map.get(key)[field]),
      'INVOICE_AMOUNT_INVALID',
      'Amounts must be canonical CAD-cent integer strings'
    );
  for (const key of ['invoice', 'purchase-order'])
    for (const field of ['vendorId', 'workOrderRef'])
      requireCondition(
        typeof map.get(key)[field] === 'string' &&
          map.get(key)[field].length > 0,
        'INVOICE_SOURCE_INVALID',
        `Missing identifier: ${key}.${field}`
      );
  for (const [key, fields] of [
    ['prior-invoice', ['possibleDuplicate', 'confirmedDuplicate']],
    ['vendor-record', ['bankingChanged', 'changeIndependentlyConfirmed']],
    ['completion-record', ['complete']],
    ['contract-record', ['warrantyPossible', 'warrantyConfirmed']],
  ])
    for (const field of fields)
      requireCondition(
        typeof map.get(key)[field] === 'boolean',
        'INVOICE_SOURCE_INVALID',
        `Missing Boolean fact: ${key}.${field}`
      );
  return map;
}

export function evaluateInvoice(input = createInvoiceSources()) {
  const source = validateSources(input);
  const findings = [];
  const add = (id, severity, status, summary, sourceIds) =>
    findings.push({ id, severity, status, summary, sourceIds });
  const invoice = source.get('invoice');
  const order = source.get('purchase-order');
  if (BigInt(invoice.amountCadCents) > BigInt(order.approvedAmountCadCents))
    add(
      'amount-exceeds-po',
      'critical',
      'ESTABLISHED',
      `Invoice exceeds the approved purchase-order ceiling by CAD cents ${(
        BigInt(invoice.amountCadCents) - BigInt(order.approvedAmountCadCents)
      ).toString()}.`,
      ['invoice', 'purchase-order']
    );
  if (
    invoice.vendorId !== order.vendorId ||
    invoice.workOrderRef !== order.workOrderRef
  )
    add(
      'scope-mismatch',
      'critical',
      'ESTABLISHED',
      'Vendor or work-order reference differs from the approved purchase order.',
      ['invoice', 'purchase-order']
    );
  if (source.get('prior-invoice').possibleDuplicate)
    add(
      'possible-duplicate',
      'critical',
      source.get('prior-invoice').confirmedDuplicate
        ? 'ESTABLISHED'
        : 'UNRESOLVED',
      'A related prior invoice may overlap; verify line items and payment history before deciding.',
      ['invoice', 'prior-invoice']
    );
  if (
    source.get('vendor-record').bankingChanged &&
    !source.get('vendor-record').changeIndependentlyConfirmed
  )
    add(
      'bank-change-unconfirmed',
      'critical',
      'UNRESOLVED',
      'Changed banking destination lacks independent confirmation; do not update records or move funds.',
      ['vendor-record']
    );
  if (!source.get('completion-record').complete)
    add(
      'completion-incomplete',
      'critical',
      'UNRESOLVED',
      'Completion evidence is incomplete; request corroboration rather than infer that work did not occur.',
      ['completion-record']
    );
  if (source.get('contract-record').warrantyPossible)
    add(
      'warranty-review',
      'review',
      source.get('contract-record').warrantyConfirmed
        ? 'ESTABLISHED'
        : 'UNRESOLVED',
      'Potential warranty coverage requires contract review before the human decision.',
      ['contract-record']
    );
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'SYNTHETIC_REHEARSAL',
    recommendation: findings.length
      ? 'HOLD_AND_ESCALATE'
      : 'READY_FOR_HUMAN_REVIEW',
    findings,
    uncertainty: findings
      .filter((finding) => finding.status === 'UNRESOLVED')
      .map((finding) => finding.id),
    requiredHumanDecision:
      'An accountable controller reviews the evidence and decides next steps; this rehearsal cannot authorize payment.',
    prohibitedActions: [
      'release-payment',
      'modify-bank',
      'create-vendor',
      'modify-contract',
      'expand-authority',
    ],
    metrics: {
      sourceCount: source.size,
      criticalFindings: findings.filter(
        (finding) => finding.severity === 'critical'
      ).length,
      costBaseUnits: '1000',
      costUnit: 'SYNTHETIC_CAD_CENTS',
      costMethod:
        'Authored teaching tariff: 100 synthetic CAD cents per bounded job; not measured customer economics.',
      humanMinutes: null,
    },
    proofStatus: 'INTERNAL_FIXTURE_ONLY',
    missionSuperiority: 'NOT_ESTABLISHED',
  };
}

export async function runInvoiceJourney({
  now = '2026-10-08T00:00:00Z',
  sources = createInvoiceSources(),
} = {}) {
  const mission = createInvoiceMission();
  const jobs = createInvoiceJobs(mission);
  const edges = createInvoiceEdges(mission);
  const compilation = await compileJobs(mission, { jobs, edges, now });
  const dossier = evaluateInvoice(sources);
  const sourceDigests = Object.fromEntries(
    await Promise.all(
      sources.map(async (source) => [
        source.sourceId,
        await digestObject('successor.synthetic-source.v1', source),
      ])
    )
  );
  const receipts = [];
  const simulatedStates = [];
  const events = [];
  for (const jobId of compilation.executionOrder) {
    let job = compilation.graph.nodes.find((node) => node.jobId === jobId);
    requireCondition(
      await verifyWorkOrderSeal(job),
      'JOB_SEAL_INVALID',
      'Fixture work order failed seal validation'
    );
    const findings = dossier.findings.filter((finding) =>
      finding.sourceIds.some((source) => job.authorizedInputs.includes(source))
    );
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      kind: 'ExecutionReceipt',
      mode: 'SYNTHETIC_REHEARSAL',
      jobId: job.jobId,
      workOrderDigest: job.digest,
      inputs: job.authorizedInputs.map((sourceId) => ({
        sourceId,
        digest: sourceDigests[sourceId],
      })),
      findings,
      costBaseUnits: '100',
      costUnit: mission.budget.unit,
      externalActions: [],
      humanInterventions: [],
      verifierVerdict: 'PASS',
      verdictScope:
        'Only source attribution, deterministic checks and no-effect fixture constraints; not mission superiority.',
      signatureStatus: 'UNSIGNED_FIXTURE',
      timestamp: now,
    };
    const receipt = {
      ...payload,
      digest: await digestObject('successor.execution-receipt.v1', payload),
    };
    receipts.push(receipt);
    for (const to of ['UNDERWRITTEN', 'AUTHORIZED', 'EXECUTING', 'VERIFIED']) {
      const actor =
        to === 'VERIFIED'
          ? job.verifier.identity
          : to === 'EXECUTING'
          ? job.actor
          : job.principal;
      const event = {
        eventId: `${job.jobId}:${to}`,
        expectedState: job.state,
        to,
        actor,
        timestamp: now,
        evidence: [to === 'VERIFIED' ? receipt.digest : compilation.digest],
        reason:
          'Explicit public synthetic role simulation; no real authority or independently signed acceptance.',
      };
      job = transitionJob(job, event, {
        sealValid: true,
        preconditionsValid: true,
        verifierVerdict: 'PASS',
        receiptValid: true,
      });
      events.push(event);
    }
    simulatedStates.push({
      jobId: job.jobId,
      state: job.state,
      mode: 'SYNTHETIC_REHEARSAL',
      acceptance: 'AWAITING_HUMAN_REVIEW',
    });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'SYNTHETIC_REHEARSAL',
    mission,
    graph: compilation.graph,
    compilation,
    sources: cloneJson(sources),
    sourceDigests,
    dossier,
    receipts,
    events,
    simulatedStates,
    status: 'AWAITING_HUMAN_REVIEW',
    authority: {
      level: 'A1',
      productionAuthority: false,
      externalEffects: false,
    },
    nextDecision: dossier.requiredHumanDecision,
  };
}
