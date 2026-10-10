import { saveEditableDraft } from './work-model.mjs';

const wizard = document.querySelector('#wizard');
if (wizard) {
  const $ = (id) => document.getElementById(id);
  let step = 0;
  let role = '';
  let type = 'research';
  const status = $('guide-status');
  const goal = $('start-goal');
  const base = document.body.dataset.base;
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
  function show(next, focus = true) {
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
    if (focus) wizard.querySelector(`[data-step="${step}"] h2`).focus();
  }
  function error(message) {
    status.textContent = message;
    status.focus();
  }
  $('guide-next').addEventListener('click', () => {
    role = wizard.querySelector('input[name="role"]:checked')?.value || '';
    if (!role) return error(wizard.dataset.roleError);
    if (step === 1 && role === 'buyer') {
      if (goal.value.trim().length < 10) {
        goal.setAttribute('aria-invalid', 'true');
        error(wizard.dataset.goalError);
        goal.focus();
        return;
      }
      try {
        draft();
      } catch {
        return error(wizard.dataset.goalError);
      }
    }
    show(Math.min(step + 1, 2));
  });
  $('guide-back').addEventListener('click', () => show(Math.max(0, step - 1)));
  $('guide-restart').addEventListener('click', () => show(0));
  goal.addEventListener('input', () => {
    goal.removeAttribute('aria-invalid');
    status.textContent = '';
  });
  for (const button of wizard.querySelectorAll('[data-preset]'))
    button.addEventListener('click', () => {
      type = button.dataset.preset;
      goal.value = button.dataset.goal;
      goal.removeAttribute('aria-invalid');
      status.textContent = wizard.dataset.exampleStatus;
      goal.focus();
    });
  $('save-start-draft').addEventListener('click', () => {
    const url = URL.createObjectURL(
      new Blob([draft()], { type: 'application/json;charset=utf-8' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'agi-jobs-editable-draft.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = wizard.dataset.savedStatus;
  });
  $('planner-handoff').addEventListener('click', (event) => {
    try {
      sessionStorage.setItem(`${base}start-draft/v1`, draft());
    } catch {
      event.preventDefault();
      $('planner-fallback').hidden = false;
      error(wizard.dataset.transferError);
    }
  });
  $('large-text').hidden = false;
  $('large-text').addEventListener('click', () => {
    const active = document.documentElement.classList.toggle('large-text');
    $('large-text').setAttribute('aria-pressed', String(active));
  });
  wizard.hidden = false;
  $('guide-fallback').hidden = true;
  show(0, false);
}
