import { defaults, plan, workOrder, reportMarkdown } from './model.mjs';
const $ = (id) => document.getElementById(id);
const format = (value) =>
  value === null
    ? 'Not applicable'
    : new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
const fields = {
  offers: 'Work offers',
  workers: 'Workers',
  days: 'Days',
  hoursPerJob: 'Worker hours per job',
  reviewMinutes: 'Review minutes per attempt',
  reviewerHours: 'Total reviewer hours',
  budgetUSDC: 'Total budget (USDC)',
  rewardUSDC: 'Reward per accepted job (USDC)',
  executionUSDC: 'Execution cost per attempt (USDC)',
  reviewUSDC: 'Review cost per attempt (USDC)',
  acceptancePercent: 'Assumed acceptance (%)',
  outagePercent: 'Worker capacity unavailable (%)',
};
let selected, tasks, result;
const settings = () =>
  Object.fromEntries(
    Object.keys(fields).map((key) => [
      key,
      $(key).value.trim() === '' ? NaN : Number($(key).value),
    ])
  );
function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(
    new Blob(
      [
        typeof content === 'string'
          ? content
          : JSON.stringify(content, null, 2) + '\n',
      ],
      { type }
    )
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('status').textContent = `Downloaded ${name}.`;
}
function select(task) {
  selected = task;
  for (const button of $('tasks').children)
    button.setAttribute('aria-pressed', String(button.dataset.id === task.id));
  $('domain').textContent = task.domain.replaceAll('-', ' ').toUpperCase();
  $('task-title').textContent = task.title;
  $('goal').textContent = task.goal;
  for (const [id, items] of [
    ['deliverables', task.deliverables],
    ['criteria', task.acceptanceCriteria],
  ]) {
    $(id).replaceChildren(
      ...items.map((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      })
    );
  }
}
function update() {
  try {
    result = plan(settings());
    $('error').textContent = '';
    $('accepted').textContent = format(result.accepted);
    $('constraint').textContent = `Limiting capacity: ${result.bottlenecks.join(
      ' + '
    )}. ${format(result.deferred)} offers deferred.`;
    $('bars').replaceChildren(
      ...Object.entries(result.capacity).map(([name, value]) => {
        const row = document.createElement('div');
        row.className = 'bar';
        const label = document.createElement('span');
        label.textContent = name;
        const track = document.createElement('div');
        track.className = 'track';
        const fill = document.createElement('div');
        fill.className = 'fill';
        fill.style.width = `${
          (value / Math.max(1, ...Object.values(result.capacity))) * 100
        }%`;
        track.append(fill);
        const number = document.createElement('b');
        number.textContent = format(value);
        row.append(label, track, number);
        return row;
      })
    );
    const metrics = [
      ['Admitted / not accepted', `${result.admitted} / ${result.notAccepted}`],
      [
        'Full reserve / uncommitted (USDC)',
        `${format(result.reserveUSDC)} / ${format(result.uncommittedUSDC)}`,
      ],
      [
        'Expected spend / remaining (USDC)',
        `${format(result.spentUSDC)} / ${format(result.remainingUSDC)}`,
      ],
      [
        'Review hours / minutes per accepted',
        `${format(result.reviewHours)} / ${format(result.minutesPerAccepted)}`,
      ],
      ['Expected cost per accepted (USDC)', format(result.costPerAcceptedUSDC)],
    ];
    $('metrics').replaceChildren(
      ...metrics.map(([label, value]) => {
        const div = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        div.append(dt, dd);
        return div;
      })
    );
  } catch (error) {
    result = null;
    $('accepted').textContent = '—';
    $('constraint').textContent =
      'Correct the scenario inputs to calculate capacity.';
    $('bars').replaceChildren();
    $('metrics').replaceChildren();
    $('error').textContent = error.message;
  }
  for (const id of ['export-plan', 'export-report', 'export-order'])
    $(id).disabled = !result;
}
async function init() {
  const response = await fetch('./tasks.json');
  if (!response.ok)
    throw new Error(
      'Work categories could not load. Reload the page or open the repository guide.'
    );
  tasks = await response.json();
  for (const task of tasks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'task';
    button.dataset.id = task.id;
    button.setAttribute('aria-pressed', 'false');
    const category = document.createElement('span');
    category.textContent = task.category;
    const title = document.createElement('strong');
    title.textContent = task.title;
    button.append(category, title);
    button.addEventListener('click', () => select(task));
    $('tasks').append(button);
  }
  for (const [key, label] of Object.entries(fields)) {
    const field = document.createElement('label');
    field.htmlFor = key;
    field.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.id = key;
    input.name = key;
    input.step = '1';
    input.min = ['days', 'hoursPerJob', 'reviewMinutes', 'rewardUSDC'].includes(
      key
    )
      ? '1'
      : '0';
    input.max = key.endsWith('Percent')
      ? '100'
      : key === 'days'
      ? '365'
      : key === 'hoursPerJob'
      ? '8760'
      : key === 'reviewMinutes'
      ? '1440'
      : key === 'budgetUSDC'
      ? '1000000000'
      : '1000000';
    input.required = true;
    input.value = defaults[key];
    field.append(input);
    $('fields').append(field);
  }
  $('scenario').addEventListener('submit', (e) => e.preventDefault());
  $('scenario').addEventListener('input', () => {
    document
      .querySelectorAll('[data-preset]')
      .forEach((x) => x.setAttribute('aria-pressed', 'false'));
    update();
  });
  for (const button of document.querySelectorAll('[data-preset]'))
    button.addEventListener('click', () => {
      const preset = button.dataset.preset;
      const values = {
        ...defaults,
        ...(preset === 'review'
          ? { reviewerHours: 4 }
          : preset === 'outage'
          ? { outagePercent: 80 }
          : {}),
      };
      for (const [key, value] of Object.entries(values)) $(key).value = value;
      document
        .querySelectorAll('[data-preset]')
        .forEach((x) => x.setAttribute('aria-pressed', String(x === button)));
      update();
    });
  $('export-plan').addEventListener(
    'click',
    () => result && download('phase8-capacity-plan.json', result)
  );
  $('export-order').addEventListener(
    'click',
    () =>
      result &&
      download(
        `phase8-${selected.id}-work-order.json`,
        workOrder(selected, settings())
      )
  );
  $('export-report').addEventListener(
    'click',
    () =>
      result &&
      download(
        'phase8-capacity-report.md',
        reportMarkdown(result),
        'text/markdown'
      )
  );
  select(tasks[0]);
  update();
}
init().catch((error) => {
  $('error').textContent = error.message;
  for (const id of ['export-plan', 'export-report', 'export-order'])
    $(id).disabled = true;
});
