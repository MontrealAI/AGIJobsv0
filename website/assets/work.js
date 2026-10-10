import {
  workTypes,
  createDraft,
  handoffText,
  saveEditableDraft,
  openEditableDraft,
  savedDraftMaxBytes,
} from './work-model.mjs';

function downloadText(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initWorkPlanner() {
  const form = document.querySelector('#work-planner');
  if (!form) return;
  form.reset();
  const $ = (id) => document.getElementById(id);
  const field = (name) => form.elements.namedItem(name);
  const downloads = [...document.querySelectorAll('[data-work-download]')];
  let draft = null;
  let editVersion = 0;
  let openVersion = 0;
  let suggestedGoal = '';
  function invalidate() {
    editVersion += 1;
    draft = null;
    downloads.forEach((button) => {
      button.disabled = true;
    });
    $('work-preview').hidden = true;
    $('work-status').textContent =
      'Draft changed. Build the work order to review and download the current version.';
  }
  function selectType(preserveGoal = false) {
    const type = workTypes.find((t) => t.id === field('type').value);
    if (
      !preserveGoal &&
      (!field('goal').value.trim() || field('goal').value === suggestedGoal)
    )
      field('goal').value = type.goal;
    suggestedGoal = type.goal;
    $('work-outcome').textContent = type.outcome;
    $('work-files').textContent = [
      ...type.files.map(([name]) => name),
      'evidence.json',
    ].join(' · ');
    $('work-criteria').replaceChildren(
      ...type.checks.map((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      })
    );
    invalidate();
  }
  form.addEventListener('input', invalidate);
  form.addEventListener('change', invalidate);
  field('type').addEventListener('change', () => selectType());
  $('work-use-objective').addEventListener('click', () => {
    field('goal').value = suggestedGoal;
    invalidate();
    field('goal').focus();
  });
  $('work-save').addEventListener('click', () => {
    try {
      downloadText(
        'work-draft.json',
        saveEditableDraft(Object.fromEntries(new FormData(form)))
      );
      $('work-status').textContent =
        'Editable draft saved. Open it here to continue later; it carries no execution approval.';
    } catch (error) {
      $('work-status').textContent = error.message;
    }
  });
  $('work-open').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    const opening = ++openVersion;
    if (!file) return;
    invalidate();
    const editing = editVersion;
    $('work-status').textContent = 'Opening editable draft…';
    try {
      if (file.size > savedDraftMaxBytes)
        throw new Error('Choose a saved work draft smaller than 100 KB.');
      const bytes = await file.arrayBuffer();
      let saved;
      try {
        saved = new TextDecoder('utf-8', {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      } catch {
        throw new Error('Choose a saved work draft encoded as valid UTF-8.');
      }
      const fields = openEditableDraft(saved);
      if (opening !== openVersion) return;
      if (editing !== editVersion)
        throw new Error(
          'Draft was not opened because you changed the form. Open the file again when ready.'
        );
      for (const [name, value] of Object.entries(fields))
        field(name).value = value;
      selectType(true);
      $('work-status').textContent =
        'Editable draft opened. Review the fields and build a new work order before downloading a task.';
    } catch (error) {
      if (opening !== openVersion) return;
      $('work-status').textContent = error.message;
    } finally {
      if (opening === openVersion) {
        event.target.value = '';
      }
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    invalidate();
    try {
      draft = createDraft(Object.fromEntries(new FormData(form)));
      $('work-json').textContent = JSON.stringify(draft, null, 2);
      $('work-preview').hidden = false;
      downloads.forEach((button) => {
        button.disabled = false;
      });
      $('work-status').textContent =
        'Draft ready for review. No source was fetched, no agent was dispatched and no money moved.';
      $('work-preview').focus();
    } catch (error) {
      $('work-status').textContent = error.message;
      $('work-status').focus();
    }
  });
  for (const button of downloads)
    button.addEventListener('click', () => {
      if (!draft) return;
      const kind = button.dataset.workDownload;
      const name =
        kind === 'task'
          ? 'task.json'
          : kind === 'handoff'
          ? 'handoff.txt'
          : 'work-proposal.json';
      const content =
        kind === 'handoff'
          ? handoffText(draft)
          : JSON.stringify(kind === 'task' ? draft.task : draft, null, 2) +
            '\n';
      downloadText(
        name,
        content,
        kind === 'handoff' ? 'text/plain;charset=utf-8' : 'application/json'
      );
      $('work-status').textContent =
        name +
        ' downloaded. Review and admit the exact task through your operator configuration before execution.';
    });
  selectType();
  $('work-status').textContent =
    'Choose a category, describe the scope and add approved source URLs. Your draft stays in this browser tab.';
  if (location.hash === '#from-start') {
    const key = `${location.pathname.replace(/work\/$/, '')}start-draft/v1`;
    try {
      const saved = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (saved) {
        const fields = openEditableDraft(saved);
        for (const [name, value] of Object.entries(fields))
          field(name).value = value;
        selectType(true);
        $('work-status').textContent =
          'Your guided draft is here. Add the scope and approved sources, then choose the worker, budget and review allowances with your operator. Nothing has been posted or authorized.';
      } else {
        $('work-status').textContent =
          'No guided draft is available in this tab. Open a saved editable draft or enter your request below.';
      }
    } catch {
      $('work-status').textContent =
        'The guided draft could not be opened. Use Open saved editable draft to load your downloaded copy, or enter your request below.';
    }
    history.replaceState(
      null,
      '',
      location.pathname + location.search + '#planner'
    );
  }
  form.querySelector('button[type="submit"]').disabled = false;
  $('work-save').disabled = false;
  $('work-open').disabled = false;
  $('work-use-objective').disabled = false;
}
