import { workTypes, createDraft, handoffText } from './work-model.mjs';

export function initWorkPlanner() {
  const form = document.querySelector('#work-planner');
  if (!form) return;
  form.reset();
  const $ = (id) => document.getElementById(id);
  const field = (name) => form.elements.namedItem(name);
  const downloads = [...document.querySelectorAll('[data-work-download]')];
  let draft = null;
  function invalidate() {
    draft = null;
    downloads.forEach((button) => {
      button.disabled = true;
    });
    $('work-preview').hidden = true;
    $('work-status').textContent =
      'Draft changed. Build the work order to review and download the current version.';
  }
  function selectType() {
    const type = workTypes.find((t) => t.id === field('type').value);
    field('goal').value = type.goal;
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
  field('type').addEventListener('change', selectType);
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
      const url = URL.createObjectURL(
        new Blob([content], {
          type:
            kind === 'handoff'
              ? 'text/plain;charset=utf-8'
              : 'application/json',
        })
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('work-status').textContent =
        name +
        ' downloaded. Review and admit the exact task through your operator configuration before execution.';
    });
  selectType();
  $('work-status').textContent =
    'Choose a category, describe the scope and add approved source URLs. Your draft stays in this browser tab.';
  form.querySelector('button[type="submit"]').disabled = false;
}
