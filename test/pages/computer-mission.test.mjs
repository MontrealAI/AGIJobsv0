import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import {
  createComputerMission,
  checkComputerPlan,
  runComputerMission,
  createAlphaComputerTask,
  reviewObservedAllocation,
  COMPUTER_MISSION_LIMITS,
} from '../../packages/successor-core/src/computer-mission.mjs';
import { renderComputerDeskDocument } from '../../website/assets/computer-desk.mjs';
import {
  renderComputerMissionPage,
  renderComputerDeskTaskHTML,
} from '../../scripts/pages/computer-mission.mjs';

const desk = (mission, options = {}) =>
  new JSDOM(renderComputerDeskDocument(mission, options), {
    runScripts: 'dangerously',
  });
function submit(window, allocations) {
  for (const id of ['stellar', 'laurentian', 'boreal']) {
    const input = window.document.getElementById(`cm-qty-${id}`);
    input.value = String(allocations[id] || 0);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  window.document
    .getElementById('cm-desk-form')
    .dispatchEvent(
      new window.Event('submit', { cancelable: true, bubbles: true })
    );
  return JSON.parse(
    window.document
      .getElementById('cm-desk-output')
      .textContent.replace(/^SUCCESSOR_COMPUTER_RESULT\s+/, '')
  );
}

test('the actual desk remains reviewable after more than 100 edits and caps its observation at 200 events', async () => {
  const mission = await createComputerMission();
  const report = await runComputerMission(mission, {
    formulationApproval: {
      approved: true,
      ownerLabel: 'Desk regression reviewer',
      reason:
        'Compare staged delivery while preserving every actual requirement.',
    },
  });
  const { window } = desk(mission, {
    formulation: report.formulation,
    reportDigest: report.digest,
    frozenProgramDigest: report.frozen.programDigest,
  });
  try {
    const input = window.document.getElementById('cm-qty-stellar');
    for (let edit = 0; edit < 205; edit++) {
      input.value = String(edit % 11);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
    const result = submit(window, { stellar: 10, laurentian: 30 });
    assert.equal(result.actions.length, 200);
    assert.equal(result.actions[0].sequence, 1);
    assert.equal(result.actions[199].sequence, 200);
    assert.ok(
      result.actions.every((event) => event.trustedUserEvent === false)
    );
    assert.equal(result.check.valid, true);
    const review = await reviewObservedAllocation(report, result);
    assert.equal(review.accepted, true);
    assert.equal(review.reportedExecution.actionCount, 200);
    assert.equal(review.trustedComputerExecution, false);
    assert.equal(review.independentProof, false);
  } finally {
    window.close();
  }
});

test('the actual desk calculates freight, deadlines and quantities and invalidates its previous observation on input edits', async () => {
  const mission = await createComputerMission({});
  const { window } = desk(mission);
  try {
    const incumbent = submit(window, { stellar: 40 });
    assert.equal(incumbent.plan.costCents, 49000);
    assert.equal(incumbent.check.valid, true);
    const staged = submit(window, { stellar: 10, laurentian: 30 });
    assert.deepEqual(staged.check.totals, {
      totalUnits: 40,
      earlyUnits: 10,
      costCents: 36000,
    });
    assert.equal(staged.check.valid, true);
    assert.equal(checkComputerPlan(mission, staged.plan).valid, true);
    assert.equal(staged.purchaseExecuted, false);
    assert.equal(staged.executionKind, 'USER_OR_SCRIPTED_BROWSER_INTERACTION');
    assert.ok(staged.actions.some((action) => action.type === 'CHECK_PLAN'));
    const late = submit(window, { laurentian: 40 });
    assert.equal(late.plan.costCents, 30000);
    assert.equal(late.check.valid, false);
    assert.equal(checkComputerPlan(mission, late.plan).valid, false);
    const input = window.document.getElementById('cm-qty-laurentian');
    input.value = '39';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(
      window.document.getElementById('cm-desk-output').textContent,
      ''
    );
    assert.equal(
      window.document.getElementById('cm-desk-summary').hidden,
      true
    );
  } finally {
    window.close();
  }
});

test('a genuine all-forty-early requirement survives the staged formulation and rejects an apparently cheaper late allocation', async () => {
  const mission = await createComputerMission({
    requirements: {
      earlyUnits: 40,
      earlyDay: 7,
      totalUnits: 40,
      finalDay: 14,
      budgetCents: 51000,
    },
  });
  for (const language of ['en', 'fr']) {
    const { window } = desk(mission, {
      language,
      formulation: 'actual_requirements',
    });
    try {
      assert.equal(window.document.documentElement.lang, language);
      const weakened = submit(window, { stellar: 10, laurentian: 30 });
      assert.equal(weakened.check.valid, false);
      assert.equal(checkComputerPlan(mission, weakened.plan).valid, false);
      const feasible = submit(window, { stellar: 40 });
      assert.equal(feasible.check.valid, true);
      assert.equal(feasible.plan.costCents, 49000);
      for (const input of window.document.querySelectorAll('input'))
        assert.ok(window.document.querySelector(`label[for="${input.id}"]`));
      assert.equal(
        window.document.getElementById('cm-desk-review').getAttribute('role'),
        'status'
      );
    } finally {
      window.close();
    }
  }
});

test('exported executable desk treats hostile public supplier names and script terminators as inert source data', async () => {
  const hostile = '</script><script>globalThis.deskCompromised=true</script>';
  const mission = await createComputerMission({
    suppliers: [
      {
        id: 'stellar',
        name: hostile,
        unitCents: 1200,
        freightCents: 1000,
        deliveryDay: 7,
      },
      {
        id: 'laurentian',
        name: '<img id="desk-injected" src=x onerror="globalThis.deskCompromised=true">',
        unitCents: 700,
        freightCents: 2000,
        deliveryDay: 12,
      },
      {
        id: 'boreal',
        name: 'Boreal',
        unitCents: 1400,
        freightCents: 0,
        deliveryDay: 5,
      },
    ],
    publicNonPersonal: true,
    rights:
      'Original synthetic security-test strings, permitted for this local test.',
  });
  const { window } = desk(mission);
  try {
    assert.equal(window.deskCompromised, undefined);
    assert.equal(window.document.querySelector('#desk-injected'), null);
    assert.equal(window.document.querySelectorAll('[onerror]').length, 0);
    const embedded = JSON.parse(
      window.document.getElementById('cm-desk-config').textContent
    );
    assert.equal(embedded.mission.suppliers[0].name, hostile);
    assert.ok(
      window.document.querySelector('table').textContent.includes(hostile)
    );
    assert.equal(
      submit(window, { stellar: 10, laurentian: 30 }).check.valid,
      true
    );
  } finally {
    window.close();
  }
});

test('bilingual first use exposes labelled bounded controls and separates scripted practice from provider execution', () => {
  for (const language of ['en', 'fr']) {
    const document = new JSDOM(
      renderComputerMissionPage('/AGIJobsv0/', 'a'.repeat(40), language)
    ).window.document;
    assert.equal(document.querySelectorAll('main').length, 1);
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(
      document.querySelector('[data-computer-mission]').lang,
      language
    );
    for (const input of document.querySelectorAll('input, textarea'))
      assert.ok(
        document.querySelector(`label[for="${input.id}"]`) ||
          input.closest('label'),
        `Missing label ${language} ${input.id}`
      );
    for (const id of [
      'export',
      'task',
      'desk-download',
      'evidence-export',
      'copy-work',
      'evidence-input',
    ])
      assert.equal(
        document.getElementById(`cm-${id}`).disabled,
        true,
        `${language} ${id}`
      );
    for (const id of ['early-units', 'total-units'])
      assert.ok(
        Number(document.getElementById(`cm-${id}`).max) <=
          COMPUTER_MISSION_LIMITS.units,
        `${id} must respect the actual engine limit`
      );
    assert.equal(document.getElementById('cm-results').hidden, true);
    assert.equal(
      document.getElementById('cm-status').getAttribute('role'),
      'status'
    );
    assert.match(
      document.querySelector('.cm-mode').textContent,
      language === 'fr'
        ? /Aucun modèle d’IA n’est appelé/
        : /does not call an AI model/
    );
    assert.equal(
      document.querySelector('a[aria-current="page"]').getAttribute('lang'),
      language
    );
    assert.ok(
      document
        .querySelector('#cm-public-desk')
        .getAttribute('href')
        .startsWith('/AGIJobsv0/successor/computer/desk/')
    );
  }
  assert.throws(
    () => renderComputerMissionPage('/AGIJobsv0/', 'a'.repeat(40), 'other'),
    /Unsupported computer mission language/
  );
  const malicious =
    '"><img id="revision-injected" onerror="globalThis.compromised=true">';
  const document = new JSDOM(
    renderComputerMissionPage('/AGIJobsv0/', malicious)
  ).window.document;
  assert.equal(
    document.querySelector('[data-computer-mission]').dataset.revision,
    malicious
  );
  assert.equal(document.querySelector('#revision-injected'), null);
});

test('native task export binds the actual rendered desk to the frozen approved plan without a provider or token conversion', async () => {
  const report = await runComputerMission(await createComputerMission({}), {
    formulationApproval: {
      approved: true,
      ownerLabel: 'Test owner',
      reason: 'Compare staged delivery without changing actual requirements.',
    },
  });
  const html = renderComputerDeskTaskHTML(report, 'fr');
  const config = JSON.parse(
    new JSDOM(html).window.document.getElementById('cm-desk-config').textContent
  );
  assert.equal(config.mission.digest, report.mission.digest);
  assert.equal(config.reportDigest, report.digest);
  assert.equal(config.frozenProgramDigest, report.frozen.programDigest);
  assert.deepEqual(config.mission.requirements, report.mission.requirements);
  assert.equal(config.formulation, 'actual_requirements');
  const task = await createAlphaComputerTask(report, { html });
  assert.equal(task.kind, 'successor-computer');
  assert.equal(task.html, html);
  assert.deepEqual(task.allowed_urls, []);
  assert.ok(
    task.goal.includes(
      'sha256:' + createHash('sha256').update(html).digest('hex')
    )
  );
  assert.ok(task.goal.includes(report.digest));
  assert.ok(task.goal.includes(report.frozen.programDigest));
  assert.match(task.goal, /stellar: 10 units; laurentian: 30 units/);
  assert.equal(report.mission.currency, 'USD');
  assert.equal(report.decision.sameTaskSuperiority, false);
  assert.equal(
    report.decision.quotedCostDifferenceFromCredibleAlternativeCents,
    0
  );
});
