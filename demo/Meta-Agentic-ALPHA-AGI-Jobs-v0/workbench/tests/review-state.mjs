import assert from 'node:assert/strict';
import { json, makeTask, taskDigest } from '../model.mjs';

// Hold real browser I/O at an explicit barrier; no application test hooks or timing races.
export async function checkReviewState(page, source, bundle) {
  const upload = (value) =>
    page.locator('#receipt-file').setInputFiles({
      name: 'evidence.json',
      mimeType: 'application/json',
      buffer: Buffer.from(typeof value === 'string' ? value : json(value)),
    });
  const title = (value) =>
    page.waitForFunction(
      (expected) =>
        document.querySelector('#review-title').textContent === expected,
      value
    );
  const task = await makeTask(source, 'identify');
  const receipt = {
    schemaVersion: 1,
    provider: 'openclaw-responses',
    workerProfile: 'meta-agentic-alpha',
    jobId: '73',
    deploymentId: 'qa-fixture',
    task,
    taskSha256: await taskDigest(task),
    status: 'evidence-ready',
    simulated: true,
    productionApproved: false,
    settlementApproved: false,
    artifacts: [bundle.results[0].artifact],
  };
  for (const control of [
    'review-stage',
    'evidence-kind',
    'expected-job',
    'expected-deployment',
  ]) {
    await page.selectOption('#review-stage', 'identify');
    await page.selectOption('#evidence-kind', 'receipt');
    await page.locator('#expected-job').fill('73');
    await page.locator('#expected-deployment').fill('qa-fixture');
    await upload(receipt);
    await title('Artifact checks passed');
    await page.evaluate(() => {
      const original = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        File.prototype.arrayBuffer = original;
        return new Promise((resolve) => {
          window.releaseReviewFile = async () => {
            const bytes = await original.call(this);
            resolve(bytes);
          };
        });
      };
    });
    await upload(receipt);
    await page.waitForFunction(() => !!window.releaseReviewFile);
    if (control === 'review-stage')
      await page.selectOption('#review-stage', 'design');
    else if (control === 'evidence-kind')
      await page.selectOption('#evidence-kind', 'candidate');
    else await page.locator('#' + control).fill('different');
    await title('Review inputs changed');
    // A valid new operation must finish before the stale read is released.
    await page.selectOption('#evidence-kind', 'receipt');
    await upload(bundle);
    await title('Artifact checks passed');
    await page.evaluate(async () => {
      await window.releaseReviewFile();
      delete window.releaseReviewFile;
    });
    // Following digest barrier flushes earlier content checks before assertions.
    await page.evaluate(() =>
      crypto.subtle.digest('SHA-256', new Uint8Array())
    );
    assert.match(
      await page.locator('#review-status').textContent(),
      /Imported rehearsal bundle/
    );
    assert.equal(await page.locator('#download-evidence').isDisabled(), false);
    assert.equal(await page.locator('#run').isDisabled(), false);
    assert.equal(
      await page.locator('#evidence').getAttribute('aria-busy'),
      'false'
    );
    // Completed review results also cease to apply when their inputs change.
    await page.locator('#expected-job').fill('74');
    await title('Review inputs changed');
    assert.equal(await page.locator('#review-checks li').count(), 0);
    assert.equal(await page.locator('#download-evidence').isDisabled(), true);
  }
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let held = false;
    window.pendingReviewDigests = 0;
    crypto.subtle.digest = async (...args) => {
      window.pendingReviewDigests++;
      try {
        if (!held) {
          held = true;
          await new Promise((resolve) => {
            window.releaseReviewDigest = resolve;
          });
        }
        return await original(...args);
      } finally {
        window.pendingReviewDigests--;
      }
    };
    window.restoreReviewDigest = () => {
      crypto.subtle.digest = original;
    };
  });
  await page.locator('#run').click();
  await page.waitForFunction(() => !!window.releaseReviewDigest);
  await upload('invalid JSON');
  await title('File could not be verified');
  assert.equal(await page.locator('#run').isDisabled(), false);
  await page.evaluate(() => window.releaseReviewDigest());
  // Poll the actual computation rather than use a sleep to guess its completion.
  await page.waitForFunction(() => window.pendingReviewDigests === 0);
  await page.evaluate(() => window.restoreReviewDigest());
  assert.equal(
    await page.locator('#review-title').textContent(),
    'File could not be verified'
  );
  assert.equal(await page.locator('#run').isDisabled(), false);
  assert.equal(
    await page.locator('#evidence').getAttribute('aria-busy'),
    'false'
  );
  await page.locator('#run').click();
  await title('Artifact checks passed');
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = () => {
      crypto.subtle.digest = original;
      return Promise.reject(new Error('Injected digest failure'));
    };
  });
  await page.locator('#wrong-answer').click();
  await title('File could not be verified');
  assert.match(
    await page.locator('#review-status').textContent(),
    /Injected digest failure/
  );
  assert.equal(await page.locator('#run').isDisabled(), false);
  assert.equal(await page.locator('#download-evidence').isDisabled(), true);
}
