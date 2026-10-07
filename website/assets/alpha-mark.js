import { createAlphaMarkPlan, formatUsdc } from './alpha-mark-model.mjs';
import { workTypes } from './work-model.mjs';

export function initAlphaMark() {
  const form = document.querySelector('#alpha-mark-form');
  if (!form) return;
  const status = document.querySelector('#alpha-mark-status');
  const result = document.querySelector('#alpha-mark-result');
  const buttons = [...document.querySelectorAll('[data-mark-download]')];
  const category = form.elements.type;
  const objective = form.elements.goal;
  let plan = null;
  let suggested = workTypes.find((type) => type.id === category.value).goal;
  if (!objective.value) objective.value = suggested;
  const invalidate = () => {
    plan = null;
    result.hidden = true;
    buttons.forEach((button) => {
      button.disabled = true;
    });
    status.textContent =
      'Draft changed. Calculate again to review the exact current inputs.';
  };
  const refreshCategory = () => {
    const type = workTypes.find((item) => item.id === category.value);
    if (!objective.value || objective.value === suggested)
      objective.value = type.goal;
    suggested = type.goal;
    document.querySelector('#mark-outcome').textContent = type.outcome;
    const criteria = document.querySelector('#mark-criteria');
    criteria.replaceChildren(
      ...type.checks.map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      })
    );
  };
  form.addEventListener('input', invalidate);
  form.addEventListener('change', invalidate);
  category.addEventListener('change', refreshCategory);
  document
    .querySelector('#mark-use-objective')
    .addEventListener('click', () => {
      objective.value = suggested;
      invalidate();
    });
  const example = document.querySelector('#mark-example');
  example.addEventListener('click', () => {
    category.value = 'docs';
    objective.value =
      'Produce a reproducible operator guide for the public Alpha Mark local contract demo.';
    form.elements.scope.value =
      'Pin the repository commit and toolchain. In a disposable local environment, run the contract tests and full Alpha Mark suite, record the actual outputs and first failure if any, distinguish native/ERC20 market scenarios from USDC job proposals, and document the verification commands. Do not configure an external network or use real funds.';
    form.elements.sources.value =
      'https://github.com/MontrealAI/AGIJobsv0/tree/main/demo/alpha-agi-mark';
    form.elements.dataClass.value = 'public';
    for (const name of ['authorityPlanned', 'inputsPlanned', 'reviewPlanned'])
      form.elements[name].checked = false;
    refreshCategory();
    invalidate();
    status.textContent =
      'Example work definition loaded. Review its scope and sources, then make your own preparation commitments. Capacity assumptions were kept.';
  });
  example.disabled = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    invalidate();
    const input = Object.fromEntries(new FormData(form));
    for (const key of ['authorityPlanned', 'inputsPlanned', 'reviewPlanned'])
      input[key] = form.elements[key].checked;
    try {
      plan = createAlphaMarkPlan(input);
      const model = plan.capacity;
      for (const key of ['worker', 'reviewer', 'rewardBudget'])
        document.querySelector(`#mark-${key}`).textContent =
          model.slots[key].toLocaleString('en-US');
      document.querySelector('#mark-candidate').textContent =
        model.candidateJobs.toLocaleString('en-US');
      const labels = {
        worker: 'worker throughput',
        reviewer: 'independent review time',
        rewardBudget: 'reward budget',
      };
      document.querySelector(
        '#mark-bottleneck'
      ).textContent = `Limited by ${model.bottlenecks
        .map((key) => labels[key])
        .join(' and ')}. ${formatUsdc(
        model.reservedRewardsBaseUnits
      )} USDC in proposed rewards; ${formatUsdc(
        model.unallocatedRewardsBaseUnits
      )} USDC unallocated. ${model.reviewMinutesReserved.toLocaleString(
        'en-US'
      )} reviewer minutes reserved.`;
      document.querySelector('#mark-json').textContent = JSON.stringify(
        plan,
        null,
        2
      );
      result.hidden = false;
      status.textContent = plan.missing.length
        ? `Preparation incomplete. ${plan.missing.join(
            ' '
          )} The capacity model is still available; task exports require all preparation acknowledgments.`
        : 'Draft prepared for operator review. Your acknowledgments are planning statements. No execution, source rights, review independence or settlement has been verified or authorized.';
      buttons.forEach((button) => {
        button.disabled =
          button.dataset.markDownload !== 'plan' && plan.missing.length > 0;
      });
    } catch (error) {
      status.textContent = error.message;
    }
    status.focus();
  });
  for (const button of buttons)
    button.addEventListener('click', () => {
      if (!plan || button.disabled) return;
      const kind = button.dataset.markDownload;
      const artifact =
        kind === 'task'
          ? plan.proposal.task
          : kind === 'proposal'
          ? plan.proposal
          : plan;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(artifact, null, 2) + '\n'], {
          type: 'application/json',
        })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = kind === 'task' ? 'task.json' : `alpha-mark-${kind}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  form.querySelector('button[type="submit"]').disabled = false;
  document.querySelector('#mark-use-objective').disabled = false;
  status.textContent =
    'Enter a concrete scope and approved sources, then calculate a local draft.';
  refreshCategory();
}
