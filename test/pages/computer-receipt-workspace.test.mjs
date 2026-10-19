import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  canonicalize,
  digestBytes,
} from '../../packages/successor-core/src/integrity.mjs';
import {
  protocolComputerInputs,
  protocolComputerAttempt,
} from './computer-receipt-fixture.mjs';
import {
  createComputerWorkspace,
  inspectComputerWorkspace,
  prepareSupplierComputerHandoff,
  agialphaBaseUnits,
  PROPOSED_NETWORK,
  ALPHA_COMPUTER_SOURCE,
} from '../../website/assets/computer-receipt-model.mjs';
import {
  inspectComputerHandoff,
  retainComputerHandoff,
  importComputerReturn,
} from '../../integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/computer.mjs';
import { initComputerDesk } from '../../website/assets/computer-desk.mjs';
import { computerDeskRuntimeSource } from '../../website/assets/computer-desk-runtime-source.mjs';
import { renderComputerReceipt } from '../../scripts/pages/computer-receipt.mjs';
import { mountComputerReceipt } from '../../website/assets/computer-receipt.mjs';
const inputs = protocolComputerInputs();
const options = {
  inputs,
  amount: '7.000000000000000001',
  network: PROPOSED_NETWORK,
  approved: true,
  publicNonpersonal: true,
  createdAt: '2026-10-19T14:00:00.000Z',
};
const seal = async (body) =>
  canonicalize({ ...body, sha256: await digestBytes(canonicalize(body)) });

test('public explicit handoff preserves the original Alpha project and exact frozen desk', async () => {
  const projectRaw = JSON.parse(inputs.handoffRaw).projectRaw;
  for (const language of ['en', 'fr']) {
    const prepared = await prepareSupplierComputerHandoff({
      projectRaw,
      reportRaw: inputs.reportRaw,
      approved: true,
      publicNonpersonal: true,
      language,
    });
    const native = await inspectComputerHandoff(prepared.handoffRaw);
    assert.equal(
      canonicalize(native.project),
      canonicalize(JSON.parse(projectRaw))
    );
    assert.equal(native.handoff.sourceHash, ALPHA_COMPUTER_SOURCE.sourceHash);
    assert.equal(prepared.reportRaw, inputs.reportRaw);
    assert.equal(native.handoff.authority, 'none');
    assert.equal(native.handoff.settlement, 'not_connected');
    assert.equal(native.handoff.task.allowed_urls.length, 0);
    assert.equal(native.handoff.strategy.selected, 'reframe');
    assert.equal(
      native.handoff.strategy.originalGoal,
      JSON.parse(projectRaw).goal
    );
  }
  await assert.rejects(
    prepareSupplierComputerHandoff({
      projectRaw,
      reportRaw: inputs.reportRaw,
      approved: false,
      publicNonpersonal: true,
    }),
    /APPROVAL_REQUIRED/
  );
});

test('same native project, original bytes and history survive save/reopen without proof or authority', async () => {
  const value = await createComputerWorkspace(options);
  const restored = await inspectComputerWorkspace(value.raw);
  assert.equal(restored.raw, value.raw);
  assert.deepEqual(restored.draft.original, inputs);
  assert.equal(restored.draft.planning.amountBaseUnits, '7000000000000000001');
  assert.equal(
    restored.project.id,
    JSON.parse(JSON.parse(inputs.handoffRaw).projectRaw).id
  );
  assert.equal(restored.history.records[0].returnRaw, inputs.returnRaw);
  assert.equal(restored.draft.trustedComputerExecution, false);
  assert.equal(restored.draft.independentProof, false);
  assert.equal(restored.draft.settlementApproved, false);
  assert.equal(restored.workspace.network.deploymentSelected, false);
  const continued = await createComputerWorkspace({
    ...options,
    priorWorkspaceRaw: restored.raw,
  });
  assert.equal(continued.history.records.length, 1);
  assert.equal(continued.raw, value.raw);
  const changedAmount = await createComputerWorkspace({
    ...options,
    amount: '8',
    priorWorkspaceRaw: restored.raw,
  });
  assert.equal(changedAmount.workspace.drafts.length, 2);
  assert.equal(changedAmount.workspace.drafts[0], restored.workspace.draftRaw);
  assert.equal(changedAmount.history.records[0].handoffRaw, inputs.handoffRaw);
  assert.equal(
    (await inspectComputerWorkspace(changedAmount.raw)).workspace.drafts[0],
    restored.workspace.draftRaw
  );
  assert(
    changedAmount.workspace.historySources.includes(
      restored.workspace.historyRaw
    )
  );
  const originalHistorySource = ' \n' + restored.workspace.historyRaw + '\n';
  const imported = await createComputerWorkspace({
    ...options,
    priorHistoryRaw: originalHistorySource,
  });
  assert(imported.workspace.historySources.includes(originalHistorySource));
  assert.equal(
    (await inspectComputerWorkspace(imported.raw)).history.records[0].returnRaw,
    inputs.returnRaw
  );
});

test('explicit 18-decimal amount and network cannot become a rounded amount, alternate route or permission', async () => {
  assert.equal(agialphaBaseUnits('0.000000000000000001'), '1');
  for (const value of [
    '0',
    '-1',
    '1e3',
    '01',
    '1.0000000000000000001',
    '79228162515',
    7,
  ])
    assert.throws(() => agialphaBaseUnits(value));
  for (const change of [
    { approved: false },
    { publicNonpersonal: false },
    { network: null },
    { network: { ...PROPOSED_NETWORK, chainId: 31337 } },
    { network: { ...PROPOSED_NETWORK, token: '0x' + '1'.repeat(40) } },
  ])
    await assert.rejects(createComputerWorkspace({ ...options, ...change }));
});

test('complete original, interrupted and recovered native attempts and exact source bytes survive proposal/reopen', async () => {
  const project = JSON.parse(JSON.parse(inputs.handoffRaw).projectRaw);
  const interrupted = await protocolComputerAttempt(inputs),
    recovered = await protocolComputerAttempt(inputs, 'review');
  let historyRaw = null;
  for (const attempt of [inputs, interrupted, recovered]) {
    historyRaw = await retainComputerHandoff(project, attempt.handoffRaw, {
      priorRecord: historyRaw,
    });
    historyRaw = await importComputerReturn(
      project,
      attempt.handoffRaw,
      attempt.returnRaw,
      { priorRecord: historyRaw }
    );
  }
  const originalSource = ' \n' + historyRaw + '\n';
  const value = await createComputerWorkspace({
    ...options,
    inputs: recovered,
    priorHistoryRaw: originalSource,
  });
  assert.equal(value.history.records.length, 3);
  assert(value.workspace.historySources.includes(originalSource));
  assert(value.history.records.every((record) => record.review === null));
  assert.equal(value.history.records[1].returnRaw, interrupted.returnRaw);
  assert.equal(
    (await inspectComputerWorkspace(value.raw)).history.records[2].returnRaw,
    recovered.returnRaw
  );
  await assert.rejects(
    createComputerWorkspace({ ...options, priorHistoryRaw: '' }),
    /HISTORY_SOURCE/
  );
});

test('resealing an archive cannot replace native history, observed output, token or authority', async () => {
  const value = await createComputerWorkspace(options);
  for (const mutate of [
    (body) => {
      body.authority = 'owner';
    },
    (body) => {
      body.network.chainId = 31337;
    },
    (body) => {
      const history = JSON.parse(body.historyRaw);
      history.records = [];
      body.historyRaw = canonicalize(history);
    },
    (body) => {
      const draft = JSON.parse(body.draftRaw);
      draft.original.returnRaw += ' ';
      body.draftRaw = canonicalize(draft);
    },
  ]) {
    const { sha256, ...body } = JSON.parse(value.raw);
    mutate(body);
    await assert.rejects(inspectComputerWorkspace(await seal(body)));
  }
});

test('browser-bundled native inspectors produce byte-identical drafts and archives to native source', async (t) => {
  assert.equal(computerDeskRuntimeSource, initComputerDesk.toString());
  const bundle = await build({
    entryPoints: [
      fileURLToPath(
        new URL(
          '../../website/assets/computer-receipt-model.mjs',
          import.meta.url
        )
      ),
    ],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-computer-ui-bundle-')
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'browser.mjs');
  fs.writeFileSync(filename, bundle.outputFiles[0].contents);
  const browser = await import(pathToFileURL(filename).href);
  const native = await createComputerWorkspace(options),
    portable = await browser.createComputerWorkspace(options);
  assert.equal(portable.raw, native.raw);
  assert.equal(
    (await browser.inspectComputerWorkspace(native.raw)).workspace.draftRaw,
    native.workspace.draftRaw
  );
  const bad = {
    ...inputs,
    returnRaw: inputs.returnRaw.replace(
      'PROTOCOL_DOUBLE_NO_BROWSER',
      'FORGED_EXECUTION_LABEL'
    ),
  };
  await assert.rejects(
    browser.createComputerWorkspace({ ...options, inputs: bad })
  );
});

test('DOM controls require public confirmation and explicit choices, retain exact files, then reopen without a new permission', async (t) => {
  const dom = new JSDOM('<main>' + renderComputerReceipt('en') + '</main>');
  const previousDocument = globalThis.document,
    previousCreate = URL.createObjectURL;
  globalThis.document = dom.window.document;
  let downloaded;
  URL.createObjectURL = (blob) => {
    downloaded = blob;
    return 'blob:protocol-ui-test';
  };
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  t.after(() => {
    globalThis.document = previousDocument;
    URL.createObjectURL = previousCreate;
    dom.window.close();
  });
  const root = dom.window.document.querySelector('main'),
    $ = (id) => root.querySelector('#cr-' + id);
  const event = (id, type = 'change') =>
    $(id).dispatchEvent(new dom.window.Event(type));
  const file = (id, raw) => {
    Object.defineProperty($(id), 'files', {
      configurable: true,
      value: [
        {
          size: new TextEncoder().encode(raw).length,
          async arrayBuffer() {
            return new TextEncoder().encode(raw).buffer;
          },
        },
      ],
    });
    event(id);
  };
  const wait = async (condition) => {
    for (let attempt = 0; attempt < 1000; attempt++) {
      if (condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw Error('UI did not reach expected state: ' + $('status').textContent);
  };
  mountComputerReceipt(root, { getReport: () => null });
  assert.equal($('read').disabled, true);
  $('public').checked = true;
  event('public');
  file('project', JSON.parse(inputs.handoffRaw).projectRaw);
  file('report', inputs.reportRaw);
  $('read').click();
  await wait(
    () =>
      !$('read').disabled &&
      $('forward-summary').textContent.includes(
        'Native inspector protocol fixture'
      )
  );
  assert.equal($('prepare').disabled, true);
  $('approve-handoff').checked = true;
  event('approve-handoff');
  $('prepare').click();
  await wait(() => !$('handoff-download').disabled);
  for (const [id, raw] of [
    ['native-handoff', inputs.handoffRaw],
    ['native-return', inputs.returnRaw],
    ['native-report', inputs.reportRaw],
  ])
    file(id, raw);
  $('amount').value = '7.000000000000000001';
  event('amount', 'input');
  assert.equal($('create').disabled, true);
  $('network').value = '1';
  event('network');
  $('approve-draft').checked = true;
  event('approve-draft');
  $('create').click();
  await wait(() => !$('archive-download').disabled);
  assert.equal(
    JSON.parse($('details').textContent).planning.amountBaseUnits,
    '7000000000000000001'
  );
  $('archive-download').click();
  const raw = await downloaded.text();
  await inspectComputerWorkspace(raw);
  file('reopen', raw);
  await wait(() => !$('archive-download').disabled && !$('public').checked);
  assert.equal($('approve-draft').checked, false);
  assert.equal($('create').disabled, true);
  $('archive-download').click();
  assert.equal(await downloaded.text(), raw);
  $('public').checked = true;
  event('public');
  file('reopen', '{}');
  await wait(
    () =>
      !$('archive-download').disabled &&
      $('status').textContent.startsWith('The selected files')
  );
  $('archive-download').click();
  assert.equal(
    await downloaded.text(),
    raw,
    'Failed import preserves the last complete exact workspace'
  );
  $('amount').value = '8';
  event('amount', 'input');
  assert.equal($('archive-download').disabled, true);
  assert.equal($('create').disabled, true);
});
