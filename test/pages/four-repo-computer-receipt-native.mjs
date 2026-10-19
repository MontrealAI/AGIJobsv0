import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createComputerReceiptDraft,
  inspectComputerReceiptDraft,
  inspectComputerReceiptEvidence,
} from '../../integrations/alpha-agent/four-repo-computer-receipt.mjs';
import {
  createComputerMission,
  runComputerMission,
  checkComputerPlan,
} from '../../packages/successor-core/src/computer-mission.mjs';
import { renderComputerDeskTaskHTML } from '../../scripts/pages/computer-mission.mjs';

// Explicit reviewed-checkout argument: the imported payload never chooses executable code.
const alphaRoot = process.argv[2];
if (!path.isAbsolute(alphaRoot ?? ''))
  throw Error('Supply the absolute reviewed Alpha checkout root');
const load = (relative) =>
  import(pathToFileURL(path.join(alphaRoot, relative)).href);
const { canonical, digest } = await load('docs/assets/successor/engine.mjs');
const { exactDigest } = await load('examples/successor-alpha/continuity.mjs');
const { createProject } = await load('examples/successor-alpha/project.mjs');
const { createComputerHandoff, inspectComputerReturn } = await load(
  'examples/successor-alpha/computer.mjs'
);
const report = await runComputerMission(await createComputerMission(), {
  formulationApproval: {
    approved: true,
    ownerLabel: 'Synthetic protocol test operator',
    reason:
      'Preserve actual delivery requirements in this bounded protocol-only test.',
  },
});
const project = createProject({
  name: 'Native inspector protocol fixture',
  goal: 'Retain exact synthetic allocation evidence without production authority.',
});
const sourceHash = createHash('sha256')
  .update(
    fs.readFileSync(
      path.join(alphaRoot, 'examples/successor-alpha/computer.mjs')
    )
  )
  .digest('hex');
const handoffRaw = await createComputerHandoff(project, {
  sourceHash,
  goal: project.goal,
  selected: 'reframe',
  valueHypothesis:
    'Synthetic protocol consistency only; no real savings established.',
  hypotheses: [
    'Compare a single early supplier.',
    'Compare exact staged delivery allocations.',
  ],
  combination:
    'Compare landed costs and preserve all required quantities and dates.',
  reframing:
    'Remove only an extra single-delivery assumption, preserving actual requirements.',
  successCriteria: [
    'Preserve the exact mission and frozen strategy.',
    'Retain every production boundary.',
  ],
  html: renderComputerDeskTaskHTML(report),
  inputRights: report.mission.inputRights.classification,
  license: report.mission.inputRights.license,
});
const handoff = JSON.parse(handoffRaw);
const executionContext = await digest('computer-handoff', handoff);
const execution = {
  provider: {
    mode: 'responses',
    model: 'PROTOCOL_DOUBLE_NO_BROWSER',
    endpoint: 'https://example.invalid/v1',
  },
  image: 'sha256:' + '1'.repeat(64),
  workerSha256: '2'.repeat(64),
};
const taskCommitment = await digest('computer-task', {
  task: handoff.task,
  provider: execution.provider,
  image: execution.image,
  worker_sha256: execution.workerSha256,
  execution_context: executionContext,
});
const arithmetic = checkComputerPlan(report.mission, report.frozen.plan, {
  formulation: report.formulation,
});
const observed = {
  schemaVersion: '1.0.0',
  kind: 'SupplierDeskResult',
  missionDigest: report.mission.digest,
  reportDigest: report.digest,
  frozenProgramDigest: report.frozen.programDigest,
  plan: report.frozen.plan,
  check: { valid: arithmetic.valid, totals: arithmetic.totals },
  formulation: report.formulation,
  purchaseExecuted: false,
};
const observedText =
  'PROTOCOL_DOUBLE_NO_BROWSER\nSUCCESSOR_COMPUTER_RESULT ' +
  canonical(observed);
const receipt = {
  run_id: crypto.randomUUID(),
  state: 'review',
  cleanup: 'VERIFIED',
  execution_context: executionContext,
  commitment: taskCommitment,
  provider: execution.provider,
  authority: [],
  billing: 'UNKNOWN',
  actions_reserved: 1,
  turns_reserved: 2,
  elapsed_milliseconds: 1000,
  verified: false,
  completion_claim:
    'Protocol double; no browser or model execution is claimed.',
  screenshots: [
    { file: 'screen-000.png', sha256: '3'.repeat(64) },
    { file: 'screen-001.png', sha256: '4'.repeat(64) },
  ],
  events: [{ action: { type: 'screenshot' }, status: 'observed', turn: 0 }],
  observed_text_sha256: await exactDigest(observedText),
  observed_text_bytes: new TextEncoder().encode(observedText).length,
};
const returnRaw = canonical({
  schema: 'successor-alpha-computer-return/v1',
  handoffSha256: await exactDigest(canonical(handoff)),
  executionContext,
  projectSha256: handoff.projectSha256,
  sourceHash: handoff.sourceHash,
  taskCommitment,
  execution,
  receipt,
  signedReceipt: {
    domain: 'computer-receipt',
    principal: 'PROTOCOL_DOUBLE',
    payload: receipt,
    signature: 'A'.repeat(86) + '==',
  },
  observedText,
  authority: 'none',
  settlement: 'not_connected',
  verified: false,
});
const supplied = { handoffRaw, returnRaw, reportRaw: JSON.stringify(report) };
const options = {
  amountBaseUnits: '7000000000000000000',
  createdAt: '2026-10-19T14:00:00.000Z',
  inspectAlphaReturn: inspectComputerReturn,
};

// Opt-in output is protocol-only evidence for wiring tests, never browser qualification.
const outputDirectory = process.argv[3];
if (outputDirectory !== undefined) {
  if (!path.isAbsolute(outputDirectory))
    throw Error('Protocol fixture output must be an absolute new directory');
  await inspectComputerReceiptEvidence(supplied, {
    inspectAlphaReturn: inspectComputerReturn,
  });
  fs.mkdirSync(outputDirectory, { mode: 0o700 });
  const evidence = {
    evidenceClass: 'PROTOCOL_DOUBLE_NO_BROWSER',
    realBrowser: false,
    scriptedAdvice: true,
    liveModel: false,
    nativeSession: {
      state: receipt.state,
      actions: receipt.actions_reserved,
      turns: receipt.turns_reserved,
      cleanup: receipt.cleanup,
    },
    billing: 'UNKNOWN',
    costs: { model: null, humanReview: null },
    independentProof: false,
    authority: [],
    settlementApproved: false,
    productionApproved: false,
  };
  for (const [name, bytes] of Object.entries({
    'handoff.json': supplied.handoffRaw,
    'computer-return.json': supplied.returnRaw,
    'frozen-mission-report.json': supplied.reportRaw,
    'browser-evidence.json': canonical(evidence),
  })) {
    fs.writeFileSync(path.join(outputDirectory, name), bytes, {
      flag: 'wx',
      mode: 0o600,
    });
  }
}

test('real Alpha inspector validates project/task bindings without authenticating a protocol double', async () => {
  const evidence = await inspectComputerReceiptEvidence(supplied, {
    inspectAlphaReturn: inspectComputerReturn,
  });
  assert.deepEqual(Object.keys(evidence).sort(), [
    'bindings',
    'observationReview',
    'original',
    'project',
    'report',
  ]);
  const raw = await createComputerReceiptDraft(supplied, options);
  const draft = await inspectComputerReceiptDraft(raw, options);
  assert.equal(draft.project.id, project.id);
  assert.equal(draft.bindings.taskCommitment, taskCommitment);
  assert.deepEqual(draft.bindings, evidence.bindings);
  assert.equal(draft.observationReview.accepted, true);
  assert.equal(draft.trustedComputerExecution, false);
  assert.equal(draft.independentProof, false);
  assert.equal(draft.productionApproved, false);
  assert.equal(draft.compiled.budgetReservations.reservedBaseUnits, '0');
});

test('real native inspector rejects changed observed bytes, signature payload, provider, context and authority', async () => {
  for (const mutate of [
    (x) => {
      x.observedText += ' altered';
    },
    (x) => {
      x.signedReceipt.payload.cleanup = 'UNKNOWN';
    },
    (x) => {
      x.execution.provider.model = 'changed';
    },
    (x) => {
      x.executionContext = '0'.repeat(64);
    },
    (x) => {
      x.authority = 'active';
    },
    (x) => {
      x.verified = true;
    },
  ]) {
    const returned = JSON.parse(returnRaw);
    mutate(returned);
    await assert.rejects(
      createComputerReceiptDraft(
        { ...supplied, returnRaw: canonical(returned) },
        options
      )
    );
  }
  const alteredHandoff = JSON.parse(handoffRaw);
  alteredHandoff.projectSha256 = 'f'.repeat(64);
  await assert.rejects(
    createComputerReceiptDraft(
      { ...supplied, handoffRaw: canonical(alteredHandoff) },
      options
    )
  );
});
