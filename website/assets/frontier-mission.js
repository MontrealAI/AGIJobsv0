import {
  frontierMissionCopy,
  frontierPresetFrench,
} from './frontier-mission-copy.mjs';
import {
  initFrontierDesk,
  renderFrontierDeskDocument,
} from './frontier-desk.mjs';
import {
  FRONTIER_MISSION_PRESETS,
  createFrontierMission,
  verifyFrontierMission,
  restoreFrontierMission,
  createFrontierWorkspace,
  sealFrontierWorkspace,
  verifyFrontierWorkspace,
  proposeFrontierFormulation,
  approveFrontierFormulation,
  exportFrontierWorkspace,
  restoreFrontierWorkspace,
  importFrontierDeskDraft,
  createFrontierComputerTask,
  buildFrontierWorkPrompt,
  exportFrontierBrief,
} from '../../packages/successor-core/src/frontier-mission.mjs';

const normalize = (value) => value.trim().normalize('NFC');
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readFile(input) {
  const file = input.files?.[0];
  if (!file) throw new Error('Choose a saved package.');
  if (file.size > 512000)
    throw new Error('The package exceeds the bounded import size.');
  return file.text();
}
async function restorePackage(serialized) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('The package must be valid JSON.');
  }
  if (parsed?.format === 'successor-frontier-workspace-v1')
    return restoreFrontierWorkspace(serialized);
  if (parsed?.kind === 'FrontierDeskDraftEnvelope') {
    if (Object.keys(parsed).sort().join(',') !== 'draft,kind,mission')
      throw new Error('Unsupported desk draft envelope.');
    const mission = await verifyFrontierMission(parsed.mission);
    return {
      mission,
      workspace: await importFrontierDeskDraft(mission, parsed.draft),
      draft: true,
    };
  }
  const mission = await restoreFrontierMission(serialized);
  return { mission, workspace: await createFrontierWorkspace(mission) };
}

const studio = document.querySelector('[data-frontier-mission]');
if (studio) {
  const language = studio.dataset.language === 'fr' ? 'fr' : 'en',
    t = frontierMissionCopy[language],
    $ = (id) => document.getElementById(`fm-${id}`);
  let preset = 'business',
    mission = null,
    workspace = null,
    nativeTask = null,
    taskHTML = '',
    brief = '',
    workspaceExport = '',
    busy = false,
    generation = 0,
    sourceCounter = 0;
  function status(value) {
    $('status').textContent = value;
  }
  function localizedPreset(key) {
    const source = FRONTIER_MISSION_PRESETS[key];
    return language === 'fr'
      ? {
          ...source,
          ...frontierPresetFrench[key],
          rights: {
            ...source.rights,
            license:
              'Attestation du propriétaire requise pour chaque source publique non personnelle et chaque extrait.',
          },
        }
      : source;
  }
  function invalidate() {
    const hadPrepared = !!mission || busy;
    generation++;
    mission = null;
    workspace = null;
    nativeTask = null;
    $('results').hidden = true;
    if (hadPrepared) status(t.edited);
  }
  function sourceRow(source = {}) {
    const id = ++sourceCounter,
      row = element('div', undefined, 'fm-source-row');
    row.dataset.sourceRow = '';
    let sourceId = source.id || `source-${id}`;
    const usedIds = new Set(
      [...$('source-list').querySelectorAll('[data-source-row]')].map(
        (item) => item.dataset.sourceId
      )
    );
    if (!source.id) {
      let suffix = id;
      while (usedIds.has(sourceId)) sourceId = `source-${++suffix}`;
    }
    row.dataset.sourceId = sourceId;
    const top = element('div', undefined, 'fm-source-row-top');
    top.append(element('p', `${t.sources} / ${String(id).padStart(2, '0')}`));
    const remove = element('button', t.remove, 'fm-button fm-secondary');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      row.remove();
      invalidate();
    });
    top.append(remove);
    row.append(top);
    for (const [key, label, max, rows] of [
      ['title', t.sourceTitle, 240, 0],
      ['url', t.sourceURL, 2048, 0],
      ['text', t.sourceText, 12000, 3],
    ]) {
      const field = element('div', undefined, 'fm-field'),
        lab = element('label', label),
        input = element(rows ? 'textarea' : 'input');
      input.id = `fm-source-${id}-${key}`;
      lab.htmlFor = input.id;
      input.dataset[`source${key[0].toUpperCase() + key.slice(1)}`] = '';
      input.maxLength = max;
      if (rows) input.rows = rows;
      if (key === 'url') input.type = 'url';
      if (key !== 'text') input.required = true;
      input.value = source[key] || '';
      field.append(lab, input);
      row.append(field);
    }
    $('source-list').append(row);
  }
  function populate(input) {
    preset = input.preset || 'custom';
    for (const [id, key] of [
      ['title', 'title'],
      ['question', 'question'],
      ['outcome', 'outcome'],
      ['current', 'currentApproach'],
      ['alternative', 'credibleAlternative'],
    ])
      $(id).value = input[key];
    $('requirements').value = input.hardRequirements.join('\n');
    $('license').value = input.rights.license;
    $('rights').checked = input.rights.publicNonPersonal === true;
    for (const [id, key] of [
      ['turns', 'maxTurns'],
      ['actions', 'maxActions'],
      ['seconds', 'maxSeconds'],
      ['review', 'reviewMinutes'],
    ])
      $(id).value = input.budget[key];
    $('source-list').replaceChildren();
    sourceCounter = 0;
    input.sources.forEach(sourceRow);
    for (const button of studio.querySelectorAll('[data-preset]'))
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.preset === preset)
      );
  }
  function readInputs() {
    return {
      preset,
      title: normalize($('title').value),
      question: normalize($('question').value),
      outcome: normalize($('outcome').value),
      currentApproach: normalize($('current').value),
      credibleAlternative: normalize($('alternative').value),
      hardRequirements: $('requirements')
        .value.split('\n')
        .map(normalize)
        .filter(Boolean),
      sources: [...$('source-list').querySelectorAll('[data-source-row]')].map(
        (row) => ({
          id: row.dataset.sourceId,
          title: normalize(row.querySelector('[data-source-title]').value),
          url: normalize(row.querySelector('[data-source-url]').value),
          text: normalize(row.querySelector('[data-source-text]').value),
        })
      ),
      rights: {
        publicNonPersonal: $('rights').checked,
        license: normalize($('license').value),
      },
      budget: {
        maxTurns: Number($('turns').value),
        maxActions: Number($('actions').value),
        maxSeconds: Number($('seconds').value),
        reviewMinutes: Number($('review').value),
      },
    };
  }
  function setBusy(value) {
    busy = value;
    studio.setAttribute('aria-busy', String(value));
    for (const control of studio.querySelectorAll('button,input,textarea'))
      control.disabled = value;
  }
  async function present(
    nextMission,
    nextWorkspace,
    request,
    populateAfter = false
  ) {
    const checked = await verifyFrontierMission(nextMission),
      checkedWorkspace = await verifyFrontierWorkspace(checked, nextWorkspace);
    const html = renderFrontierDeskDocument(checked, {
      language,
      workspace: checkedWorkspace,
    });
    const task = await createFrontierComputerTask(checked, { html }),
      text = await exportFrontierBrief(checked),
      serialized = await exportFrontierWorkspace(checked, checkedWorkspace);
    const route = `${studio.dataset.base}successor/mission/desk/${
      language === 'fr' ? 'fr/' : ''
    }`;
    const link = new URL(route, window.location.href),
      fragment = new URLSearchParams({ task: JSON.stringify(checked) });
    if (
      checkedWorkspace.strategyLedger !==
        (await createFrontierWorkspace(checked)).strategyLedger ||
      checkedWorkspace.experimentLedger !==
        (await createFrontierWorkspace(checked)).experimentLedger ||
      checkedWorkspace.evidenceLedger !==
        (await createFrontierWorkspace(checked)).evidenceLedger ||
      checkedWorkspace.reframing.status !== 'NOT_PROPOSED'
    )
      fragment.set('workspace', JSON.stringify(checkedWorkspace));
    link.hash = fragment.toString();
    if (link.href.length > 400000)
      throw new Error(
        'The workspace link is too large. Export and restore this package directly in the mission workspace.'
      );
    const publicLink = new URL(link.href);
    if (publicLink.protocol !== 'https:') {
      publicLink.protocol = 'https:';
      publicLink.hostname = 'montrealai.github.io';
      publicLink.port = '';
    }
    const prompt = await buildFrontierWorkPrompt(checked, {
      deskURL: publicLink.href,
    });
    if (request !== generation) return false;
    if (populateAfter) populate(checked);
    mission = checked;
    workspace = checkedWorkspace;
    nativeTask = task;
    taskHTML = html;
    brief = text;
    workspaceExport = serialized;
    $('brief-output').textContent = text;
    $('work-prompt').value = prompt;
    $('mission-json').textContent = JSON.stringify(checked, null, 2);
    $('public-desk').href = link.href;
    $('results').hidden = false;
    status(t.prepared);
    studio.dataset.ready = 'true';
    return true;
  }
  $('form').addEventListener('input', invalidate);
  $('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const input = readInputs(),
      request = ++generation;
    setBusy(true);
    try {
      const next = await createFrontierMission(input);
      if (await present(next, await createFrontierWorkspace(next), request))
        $('results').scrollIntoView({ behavior: 'auto', block: 'start' });
    } catch (error) {
      if (request === generation) {
        status(t.error + error.message);
        $('status').focus();
      }
    } finally {
      setBusy(false);
    }
  });
  for (const button of studio.querySelectorAll('[data-preset]'))
    button.addEventListener('click', () => {
      if (busy) return;
      invalidate();
      populate(localizedPreset(button.dataset.preset));
      $('brief-form').scrollIntoView({ behavior: 'auto', block: 'start' });
      $('title').focus();
    });
  $('add-source').addEventListener('click', () => {
    if (busy) return;
    if ($('source-list').children.length >= 12) {
      status('A mission may contain at most twelve public sources.');
      return;
    }
    sourceRow();
    invalidate();
    $('source-list').lastElementChild.querySelector('input').focus();
  });
  $('copy-work').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('work-prompt').value);
      status(t.copied);
    } catch {
      status(t.copyFailed);
      $('work-prompt').focus();
      $('work-prompt').select();
    }
  });
  $('download-task').addEventListener(
    'click',
    () =>
      nativeTask &&
      download(
        'successor-omega-computer-task.json',
        JSON.stringify(nativeTask, null, 2)
      )
  );
  $('download-desk').addEventListener(
    'click',
    () =>
      mission &&
      download('successor-omega-workspace.html', taskHTML, 'text/html')
  );
  $('download-brief').addEventListener(
    'click',
    () =>
      mission && download('successor-omega-mission.txt', brief, 'text/plain')
  );
  $('download-mission').addEventListener('click', () => {
    if (mission)
      download('successor-omega-mission-and-workspace.json', workspaceExport);
  });
  $('import').addEventListener('change', async () => {
    if (busy) return;
    const request = ++generation;
    setBusy(true);
    try {
      const restored = await restorePackage(await readFile($('import')));
      if (await present(restored.mission, restored.workspace, request, true)) {
        $('imported-workspace').textContent =
          t.retained + ': ' + restored.workspace.digest;
        $('imported-workspace').hidden = false;
        status(t.imported);
      }
    } catch (error) {
      if (request === generation) status(error.message);
    } finally {
      $('import').value = '';
      setBusy(false);
    }
  });
  populate(localizedPreset('business'));
  $('prepare').disabled = false;
  studio.dataset.ready = 'true';
}

const deskPage = document.querySelector('[data-frontier-desk-page]');
if (deskPage) {
  const language = deskPage.dataset.language === 'fr' ? 'fr' : 'en',
    desk = deskPage.querySelector('[data-frontier-desk]');
  let controller;
  const callbacks = {
    async onSave(api) {
      const next = api.collect();
      if (
        next.reframing.status === 'PROPOSED' &&
        (!next.reframing.proposal || !next.reframing.hardRequirementMapping)
      )
        throw new Error(
          'Complete both the formulation and requirement mapping, or clear both.'
        );
      const sealed = await sealFrontierWorkspace(api.mission, next);
      api.setWorkspace(sealed);
      api.status(
        language === 'fr'
          ? 'Espace sauvegardé. Les déclarations restent non vérifiées.'
          : 'Workspace saved. Recorded claims remain unverified.'
      );
    },
    async onPropose(api) {
      const draft = api.collect();
      const base = await sealFrontierWorkspace(api.mission, {
        ...draft,
        reframing: {
          proposal: '',
          hardRequirementMapping: '',
          status: 'NOT_PROPOSED',
          ownerApproval: null,
        },
      });
      const next = await proposeFrontierFormulation(api.mission, base, {
        proposal: draft.reframing.proposal,
        hardRequirementMapping: draft.reframing.hardRequirementMapping,
      });
      api.setWorkspace(next);
      api.status(
        language === 'fr'
          ? 'Proposition consignée. Approbation en attente.'
          : 'Proposal recorded. Owner approval is pending.'
      );
    },
    async onApprove(api) {
      if (!api.fields('preserve').checked)
        throw new Error(
          language === 'fr'
            ? 'Attestez explicitement du respect des exigences.'
            : 'Explicitly attest that every hard requirement is preserved.'
        );
      const draft = api.collect();
      const approval = {
        ownerLabel: normalize(api.fields('owner').value),
        reason: normalize(api.fields('reason').value),
        hardRequirementsPreserved: true,
      };
      let next = await sealFrontierWorkspace(api.mission, {
        ...draft,
        reframing: {
          proposal: '',
          hardRequirementMapping: '',
          status: 'NOT_PROPOSED',
          ownerApproval: null,
        },
      });
      next = await proposeFrontierFormulation(api.mission, next, {
        proposal: draft.reframing.proposal,
        hardRequirementMapping: draft.reframing.hardRequirementMapping,
      });
      next = await approveFrontierFormulation(api.mission, next, approval);
      api.setWorkspace(next);
      api.status(
        language === 'fr'
          ? 'Attestation liée à cette formulation exacte. Aucune preuve indépendante.'
          : 'Owner attestation bound to this exact formulation. Independent proof remains absent.'
      );
    },
    async onExport(api) {
      await callbacks.onSave(api);
      const serialized = await exportFrontierWorkspace(
        api.mission,
        api.workspace
      );
      api.assertCurrent();
      download('successor-omega-evidence-workspace.json', serialized);
    },
    async onImport(api) {
      try {
        const restored = await restorePackage(
          await readFile(api.fields('import'))
        );
        api.replace(restored.mission, restored.workspace);
        api.status(
          language === 'fr'
            ? 'Paquet vérifié et restauré. Déclarations non vérifiées.'
            : 'Content bindings verified and restored. Claims remain unverified.'
        );
      } finally {
        api.fields('import').value = '';
      }
    },
  };
  controller = initFrontierDesk(desk, {}, callbacks);
  const loaded = await controller.runAction(async () => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (
      window.location.hash.length > 400000 ||
      [...fragment.keys()].some(
        (key) => !['task', 'workspace'].includes(key)
      ) ||
      fragment.getAll('task').length > 1 ||
      fragment.getAll('workspace').length > 1
    )
      throw new Error('Unsupported or oversized mission workspace link.');
    if (fragment.has('workspace') && !fragment.has('task'))
      throw new Error('A saved workspace must bind an exact mission.');
    if (fragment.has('task')) {
      const mission = await restoreFrontierMission(fragment.get('task'));
      const workspace = fragment.has('workspace')
        ? await verifyFrontierWorkspace(
            mission,
            JSON.parse(fragment.get('workspace'))
          )
        : await createFrontierWorkspace(mission);
      controller.replace(mission, workspace);
    }
  });
  if (loaded) deskPage.dataset.ready = 'true';
  else deskPage.dataset.error = 'true';
}
