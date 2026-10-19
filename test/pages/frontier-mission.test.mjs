import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import {
  FRONTIER_MISSION_PRESETS,
  createFrontierMission,
  createFrontierWorkspace,
  sealFrontierWorkspace,
  proposeFrontierFormulation,
  approveFrontierFormulation,
  createFrontierComputerTask,
  importFrontierDeskDraft,
} from '../../packages/successor-core/src/frontier-mission.mjs';
import {
  renderFrontierDeskDocument,
  renderFrontierDeskMarkup,
  initFrontierDesk,
  safeFrontierJSON,
} from '../../website/assets/frontier-desk.mjs';
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

test('public desk approval stays revoked after control edits are reverted, until an explicit sealed approval is supplied', async () => {
  const mission = await sourceMission();
  const proposed = await proposeFrontierFormulation(
    mission,
    await createFrontierWorkspace(mission),
    {
      proposal:
        'Compare independent argument mapping while preserving every original requirement.',
      hardRequirementMapping:
        'All original requirements remain unchanged and must be checked separately.',
    }
  );
  const approved = await approveFrontierFormulation(mission, proposed, {
    ownerLabel: 'Original owner',
    reason:
      'Authorize only the exact experiment, without independent proof or operational authority.',
    hardRequirementsPreserved: true,
  });
  for (const language of ['en', 'fr']) {
    const window = new JSDOM(renderFrontierDeskMarkup(mission, { language }), {
      runScripts: 'outside-only',
    }).window;
    try {
      const api = window.eval(
        '(' +
          initFrontierDesk.toString() +
          ')(document.querySelector("[data-frontier-desk]"),' +
          safeFrontierJSON({ mission, workspace: approved, language }) +
          ')'
      );
      const document = window.document;
      assert.equal(document.getElementById('fd-owner').maxLength, 240);
      assert.equal(document.getElementById('fd-reason').maxLength, 2000);
      api.setWorkspace(await createFrontierWorkspace(mission));
      document.getElementById('fd-proposal').value =
        'First proposal on a previously unapproved workspace.';
      document
        .getElementById('fd-proposal')
        .dispatchEvent(new window.Event('input', { bubbles: true }));
      assert.doesNotMatch(
        document.getElementById('fd-status').textContent,
        /previous approval|approbation précédente|ancienne approbation|approbation antérieure/i
      );
      for (const id of ['owner', 'reason', 'preserve', 'proposal', 'mapping']) {
        for (const eventName of ['input', 'change']) {
          api.setWorkspace(approved);
          const field = document.getElementById('fd-' + id);
          const original = id === 'preserve' ? field.checked : field.value;
          const edit = (value) => {
            if (id === 'preserve') field.checked = value;
            else field.value = value;
            field.dispatchEvent(new window.Event(eventName, { bubbles: true }));
          };
          edit(id === 'preserve' ? false : original + ' Edited.');
          for (const phase of ['edited', 'reverted']) {
            if (phase === 'reverted') edit(original);
            const draft = api.collect();
            assert.equal(
              draft.reframing.status,
              'PROPOSED',
              language + ' ' + id + ' ' + eventName + ' ' + phase
            );
            assert.equal(draft.reframing.ownerApproval, null);
            assert.equal(
              document.getElementById('fd-approval-status').textContent,
              'PROPOSED'
            );
            const visible = JSON.parse(
              document.getElementById('fd-result').textContent
            );
            assert.equal(visible.kind, 'FrontierDeskDraft');
            assert.equal(
              Object.hasOwn(visible.reframing, 'ownerApproval'),
              false
            );
            assert.equal(
              document
                .getElementById('fd-result')
                .textContent.includes('OWNER_APPROVED_FOR_EXPERIMENT'),
              false
            );
            assert.equal(draft.provenance.independentProof, false);
            assert.equal(draft.provenance.authorityCreated, 'NONE');
          }
          if (id === 'preserve')
            assert.equal(
              field.checked,
              true,
              'Checking the attestation must remain possible after revocation'
            );
        }
      }
      for (const id of ['owner', 'reason', 'preserve']) {
        api.setWorkspace(approved);
        const field = document.getElementById('fd-' + id);
        if (id === 'preserve') field.checked = false;
        else field.value += ' Changed without an input event.';
        assert.equal(
          api.collect().reframing.ownerApproval,
          null,
          'Collection must defensively compare ' + id
        );
      }
      api.setWorkspace(approved);
      assert.equal(
        api.collect().reframing.status,
        'OWNER_APPROVED_FOR_EXPERIMENT'
      );
      assert.equal(document.getElementById('fd-preserve').checked, true);
    } finally {
      window.close();
    }
  }
});

test('the exported isolated reader offers the same exact source in a separate browser tab and returns focus without discarding work', async () => {
  const mission = await sourceMission();
  for (const language of ['en', 'fr']) {
    const window = new JSDOM(
      renderFrontierDeskDocument(mission, { language }),
      {
        runScripts: 'dangerously',
        beforeParse(window) {
          window.HTMLElement.prototype.scrollIntoView = () => {};
        },
      }
    ).window;
    try {
      const document = window.document;
      const field = document.getElementById('fd-strategy');
      field.value =
        'An unsaved original strategy draft remains while examining a permitted source.';
      field.dispatchEvent(new window.Event('input', { bubbles: true }));
      const link = document.querySelector('#fd-sources a');
      link.closest('details').open = true;
      link.click();
      const frame = document.getElementById('fd-source-frame');
      assert.equal(frame.getAttribute('src'), mission.sources[0].url);
      assert.equal(frame.getAttribute('sandbox'), '');
      assert.equal(frame.referrerPolicy, 'no-referrer');
      const fallback = document.querySelector(
        '#fd-source-viewer a[target="_blank"]'
      );
      assert.equal(fallback.href, mission.sources[0].url);
      assert.equal(fallback.rel, 'noopener noreferrer');
      assert.match(
        fallback.textContent,
        language === 'fr'
          ? /source exacte.*onglet/i
          : /exact source.*browser tab/i
      );
      assert.equal(
        document.activeElement.id,
        'fd-source-close',
        'The native primary reader keeps its first keyboard action'
      );
      document.getElementById('fd-source-close').click();
      assert.equal(document.getElementById('fd-source-viewer').hidden, true);
      assert.equal(document.getElementById('fd-source-frame'), null);
      assert.equal(document.activeElement, link);
      assert.equal(
        field.value,
        'An unsaved original strategy draft remains while examining a permitted source.'
      );
    } finally {
      window.close();
    }
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

test('a maximum-source Unicode workspace initializes and saves all real desk fields without truncating content or inheriting owner approval', async () => {
  const pattern = '<>&\u2028\u2029数学🧪';
  const fullText = (label, max) => {
    const head = label + ': ',
      end = ' END ' + label;
    const size = max - head.length - end.length;
    return (
      head +
      pattern.repeat(Math.floor(size / pattern.length)) +
      'x'.repeat(size % pattern.length) +
      end
    );
  };
  const values = input();
  values.title =
    '</script><script>globalThis.frontierCapacityCompromised=true</script>';
  values.sources = [12000, 12000, 12000, 12000, 12000, 4000].map(
    (size, index) => ({
      id: 'large-source-' + index,
      title: 'Full supplied source ' + index,
      url: 'https://www.example.org/large-source-' + index,
      text: fullText('source-' + index, size),
    })
  );
  const mission = await createFrontierMission(values);
  let workspace = await sealFrontierWorkspace(mission, {
    ...(await createFrontierWorkspace(mission)),
    strategyLedger: fullText('strategy', 18000),
    experimentLedger: fullText('experiments', 18000),
    evidenceLedger: fullText('evidence', 18000),
  });
  workspace = await proposeFrontierFormulation(mission, workspace, {
    proposal: fullText('proposal', 6000),
    hardRequirementMapping: fullText('mapping', 6000),
  });
  workspace = await approveFrontierFormulation(mission, workspace, {
    ownerLabel: 'Source package owner',
    reason:
      'Exact experiment only, with unverified claims and no operational authority.',
    hardRequirementsPreserved: true,
  });
  const window = new JSDOM(
    renderFrontierDeskDocument(mission, { language: 'fr', workspace }),
    { runScripts: 'dangerously' }
  ).window;
  try {
    const document = window.document;
    assert.equal(window.frontierCapacityCompromised, undefined);
    assert.deepEqual(
      [...document.querySelectorAll('#fd-sources pre')].map(
        (item) => item.textContent
      ),
      mission.sources.map((source) => source.text)
    );
    for (const [id, value] of [
      ['strategy', workspace.strategyLedger],
      ['experiments', workspace.experimentLedger],
      ['evidence', workspace.evidenceLedger],
      ['proposal', workspace.reframing.proposal],
      ['mapping', workspace.reframing.hardRequirementMapping],
    ])
      assert.equal(document.getElementById('fd-' + id).value, value);
    document.getElementById('fd-save').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const draft = JSON.parse(document.getElementById('fd-result').textContent);
    assert.equal(draft.strategyLedger, workspace.strategyLedger);
    assert.equal(draft.experimentLedger, workspace.experimentLedger);
    assert.equal(draft.evidenceLedger, workspace.evidenceLedger);
    assert.equal(draft.reframing.proposal, workspace.reframing.proposal);
    assert.equal(
      draft.reframing.hardRequirementMapping,
      workspace.reframing.hardRequirementMapping
    );
    const retained = await importFrontierDeskDraft(mission, draft);
    assert.equal(retained.reframing.status, 'PROPOSED');
    assert.equal(
      retained.reframing.ownerApproval,
      null,
      'A native draft cannot replay a package owner attestation'
    );
    assert.equal(retained.provenance.classification, 'USER_ENTERED_UNVERIFIED');
    assert.equal(retained.provenance.executionStatus, 'NOT_ATTESTED');
    assert.equal(retained.provenance.independentProof, false);
    assert.equal(retained.provenance.productionApproved, false);
    assert.equal(retained.provenance.authorityCreated, 'NONE');
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
