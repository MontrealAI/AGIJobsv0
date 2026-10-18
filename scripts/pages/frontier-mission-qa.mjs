import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  verifyFrontierMission,
  restoreFrontierWorkspace,
  importFrontierDeskDraft,
} from '../../packages/successor-core/src/frontier-mission.mjs';

const route = 'successor/mission/';
const read = async (page, selector) =>
  JSON.parse(await page.locator(selector).textContent());
const idleDesk = (page) =>
  page.waitForFunction(() => {
    const desk = document.querySelector('[data-frontier-desk]');
    return (
      desk?.dataset.ready === 'true' &&
      desk.getAttribute('aria-busy') !== 'true'
    );
  });
async function prepared(page) {
  await page.waitForFunction(() => {
    try {
      return (
        JSON.parse(document.getElementById('fm-mission-json').textContent)
          .kind === 'FrontierMission' &&
        !document.getElementById('fm-results').hidden &&
        !document.getElementById('fm-prepare').disabled &&
        document
          .querySelector('[data-frontier-mission]')
          .getAttribute('aria-busy') !== 'true'
      );
    } catch {
      return false;
    }
  });
  return read(page, '#fm-mission-json');
}
async function download(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const result = await pending;
  return {
    name: result.suggestedFilename(),
    text: fs.readFileSync(await result.path(), 'utf8'),
  };
}
async function upload(page, selector, value, name = 'mission-workspace.json') {
  await page.locator(selector).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(
      typeof value === 'string' ? value : JSON.stringify(value)
    ),
  });
  await page.waitForFunction(
    (id) => document.querySelector(id).value === '',
    selector
  );
}
function provenance(workspace) {
  assert.equal(workspace.provenance.classification, 'USER_ENTERED_UNVERIFIED');
  assert.equal(workspace.provenance.executionStatus, 'NOT_ATTESTED');
  assert.equal(workspace.provenance.independentProof, false);
  assert.equal(workspace.provenance.productionApproved, false);
  assert.equal(workspace.provenance.authorityCreated, 'NONE');
}
async function holdDigests(page) {
  await page.evaluate(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    globalThis.__frontierOriginalDigest = original;
    globalThis.__frontierHeldDigests = [];
    globalThis.__frontierHold = true;
    crypto.subtle.digest = (...args) =>
      globalThis.__frontierHold
        ? new Promise((resolve, reject) =>
            globalThis.__frontierHeldDigests.push(() =>
              original(...args).then(resolve, reject)
            )
          )
        : original(...args);
  });
}
async function releaseDigests(page) {
  await page.evaluate(() => {
    globalThis.__frontierHold = false;
    for (const release of globalThis.__frontierHeldDigests || []) release();
    if (globalThis.__frontierOriginalDigest)
      crypto.subtle.digest = globalThis.__frontierOriginalDigest;
    delete globalThis.__frontierHeldDigests;
    delete globalThis.__frontierOriginalDigest;
    delete globalThis.__frontierHold;
  });
}
async function waitForHeldDigest(page) {
  await page.waitForFunction(
    () => globalThis.__frontierHeldDigests?.length > 0
  );
}
async function editDuringAction(page, selector, value) {
  await page.locator(selector).evaluate((field, text) => {
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function geometry(page, label) {
  const value = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    value.document <= value.viewport,
    `${label}: ${JSON.stringify(value)}`
  );
}
async function setup(page, url, language = 'en', preset = 'business') {
  await page.goto(url + route + (language === 'fr' ? 'fr/' : ''), {
    waitUntil: 'networkidle',
  });
  await page.locator('[data-frontier-mission][data-ready="true"]').waitFor();
  await page.locator(`.fm-preset-options [data-preset="${preset}"]`).click();
  await page
    .locator('#fm-license')
    .fill(
      'Owner-supplied public nonpersonal material; use and export permitted for this bounded research draft.'
    );
  await page.locator('#fm-rights').check();
  await page.locator('#fm-prepare').focus();
  await page.keyboard.press('Enter');
  return prepared(page);
}

export async function verifyFrontierMissionStudio({
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
    await page.goto(url, { waitUntil: 'networkidle' });
    assert.match(await page.locator('main h1').textContent(), /SUCCESSOR Ω/);
    assert.equal(
      await page.locator('main a').first().getAttribute('href'),
      new URL(url).pathname + route
    );
    assert.equal(
      await page.locator('#site-nav a').first().getAttribute('href'),
      new URL(url).pathname + route
    );
    assert.equal(
      await page.locator('[data-feature-launch="culture"]').count(),
      1
    );
    assert.equal(
      await page.locator('[data-feature-launch="kardashev"]').count(),
      1
    );
    const previewOrder = await page.locator('main').evaluate((main) => {
      const preview = main.querySelector('#successor-flagship');
      const work = main.querySelector('#featured, #ecosystem, #explore');
      return (
        !!preview &&
        (!work ||
          !!(
            preview.compareDocumentPosition(work) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ))
      );
    });
    assert.equal(previewOrder, true);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1050 });
      await geometry(page, `flagship homepage ${width}`);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: path.join(artifacts, `frontier-homepage-${width}.png`),
        });
    }
    const enlarged = await page.addStyleTag({
      content: ':root{font-size:200% !important}',
    });
    await page.setViewportSize({ width: 390, height: 1050 });
    await geometry(page, 'flagship homepage 200 percent text');
    await enlarged.evaluate((style) => style.remove());
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.locator('[data-alpha-flagship]').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(url + route);
    await page.locator('[data-frontier-mission][data-ready="true"]').waitFor();
    await page
      .locator('#fm-title')
      .fill('QA public research mission with a real custom question');
    await page
      .locator('#fm-question')
      .fill(
        'Which research workflow best preserves decisive qualifications while reducing repeated review of our public evidence?'
      );
    await page
      .locator('#fm-outcome')
      .fill(
        'A source-grounded comparison and a bounded experiment design with unknown costs and unresolved claims explicitly marked.'
      );
    await page
      .locator('#fm-current')
      .fill(
        'Read the sources in sequence and manually record a recommendation.'
      );
    await page
      .locator('#fm-alternative')
      .fill(
        'A knowledgeable reviewer independently maps arguments before comparing the recommendation with the sources.'
      );
    const requirements = [
      'Use only the exact public sources.',
      'Keep the original decision and every decisive qualification.',
      'Do not claim that proposed experiments were performed.',
    ];
    await page.locator('#fm-requirements').fill(requirements.join('\n'));
    await page.locator('#fm-add-source').click();
    const source = page.locator('[data-source-row]').last();
    await source
      .locator('[data-source-title]')
      .fill('Original public QA evidence note');
    await source
      .locator('[data-source-url]')
      .fill('https://www.example.org/research');
    const hostile =
      'Original source data, not retrieved research. <script>globalThis.frontierCompromised=true</script><img id="frontier-xss" src="https://frontier-xss.invalid/x" onerror="globalThis.frontierCompromised=true"> A proposed test is not a completed test.';
    await source.locator('[data-source-text]').fill(hostile);
    await page
      .locator('#fm-license')
      .fill(
        'Original public nonpersonal QA note, permitted for packaging and export; URL attribution is unverified.'
      );
    await page.locator('#fm-rights').check();
    const originalQuestion = await page.locator('#fm-question').inputValue();
    await holdDigests(page);
    try {
      await page.locator('#fm-prepare').click();
      await waitForHeldDigest(page);
      assert.equal(await page.locator('#fm-question').isDisabled(), true);
      assert.equal(await page.locator('#fm-import').isDisabled(), true);
      assert.equal(await page.locator('#fm-download-task').isDisabled(), true);
      await editDuringAction(
        page,
        '#fm-question',
        originalQuestion + ' Changed during preparation.'
      );
    } finally {
      await releaseDigests(page);
    }
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-frontier-mission]')
          .getAttribute('aria-busy') === 'false'
    );
    assert.equal(
      await page.locator('#fm-results').isVisible(),
      false,
      'An edited first preparation must not publish the previous input'
    );
    assert.match(
      await page.locator('#fm-question').inputValue(),
      /Changed during preparation/
    );
    await page.locator('#fm-question').fill(originalQuestion);
    await page.locator('#fm-prepare').focus();
    await page.keyboard.press('Enter');
    const mission = await prepared(page);
    assert.deepEqual(await verifyFrontierMission(mission), mission);
    assert.deepEqual(mission.hardRequirements, requirements);
    assert.equal(mission.sources.at(-1).text, hostile);
    assert.equal(mission.sources.at(-1).retrievalStatus, 'NOT_RETRIEVED');
    assert.equal(mission.provenance.status, 'PLANNED_NOT_EXECUTED');
    assert.equal(mission.provenance.mathematicalProof, 'NOT_ESTABLISHED');
    assert.equal(mission.provenance.independentProof, false);
    assert.equal(await page.locator('#frontier-xss').count(), 0);
    const taskFile = await download(page, '#fm-download-task'),
      task = JSON.parse(taskFile.text);
    const htmlFile = await download(page, '#fm-download-desk');
    assert.equal(task.kind, 'successor-computer');
    assert.equal(task.html, htmlFile.text);
    assert.deepEqual(
      task.allowed_urls,
      mission.sources.map((entry) => entry.url)
    );
    assert.ok(task.goal.includes(mission.digest));
    assert.ok(
      task.goal.includes(
        'sha256:' + createHash('sha256').update(task.html).digest('hex')
      )
    );
    assert.match(task.goal, /research and draft this exact mission/);
    const brief = await download(page, '#fm-download-brief');
    assert.ok(
      brief.text.includes(mission.digest) &&
        brief.text.includes(requirements[2])
    );
    assert.ok(
      (await page.locator('#fm-work-prompt').inputValue()).includes(
        mission.digest
      )
    );
    const original = await download(page, '#fm-download-mission');
    const originalPack = JSON.parse(original.text);
    assert.deepEqual(
      (await restoreFrontierWorkspace(original.text)).mission,
      mission
    );
    provenance(originalPack.workspace);
    for (const invalid of ['{', 'x'.repeat(512001)]) {
      await upload(page, '#fm-import', invalid, 'invalid-package.json');
      assert.deepEqual(await read(page, '#fm-mission-json'), mission);
      assert.equal(await page.locator('#fm-title').inputValue(), mission.title);
      assert.equal(await page.locator('#fm-results').isVisible(), true);
      assert.match(
        await page.locator('#fm-status').textContent(),
        /valid JSON|import size/i
      );
    }
    checks.push(
      'Mission Studio: first preparation locks controls, rejects stale edits under delayed hashing, and malformed or oversized imports preserve the exact prepared mission'
    );
    checks.push(
      'Mission Studio: homepage first action opens a custom public mission; exact native ComputerTask, desk HTML, allowed source URLs, readable brief and Work prompt share the sealed request without claiming execution'
    );

    const deskURL = new URL(
      await page.locator('#fm-public-desk').getAttribute('href'),
      page.url()
    ).href;
    await page.goto(deskURL, { waitUntil: 'networkidle' });
    await idleDesk(page);
    await page.waitForFunction(
      (digest) =>
        document.getElementById('fd-mission-digest').textContent === digest,
      mission.digest
    );
    assert.deepEqual(
      await page.locator('#fd-requirements li').allTextContents(),
      requirements
    );
    assert.ok(
      (await page.locator('#fd-sources').textContent()).includes(hostile)
    );
    assert.equal(await page.locator('#frontier-xss').count(), 0);
    const strategy =
      'QA-authored draft. Compare sequential reading, independent argument mapping and a combined omission challenge. No method has been executed.';
    const experiment =
      'PLANNED, NOT RUN: freeze the combined method, compare against the incumbent and strongest alternative on fresh public evidence, record material errors and complete review cost.';
    const evidence =
      'The supplied source is owner-entered and unverified. Provider identity and spending are unknown. No proof, business advantage or completed experiment is claimed.';
    await page.locator('#fd-strategy').focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(strategy);
    await page.locator('#fd-experiments').fill(experiment);
    await page.locator('#fd-evidence').fill(evidence);
    await page.locator('#fd-save').focus();
    await page.keyboard.press('Enter');
    await idleDesk(page);
    let workspace = await read(page, '#fd-result');
    assert.equal(workspace.kind, 'FrontierMissionWorkspace');
    assert.equal(workspace.strategyLedger, strategy);
    assert.equal(workspace.experimentLedger, experiment);
    assert.equal(workspace.evidenceLedger, evidence);
    provenance(workspace);
    await page
      .locator('#fd-proposal')
      .fill(
        'Map the arguments independently before searching for consequential omissions; preserve the original decision.'
      );
    await page
      .locator('#fd-mapping')
      .fill(
        requirements
          .map((item, index) => `${index + 1}. Preserved unchanged: ${item}`)
          .join('\n')
      );
    await page.locator('#fd-propose').click();
    await idleDesk(page);
    workspace = await read(page, '#fd-result');
    assert.equal(workspace.reframing.status, 'PROPOSED');
    assert.equal(workspace.reframing.ownerApproval, null);
    await page.locator('#fd-owner').fill('QA owner attestation');
    await page
      .locator('#fd-reason')
      .fill(
        'Approve this exact comparison experiment while preserving every original requirement.'
      );
    await page.locator('#fd-approve').click();
    await idleDesk(page);
    assert.equal((await read(page, '#fd-result')).reframing.status, 'PROPOSED');
    await page.locator('#fd-preserve').check();
    await page.locator('#fd-approve').click();
    await idleDesk(page);
    const approved = await read(page, '#fd-result');
    assert.equal(approved.reframing.status, 'OWNER_APPROVED_FOR_EXPERIMENT');
    assert.equal(
      approved.reframing.ownerApproval.hardRequirementsPreserved,
      true
    );
    assert.ok(approved.reframing.ownerApproval.formulationDigest);
    provenance(approved);
    assert.deepEqual(
      await page.locator('#fd-requirements li').allTextContents(),
      requirements
    );
    const approvedFile = await download(page, '#fd-export');
    assert.deepEqual(
      (await restoreFrontierWorkspace(approvedFile.text)).workspace,
      approved
    );
    await page
      .locator('#fd-mapping')
      .fill(
        'An edited mapping requires a new owner decision for every unchanged requirement.'
      );
    assert.equal(await page.locator('#fd-preserve').isChecked(), false);
    const changedMapping = JSON.parse(
      (await download(page, '#fd-export')).text
    ).workspace;
    assert.equal(changedMapping.reframing.status, 'PROPOSED');
    assert.equal(changedMapping.reframing.ownerApproval, null);
    await page.locator('#fd-owner').fill('QA pending approval owner');
    await page
      .locator('#fd-reason')
      .fill(
        'This approval must be cancelled if its exact mapping changes while hashing.'
      );
    await page.locator('#fd-preserve').check();
    await holdDigests(page);
    try {
      await page.locator('#fd-approve').click();
      await waitForHeldDigest(page);
      assert.equal(await page.locator('#fd-mapping').isDisabled(), true);
      assert.equal(await page.locator('#fd-export').isDisabled(), true);
      assert.equal(await page.locator('#fd-import').isDisabled(), true);
      await editDuringAction(
        page,
        '#fd-mapping',
        'Changed while approval was pending; no approval may bind this mapping.'
      );
    } finally {
      await releaseDigests(page);
    }
    await idleDesk(page);
    assert.equal(await page.locator('#fd-preserve').isChecked(), false);
    assert.deepEqual(
      await read(page, '#fd-result'),
      changedMapping,
      'A stale approval cannot overwrite the last saved workspace'
    );
    assert.match(
      await page.locator('#fd-status').textContent(),
      /changed during this action/
    );
    const cancelledApproval = JSON.parse(
      (await download(page, '#fd-export')).text
    ).workspace;
    assert.equal(cancelledApproval.reframing.status, 'PROPOSED');
    assert.equal(cancelledApproval.reframing.ownerApproval, null);
    await upload(page, '#fd-import', approvedFile.text);
    await idleDesk(page);
    assert.equal(await page.locator('#fd-preserve').isChecked(), true);
    await page
      .locator('#fd-proposal')
      .fill('A revised comparison must receive a new owner decision.');
    assert.equal(await page.locator('#fd-preserve').isChecked(), false);
    const editedFile = await download(page, '#fd-export');
    const editedPack = JSON.parse(editedFile.text);
    assert.equal(editedPack.workspace.reframing.status, 'PROPOSED');
    assert.equal(editedPack.workspace.reframing.ownerApproval, null);
    assert.equal(
      JSON.parse(approvedFile.text).workspace.reframing.status,
      'OWNER_APPROVED_FOR_EXPERIMENT'
    );
    assert.notEqual(editedPack.workspace.digest, approved.digest);
    checks.push(
      'Mission Studio: actual keyboard and mouse edit strategy, planned experiments and evidence; exact owner-attested reframing preserves hard requirements and editing it clears approval while prior exports remain unchanged'
    );

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
        await fresh.goto(url + route + 'desk/', { waitUntil: 'networkidle' });
        await idleDesk(fresh);
        assert.equal(await fresh.locator('#fd-save').isDisabled(), true);
        await upload(fresh, '#fd-import', approvedFile.text);
        await idleDesk(fresh);
        assert.deepEqual(await read(fresh, '#fd-result'), approved);
        assert.equal(
          await fresh.locator('#fd-strategy').inputValue(),
          strategy
        );
        for (const invalid of ['{', 'x'.repeat(512001)]) {
          await upload(fresh, '#fd-import', invalid, 'invalid-package.json');
          await idleDesk(fresh);
          assert.deepEqual(await read(fresh, '#fd-result'), approved);
          assert.equal(
            await fresh.locator('#fd-strategy').inputValue(),
            strategy
          );
          assert.equal(await fresh.locator('#fd-preserve').isChecked(), true);
          assert.match(
            await fresh.locator('#fd-status').textContent(),
            /valid JSON|import size/i
          );
        }
        await fresh
          .locator('#fd-strategy')
          .fill(strategy + ' Unsaved late revision.');
        await holdDigests(fresh);
        try {
          await fresh.locator('#fd-save').click();
          await waitForHeldDigest(fresh);
          assert.equal(await fresh.locator('#fd-import').isDisabled(), true);
          assert.equal(await fresh.locator('#fd-save').isDisabled(), true);
          assert.equal(await fresh.locator('#fd-export').isDisabled(), true);
          await fresh.locator('#fd-import').dispatchEvent('change');
          await editDuringAction(
            fresh,
            '#fd-strategy',
            strategy + ' Latest revision while save was pending.'
          );
        } finally {
          await releaseDigests(fresh);
        }
        await idleDesk(fresh);
        assert.deepEqual(
          await read(fresh, '#fd-result'),
          approved,
          'A pending save/import cannot overwrite edits'
        );
        assert.match(
          await fresh.locator('#fd-strategy').inputValue(),
          /Latest revision/
        );
        await upload(fresh, '#fd-import', approvedFile.text);
        await idleDesk(fresh);
        assert.equal(
          await fresh.locator('#fd-strategy').inputValue(),
          strategy
        );
        for (const change of [
          (pack) => {
            pack.mission.hardRequirements[0] = 'Silently changed requirement';
          },
          (pack) => {
            pack.workspace.provenance.executionStatus =
              'VERIFIED_PROVIDER_COMPLETION';
            pack.workspace.provenance.independentProof = true;
          },
        ]) {
          const tampered = JSON.parse(approvedFile.text);
          change(tampered);
          await upload(fresh, '#fd-import', tampered, 'tampered.json');
          await idleDesk(fresh);
          assert.deepEqual(await read(fresh, '#fd-result'), approved);
          assert.match(
            await fresh.locator('#fd-status').textContent(),
            /differ|changed|cannot|invalid|draft/i
          );
        }
        await fresh.goto('about:blank');
        await fresh.setContent(task.html, { waitUntil: 'load' });
        await idleDesk(fresh);
        assert.equal(await fresh.locator('#fd-approve').isVisible(), false);
        await fresh.locator('#fd-strategy').fill(strategy);
        await fresh.locator('#fd-experiments').fill(experiment);
        await fresh.locator('#fd-evidence').fill(evidence);
        await fresh.locator('#fd-save').focus();
        await fresh.keyboard.press('Enter');
        await idleDesk(fresh);
        const draft = await read(fresh, '#fd-result');
        assert.equal(draft.kind, 'FrontierDeskDraft');
        const sealedDraft = await importFrontierDeskDraft(mission, draft);
        assert.equal(sealedDraft.strategyLedger, strategy);
        provenance(sealedDraft);
      } finally {
        removeFresh();
      }
    } finally {
      await restoreContext.close();
    }
    checks.push(
      'Mission Studio: delayed approval and save lock export/import, reject concurrent stale edits, and exact proposal or mapping changes clear approval; malformed, oversized and tampered imports preserve the prior workspace'
    );
    checks.push(
      'Mission Studio: sealed workspace restores in a fresh context; tampered requirements and fabricated provider proof are rejected; the real exported native desk produces unverified drafts and cannot self-approve an owner'
    );

    for (const language of ['en', 'fr']) {
      const presetMission = await setup(page, url, language, 'mathematics');
      assert.equal(presetMission.preset, 'mathematics');
      assert.equal(
        presetMission.provenance.mathematicalProof,
        'NOT_ESTABLISHED'
      );
      assert.equal(presetMission.provenance.modelPerformance, 'NOT_EVALUATED');
      assert.ok(
        presetMission.sources.every(
          (item) => item.retrievalStatus === 'NOT_RETRIEVED'
        )
      );
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      const target = new URL(
        await page.locator('#fm-public-desk').getAttribute('href'),
        page.url()
      ).href;
      await page.locator('main details').evaluateAll((details) => {
        for (const detail of details) detail.open = true;
      });
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1050 });
        await page.evaluate(() => document.activeElement?.blur());
        await geometry(page, `studio ${language} ${width}`);
        await a11y(`frontier-mission-${language}-${width}`);
        if (width === 390 || width === 1440) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(
              artifacts,
              `frontier-mission-${language}-${width}.png`
            ),
          });
        }
      }
      await page
        .locator('#fm-question')
        .fill('Changed mission requiring a newly prepared task.');
      assert.equal(await page.locator('#fm-results').isVisible(), false);
      await page.goto(target, { waitUntil: 'networkidle' });
      await idleDesk(page);
      provenance(await read(page, '#fd-result'));
      await page
        .locator('#fd-evidence')
        .fill(
          'QA-entered research note. No mathematical result or provider execution is established.'
        );
      await page.locator('#fd-save').focus();
      await page.keyboard.press('Enter');
      await idleDesk(page);
      await page.locator('main details').evaluateAll((details) => {
        for (const detail of details) detail.open = true;
      });
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1050 });
        await geometry(page, `workspace ${language} ${width}`);
        await a11y(`frontier-workspace-${language}-${width}`);
        if (width === 390 || width === 1440) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(
              artifacts,
              `frontier-workspace-${language}-${width}.png`
            ),
          });
        }
      }
    }
    const noJS = await page
      .context()
      .browser()
      .newContext({
        javaScriptEnabled: false,
        viewport: { width: 390, height: 844 },
      });
    try {
      const fallback = await noJS.newPage(),
        removeFallback = track(fallback);
      try {
        await fallback.goto(url, { waitUntil: 'networkidle' });
        assert.equal(
          await fallback.locator('[data-alpha-flagship]').getAttribute('href'),
          new URL(url).pathname + route
        );
        assert.equal(
          await fallback
            .locator('#successor-flagship a[hreflang="fr"]')
            .getAttribute('href'),
          new URL(url).pathname + route + 'fr/'
        );
        await fallback.locator('[data-alpha-flagship]').focus();
        await fallback.keyboard.press('Enter');
        await fallback.waitForURL(url + route);
        assert.match(
          await fallback.locator('noscript').textContent(),
          /JavaScript/
        );
        assert.equal(await fallback.locator('#fm-prepare').isDisabled(), true);
        await fallback.locator('.fm-supporting').evaluate((detail) => {
          detail.open = true;
        });
        assert.equal(
          await fallback
            .locator('a[href$="/docs/successor/MISSION_STUDIO.md"]')
            .isVisible(),
          true
        );
        const french = fallback.locator('.fm-topline a[hreflang="fr"]');
        await french.focus();
        await fallback.keyboard.press('Enter');
        await fallback.waitForURL(url + route + 'fr/');
        assert.equal(await fallback.locator('html').getAttribute('lang'), 'fr');
      } finally {
        removeFallback();
      }
    } finally {
      await noJS.close();
    }
    checks.push(
      'Mission Studio: real mathematics brief and draft workspace work in EN/FR at 320/390/768/1440px with zero overflow or WCAG A/AA violations; edited briefs invalidate tasks and no-JavaScript guide/language links remain available'
    );
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(dialogs, []);
    fs.writeFileSync(
      path.join(artifacts, 'frontier-mission-browser-qa.json'),
      JSON.stringify(
        {
          passed: true,
          checks: checks.filter((entry) => entry.startsWith('Mission Studio:')),
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
    await page.goto(url, { waitUntil: 'networkidle' });
  }
}

export { verifyFrontierMissionStudio as verifyFrontierMission };

async function standalone() {
  const { chromium } = await import('playwright');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..'
    ),
    output = path.resolve(
      process.env.FRONTIER_MISSION_QA_OUTPUT || path.join(root, 'build/pages')
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
        result.violations.map((entry) => ({
          id: entry.id,
          nodes: entry.nodes.map((node) => node.target),
        })),
        [],
        label
      );
    };
    await verifyFrontierMissionStudio({
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
