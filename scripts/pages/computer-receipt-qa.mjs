import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  protocolComputerInputs,
  protocolComputerAttempt,
  protocolComputerLearningArchive,
} from '../../test/pages/computer-receipt-fixture.mjs';
import { inspectComputerWorkspace } from '../../website/assets/computer-receipt-model.mjs';
import { inspectComputerHandoff } from '../../integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/computer.mjs';
import {
  canonicalize,
  digestBytes,
} from '../../packages/successor-core/src/integrity.mjs';
import { computerReceiptCopy } from '../../website/assets/computer-receipt-copy.mjs';
const upload = (page, id, raw) =>
  page.locator('#cr-' + id).setInputFiles({
    name: id + '.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
async function download(page, id) {
  const event = page.waitForEvent('download');
  await page.locator('#cr-' + id).click();
  return fs.readFileSync(await (await event).path(), 'utf8');
}
export async function verifyComputerReceipt({ page, url, artifacts, checks }) {
  const inputs = protocolComputerInputs(),
    project = JSON.parse(JSON.parse(inputs.handoffRaw).projectRaw);
  const { archiveRaw: alphaArchiveRaw, historyRaw: nativeHistoryRaw } =
    await protocolComputerLearningArchive(inputs, {
      historicalSourceHash: 'f'.repeat(64),
    });
  for (const language of ['en', 'fr']) {
    await page.goto(
      url + 'successor/computer/' + (language === 'fr' ? 'fr/' : ''),
      { waitUntil: 'networkidle' }
    );
    await page.locator('[data-computer-receipt][data-ready="true"]').waitFor();
    assert.equal(await page.locator('#cr-read').isDisabled(), true);
    await page.locator('#cr-public').check();
    await upload(page, 'project', alphaArchiveRaw);
    await upload(page, 'report', inputs.reportRaw);
    await page.locator('#cr-read').click();
    await page.waitForFunction(
      (id) =>
        document.getElementById('cr-forward-summary').textContent.includes(id),
      project.id
    );
    await page.locator('#cr-approve-handoff').check();
    await page.locator('#cr-prepare').click();
    const handoff = await inspectComputerHandoff(
      await download(page, 'handoff-download')
    );
    assert.equal(handoff.project.id, project.id);
    assert.equal(
      handoff.handoff.projectRaw,
      JSON.parse(inputs.handoffRaw).projectRaw
    );
    assert.equal(await download(page, 'report-download'), inputs.reportRaw);
    for (const [id, raw] of [
      ['native-handoff', inputs.handoffRaw],
      ['native-return', inputs.returnRaw],
      ['native-report', inputs.reportRaw],
    ])
      await upload(page, id, raw);
    await upload(page, 'native-history', nativeHistoryRaw);
    await page.locator('#cr-amount').fill('7.000000000000000001');
    await page.locator('#cr-network').selectOption('1');
    await page.locator('#cr-approve-draft').check();
    await page.locator('#cr-create').click();
    const raw = await download(page, 'archive-download'),
      workspace = await inspectComputerWorkspace(raw);
    assert.deepEqual(workspace.draft.original, inputs);
    assert.equal(
      workspace.draft.planning.amountBaseUnits,
      '7000000000000000001'
    );
    assert.equal(workspace.project.id, project.id);
    assert.equal(workspace.draft.independentProof, false);
    assert.equal(workspace.history.records.length, 3);
    assert(workspace.workspace.historySources.includes(nativeHistoryRaw));
    assert(workspace.workspace.projectSources.includes(alphaArchiveRaw));
    assert.equal(await download(page, 'alpha-download'), alphaArchiveRaw);
    assert.equal(
      workspace.workspace.inspectorSource.role,
      'NATIVE_VALIDATION_IMPLEMENTATION_ONLY'
    );
    assert.equal(workspace.workspace.unmatchedHistoricalSourceCount, 1);
    assert.equal(
      workspace.workspace.historicalSourceDeclarations.filter(
        (item) => !item.matchesInstalledInspector
      ).length,
      1
    );
    assert(
      workspace.workspace.historicalSourceDeclarations.every(
        (item) => item.authenticatedProducer === false
      )
    );
    assert.equal(workspace.history.records[0].review.decision, 'useful');
    assert(
      workspace.history.records
        .slice(1)
        .every((record) => record.review === null)
    );
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      );
    }
    const accessibility = await new AxeBuilder({ page })
      .include('[data-computer-receipt]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    assert.deepEqual(
      accessibility.violations.map((item) => item.id),
      []
    );
    await page.locator('[data-computer-receipt]').screenshot({
      path: path.join(artifacts, `computer-receipt-${language}.png`),
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-computer-receipt][data-ready="true"]').waitFor();
    await page.locator('#cr-public').check();
    await upload(page, 'reopen', raw);
    await page.waitForFunction(
      (id) => document.getElementById('cr-summary').textContent.includes(id),
      project.id
    );
    assert.equal(await download(page, 'archive-download'), raw);
    assert.equal(
      await download(page, 'draft-download'),
      workspace.workspace.draftRaw
    );
    assert.equal(await page.locator('#cr-approve-draft').isChecked(), false);
    assert.equal(await page.locator('#cr-public').isChecked(), false);
    const changed = JSON.parse(raw),
      draft = JSON.parse(changed.draftRaw);
    draft.original.returnRaw += ' ';
    changed.draftRaw = canonicalize(draft);
    const { sha256, ...body } = changed,
      forged = canonicalize({
        ...body,
        sha256: await digestBytes(canonicalize(body)),
      });
    await page.locator('#cr-public').check();
    await upload(page, 'reopen', forged);
    await page.waitForFunction(
      (error) => document.getElementById('cr-status').textContent === error,
      computerReceiptCopy[language].error
    );
    assert.equal(await download(page, 'archive-download'), raw);
    assert.equal(await page.locator('[data-computer-receipt] img').count(), 0);
    const foreign = await protocolComputerAttempt(inputs, 'review', {
      sourceHash: 'e'.repeat(64),
    });
    await upload(page, 'native-handoff', foreign.handoffRaw);
    await upload(page, 'native-return', foreign.returnRaw);
    await page.locator('#cr-approve-draft').check();
    await page.locator('#cr-create').click();
    await page.waitForFunction(
      (message) => document.getElementById('cr-status').textContent === message,
      computerReceiptCopy[language].sourceMismatch
    );
    assert.equal(await download(page, 'archive-download'), raw);
    await upload(page, 'native-handoff', inputs.handoffRaw);
    await upload(page, 'native-return', inputs.returnRaw);
    await page.evaluate(() => {
      const original = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = async function () {
        if (this.name === 'native-return.json') {
          const file = this;
          await new Promise((resolve) => {
            globalThis.releaseComputerInput = resolve;
          });
          return original.call(file);
        }
        return original.call(this);
      };
    });
    await page.locator('#cr-approve-draft').check();
    await page.locator('#cr-create').click();
    await page.waitForFunction(
      () => typeof globalThis.releaseComputerInput === 'function'
    );
    await page.evaluate(() => {
      const confirmation = document.getElementById('cr-public');
      confirmation.checked = false;
      confirmation.dispatchEvent(new Event('change', { bubbles: true }));
      globalThis.releaseComputerInput();
    });
    await page.waitForFunction(
      (message) => document.getElementById('cr-status').textContent === message,
      computerReceiptCopy[language].changed
    );
    assert.equal(await download(page, 'archive-download'), raw);
  }
  checks.push(
    'Native computer workspace: EN/FR same-project handoff, exact native return, explicit 18-decimal AGIALPHA proposal and save/reopen; forged archives rejected. Inputs are labeled protocol doubles, not native execution proof.'
  );
  fs.writeFileSync(
    path.join(artifacts, 'computer-receipt-browser-qa.json'),
    JSON.stringify(
      {
        passed: true,
        scope: 'GUI_WITH_PROTOCOL_DOUBLE_INPUTS_NO_NATIVE_EXECUTION_CLAIM',
        languages: ['en', 'fr'],
        projectId: project.id,
        retainedNativeAttempts: 3,
        exactNativeHistorySourceRetained: true,
        exactCompleteAlphaArchiveRetained: true,
        historicalOwnerReviewRetained: true,
        pendingReadConsentRevocationRejected: true,
        unknownHistoricalSourceRetainedWithoutProducerAttestation: true,
        unknownCurrentSourceRejected: true,
        authority: 'none',
      },
      null,
      2
    ) + '\n'
  );
}
