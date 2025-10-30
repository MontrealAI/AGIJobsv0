const SUMMARY_FIELDS = [
  { key: 'gmv', label: 'GMV', formatter: (v) => currency(v) },
  { key: 'cost', label: 'Cost', formatter: (v) => currency(v) },
  { key: 'profit', label: 'Profit', formatter: (v) => currency(v) },
  {
    key: 'roi',
    label: 'ROI (x)',
    formatter: (value) => (value == null ? '∞' : Number(value).toFixed(2)),
  },
];

const currency = (value) =>
  `$ ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

async function loadComparison() {
  const response = await fetch('../artifacts/comparison.json');
  if (!response.ok) {
    throw new Error(
      'Run the simulator to generate web/artifacts/comparison.json'
    );
  }
  return response.json();
}

function renderSummary(data) {
  const container = document.querySelector('#summary-cards');
  container.innerHTML = '';
  const strategies = [
    { title: data.hgm.summary.strategy || 'HGM', summary: data.hgm.summary },
    {
      title: data.baseline.summary.strategy || 'Baseline',
      summary: data.baseline.summary,
    },
  ];

  for (const entry of strategies) {
    const card = document.createElement('div');
    card.className = 'card';
    const heading = document.createElement('h3');
    heading.textContent = entry.title;
    card.append(heading);
    for (const field of SUMMARY_FIELDS) {
      const valueRow = document.createElement('p');
      valueRow.innerHTML = `<strong>${field.label}:</strong> ${field.formatter(
        entry.summary[field.key]
      )}`;
      card.append(valueRow);
    }
    container.append(card);
  }

  const lift =
    Number(data.hgm.summary.profit || 0) -
    Number(data.baseline.summary.profit || 0);
  const deltaCard = document.createElement('div');
  deltaCard.className = 'card highlight';
  deltaCard.innerHTML = `
    <h3>Profit Lift</h3>
    <p>${currency(lift)} vs baseline</p>
  `;
  container.append(deltaCard);
}

function renderRoiChart(data) {
  const ctx = document.getElementById('roi-chart');
  if (!ctx) {
    return;
  }

  const labels = data.hgm.timeline.map((entry) => entry.step);
  const hgmSeries = data.hgm.timeline.map((entry) =>
    entry.roi == null ? null : Number(entry.roi)
  );
  const baselineSeries = data.baseline.timeline.map((entry) =>
    entry.roi == null ? null : Number(entry.roi)
  );

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'HGM',
          data: hgmSeries,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.2)',
          spanGaps: true,
        },
        {
          label: 'Baseline',
          data: baselineSeries,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.2)',
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Step' },
        },
        y: {
          title: { display: true, text: 'ROI (x)' },
          beginAtZero: true,
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed.y;
              return `${context.dataset.label}: ${
                value == null ? '∞' : value.toFixed(2)
              }x`;
            },
          },
        },
      },
    },
  });
}

function renderLogs(data) {
  const container = document.querySelector('#log-summary');
  if (!container) {
    return;
  }
  container.innerHTML = '';

  const renderLogColumn = (title, logs) => {
    const card = document.createElement('div');
    card.className = 'card';
    const heading = document.createElement('h3');
    heading.textContent = title;
    card.append(heading);

    if (!logs.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No activity recorded.';
      card.append(empty);
      return card;
    }

    const list = document.createElement('ul');
    const preview = logs.slice(-8);
    for (const item of preview) {
      const li = document.createElement('li');
      li.textContent = item;
      list.append(li);
    }
    card.append(list);
    return card;
  };

  container.append(renderLogColumn('HGM', data.hgm.logs || []));
  container.append(renderLogColumn('Baseline', data.baseline.logs || []));
}

function renderLineage(data) {
  const container = document.querySelector('#lineage');
  container.innerHTML = '';
  const timeline = data.hgm.timeline || [];
  if (!timeline.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Run the demo to see the HGM lineage blossom.';
    container.append(empty);
    return;
  }

  const finalSnapshot = timeline[timeline.length - 1];
  const agents = finalSnapshot.agents || [];
  if (!agents.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No agent lineage data recorded.';
    container.append(empty);
    return;
  }

  const sorted = agents
    .map((agent) => ({
      id: agent.agent_id || agent.agentId,
      quality: agent.quality,
      successes: agent.direct_success || agent.successes || 0,
      failures: agent.direct_failure || agent.failures || 0,
    }))
    .sort((a, b) => b.successes - a.successes)
    .slice(0, 6);

  for (const record of sorted) {
    const card = document.createElement('div');
    card.className = 'lineage-card';
    const roi =
      record.failures + record.successes === 0
        ? 0
        : record.successes / (record.failures + record.successes);
    card.innerHTML = `
      <h3>${record.id}</h3>
      <p><strong>Quality:</strong> ${(
        Number(record.quality || 0) * 100
      ).toFixed(1)}%</p>
      <p><strong>Successes:</strong> ${record.successes}</p>
      <p><strong>Failures:</strong> ${record.failures}</p>
      <p><strong>Hit Rate:</strong> ${(roi * 100).toFixed(1)}%</p>
    `;
    container.append(card);
  }
}

async function init() {
  try {
    const telemetry = await loadComparison();
    renderSummary(telemetry);
    renderRoiChart(telemetry);
    renderLogs(telemetry);
    renderLineage(telemetry);
  } catch (error) {
    const container = document.querySelector('#summary-cards');
    container.innerHTML = `<div class="card"><h3>Ready to Run</h3><p>${error.message}</p></div>`;
  }
}

init();
