import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  createComputerMission,
  runComputerMission,
  restoreComputerMissionReport,
  reviewObservedAllocation,
} from '../../packages/successor-core/src/computer-mission.mjs';
import { verifyWorkOrderSeal } from '../../packages/successor-core/src/compiler.mjs';

const route = 'successor/computer/';
const read = async (page, selector = '#cm-report-json') =>
  JSON.parse(await page.locator(selector).textContent());
const idle = (page) =>
  page.waitForFunction(() => {
    const root = document.querySelector('[data-computer-mission]');
    return (
      root?.dataset.ready === 'true' &&
      root.getAttribute('aria-busy') !== 'true'
    );
  });
const observed = async (page) =>
  JSON.parse(
    (await page.locator('#cm-desk-output').textContent()).replace(
      /^SUCCESSOR_COMPUTER_RESULT\s+/,
      ''
    )
  );
function findKind(value, kind) {
  if (value?.kind === kind) return value;
  if (value && typeof value === 'object')
    for (const item of Object.values(value)) {
      const found = findKind(item, kind);
      if (found) return found;
    }
  return null;
}
async function download(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const file = await pending;
  const result = {
    name: file.suggestedFilename(),
    text: fs.readFileSync(await file.path(), 'utf8'),
  };
  await idle(page);
  return result;
}
async function allocation(page, quantities) {
  for (const id of ['stellar', 'laurentian', 'boreal'])
    await page.locator(`#cm-qty-${id}`).fill(String(quantities[id] || 0));
  await page.locator('#cm-desk-evaluate').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    document
      .getElementById('cm-desk-output')
      .textContent.startsWith('SUCCESSOR_COMPUTER_RESULT')
  );
  return observed(page);
}
function researchChecks(report) {
  assert.equal(report.kind, 'ComputerMissionReport');
  assert.equal(report.mission.currency, 'USD');
  assert.equal(report.independentProof, false);
  assert.equal(report.authorityCreated, 'NONE');
  assert.equal(report.decision.sameTaskSuperiority, false);
  assert.equal(report.decision.provenExternalAlpha, false);
  assert.equal(report.search.actualBrowserActions, null);
  assert.equal(report.search.providerCost, null);
  assert.ok(report.development.attempts.length > 3);
  const revisions = report.development.attempts.filter(
    (attempt) => attempt.lineage.kind === 'FAILURE_DRIVEN_REVISION'
  );
  assert.ok(revisions.length >= 1);
  for (const attempt of revisions) {
    const parent = report.development.attempts.find(
      (entry) => entry.attemptId === attempt.lineage.parentAttemptId
    );
    assert.ok(parent && parent.digest === attempt.lineage.parentDigest);
    assert.notDeepEqual(parent.program, attempt.program);
    assert.ok(attempt.lineage.changes.length > 0);
  }
  const frozen = report.history.findIndex(
    (event) => event.type === 'CANDIDATE_FROZEN'
  );
  const tested = report.history.findIndex(
    (event) => event.type === 'PUBLIC_FRESH_CASE_TESTED'
  );
  assert.ok(frozen >= 0 && tested > frozen);
  assert.equal(report.confirmation.cases.length, 2);
  for (const fresh of report.confirmation.cases) {
    assert.notEqual(fresh.mission.digest, report.mission.digest);
    assert.equal(fresh.frozenDigest, report.frozen.digest);
    assert.equal(fresh.candidate.programDigest, report.frozen.programDigest);
    assert.equal(fresh.protectedHoldout, false);
  }
  assert.deepEqual(
    report.reframing.actualRequirements,
    report.mission.requirements
  );
  assert.equal(report.reframing.changesActualRequirements, false);
  assert.equal(report.decision.retainedPlan.costCents, 49000);
}
async function approve(page) {
  await page.locator('#cm-owner').fill('Browser QA owner');
  await page
    .locator('#cm-reason')
    .fill(
      'Compare staged delivery while preserving every actual quantity, deadline and budget.'
    );
  await page.locator('#cm-approval').check();
  await page.locator('#cm-reframe').click();
  await idle(page);
  return read(page);
}
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.document <= dimensions.viewport,
    `${label}: ${JSON.stringify(dimensions)}`
  );
}

export async function verifyComputerMission({
  page,
  url,
  artifacts,
  a11y,
  checks,
}) {
  fs.mkdirSync(artifacts, { recursive: true });
  const origin = new URL(url).origin,
    external = [],
    errors = [],
    dialogs = [];
  const track = (target) => {
    const request = (entry) => {
      const address = entry.url();
      if (
        !address.startsWith(origin + '/') &&
        !address.startsWith('data:') &&
        !address.startsWith('blob:')
      )
        external.push(address);
    };
    const error = (entry) => errors.push(entry.message);
    const failed = (entry) =>
      errors.push(`${entry.url()}: ${entry.failure()?.errorText}`);
    const response = (entry) => {
      if (entry.status() >= 400)
        errors.push(`${entry.status()} ${entry.url()}`);
    };
    const dialog = async (entry) => {
      dialogs.push(entry.message());
      await entry.dismiss();
    };
    target.on('request', request);
    target.on('pageerror', error);
    target.on('requestfailed', failed);
    target.on('response', response);
    target.on('dialog', dialog);
    return () => {
      target.off('request', request);
      target.off('pageerror', error);
      target.off('requestfailed', failed);
      target.off('response', response);
      target.off('dialog', dialog);
    };
  };
  const untrack = track(page);
  try {
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(url + route, { waitUntil: 'networkidle' });
    await idle(page);
    assert.equal(await page.locator('#cm-task').isDisabled(), true);
    assert.equal(await page.locator('#cm-evidence-input').isDisabled(), true);
    await page.locator('#cm-practice').focus();
    await page.keyboard.press('Enter');
    await idle(page);
    const initial = await read(page);
    researchChecks(initial);
    assert.equal(initial.formulation, 'all_early');
    assert.equal(initial.development.selected.plan.costCents, 49000);
    assert.equal(initial.reframing.approval, null);
    assert.equal(
      await page.locator('#cm-attempts tr').count(),
      initial.development.attempts.length
    );
    const initialDesk = await observed(page);
    assert.equal(initialDesk.plan.costCents, 49000);
    assert.equal(initialDesk.check.valid, true);
    assert.match(
      await page.locator('#cm-desk-mode').textContent(),
      /SCRIPTED|NO AI MODEL/
    );
    const approved = await approve(page);
    researchChecks(approved);
    assert.equal(approved.formulation, 'actual_requirements');
    assert.deepEqual(
      approved.mission.requirements,
      initial.mission.requirements
    );
    assert.equal(approved.mission.digest, initial.mission.digest);
    assert.equal(approved.development.selected.plan.costCents, 36000);
    assert.equal(approved.development.credibleAlternative.costCents, 36000);
    assert.equal(
      approved.decision.quotedCostDifferenceFromCredibleAlternativeCents,
      0
    );
    assert.equal(
      approved.decision.quotedCostDifferenceFromIncumbentCents,
      13000
    );
    checks.push(
      'Computer mission: actual typed strategy construction, failed-program revision lineage, candidate freeze before distinct public cases, explicit local reframing approval and credible-alternative tie'
    );

    await page.evaluate(() => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      globalThis.__computerOriginalDigest = original;
      globalThis.__computerHeldDigests = [];
      globalThis.__computerHoldReview = true;
      crypto.subtle.digest = (...args) =>
        globalThis.__computerHoldReview
          ? new Promise((resolve, reject) =>
              globalThis.__computerHeldDigests.push(() =>
                original(...args).then(resolve, reject)
              )
            )
          : original(...args);
    });
    try {
      await allocation(page, { stellar: 10, laurentian: 30 });
      await page.waitForFunction(
        () => globalThis.__computerHeldDigests.length > 0
      );
      assert.equal(
        await page.locator('#cm-evidence-export').isDisabled(),
        true,
        'Pending review is not exportable evidence'
      );
      await page.locator('#cm-qty-stellar').fill('11');
      assert.deepEqual(await read(page, '#cm-observed-json'), {});
      await page.evaluate(() => {
        globalThis.__computerHoldReview = false;
        for (const release of globalThis.__computerHeldDigests) release();
      });
      await page.waitForTimeout(500);
      assert.deepEqual(
        await read(page, '#cm-observed-json'),
        {},
        'A completed older review must not resurrect an invalidated observation'
      );
      assert.equal(
        await page.locator('#cm-evidence-export').isDisabled(),
        true
      );
    } finally {
      await page.evaluate(() => {
        globalThis.__computerHoldReview = false;
        for (const release of globalThis.__computerHeldDigests || []) release();
        crypto.subtle.digest = globalThis.__computerOriginalDigest;
        delete globalThis.__computerHeldDigests;
        delete globalThis.__computerOriginalDigest;
        delete globalThis.__computerHoldReview;
      });
    }

    const chosen = await allocation(page, { stellar: 10, laurentian: 30 });
    await idle(page);
    await page.waitForFunction(() => {
      try {
        const result = JSON.parse(
          document.getElementById('cm-observed-json').textContent
        );
        return (
          result.review?.accepted === true &&
          result.observedResult?.plan.costCents === 36000
        );
      } catch {
        return false;
      }
    });
    assert.equal(chosen.check.valid, true);
    assert.deepEqual(chosen.check.totals, {
      totalUnits: 40,
      earlyUnits: 10,
      costCents: 36000,
    });
    assert.equal(chosen.reportDigest, approved.digest);
    assert.equal(chosen.frozenProgramDigest, approved.frozen.programDigest);
    const checked = await reviewObservedAllocation(approved, chosen);
    assert.equal(checked.accepted, true);
    assert.equal(checked.trustedComputerExecution, false);
    assert.equal(checked.independentProof, false);
    const displayed = findKind(
      await read(page, '#cm-observed-json'),
      'ComputerObservedAllocationReview'
    );
    assert.ok(
      displayed &&
        displayed.accepted &&
        displayed.trustedComputerExecution === false
    );
    const evidenceFile = await download(page, '#cm-evidence-export');
    assert.ok(evidenceFile.text.includes(approved.mission.digest));
    const late = await allocation(page, { laurentian: 40 });
    await idle(page);
    assert.equal(late.check.valid, false);
    assert.equal((await read(page)).decision.retainedPlan.costCents, 49000);
    await page.locator('#cm-run-desk').click();
    await idle(page);
    const scripted = await observed(page);
    assert.equal(scripted.check.valid, true);
    assert.equal(scripted.plan.costCents, 36000);
    assert.equal(
      scripted.executionKind,
      'USER_OR_SCRIPTED_BROWSER_INTERACTION'
    );
    checks.push(
      'Computer mission: keyboard and mouse operate the actual desk, exact allocation/freight/deadlines are independently recomputed, failed late allocation stays rejected and scripted execution stays unqualified'
    );

    const taskFile = await download(page, '#cm-task'),
      task = JSON.parse(taskFile.text);
    const htmlFile = await download(page, '#cm-desk-download');
    assert.equal(task.kind, 'successor-computer');
    assert.equal(task.html, htmlFile.text);
    assert.deepEqual(task.allowed_urls, []);
    assert.ok(task.goal.includes(approved.digest));
    assert.ok(task.goal.includes(approved.frozen.programDigest));
    assert.ok(
      task.goal.includes(
        'sha256:' + createHash('sha256').update(task.html).digest('hex')
      )
    );
    assert.match(task.goal, /stellar: 10 units; laurentian: 30 units/);
    assert.ok(
      (await page.locator('#cm-work-prompt').inputValue()).includes(
        'successor/computer/desk/'
      )
    );
    const reportFile = await download(page, '#cm-export');
    const exported = JSON.parse(reportFile.text);
    assert.deepEqual(
      await restoreComputerMissionReport(reportFile.text),
      exported
    );
    const readable = await download(page, '#cm-readable');
    assert.ok(readable.text.includes(approved.frozen.programDigest));
    await page.locator('#cm-jobs').evaluate((button) => {
      button.closest('details').open = true;
    });
    await page.locator('#cm-jobs').click();
    await idle(page);
    const jobs = await read(page, '#cm-jobs-json');
    assert.equal(jobs.graph.nodes.length, 4);
    assert.equal(jobs.fundingStatus, 'UNFUNDED');
    assert.equal(jobs.signatureStatus, 'UNSIGNED_COMMITMENT');
    assert.equal(jobs.budgetReservations.reservedBaseUnits, '0');
    assert.equal(jobs.computerMission.mission.currency, 'USD');
    assert.equal(jobs.computerMission.reportDigest, approved.digest);
    for (const job of jobs.graph.nodes) {
      assert.equal(job.state, 'DRAFT');
      assert.equal(job.budget.unit, 'AGIALPHA');
      assert.equal(job.budget.limitBaseUnits, '0');
      assert.ok(await verifyWorkOrderSeal(job));
    }
    assert.deepEqual(
      JSON.parse((await download(page, '#cm-jobs-download')).text),
      jobs
    );
    checks.push(
      'Computer mission: real Alpha ComputerTask and executable desk exports share exact frozen mission/program/HTML bindings; strategy report replays and readable brief retains evidence'
    );

    const deskPage = await page.context().newPage(),
      removeDesk = track(deskPage);
    try {
      const address = await page
        .locator('#cm-public-desk')
        .getAttribute('href');
      await deskPage.goto(new URL(address, page.url()).href, {
        waitUntil: 'networkidle',
      });
      await deskPage
        .locator('[data-computer-desk][data-ready="true"]')
        .waitFor();
      const config = JSON.parse(
        await deskPage.locator('#cm-desk-config').textContent()
      );
      assert.deepEqual(
        config.mission.requirements,
        approved.mission.requirements
      );
      assert.equal(config.reportDigest, approved.digest);
      assert.equal(
        (await allocation(deskPage, { stellar: 10, laurentian: 30 })).check
          .valid,
        true
      );
    } finally {
      removeDesk();
      await deskPage.close();
    }

    const restoreContext = await page
      .context()
      .browser()
      .newContext({
        acceptDownloads: true,
        reducedMotion: 'reduce',
        viewport: { width: 1440, height: 1050 },
      });
    try {
      const fresh = await restoreContext.newPage(),
        removeFresh = track(fresh);
      try {
        await fresh.goto(url + route, { waitUntil: 'networkidle' });
        await idle(fresh);
        assert.deepEqual(await read(fresh), {});
        await fresh
          .locator('#cm-restore')
          .setInputFiles({
            name: reportFile.name,
            mimeType: 'application/json',
            buffer: Buffer.from(reportFile.text),
          });
        await idle(fresh);
        assert.deepEqual(await read(fresh), exported);
        const customMission = await createComputerMission({
          suppliers: exported.mission.suppliers.map((supplier, index) => ({
            ...supplier,
            id: `custom_${index}`,
            name: `Public custom supplier ${index}`,
          })),
          publicNonPersonal: true,
          rights:
            'Original synthetic custom quotes for a browser import boundary test.',
        });
        const customReport = await runComputerMission(customMission);
        await fresh
          .locator('#cm-restore')
          .setInputFiles({
            name: 'unsupported-custom-suppliers.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(customReport)),
          });
        await idle(fresh);
        assert.equal(
          await fresh.locator('#cm-status').getAttribute('data-error'),
          'true'
        );
        assert.equal(
          (await read(fresh)).digest,
          exported.digest,
          'Unsupported supplier identities cannot silently become default offers or replace the valid report'
        );
        for (const mutation of [
          (copy) => {
            copy.mission.requirements.earlyUnits = 0;
          },
          (copy) => {
            copy.independentProof = true;
            copy.authorityCreated = 'A4';
          },
        ]) {
          const tampered = structuredClone(exported);
          mutation(tampered);
          await fresh
            .locator('#cm-restore')
            .setInputFiles({
              name: 'forged-report.json',
              mimeType: 'application/json',
              buffer: Buffer.from(JSON.stringify(tampered)),
            });
          await idle(fresh);
          assert.equal(
            await fresh.locator('#cm-status').getAttribute('data-error'),
            'true'
          );
          assert.equal((await read(fresh)).digest, exported.digest);
        }
        const claimed = {
          schema: 'reported-computer-execution',
          liveProvider: true,
          model: 'UNVERIFIED_MODEL_CLAIM',
          deliveredResult: scripted,
        };
        await fresh
          .locator('#cm-evidence-input')
          .setInputFiles({
            name: 'reported-evidence.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(claimed)),
          });
        await idle(fresh);
        const imported = findKind(
          await read(fresh, '#cm-import-review'),
          'ComputerObservedAllocationReview'
        );
        assert.ok(imported && imported.accepted);
        assert.equal(imported.trustedComputerExecution, false);
        assert.equal(imported.independentProof, false);
        assert.equal(imported.authorityCreated, 'NONE');
        assert.match(
          await fresh.locator('#cm-provider-state').textContent(),
          /NOT AUTHENTICATED|SELF-REPORTED|unauthenticated/i
        );
      } finally {
        removeFresh();
      }
    } finally {
      await restoreContext.close();
    }
    checks.push(
      'Computer mission: pending and stale observations cannot export or resurrect after edits; the public desk matches the task, unsupported custom suppliers/tampering are rejected atomically, and provider claims remain unauthenticated'
    );

    await page.locator('#cm-budget').fill('500.00');
    assert.equal(await page.locator('#cm-edited').isVisible(), true);
    for (const id of ['task', 'desk-download', 'evidence-input', 'run-desk'])
      assert.equal(await page.locator(`#cm-${id}`).isDisabled(), true);
    assert.equal((await read(page)).digest, approved.digest);
    await page.locator('#cm-hard-early').click();
    await idle(page);
    const hard = await approve(page);
    assert.equal(hard.mission.requirements.earlyUnits, 40);
    assert.equal(hard.development.selected.plan.costCents, 49000);
    assert.equal(hard.decision.quotedCostDifferenceFromIncumbentCents, 0);
    assert.equal(hard.reframing.hardEarlyRequirement, true);
    const rejected = await allocation(page, { stellar: 10, laurentian: 30 });
    await idle(page);
    assert.equal(rejected.check.valid, false);
    await page.locator('#cm-run-desk').click();
    await idle(page);
    assert.equal((await observed(page)).plan.costCents, 49000);
    const hardTask = JSON.parse((await download(page, '#cm-task')).text);
    assert.match(hardTask.goal, /stellar: 40 units/);
    assert.ok(hardTask.html.includes('"earlyUnits":40'));
    checks.push(
      'Computer mission: changing inputs disables stale execution exports, and a genuine all-forty-early requirement remains hard under reframing and in the actual task'
    );

    const hostileMission = await createComputerMission({
      title:
        '<img id="cm-injected" src="https://computer-xss.invalid/x" onerror="globalThis.computerCompromised=true">',
    });
    const hostile = await runComputerMission(hostileMission);
    await page
      .locator('#cm-restore')
      .setInputFiles({
        name: 'literal-markup-report.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(hostile)),
      });
    await idle(page);
    await page.locator('#cm-run-desk').click();
    await idle(page);
    assert.equal(
      await page.locator('#cm-injected,[data-computer-mission] img').count(),
      0
    );
    assert.equal(
      await page.evaluate(() => globalThis.computerCompromised),
      undefined
    );

    for (const language of ['en', 'fr']) {
      await page.goto(url + route + (language === 'fr' ? 'fr/' : ''), {
        waitUntil: 'networkidle',
      });
      await idle(page);
      await page.locator('#cm-practice').focus();
      await page.keyboard.press('Enter');
      await idle(page);
      const report = await approve(page);
      researchChecks(report);
      await page.locator('#cm-run-desk').click();
      await idle(page);
      assert.equal((await observed(page)).check.valid, true);
      await page
        .locator('[data-computer-mission] details')
        .evaluateAll((details) => {
          for (const detail of details) detail.open = true;
        });
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1050 });
        await page.evaluate(() => document.activeElement?.blur());
        await noOverflow(page, `${language} ${width}px`);
        await a11y(`computer-mission-${language}-${width}`);
        if (width === 390 || width === 1440) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(
              artifacts,
              `computer-mission-${language}-${width}.png`
            ),
          });
        }
      }
      const publicAddress = await page
        .locator('#cm-public-desk')
        .getAttribute('href');
      await page.goto(new URL(publicAddress, page.url()).href, {
        waitUntil: 'networkidle',
      });
      await page.locator('[data-computer-desk][data-ready="true"]').waitFor();
      assert.equal(
        (await allocation(page, { stellar: 10, laurentian: 30 })).check.valid,
        true
      );
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1050 });
        await noOverflow(page, `desk ${language} ${width}px`);
        await a11y(`computer-desk-${language}-${width}`);
      }
    }
    await page.emulateMedia({
      forcedColors: 'active',
      reducedMotion: 'reduce',
    });
    await page.locator('#cm-desk-evaluate').focus();
    await page.keyboard.press('Enter');
    assert.equal((await observed(page)).check.valid, true);
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
    checks.push(
      'Computer mission: inert imported markup, complete EN/FR keyboard journeys and expanded evidence at 320/390/768/1440px with zero overflow/WCAG A/AA violations and forced-colors operation'
    );
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(dialogs, []);
    fs.writeFileSync(
      path.join(artifacts, 'computer-mission-browser-qa.json'),
      JSON.stringify(
        {
          passed: true,
          checks: checks.filter((check) =>
            check.startsWith('Computer mission:')
          ),
          external,
          errors,
          dialogs,
        },
        null,
        2
      ) + '\n'
    );
  } finally {
    untrack();
    await page.setViewportSize({ width: 1440, height: 1050 });
  }
}

async function standalone() {
  const { chromium } = await import('playwright');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..'
    ),
    output = path.resolve(
      process.env.COMPUTER_MISSION_QA_OUTPUT || path.join(root, 'build/pages')
    ),
    artifacts = path.join(root, 'reports/pages');
  const base = JSON.parse(
      fs.readFileSync(path.join(output, 'catalog.json'), 'utf8')
    ).basePath,
    checks = [];
  fs.mkdirSync(artifacts, { recursive: true });
  const server = http.createServer((request, response) => {
    const address = new URL(request.url, 'http://localhost');
    if (!address.pathname.startsWith(base)) {
      response.writeHead(404);
      response.end();
      return;
    }
    let file = path.resolve(
      output,
      decodeURIComponent(address.pathname.slice(base.length)) || 'index.html'
    );
    if (!file.startsWith(output + path.sep) && file !== output) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
      }[path.extname(file)] || 'application/octet-stream'
    );
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({
        acceptDownloads: true,
        reducedMotion: 'reduce',
        viewport: { width: 1440, height: 1050 },
      }),
      page = await context.newPage();
    const a11y = async (label) => {
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      fs.writeFileSync(
        path.join(artifacts, `accessibility-${label}.json`),
        JSON.stringify(result.violations, null, 2)
      );
      assert.deepEqual(
        result.violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => node.target),
        })),
        [],
        label
      );
    };
    await verifyComputerMission({
      page,
      url: `http://127.0.0.1:${server.address().port}${base}`,
      artifacts,
      a11y,
      checks,
    });
    console.log(JSON.stringify({ passed: true, checks }, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await standalone();
