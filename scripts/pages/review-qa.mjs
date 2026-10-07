import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { reviewFixture } from '../../test/pages/review-fixture.mjs';

export async function verifyEvidenceReview({
  page,
  context,
  url,
  artifacts,
  a11y,
  checks,
}) {
  const fixture = reviewFixture();
  const inputFile = (name, value) => ({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(
      typeof value === 'string' ? value : JSON.stringify(value)
    ),
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Inspect delivered work' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(url + 'review/');
  await page.getByRole('button', { name: 'Inspect evidence' }).click();
  assert.match(
    await page.locator('#review-status').textContent(),
    /Choose the task/
  );
  await page.getByLabel('Expected job ID').fill('42');
  await page.getByLabel('Expected deployment ID').fill('review-fixture');
  await page
    .getByLabel('Original admitted task.json')
    .setInputFiles(inputFile('task.json', fixture.task));
  await page
    .getByLabel('Worker receipt JSON')
    .setInputFiles(inputFile('receipt.json', fixture.receiptText));
  const check = async () => {
    await page.getByRole('button', { name: 'Inspect evidence' }).click();
    await page
      .getByText('Integrity checked. Review the actual content', {
        exact: false,
      })
      .waitFor();
  };
  await check();
  assert.match(
    await page.locator('#review-mode').textContent(),
    /Fixture \/ simulated/
  );
  assert.equal(
    await page.locator('#review-artifacts article').count(),
    fixture.receipt.artifacts.length
  );
  await page
    .getByText('Inspect untrusted text', { exact: true })
    .first()
    .click();
  assert.equal(
    await page
      .locator('#review-artifacts img, #review-artifacts script')
      .count(),
    0
  );
  assert.equal(await page.evaluate(() => window.reviewInjected), undefined);
  const fileWait = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download exact bytes as text' })
    .first()
    .click();
  const artifactDownload = await fileWait;
  assert.equal(
    artifactDownload.suggestedFilename(),
    fixture.receipt.artifacts[0].name + '.txt'
  );
  assert.deepEqual(
    fs.readFileSync(await artifactDownload.path()),
    Buffer.from(fixture.receipt.artifacts[0].content)
  );
  await page.getByLabel('Reviewer identifier').fill('fixture-reviewer');
  await page
    .getByLabel('Role and conflict disclosure')
    .fill('Synthetic test author, not independent.');
  await page
    .getByLabel('Reproduction steps, results and limitations')
    .fill('Reproduced the fixture. No live provider or customer use.');
  await page.getByLabel('Your recommendation').selectOption('accept');
  for (let index = 0; index < fixture.task.acceptanceCriteria.length; index++) {
    await page
      .locator(`#criterion-evidence-${index}`)
      .fill('Recorded fixture check.');
  }
  await page
    .getByRole('button', { name: 'Download review assessment' })
    .click();
  assert.match(
    await page.locator('#review-assessment-status').textContent(),
    /every criterion/
  );
  for (let index = 0; index < fixture.task.acceptanceCriteria.length; index++) {
    await page.locator(`#criterion-${index}`).selectOption('pass');
  }
  const assessmentWait = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download review assessment' })
    .focus();
  await page.keyboard.press('Enter');
  const assessmentDownload = await assessmentWait;
  const assessment = JSON.parse(
    fs.readFileSync(await assessmentDownload.path(), 'utf8')
  );
  assert.equal(assessment.recommendation, 'accept');
  assert.equal(assessment.status, 'unsigned-reviewer-assessment');
  assert.equal(assessment.simulated, true);
  assert.equal(assessment.settlementApproved, false);
  assert.equal(assessment.providerAuthenticated, false);
  assert.equal(assessment.fingerprints.taskSha256, fixture.receipt.taskSha256);
  await page
    .getByLabel('Reproduction steps, results and limitations')
    .fill('Updated findings.');
  assert.match(
    await page.locator('#review-assessment-status').textContent(),
    /Review changed/
  );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      `Review layout at ${width}`
    );
    if ([390, 1440].includes(width)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(artifacts, `evidence-review-${width}.png`),
        fullPage: true,
        style: '.skip-link { visibility: hidden !important; }',
      });
      await a11y(`evidence-review-${width}`);
    }
  }
  await page.getByLabel('Expected job ID').fill('43');
  assert.equal(await page.locator('#review-results').isVisible(), false);
  await page.getByRole('button', { name: 'Inspect evidence' }).click();
  await page
    .getByText('Receipt does not match the expected job', { exact: false })
    .waitFor();
  await page.getByLabel('Expected job ID').fill('42');
  const tampered = structuredClone(fixture.receipt);
  tampered.artifacts[0].content += ' altered';
  await page
    .getByLabel('Worker receipt JSON')
    .setInputFiles(inputFile('tampered.json', tampered));
  await page.getByRole('button', { name: 'Inspect evidence' }).click();
  await page
    .getByText('Artifact byte count or SHA-256 does not match', {
      exact: false,
    })
    .waitFor();
  assert.equal(await page.locator('#review-results').isVisible(), false);
  await page
    .getByLabel('Worker receipt JSON')
    .setInputFiles(inputFile('receipt.json', fixture.receiptText));
  // Deterministically hold a real file read while the user edits the expected identity.
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    window.releaseReviewRead = null;
    File.prototype.arrayBuffer = function () {
      const file = this;
      File.prototype.arrayBuffer = original;
      return new Promise((resolve) => {
        window.releaseReviewRead = async () =>
          resolve(await original.call(file));
      });
    };
  });
  await page.getByRole('button', { name: 'Inspect evidence' }).click();
  await page.waitForFunction(
    () => typeof window.releaseReviewRead === 'function'
  );
  await page.getByLabel('Expected job ID').fill('43');
  await page.evaluate(async () => {
    await window.releaseReviewRead();
    // Flush pending digest promises before asserting that no stale result is displayed.
    const original = crypto.subtle.digest.bind(crypto.subtle);
    await original('SHA-256', new Uint8Array());
  });
  assert.equal(await page.locator('#review-results').isVisible(), false);
  assert.match(
    await page.locator('#review-status').textContent(),
    /Inputs changed/
  );
  await page.getByLabel('Expected job ID').fill('42');
  await check();
  assert.equal(await page.getByLabel('Reviewer identifier').inputValue(), '');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#review-results').isVisible(), false);
  assert.equal(await page.getByLabel('Expected job ID').inputValue(), '');
  assert.equal(await page.getByLabel('Worker receipt JSON').inputValue(), '');
  const noScript = await context
    .browser()
    .newContext({ javaScriptEnabled: false });
  try {
    const plain = await noScript.newPage();
    await plain.goto(url + 'review/');
    assert.equal(
      await plain
        .getByRole('button', { name: 'Inspect evidence' })
        .isDisabled(),
      true
    );
    assert.equal(await plain.locator('noscript p').isVisible(), true);
    assert.match(
      await plain.locator('noscript p').textContent(),
      /Evidence inspection requires JavaScript/
    );
    assert.equal(
      await plain.getByRole('link', { name: 'Review guide' }).isVisible(),
      true
    );
  } finally {
    await noScript.close();
  }
  checks.push(
    'evidence review: actual adapter receipt, exact downloads, tamper/replay rejection, untrusted text, acceptance gating, input races, reset and no-JavaScript fallback'
  );
}
