import {
  openEditableDraft,
  saveEditableDraft,
  savedDraftMaxBytes,
} from './work-model.mjs';
import { openStartProgress, saveStartProgress } from './start-state.mjs';

const wizard = document.querySelector('#wizard');
if (wizard) {
  const $ = (id) => document.getElementById(id);
  const messages = JSON.parse(wizard.dataset.messages);
  const status = $('guide-status');
  const goal = $('start-goal');
  const base = document.body.dataset.base;
  const progressKey = base + 'start-progress/v1';
  const transferKey = base + 'start-draft/v1';
  let step = 0,
    role = '',
    type = 'research';
  let exampleHistory = [],
    clearedState,
    storageAvailable = true;
  let editVersion = 0,
    openVersion = 0;
  const snapshot = () => ({
    step,
    role,
    type,
    goal: goal.value,
    largeText: $('large-text').getAttribute('aria-pressed') === 'true',
  });
  const draft = () =>
    saveEditableDraft({
      type,
      goal: goal.value,
      scope: '',
      sources: '',
      dataClass: 'public',
      runtime: 'openclaw',
      workerProfile: '',
      reward: '',
      runMinutes: '',
      reviewerMinutes: '',
    });
  function sessionNote() {
    const text = storageAvailable
      ? messages.sessionReady
      : messages.sessionUnavailable;
    if ($('draft-session-note').textContent !== text)
      $('draft-session-note').textContent = text;
  }
  function persist() {
    editVersion += 1;
    try {
      const saved = saveStartProgress(snapshot());
      sessionStorage.setItem(progressKey, saved);
      storageAvailable = sessionStorage.getItem(progressKey) === saved;
    } catch {
      storageAvailable = false;
    }
    sessionNote();
  }
  function updateTools() {
    const empty = !role && !goal.value;
    $('clear-start-progress').hidden = empty;
    $('clear-start-help').hidden = empty;
    $('undo-example').hidden = exampleHistory.length === 0;
    $('undo-clear').hidden = !clearedState;
  }
  function applyLarge(active) {
    document.documentElement.classList.toggle('large-text', active);
    $('large-text').setAttribute('aria-pressed', String(active));
  }
  function show(next, focus = true, save = true) {
    step = next;
    for (const panel of wizard.querySelectorAll('[data-step]'))
      panel.hidden = Number(panel.dataset.step) !== step;
    for (const panel of wizard.querySelectorAll('[data-detail]'))
      panel.hidden = panel.dataset.detail !== role;
    for (const panel of wizard.querySelectorAll('[data-result]'))
      panel.hidden = panel.dataset.result !== role;
    for (const item of wizard.querySelectorAll('[data-progress]')) {
      if (Number(item.dataset.progress) === step)
        item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    }
    $('guide-back').hidden = step === 0;
    $('guide-next').hidden = step === 2;
    $('guide-restart').hidden = step !== 2;
    $('planner-fallback').hidden = true;
    $('goal-summary').textContent = goal.value;
    status.textContent = '';
    updateTools();
    if (save) persist();
    if (focus) wizard.querySelector('[data-step="' + step + '"] h2').focus();
  }
  function applyState(state, focus = true) {
    role = state.role;
    type = state.type;
    goal.value = state.goal;
    goal.removeAttribute('aria-invalid');
    $('role-choices').removeAttribute('aria-invalid');
    for (const input of wizard.querySelectorAll('[name="role"]'))
      input.checked = input.value === role;
    applyLarge(state.largeText);
    show(state.step, focus);
  }
  function error(message, target = status) {
    status.textContent = message;
    target.focus();
  }
  $('guide-next').addEventListener('click', () => {
    role = wizard.querySelector('input[name="role"]:checked')?.value || '';
    if (!role) {
      $('role-choices').setAttribute('aria-invalid', 'true');
      return error(
        wizard.dataset.roleError,
        wizard.querySelector('[name="role"]')
      );
    }
    if (step === 1 && role === 'buyer') {
      try {
        if (goal.value.trim().length < 10) throw new Error('Incomplete goal');
        draft();
      } catch {
        goal.setAttribute('aria-invalid', 'true');
        return error(wizard.dataset.goalError, goal);
      }
    }
    show(Math.min(step + 1, 2));
  });
  for (const input of wizard.querySelectorAll('[name="role"]'))
    input.addEventListener('change', () => {
      role = input.value;
      $('role-choices').removeAttribute('aria-invalid');
      status.textContent = '';
      updateTools();
      persist();
    });
  $('guide-back').addEventListener('click', () => show(Math.max(0, step - 1)));
  $('guide-restart').addEventListener('click', () => show(0));
  goal.addEventListener('input', () => {
    goal.removeAttribute('aria-invalid');
    status.textContent = '';
    updateTools();
    persist();
  });
  for (const button of wizard.querySelectorAll('[data-preset]'))
    button.addEventListener('click', () => {
      exampleHistory.push({ type, goal: goal.value });
      exampleHistory = exampleHistory.slice(-10);
      type = button.dataset.preset;
      goal.value = button.dataset.goal;
      goal.removeAttribute('aria-invalid');
      updateTools();
      persist();
      status.textContent = wizard.dataset.exampleStatus;
      goal.focus();
    });
  $('undo-example').addEventListener('click', () => {
    const previous = exampleHistory.pop();
    if (!previous) return;
    type = previous.type;
    goal.value = previous.goal;
    goal.removeAttribute('aria-invalid');
    updateTools();
    persist();
    status.textContent = messages.undoStatus;
    goal.focus();
  });
  $('clear-start-progress').addEventListener('click', () => {
    editVersion += 1;
    const previous = snapshot();
    try {
      sessionStorage.removeItem(progressKey);
      sessionStorage.removeItem(transferKey);
    } catch {
      storageAvailable = false;
      sessionNote();
      return error(messages.sessionClearFailed);
    }
    clearedState = previous;
    exampleHistory = [];
    role = '';
    type = 'research';
    goal.value = '';
    goal.removeAttribute('aria-invalid');
    $('role-choices').removeAttribute('aria-invalid');
    for (const input of wizard.querySelectorAll('[name="role"]'))
      input.checked = false;
    show(0, true, false);
    status.textContent = messages.sessionCleared;
  });
  $('undo-clear').addEventListener('click', () => {
    if (!clearedState) return;
    const previous = clearedState;
    clearedState = undefined;
    applyState(previous);
    status.textContent = messages.restoredStatus;
  });
  function download(contents, filename, mime, message) {
    let url, anchor;
    try {
      url = URL.createObjectURL(new Blob([contents], { type: mime }));
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      status.textContent = message;
    } catch {
      error(messages.downloadError);
    } finally {
      anchor?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  $('save-start-draft').addEventListener('click', () => {
    try {
      download(
        draft(),
        'agi-jobs-editable-draft.json',
        'application/json;charset=utf-8',
        wizard.dataset.savedStatus
      );
    } catch {
      error(messages.downloadError);
    }
  });
  $('save-readable-brief').addEventListener('click', () => {
    const text =
      [
        messages.briefTitle,
        messages.briefHeading,
        goal.value,
        messages.briefNext,
        messages.briefBoundary,
      ].join('\n\n') + '\n';
    download(
      text,
      'agi-jobs-work-request.txt',
      'text/plain;charset=utf-8',
      messages.briefSaved
    );
  });
  $('print-start-brief').addEventListener('click', () => window.print());
  $('open-start-draft-button').addEventListener('click', () =>
    $('open-start-draft').click()
  );
  $('open-start-draft').addEventListener('change', async () => {
    const input = $('open-start-draft'),
      file = input.files?.[0];
    const opening = ++openVersion;
    if (!file) return;
    const editing = editVersion;
    $('open-start-draft-button').disabled = true;
    try {
      if (file.size > savedDraftMaxBytes) throw new Error('Too large');
      const bytes = await file.arrayBuffer();
      if (opening !== openVersion) return;
      if (editing !== editVersion) return error(messages.fileChanged);
      const text = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
      const fields = openEditableDraft(text);
      if (
        !['research', 'feature', 'tests'].includes(fields.type) ||
        fields.runtime !== 'openclaw' ||
        fields.dataClass !== 'public' ||
        [
          'scope',
          'sources',
          'workerProfile',
          'reward',
          'runMinutes',
          'reviewerMinutes',
        ].some((key) => fields[key] !== '')
      ) {
        $('planner-fallback').hidden = false;
        return error(messages.advancedDraft);
      }
      exampleHistory = [];
      clearedState = undefined;
      applyState({
        ...snapshot(),
        role: 'buyer',
        step: 1,
        type: fields.type,
        goal: fields.goal,
      });
      status.textContent = messages.openedStatus;
      goal.focus();
    } catch {
      if (opening !== openVersion) return;
      error(messages.fileError);
    } finally {
      if (opening === openVersion) {
        input.value = '';
        $('open-start-draft-button').disabled = false;
      }
    }
  });
  $('planner-handoff').addEventListener('click', (event) => {
    try {
      sessionStorage.setItem(transferKey, draft());
    } catch {
      event.preventDefault();
      $('planner-fallback').hidden = false;
      error(wizard.dataset.transferError);
    }
  });
  $('large-text').hidden = false;
  $('large-text').addEventListener('click', () => {
    applyLarge($('large-text').getAttribute('aria-pressed') !== 'true');
    persist();
  });
  document.querySelector('.begin-guide').addEventListener('click', (event) => {
    event.preventDefault();
    wizard
      .querySelector('[data-step="' + step + '"] h2')
      .focus({ preventScroll: true });
    $('guide').scrollIntoView({ block: 'start' });
  });
  wizard.hidden = false;
  $('guide-fallback').hidden = true;
  let saved,
    notice = '';
  try {
    const raw = sessionStorage.getItem(progressKey);
    if (raw !== null) {
      try {
        saved = openStartProgress(raw);
        notice = messages.sessionRestored;
      } catch {
        sessionStorage.removeItem(progressKey);
        notice = messages.sessionInvalid;
      }
    }
  } catch {
    storageAvailable = false;
  }
  if (saved) applyState(saved, false);
  else show(0, false);
  sessionNote();
  status.textContent = notice;
}
