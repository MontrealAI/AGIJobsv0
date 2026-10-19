import { computerReceiptCopy } from './computer-receipt-copy.mjs';
import {
  prepareSupplierComputerHandoff,
  createComputerWorkspace,
  inspectComputerWorkspace,
  PROPOSED_NETWORK,
} from './computer-receipt-model.mjs';
import { restoreComputerMissionReport } from '../../packages/successor-core/src/computer-mission.mjs';
import { inspectProject } from '../../integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/project.mjs';

export function mountComputerReceipt(root, { getReport, language = 'en' }) {
  const section = root.querySelector('[data-computer-receipt]');
  if (!section) return;
  const t = computerReceiptCopy[language],
    $ = (id) => section.querySelector('#cr-' + id);
  let reviewed = null,
    prepared = null,
    current = null,
    restored = null,
    busy = false;
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
  }
  async function file(id, max, fallback = null) {
    const selected = $(id).files[0];
    if (!selected) {
      if (fallback !== null) return fallback;
      throw Error('FILE_REQUIRED');
    }
    if (selected.size > max) throw Error('FILE_SIZE');
    return new TextDecoder('utf-8', { fatal: true }).decode(
      await selected.arrayBuffer()
    );
  }
  async function act(operation) {
    if (busy) return;
    busy = true;
    sync();
    try {
      await operation();
    } catch {
      if (restored) showWorkspace(restored);
      status(t.error);
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
    ).textContent = `${value.project.name}\n${value.project.id} · ${t.revision} ${value.project.revision}\n${displayAmount} AGIALPHA\n${t.networkName}\n${value.history.records.length} ${t.historicalRecords} · ${value.workspace.drafts.length} ${t.proposals}\n${t.inert}`;
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
    act(async () => {
      reviewed = null;
      prepared = null;
      $('approve-handoff').checked = false;
      const reportRaw = await file(
        'report',
        4_000_000,
        getReport() ? JSON.stringify(getReport()) : null
      );
      const projectRaw = await file('project', 2_000_000);
      const report = await restoreComputerMissionReport(reportRaw),
        project = inspectProject(projectRaw);
      reviewed = { projectRaw, reportRaw };
      $('forward-summary').textContent = summary(project, report);
      status(t.ready);
    })
  );
  $('prepare').addEventListener('click', () =>
    act(async () => {
      prepared = await prepareSupplierComputerHandoff({
        ...reviewed,
        approved: $('approve-handoff').checked,
        publicNonpersonal: $('public').checked,
        language,
      });
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
    act(async () => {
      current = null;
      const previous = restored?.draft.original;
      const inputs = {
        handoffRaw: await file(
          'native-handoff',
          4_000_000,
          prepared?.handoffRaw ?? previous?.handoffRaw ?? null
        ),
        returnRaw: await file(
          'native-return',
          4_000_000,
          previous?.returnRaw ?? null
        ),
        reportRaw: await file(
          'native-report',
          4_000_000,
          prepared?.reportRaw ?? previous?.reportRaw ?? null
        ),
      };
      const value = await createComputerWorkspace({
        inputs,
        amount: $('amount').value,
        network: $('network').value === '1' ? PROPOSED_NETWORK : null,
        approved: $('approve-draft').checked,
        publicNonpersonal: $('public').checked,
        createdAt: new Date().toISOString(),
        priorWorkspaceRaw: restored?.raw ?? null,
        priorHistoryRaw: $('native-history').files[0]
          ? await file('native-history', 2_000_000)
          : null,
      });
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
  $('reopen').addEventListener('change', () =>
    act(async () => {
      if (!$('public').checked) throw Error('PUBLIC_INPUTS_REQUIRED');
      const value = await inspectComputerWorkspace(
        await file('reopen', 16_000_000)
      );
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
