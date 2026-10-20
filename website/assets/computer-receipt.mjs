import { computerReceiptCopy } from './computer-receipt-copy.mjs';
import {
  prepareSupplierComputerHandoff,
  createComputerWorkspace,
  inspectComputerWorkspace,
  inspectAlphaProjectSource,
  PROPOSED_NETWORK,
} from './computer-receipt-model.mjs';
import { restoreComputerMissionReport } from '../../packages/successor-core/src/computer-mission.mjs';

export function mountComputerReceipt(root, { getReport, language = 'en' }) {
  const section = root.querySelector('[data-computer-receipt]');
  if (!section) return;
  const t = computerReceiptCopy[language],
    $ = (id) => section.querySelector('#cr-' + id);
  let reviewed = null,
    prepared = null,
    current = null,
    restored = null,
    busy = false,
    revision = 0;
  for (const type of ['input', 'change'])
    section.addEventListener(
      type,
      () => {
        revision++;
      },
      true
    );
  $('token').textContent = PROPOSED_NETWORK.token;
  const status = (text) => {
    $('status').textContent = text;
  };
  function sync() {
    for (const control of section.querySelectorAll('input,select,button'))
      control.disabled = busy;
    $('read').disabled = busy || !$('public').checked;
    $('prepare').disabled =
      busy ||
      !reviewed ||
      !$('public').checked ||
      !$('approve-handoff').checked;
    $('handoff-download').disabled = $('report-download').disabled =
      busy || !prepared;
    $('create').disabled =
      busy ||
      !$('public').checked ||
      !$('approve-draft').checked ||
      $('network').value !== '1' ||
      !$('amount').value;
    for (const id of ['draft-download', 'archive-download', 'history-download'])
      $(id).disabled = busy || !current;
    $('alpha-download').disabled =
      busy || !current?.originalAlphaArchives.length;
  }
  function capture() {
    return {
      revision,
      controls: [...section.querySelectorAll('input,select')].map(
        (control) => ({
          id: control.id,
          value: control.value,
          checked: control.checked,
          files: control.files ? [...control.files] : [],
        })
      ),
    };
  }
  function unchanged(expected) {
    const actual = capture();
    if (
      actual.revision !== expected.revision ||
      actual.controls.length !== expected.controls.length ||
      !actual.controls.every((control, index) => {
        const prior = expected.controls[index];
        return (
          control.id === prior.id &&
          control.value === prior.value &&
          control.checked === prior.checked &&
          control.files.length === prior.files.length &&
          control.files.every((file, index) => file === prior.files[index])
        );
      })
    )
      throw Error('COMPUTER_INPUTS_CHANGED');
  }
  async function file(selected, max, fallback, guard) {
    guard();
    if (!selected) {
      if (fallback !== null) return fallback;
      throw Error('FILE_REQUIRED');
    }
    if (selected.size > max) throw Error('FILE_SIZE');
    const raw = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(await selected.arrayBuffer());
    guard();
    return raw;
  }
  async function act(operation) {
    if (busy) return;
    const expected = capture(),
      selected = (id) =>
        expected.controls.find((control) => control.id === 'cr-' + id),
      guard = () => unchanged(expected);
    const snapshot = {
      guard,
      checked: (id) => selected(id).checked,
      value: (id) => selected(id).value,
      hasFile: (id) => selected(id).files.length > 0,
      file: (id, max, fallback = null) =>
        file(selected(id).files[0], max, fallback, guard),
    };
    busy = true;
    sync();
    try {
      await operation(snapshot);
    } catch (error) {
      if (restored) showWorkspace(restored);
      status(
        error.message === 'COMPUTER_INPUTS_CHANGED'
          ? t.changed
          : error.message === 'COMPUTER_ALPHA_SOURCE_MISMATCH'
          ? t.sourceMismatch
          : t.error
      );
    } finally {
      busy = false;
      sync();
    }
  }
  function download(name, raw) {
    const url = URL.createObjectURL(
      new Blob([raw], { type: 'application/json' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function summary(project, report) {
    const r = report.mission.requirements;
    return `${project.name}\n${project.id} · ${t.revision} ${
      project.revision
    } · ${project.cycles.length} ${t.cycles}\n${project.goal}\n${
      r.earlyUnits
    } ${t.unitsBy} ${r.earlyDay}; ${r.totalUnits} ${t.unitsBy} ${r.finalDay}\n${
      t.budgetLabel
    }: ${new Intl.NumberFormat(language, {
      style: 'currency',
      currency: 'USD',
    }).format(r.budgetCents / 100)}\n${
      report.formulation === 'actual_requirements' ? t.staged : t.original
    }`;
  }
  function showWorkspace(value) {
    current = value;
    restored = value;
    const units = value.draft.planning.amountBaseUnits.padStart(19, '0');
    const displayAmount = (
      units.slice(0, -18) +
      '.' +
      units.slice(-18)
    ).replace(/\.?0+$/, '');
    $(
      'summary'
    ).textContent = `${value.project.name}\n${value.project.id} · ${t.revision} ${value.project.revision}\n${displayAmount} AGIALPHA\n${t.networkName}\n${value.history.records.length} ${t.historicalRecords} · ${value.workspace.drafts.length} ${t.proposals}\n${value.workspace.unmatchedHistoricalSourceCount} ${t.unmatchedHistoricalSources}\n${t.inspectorOnly}\n${t.inert}`;
    $('details').textContent = JSON.stringify(value.draft, null, 2);
  }
  for (const id of ['project', 'report'])
    $(id).addEventListener('change', () => {
      reviewed = null;
      prepared = null;
      $('approve-handoff').checked = false;
      $('forward-summary').textContent = '';
      sync();
    });
  for (const id of [
    'native-handoff',
    'native-return',
    'native-report',
    'native-history',
    'amount',
    'network',
  ])
    $(id).addEventListener(id === 'amount' ? 'input' : 'change', () => {
      current = null;
      $('approve-draft').checked = false;
      $('summary').textContent = '';
      $('details').textContent = '{}';
      sync();
    });
  for (const id of ['public', 'approve-handoff', 'approve-draft'])
    $(id).addEventListener('change', sync);
  $('read').addEventListener('click', () =>
    act(async (snapshot) => {
      if (!snapshot.checked('public')) throw Error('PUBLIC_INPUTS_REQUIRED');
      const reportRaw = await snapshot.file(
        'report',
        4_000_000,
        getReport() ? JSON.stringify(getReport()) : null
      );
      const projectRaw = await snapshot.file('project', 2_000_000);
      const report = await restoreComputerMissionReport(reportRaw),
        { project } = await inspectAlphaProjectSource(projectRaw);
      snapshot.guard();
      reviewed = { projectRaw, reportRaw };
      prepared = null;
      $('approve-handoff').checked = false;
      $('forward-summary').textContent = summary(project, report);
      status(t.ready);
    })
  );
  $('prepare').addEventListener('click', () =>
    act(async (snapshot) => {
      const value = await prepareSupplierComputerHandoff({
        ...reviewed,
        approved: snapshot.checked('approve-handoff'),
        publicNonpersonal: snapshot.checked('public'),
        language,
      });
      snapshot.guard();
      prepared = value;
      status(t.forwardReady);
    })
  );
  $('handoff-download').addEventListener(
    'click',
    () =>
      prepared &&
      download('successor-computer-handoff.json', prepared.handoffRaw)
  );
  $('report-download').addEventListener(
    'click',
    () =>
      prepared && download('successor-computer-report.json', prepared.reportRaw)
  );
  $('create').addEventListener('click', () =>
    act(async (snapshot) => {
      if (!snapshot.checked('public') || !snapshot.checked('approve-draft'))
        throw Error('PUBLIC_INPUTS_AND_APPROVAL_REQUIRED');
      current = null;
      const previous = restored?.draft.original;
      const inputs = {
        handoffRaw: await snapshot.file(
          'native-handoff',
          4_000_000,
          prepared?.handoffRaw ?? previous?.handoffRaw ?? null
        ),
        returnRaw: await snapshot.file(
          'native-return',
          4_000_000,
          previous?.returnRaw ?? null
        ),
        reportRaw: await snapshot.file(
          'native-report',
          4_000_000,
          prepared?.reportRaw ?? previous?.reportRaw ?? null
        ),
      };
      const value = await createComputerWorkspace({
        inputs,
        amount: snapshot.value('amount'),
        network: snapshot.value('network') === '1' ? PROPOSED_NETWORK : null,
        approved: snapshot.checked('approve-draft'),
        publicNonpersonal: snapshot.checked('public'),
        createdAt: new Date().toISOString(),
        priorWorkspaceRaw: restored?.raw ?? null,
        projectSourceRaw: prepared?.projectSourceRaw ?? null,
        priorHistoryRaw: snapshot.hasFile('native-history')
          ? await snapshot.file('native-history', 2_000_000)
          : null,
      });
      snapshot.guard();
      showWorkspace(value);
      status(t.checked);
    })
  );
  $('draft-download').addEventListener(
    'click',
    () =>
      current &&
      download('jobs-agialpha-computer-draft.json', current.workspace.draftRaw)
  );
  $('archive-download').addEventListener(
    'click',
    () => current && download('jobs-computer-workspace.json', current.raw)
  );
  $('history-download').addEventListener(
    'click',
    () =>
      current &&
      download('successor-computer-history.json', current.workspace.historyRaw)
  );
  $('alpha-download').addEventListener('click', () => {
    const raw = current?.originalAlphaArchives.at(-1);
    if (raw) download('successor-alpha-learning-archive.json', raw);
  });
  $('reopen').addEventListener('change', () =>
    act(async (snapshot) => {
      if (!snapshot.checked('public')) throw Error('PUBLIC_INPUTS_REQUIRED');
      const value = await inspectComputerWorkspace(
        await snapshot.file('reopen', 16_000_000)
      );
      snapshot.guard();
      for (const id of [
        'native-handoff',
        'native-return',
        'native-report',
        'native-history',
      ])
        $(id).value = '';
      prepared = null;
      $('approve-draft').checked = false;
      $('public').checked = false;
      $('network').value = '1';
      const units = value.draft.planning.amountBaseUnits.padStart(19, '0');
      $('amount').value = units.slice(0, -18) + '.' + units.slice(-18);
      showWorkspace(value);
      status(t.restored);
    })
  );
  sync();
  section.dataset.ready = 'true';
}
