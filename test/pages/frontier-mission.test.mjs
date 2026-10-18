import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import {
  FRONTIER_MISSION_PRESETS,
  createFrontierMission,
  createFrontierWorkspace,
  createFrontierComputerTask,
  importFrontierDeskDraft,
} from '../../packages/successor-core/src/frontier-mission.mjs';
import { renderFrontierDeskDocument } from '../../website/assets/frontier-desk.mjs';
import { renderFrontierMissionPage } from '../../scripts/pages/frontier-mission.mjs';

const input = (preset = 'business') => ({
  ...structuredClone(FRONTIER_MISSION_PRESETS[preset]),
  rights: {
    publicNonPersonal: true,
    license:
      'Original public nonpersonal test inputs, permitted for packaging and export.',
  },
  sources: [
    {
      id: 'source-1',
      title: 'User-supplied public evidence',
      url: 'https://www.example.org/research',
      text: 'Original test source data. No external source retrieval or experiment has occurred.',
    },
  ],
});
const sourceMission = (preset) => createFrontierMission(input(preset));

test('business and mathematical starting briefs prepare actual tasks without claiming completed research, a proved theorem or an advantage', async () => {
  for (const preset of ['business', 'mathematics']) {
    const mission = await sourceMission(preset),
      workspace = await createFrontierWorkspace(mission);
    assert.equal(mission.provenance.status, 'PLANNED_NOT_EXECUTED');
    assert.equal(mission.provenance.mathematicalProof, 'NOT_ESTABLISHED');
    assert.equal(mission.provenance.modelPerformance, 'NOT_EVALUATED');
    assert.equal(mission.sources[0].retrievalStatus, 'NOT_RETRIEVED');
    assert.equal(workspace.provenance.executionStatus, 'NOT_ATTESTED');
    assert.equal(
      workspace.provenance.classification,
      'USER_ENTERED_UNVERIFIED'
    );
    assert.equal(workspace.provenance.independentProof, false);
    assert.equal(workspace.provenance.authorityCreated, 'NONE');
    assert.match(workspace.experimentLedger, /No experiment has been run/);
    const html = renderFrontierDeskDocument(mission),
      task = await createFrontierComputerTask(mission, { html });
    assert.equal(task.kind, 'successor-computer');
    assert.equal(task.html, html);
    assert.deepEqual(
      task.allowed_urls,
      mission.sources.map((source) => source.url)
    );
    assert.ok(task.goal.includes(mission.digest));
    assert.ok(
      task.goal.includes(
        'sha256:' + createHash('sha256').update(html).digest('hex')
      )
    );
    assert.match(task.goal, /research and draft this exact mission/);
  }
});

test('the exported desk runs its real text controls and returns attributable drafts while the mission and proof status stay fixed', async () => {
  const mission = await sourceMission();
  const window = new JSDOM(renderFrontierDeskDocument(mission), {
    runScripts: 'dangerously',
  }).window;
  try {
    const document = window.document;
    assert.equal(
      document.querySelector('[data-frontier-desk]').dataset.ready,
      'true'
    );
    const text = {
      strategy:
        'QA-authored draft: compare the current workflow, a simpler redesign and a combined method. None has been executed.',
      experiments:
        'Planned only: compare on fresh public work under unchanged requirements. No result is asserted.',
      evidence:
        'Source-1 is supplied text, not retrieved evidence. Cost and provider execution remain unknown.',
    };
    for (const [id, value] of Object.entries(text)) {
      const field = document.getElementById(`fd-${id}`);
      field.value = value;
      field.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
    document.getElementById('fd-save').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const draft = JSON.parse(document.getElementById('fd-result').textContent);
    assert.equal(draft.kind, 'FrontierDeskDraft');
    assert.equal(draft.strategyLedger, text.strategy);
    assert.equal(draft.experimentLedger, text.experiments);
    assert.equal(draft.evidenceLedger, text.evidence);
    assert.equal(draft.missionDigest, mission.digest);
    const restored = await importFrontierDeskDraft(mission, draft);
    assert.equal(restored.provenance.executionStatus, 'NOT_ATTESTED');
    assert.equal(restored.provenance.independentProof, false);
    assert.equal(
      document.getElementById('fd-approve').hidden,
      true,
      'A native worker task cannot self-approve owner authority'
    );
    assert.deepEqual(
      [...document.querySelectorAll('#fd-requirements li')].map(
        (item) => item.textContent
      ),
      mission.hardRequirements
    );
    for (const field of document.querySelectorAll('input,textarea'))
      assert.ok(
        document.querySelector(`label[for="${field.id}"]`) ||
          field.closest('label'),
        `Missing label ${field.id}`
      );
  } finally {
    window.close();
  }
});

test('the real exported desk preserves hostile mission and source strings as inert data including script terminators', async () => {
  const values = input('mathematics');
  const hostile =
    '</script><script>globalThis.frontierCompromised=true</script><img id="frontier-injected" src=x onerror="globalThis.frontierCompromised=true">';
  values.title = hostile;
  values.sources[0].text = hostile;
  const mission = await createFrontierMission(values);
  const window = new JSDOM(
    renderFrontierDeskDocument(mission, { language: 'fr' }),
    { runScripts: 'dangerously' }
  ).window;
  try {
    assert.equal(window.frontierCompromised, undefined);
    assert.equal(window.document.querySelector('#frontier-injected'), null);
    assert.equal(window.document.querySelectorAll('[onerror]').length, 0);
    assert.equal(
      window.document.getElementById('fd-mission-title').textContent,
      hostile
    );
    assert.equal(
      window.document.querySelector('#fd-sources pre').textContent,
      hostile
    );
    assert.equal(window.document.documentElement.lang, 'fr');
    assert.equal(
      JSON.parse(window.document.getElementById('fd-config').textContent)
        .mission.sources[0].text,
      hostile
    );
  } finally {
    window.close();
  }
});

test('bilingual mission preparation starts with labelled custom work, plain navigation and no implicit execution', () => {
  for (const language of ['en', 'fr']) {
    const document = new JSDOM(
      renderFrontierMissionPage('/AGIJobsv0/', 'b'.repeat(40), language)
    ).window.document;
    assert.equal(document.querySelectorAll('main').length, 1);
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(
      document.querySelector('[data-frontier-mission]').lang,
      language
    );
    assert.equal(document.getElementById('fm-prepare').disabled, true);
    assert.equal(document.getElementById('fm-results').hidden, true);
    assert.equal(document.getElementById('fm-rights').checked, false);
    assert.equal(document.getElementById('fm-title').value, '');
    assert.equal(document.querySelectorAll('input[type=password]').length, 0);
    for (const field of document.querySelectorAll('input,textarea')) {
      assert.ok(
        document.querySelector(`label[for="${field.id}"]`) ||
          field.closest('label'),
        `Missing label: ${language} ${field.id}`
      );
      for (const id of (field.getAttribute('aria-describedby') || '')
        .split(' ')
        .filter(Boolean))
        assert.ok(document.getElementById(id));
    }
    assert.ok(
      document.querySelector(
        'a[href="https://github.com/MontrealAI/AGIJobsv0/blob/' +
          'b'.repeat(40) +
          '/docs/successor/MISSION_STUDIO.md"]'
      )
    );
    assert.ok(
      document.querySelector(
        'a[hreflang=fr][href="/AGIJobsv0/successor/mission/fr/"]'
      )
    );
    assert.match(document.querySelector('noscript').textContent, /JavaScript/);
  }
  assert.throws(
    () => renderFrontierMissionPage('/AGIJobsv0/', 'b'.repeat(40), 'unknown'),
    /Unsupported frontier mission language/
  );
});
