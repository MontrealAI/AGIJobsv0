import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  saveEditableDraft,
  savedDraftMaxBytes,
} from '../../website/assets/work-model.mjs';
import {
  openStartProgress,
  saveStartProgress,
} from '../../website/assets/start-state.mjs';

export async function verifyStartRecovery({
  page,
  context,
  url,
  artifacts,
  a11y,
  checks,
}) {
  const progressKey = new URL(url).pathname + 'start-progress/v1';
  const transferKey = new URL(url).pathname + 'start-draft/v1';
  const route = (lang) => url + 'start/' + (lang === 'fr' ? 'fr/' : '');
  const initial = {
    step: 0,
    role: '',
    type: 'research',
    goal: '',
    largeText: false,
  };
  const draftFields = (goal, type = 'research') => ({
    type,
    goal,
    scope: '',
    sources: '',
    dataClass: 'public',
    runtime: 'openclaw',
    workerProfile: '',
    reward: '',
    runMinutes: '',
    reviewerMinutes: '',
  });
  const readProgress = async () => {
    const saved = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      progressKey
    );
    assert.notEqual(
      saved,
      null,
      'Changed guide state is recoverable in this tab'
    );
    return openStartProgress(saved);
  };
  const fresh = async (lang) => {
    await page.goto(route(lang));
    await page.evaluate(
      (keys) => keys.forEach((key) => sessionStorage.removeItem(key)),
      [progressKey, transferKey]
    );
    await page.reload();
    await page.locator('#wizard').waitFor({ state: 'visible' });
  };
  const importFile = async (name, content) => {
    await page.locator('#open-start-draft').setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(content, 'utf8'),
    });
    await page.waitForFunction(
      () => document.getElementById('open-start-draft').value === ''
    );
    assert.notEqual(await page.locator('#guide-status').innerText(), '');
  };
  const ordinaryNotes = {};

  for (const lang of ['en', 'fr']) {
    const other = lang === 'en' ? 'fr' : 'en';
    const goal =
      lang === 'en'
        ? '  Improve a public website’s navigation.\nKeep keyboard access and explain each change.  '
        : '  Améliorer la navigation d’un site public.\nPréserver l’accès au clavier et expliquer chaque modification.  ';
    await fresh(lang);
    ordinaryNotes[lang] = await page.locator('#draft-session-note').innerText();
    assert.notEqual(ordinaryNotes[lang], '');
    await page.locator('[name="role"][value="buyer"]').check();
    await page.locator('#guide-next').click();
    await page.locator('[data-preset="feature"]').click();
    await page.locator('#start-goal').fill(goal);
    await page.locator('#large-text').click();
    await page.locator('#guide-next').click();
    const expected = {
      step: 2,
      role: 'buyer',
      type: 'feature',
      goal,
      largeText: true,
    };
    assert.deepEqual(await readProgress(), expected);
    for (const target of [other, lang]) {
      await page.locator(`.preferences nav a[lang="${target}"]`).click();
      await page.waitForURL(route(target));
      await page.locator('[data-step="2"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#start-goal').inputValue(), goal);
      assert.equal(
        await page.locator('#large-text').getAttribute('aria-pressed'),
        'true'
      );
      assert.deepEqual(await readProgress(), expected);
      await page.reload();
      await page.locator('[data-step="2"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#start-goal').inputValue(), goal);
      assert.deepEqual(await readProgress(), expected);
    }
    await page.locator('#guide-back').click();
    await page.locator('[data-preset="research"]').click();
    assert.notEqual(await page.locator('#start-goal').inputValue(), goal);
    await page.locator('#undo-example').click();
    assert.equal(await page.locator('#start-goal').inputValue(), goal);
    assert.equal((await readProgress()).type, 'feature');
    await page.locator('#guide-next').click();
    await page.locator('#guide-restart').click();
    assert.equal(await page.locator('[data-step="0"]').isVisible(), true);
    assert.equal(
      await page.locator('[name="role"][value="buyer"]').isChecked(),
      true
    );
    assert.equal(await page.locator('#start-goal').inputValue(), goal);
    const beforeClear = await readProgress();
    await page.evaluate(({ key, text }) => sessionStorage.setItem(key, text), {
      key: transferKey,
      text: saveEditableDraft(draftFields(goal, 'feature')),
    });
    await page.locator('#clear-start-progress').click();
    assert.equal(await page.locator('[data-step="0"]').isVisible(), true);
    assert.equal(await page.locator('[name="role"]:checked').count(), 0);
    assert.equal(await page.locator('#start-goal').inputValue(), '');
    assert.equal(
      await page.locator('#large-text').getAttribute('aria-pressed'),
      'true'
    );
    assert.deepEqual(
      await page.evaluate(
        (keys) => keys.map((key) => sessionStorage.getItem(key)),
        [progressKey, transferKey]
      ),
      [null, null]
    );
    await page.locator('#undo-clear').click();
    assert.deepEqual(await readProgress(), beforeClear);
    assert.equal(await page.locator('#start-goal').inputValue(), goal);
    assert.equal(
      await page.evaluate((key) => sessionStorage.getItem(key), transferKey),
      null
    );
    checks.push(
      `onboarding ${lang}: language changes, reload, text preference, example undo and reversible clear preserve authored work`
    );

    const partial = lang === 'en' ? 'Compare' : 'Comparer';
    await importFile(
      'unfinished-guide.json',
      saveEditableDraft(draftFields(partial, 'tests'))
    );
    await page.locator('[data-step="1"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#start-goal').inputValue(), partial);
    assert.deepEqual(await readProgress(), {
      step: 1,
      role: 'buyer',
      type: 'tests',
      goal: partial,
      largeText: true,
    });
    const preserved = await readProgress();
    const advanced = [
      ['scope', 'A detailed operator scope.'],
      ['sources', 'https://example.org/'],
      ['workerProfile', 'approved-worker'],
      ['reward', '1500'],
      ['runMinutes', '60'],
      ['reviewerMinutes', '15'],
      ['runtime', 'work'],
      ['dataClass', 'licensed'],
      ['type', 'performance'],
    ].map(([key, value]) => [
      key + '.json',
      saveEditableDraft({
        ...draftFields('Do not replace my unfinished request.'),
        [key]: value,
      }),
    ]);
    const authority = JSON.parse(
      saveEditableDraft(draftFields('Do not replace my unfinished request.'))
    );
    authority.approved = true;
    const malformedUTF8 = Buffer.from(
      saveEditableDraft(
        draftFields('An invalid byte must not alter this request.')
      ),
      'utf8'
    );
    const corruptedAt = malformedUTF8.indexOf('An invalid byte');
    assert.ok(corruptedAt > 0);
    malformedUTF8[corruptedAt] = 0xff;
    for (const [name, content] of [
      ['broken.json', '{'],
      ['oversized.json', 'a'.repeat(savedDraftMaxBytes + 1)],
      ['authority.json', JSON.stringify(authority)],
      ['malformed-utf8.json', malformedUTF8],
      ...advanced,
    ]) {
      await importFile(name, content);
      assert.equal(
        await page.locator('#start-goal').inputValue(),
        partial,
        name
      );
      assert.equal(
        await page.locator('[data-step="1"]').isVisible(),
        true,
        name
      );
      assert.deepEqual(await readProgress(), preserved, name);
    }
    await page.evaluate(() => {
      window.__startNativeArrayBuffer = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = async function () {
        const bytes = await window.__startNativeArrayBuffer.call(this);
        await new Promise((resolve) => {
          window.__releaseStartFileRead = resolve;
        });
        return bytes;
      };
    });
    try {
      const beginDelayedRead = async () => {
        await page.evaluate(() => {
          delete window.__releaseStartFileRead;
        });
        await page.locator('#open-start-draft').setInputFiles({
          name: 'slow-guide.json',
          mimeType: 'application/json',
          buffer: Buffer.from(
            saveEditableDraft(
              draftFields('An older file must not replace new work.')
            ),
            'utf8'
          ),
        });
        await page.waitForFunction(
          () => typeof window.__releaseStartFileRead === 'function'
        );
      };
      const completeDelayedRead = async () => {
        await page.evaluate(() => window.__releaseStartFileRead());
        await page.waitForFunction(
          () => document.getElementById('open-start-draft').value === ''
        );
        assert.match(
          await page.locator('#guide-status').innerText(),
          lang === 'en' ? /Choose the file again/ : /Choisissez à nouveau/
        );
      };
      await beginDelayedRead();
      const newerGoal =
        lang === 'en'
          ? 'Keep these words I entered while the file was opening.'
          : 'Conserver les mots saisis pendant l’ouverture du fichier.';
      await page.locator('#start-goal').fill(newerGoal);
      const newerState = await readProgress();
      await completeDelayedRead();
      assert.equal(await page.locator('#start-goal').inputValue(), newerGoal);
      assert.deepEqual(await readProgress(), newerState);
      await beginDelayedRead();
      await page.locator('#clear-start-progress').click();
      await completeDelayedRead();
      assert.equal(await page.locator('[data-step="0"]').isVisible(), true);
      assert.equal(await page.locator('#start-goal').inputValue(), '');
      assert.equal(await page.locator('[name="role"]:checked').count(), 0);
      assert.deepEqual(
        await page.evaluate(
          (keys) => keys.map((key) => sessionStorage.getItem(key)),
          [progressKey, transferKey]
        ),
        [null, null]
      );
      await page.locator('#undo-clear').click();
      assert.deepEqual(await readProgress(), newerState);
    } finally {
      await page.evaluate(() => {
        File.prototype.arrayBuffer = window.__startNativeArrayBuffer;
        delete window.__startNativeArrayBuffer;
        delete window.__releaseStartFileRead;
      });
    }
    checks.push(
      `onboarding ${lang}: corrupt UTF-8 is rejected and delayed file reads cannot replace newer edits or cleared progress`
    );
    await page.locator('#start-goal').fill(goal);
    await page.locator('#guide-next').click();
    const downloaded = page.waitForEvent('download');
    await page.locator('#save-readable-brief').click();
    const download = await downloaded;
    assert.match(download.suggestedFilename(), /\.txt$/i);
    const brief = fs.readFileSync(await download.path(), 'utf8');
    assert.ok(
      brief.includes(goal),
      'Readable brief preserves the exact authored request'
    );
    assert.match(
      brief,
      lang === 'en'
        ? /not approved|not authorized|unapproved|no (?:job|work|execution|agent)|nothing (?:has|was)/i
        : /non approuv|non autoris|aucun|aucune|n[’']autorise|ne .*pas/i
    );
    await page.evaluate(() => {
      window.__guidePrintCalls = 0;
      window.print = () => {
        window.__guidePrintCalls += 1;
      };
    });
    await page.locator('#print-start-brief').click();
    assert.equal(await page.evaluate(() => window.__guidePrintCalls), 1);
    await a11y('onboarding-recovery-' + lang);
    await page.screenshot({
      path: path.join(artifacts, `onboarding-recovery-${lang}.png`),
      fullPage: true,
    });
    checks.push(
      `onboarding ${lang}: unfinished files reopen, invalid and advanced files preserve the draft, readable download and print remain unapproved`
    );
  }

  const wouldRestore = {
    ...initial,
    step: 2,
    role: 'buyer',
    goal: 'An injected request must not be restored.',
  };
  const valid = JSON.parse(saveStartProgress(wouldRestore));
  for (const invalid of [
    '{',
    saveStartProgress(wouldRestore).padEnd(16_385),
    JSON.stringify({ ...valid, approved: true }),
    JSON.stringify({
      ...valid,
      fields: { ...wouldRestore, authorization: { execute: true } },
    }),
    JSON.stringify({ ...valid, fields: { ...wouldRestore, role: '' } }),
  ]) {
    await page.goto(route('en'));
    await page.evaluate(({ key, text }) => sessionStorage.setItem(key, text), {
      key: progressKey,
      text: invalid,
    });
    await page.reload();
    await page.locator('[data-step="0"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#start-goal').inputValue(), '');
    assert.equal(await page.locator('[name="role"]:checked').count(), 0);
    assert.equal(await page.locator('#draft-session-note').isVisible(), true);
  }
  checks.push(
    'onboarding: malformed, oversized, impossible and authority-bearing session state is never restored'
  );

  const blocked = await context.browser().newContext({
    viewport: { width: 1024, height: 900 },
    reducedMotion: 'reduce',
  });
  try {
    await blocked.addInitScript(() => {
      for (const name of ['getItem', 'setItem', 'removeItem'])
        Storage.prototype[name] = () => {
          throw new Error('Storage blocked for this test');
        };
    });
    const blockedPage = await blocked.newPage();
    const errors = [];
    blockedPage.on('pageerror', (error) => errors.push(error.message));
    for (const lang of ['en', 'fr']) {
      await blockedPage.goto(route(lang));
      await blockedPage.locator('#wizard').waitFor({ state: 'visible' });
      const warning = await blockedPage
        .locator('#draft-session-note')
        .innerText();
      assert.notEqual(warning, '');
      assert.notEqual(
        warning,
        ordinaryNotes[lang],
        'Unavailable recovery has a distinct warning'
      );
      await blockedPage.locator('[name="role"][value="buyer"]').check();
      await blockedPage.locator('#guide-next').click();
      await blockedPage.locator('[data-preset="research"]').click();
      await blockedPage.locator('#guide-next').click();
      assert.equal(
        await blockedPage.locator('[data-step="2"]').isVisible(),
        true
      );
      await blockedPage.locator('#planner-handoff').click();
      assert.equal(blockedPage.url(), route(lang));
      assert.equal(
        await blockedPage.locator('#planner-fallback').isVisible(),
        true
      );
      assert.notEqual(
        await blockedPage.locator('#guide-status').innerText(),
        ''
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await blocked.close();
  }
  checks.push(
    'onboarding: blocked storage has localized recovery guidance while both language journeys remain usable'
  );
  await page.evaluate(
    (keys) => keys.forEach((key) => sessionStorage.removeItem(key)),
    [progressKey, transferKey]
  );
}
