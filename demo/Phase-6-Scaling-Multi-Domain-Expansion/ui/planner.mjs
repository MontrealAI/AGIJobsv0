import { createWave, createExample, examples, formatUsdc } from './model.mjs';

let teardown;
export function resetPlanner() {
  teardown?.();
  teardown = undefined;
  document.querySelector('#phase6-form button[type="submit"]').disabled = true;
}
export function initPlanner(config) {
  teardown?.();
  const form = document.querySelector('#phase6-form');
  const status = document.querySelector('#wave-status');
  const result = document.querySelector('#wave-result');
  const downloadButtons = [
    ...document.querySelectorAll('[data-wave-download]'),
  ];
  const abort = new AbortController();
  const on = (element, type, fn) =>
    element.addEventListener(type, fn, { signal: abort.signal });
  let wave = null;
  let proposal = null;
  const input = () => ({
    ...Object.fromEntries(new FormData(form)),
    domains: config.domains.map((domain, index) => ({
      slug: domain.slug,
      workers: form.elements[`workers-${index}`].value,
      requested: form.elements[`requested-${index}`].value,
      mode: form.elements[`mode-${index}`].value,
    })),
    authority: form.elements.authority.checked,
    sources: form.elements.sources.checked,
    review: form.elements.review.checked,
  });
  const invalidate = () => {
    wave = null;
    proposal = null;
    result.hidden = true;
    for (const button of downloadButtons) button.disabled = true;
    status.textContent =
      'Inputs changed. Calculate again to inspect and export the current draft.';
  };
  teardown = () => {
    abort.abort();
    invalidate();
  };
  const rows = document.querySelector('#planning-domains');
  rows.replaceChildren();
  const select = form.elements.domain;
  select.replaceChildren();
  for (const [index, domain] of config.domains.entries()) {
    const row = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent =
      domain.slug.charAt(0).toUpperCase() + domain.slug.slice(1);
    row.append(legend);
    const note = document.createElement('p');
    note.textContent = `Configured concurrent-job limit: ${
      domain.operations.maxActiveJobs
    }. ${
      domain.active === false || domain.lifecycle === 'sunset'
        ? 'Inactive configuration: this row remains paused.'
        : 'Planning only; no existing job load is known.'
    }`;
    row.append(note);
    for (const [key, title, value] of [
      ['workers', 'Assigned workers', '4'],
      ['requested', 'Requested jobs', '6'],
    ]) {
      const label = document.createElement('label');
      label.htmlFor = `${key}-${index}`;
      label.textContent = title + ' · ' + domain.slug;
      const field = document.createElement('input');
      Object.assign(field, {
        id: label.htmlFor,
        name: label.htmlFor,
        type: 'number',
        value,
        min: '0',
        max: '10000',
        required: true,
      });
      row.append(label, field);
    }
    const label = document.createElement('label');
    label.htmlFor = `mode-${index}`;
    label.textContent = 'Planning state · ' + domain.slug;
    const mode = document.createElement('select');
    Object.assign(mode, { name: label.htmlFor, id: label.htmlFor });
    for (const [value, text] of [
      ['planned', 'Planned'],
      ['paused', 'Paused'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      mode.append(option);
    }
    if (domain.active === false || domain.lifecycle === 'sunset') {
      mode.value = 'paused';
      mode.disabled = true;
    }
    row.append(label, mode);
    rows.append(row);
    if (examples[domain.slug]) {
      const option = document.createElement('option');
      option.value = domain.slug;
      option.textContent = domain.slug + ' — ' + examples[domain.slug].title;
      select.append(option);
    }
  }
  const refreshExample = () => {
    const example = examples[select.value];
    document.querySelector('#example-detail').textContent = example
      ? example.scope
      : 'No synthetic example is available for this domain.';
    document.querySelector('#example-data').textContent = example?.rows || '';
  };
  on(select, 'change', refreshExample);
  refreshExample();
  on(form, 'input', invalidate);
  on(form, 'change', invalidate);
  on(form, 'submit', (event) => {
    event.preventDefault();
    invalidate();
    try {
      const values = input();
      wave = createWave(values, config);
      document.querySelector('#wave-candidates').textContent =
        wave.candidateJobs.toLocaleString('en-US');
      document.querySelector('#wave-explanation').textContent = `${
        wave.constraints.domainSlots
      } domain slots · ${
        wave.constraints.reviewSlots
      } independently reviewable slots · ${wave.constraints.rewardSlots.toLocaleString(
        'en-US'
      )} reward-budget slots. The smallest count limits this dispatch wave. ${formatUsdc(
        wave.proposedRewardsBaseUnits
      )} USDC in proposed rewards; ${formatUsdc(
        wave.unallocatedBudgetBaseUnits
      )} USDC unallocated.`;
      const tbody = document.querySelector('#allocation-rows');
      tbody.replaceChildren();
      for (const domain of wave.domains) {
        const row = document.createElement('tr');
        for (const value of [
          domain.slug,
          domain.mode,
          domain.requested,
          domain.candidateJobs,
          domain.deferredJobs,
        ]) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        tbody.append(row);
      }
      document.querySelector('#wave-json').textContent = JSON.stringify(
        wave,
        null,
        2
      );
      result.hidden = false;
      document.querySelector('[data-wave-download="plan"]').disabled = false;
      status.textContent =
        'Capacity draft prepared. Candidate slots are a static upper bound, not dispatched, completed, accepted or settled jobs.';
      try {
        proposal = createExample(values, wave);
        for (const button of downloadButtons) button.disabled = false;
        status.textContent +=
          ' Synthetic task prepared for operator review; your commitments grant no execution authority.';
      } catch (error) {
        status.textContent += ' ' + error.message;
      }
    } catch (error) {
      status.textContent = error.message;
    }
    status.focus();
  });
  for (const button of downloadButtons)
    on(button, 'click', () => {
      if (button.disabled || !wave) return;
      const kind = button.dataset.waveDownload;
      const artifact =
        kind === 'plan'
          ? wave
          : kind === 'proposal'
          ? proposal
          : proposal?.task;
      if (!artifact) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(artifact, null, 2) + '\n'], {
          type: 'application/json',
        })
      );
      const link = document.createElement('a');
      Object.assign(link, {
        href: url,
        download: kind === 'task' ? 'task.json' : `phase6-${kind}.json`,
      });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  form.querySelector('button[type="submit"]').disabled = false;
  status.textContent =
    'Plan one dispatch wave. Change a domain, reserve independent review time, then calculate.';
}
