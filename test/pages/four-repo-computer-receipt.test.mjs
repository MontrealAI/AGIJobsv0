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
  createAlphaComputerTask,
} from '../../packages/successor-core/src/computer-mission.mjs';
import {
  canonicalize,
  digestBytes,
} from '../../packages/successor-core/src/integrity.mjs';
import { renderComputerDeskTaskHTML } from '../../scripts/pages/computer-mission.mjs';

const report = await runComputerMission(await createComputerMission(), {
  formulationApproval: {
    approved: true,
    ownerLabel: 'Synthetic adapter test owner',
    reason: 'Preserve actual requirements while comparing staged deliveries.',
  },
});
const project = {
  id: 'synthetic-project',
  revision: 1,
  cycles: [{ id: 'cycle-1' }],
};
const task = await createAlphaComputerTask(report, {
  html: renderComputerDeskTaskHTML(report),
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
function fixture() {
  const handoff = {
    projectRaw: canonicalize(project),
    projectSha256: 'a'.repeat(64),
    sourceHash: 'b'.repeat(64),
    authority: 'none',
    settlement: 'not_connected',
    task: structuredClone(task),
  };
  const returned = {
    authority: 'none',
    settlement: 'not_connected',
    verified: false,
    taskCommitment: 'sha256:' + 'c'.repeat(64),
    executionContext: 'sha256:' + 'd'.repeat(64),
    receipt: {
      verified: false,
      state: 'review',
      cleanup: 'VERIFIED',
      authority: [],
      actions_reserved: 1,
      screenshots: ['synthetic-before', 'synthetic-after'],
    },
    observedText:
      'Synthetic inspector boundary double\nSUCCESSOR_COMPUTER_RESULT ' +
      canonicalize(observed),
  };
  return {
    handoffRaw: canonicalize(handoff),
    returnRaw: canonicalize(returned),
    reportRaw: JSON.stringify(report, null, 2),
  };
}
// This explicit code-installed double isolates the adapter. The four-repository runner uses Alpha's real inspector and browser return.
const inspectAlphaReturn = async (handoffRaw, returnRaw) => ({
  handoff: JSON.parse(handoffRaw),
  returned: JSON.parse(returnRaw),
  project: JSON.parse(JSON.parse(handoffRaw).projectRaw),
});
const options = {
  amountBaseUnits: '7000000000000000000',
  createdAt: '2026-10-19T14:00:00.000Z',
  inspectAlphaReturn,
};
function change(raw, update) {
  const parsed = JSON.parse(raw);
  update(parsed);
  return canonicalize(parsed);
}

test('exact native report becomes an inert project-bound AGIALPHA proposal without increasing sealed budgets', async () => {
  const supplied = fixture();
  const evidence = await inspectComputerReceiptEvidence(supplied, {
    inspectAlphaReturn,
  });
  assert.deepEqual(Object.keys(evidence).sort(), [
    'bindings',
    'observationReview',
    'original',
    'project',
    'report',
  ]);
  assert.equal(evidence.project.id, project.id);
  assert.deepEqual(evidence.original, supplied);
  const raw = await createComputerReceiptDraft(supplied, options);
  const draft = await inspectComputerReceiptDraft(raw, { inspectAlphaReturn });
  assert.deepEqual(draft.original, supplied);
  assert.equal(draft.project.id, project.id);
  assert.equal(draft.project.cycleId, 'cycle-1');
  assert.deepEqual(draft.bindings, evidence.bindings);
  assert.equal(
    draft.bindings.returnRawSha256,
    await digestBytes(supplied.returnRaw)
  );
  assert.equal(draft.route.asset, 'AGIALPHA');
  assert.equal(draft.route.decimals, 18);
  assert.equal(draft.planning.amountBaseUnits, options.amountBaseUnits);
  assert.equal(draft.compiled.budgetReservations.reservedBaseUnits, '0');
  assert.equal(draft.compiled.constitution.budget.limitBaseUnits, '0');
  assert.equal(draft.compiled.graph.nodes.length, 4);
  assert.equal(draft.observationReview.accepted, true);
  assert.equal(draft.trustedComputerExecution, false);
  assert.equal(draft.independentProof, false);
  assert.equal(draft.authority, 'none');
  assert.equal(draft.settlementApproved, false);
  assert.equal(draft.productionApproved, false);
  assert.equal(draft.review, 'independent-review-required');
});

test('no inspector is inferred from imported content and rejected native input cannot be wrapped', async () => {
  await assert.rejects(
    createComputerReceiptDraft(fixture(), {
      ...options,
      inspectAlphaReturn: undefined,
    }),
    /ALPHA_INSPECTOR_REQUIRED/
  );
  await assert.rejects(
    createComputerReceiptDraft(fixture(), {
      ...options,
      inspectAlphaReturn: async () => {
        throw Error('native rejection');
      },
    }),
    /native rejection/
  );
  const supplied = fixture();
  supplied.inspector = 'https://example.invalid/code.mjs';
  await assert.rejects(
    createComputerReceiptDraft(supplied, options),
    /COMPUTER_DRAFT_INPUT_FIELDS/
  );
});

test('receipt state, private-input scope and changed desk cannot be promoted into a proposal', async () => {
  for (const mutate of [
    (x) => {
      x.receipt.state = 'interrupted';
    },
    (x) => {
      x.receipt.cleanup = 'UNKNOWN';
    },
    (x) => {
      x.authority = 'live';
    },
    (x) => {
      x.verified = true;
    },
    (x) => {
      x.receipt.actions_reserved = 0;
    },
  ]) {
    const supplied = fixture();
    supplied.returnRaw = change(supplied.returnRaw, mutate);
    await assert.rejects(
      createComputerReceiptDraft(supplied, options),
      /COMPUTER_DRAFT_UNREVIEWABLE/
    );
  }
  for (const mutate of [
    (x) => {
      x.task.input_rights = 'licensed-nonpersonal';
    },
    (x) => {
      x.task.html += '<p>changed</p>';
    },
    (x) => {
      x.task.allowed_urls = ['https://example.invalid/'];
    },
  ]) {
    const supplied = fixture();
    supplied.handoffRaw = change(supplied.handoffRaw, mutate);
    await assert.rejects(
      createComputerReceiptDraft(supplied, options),
      /COMPUTER_DRAFT_WORK_SURFACE/
    );
  }
});

test('wrong report, forged totals, duplicate marker and missing observation fail closed', async () => {
  const badObservations = [
    { ...observed, reportDigest: 'sha256:' + '0'.repeat(64) },
    {
      ...observed,
      check: {
        ...observed.check,
        totals: { ...arithmetic.totals, costCents: 0 },
      },
    },
  ];
  for (const item of badObservations) {
    const supplied = fixture();
    supplied.returnRaw = change(supplied.returnRaw, (x) => {
      x.observedText = 'SUCCESSOR_COMPUTER_RESULT ' + canonicalize(item);
    });
    await assert.rejects(createComputerReceiptDraft(supplied, options));
  }
  for (const text of [
    null,
    'no result',
    'SUCCESSOR_COMPUTER_RESULT {} SUCCESSOR_COMPUTER_RESULT {}',
    'SUCCESSOR_COMPUTER_RESULT {',
  ]) {
    const supplied = fixture();
    supplied.returnRaw = change(supplied.returnRaw, (x) => {
      x.observedText = text;
    });
    await assert.rejects(
      createComputerReceiptDraft(supplied, options),
      /COMPUTER_DRAFT_OBSERVATION/
    );
  }
});

test('exact original bytes, amount and scope are revalidated on import even after recomputing outer hash', async () => {
  const raw = await createComputerReceiptDraft(fixture(), options);
  for (const mutate of [
    (x) => {
      x.original.reportRaw += '\n';
    },
    (x) => {
      x.productionApproved = true;
    },
    (x) => {
      x.route.asset = 'USDC';
    },
    (x) => {
      x.planning.reservedBaseUnits = '1';
    },
  ]) {
    const parsed = JSON.parse(raw);
    mutate(parsed);
    const { sha256, ...body } = parsed;
    const forged = canonicalize({
      ...body,
      sha256: await digestBytes(canonicalize(body)),
    });
    await assert.rejects(
      inspectComputerReceiptDraft(forged, { inspectAlphaReturn }),
      /COMPUTER_DRAFT_INTEGRITY/
    );
  }
});

test('strict decimal budgets and canonical clocks reject ambiguous or oversized proposals', async () => {
  for (const value of [
    '0',
    '01',
    '-1',
    '1.2',
    '1e18',
    (1n << 96n).toString(),
    1,
  ]) {
    await assert.rejects(
      createComputerReceiptDraft(fixture(), {
        ...options,
        amountBaseUnits: value,
      }),
      /COMPUTER_DRAFT_AMOUNT/
    );
  }
  await assert.rejects(
    createComputerReceiptDraft(fixture(), {
      ...options,
      createdAt: '2026-10-19',
    }),
    /COMPUTER_DRAFT_CLOCK/
  );
  const supplied = fixture();
  supplied.returnRaw = ' '.repeat(4_000_001);
  await assert.rejects(
    createComputerReceiptDraft(supplied, options),
    /COMPUTER_DRAFT_SIZE/
  );
});
