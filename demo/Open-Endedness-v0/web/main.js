const loadButton = document.getElementById('load');
const input = document.getElementById('jsonInput');
const charts = {};

async function fetchMetrics() {
  const response = await fetch(input.value);
  if (!response.ok) {
    throw new Error(`Unable to load metrics: ${response.statusText}`);
  }
  return response.json();
}

function buildDatasets(metrics) {
  const strategies = Object.keys(metrics);
  const safe = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  const gmvData = strategies.map((name) => safe(metrics[name].total_revenue));
  const operationalCostData = strategies.map((name) => safe(metrics[name].operational_cost));
  const fmCostData = strategies.map((name) => safe(metrics[name].fm_cost));
  const roiTotalData = strategies.map((name) => safe(metrics[name].roi_total || metrics[name].roi));
  const roiFmData = strategies.map((name) => safe(metrics[name].roi_fm || metrics[name].roi));
  const pausedSteps = strategies.map((name) => metrics[name].paused_steps || 0);

  const tasks = new Set();
  strategies.forEach((name) => {
    Object.keys(metrics[name].task_frequency).forEach((task) => tasks.add(task));
  });
  const taskList = Array.from(tasks);
  const allocationData = strategies.map((name) => taskList.map((task) => metrics[name].task_frequency[task] || 0));

  const events = strategies.map((name) => ({
    strategy: name,
    paused: metrics[name].paused_steps || 0,
    thermostat: metrics[name].thermostat_events || [],
    sentinel: metrics[name].sentinel_events || [],
    owner: metrics[name].owner_events || [],
  }));

  return {
    strategies,
    gmvData,
    operationalCostData,
    fmCostData,
    roiTotalData,
    roiFmData,
    taskList,
    allocationData,
    events,
    pausedSteps,
  };
}

function ensureChart(ctxId, config) {
  if (charts[ctxId]) {
    charts[ctxId].destroy();
  }
  const ctx = document.getElementById(ctxId);
  charts[ctxId] = new Chart(ctx, config);
}

function renderCharts(data) {
  ensureChart('gmvChart', {
    type: 'bar',
    data: {
      labels: data.strategies,
      datasets: [
        {
          label: 'Total GMV (USD)',
          data: data.gmvData,
          backgroundColor: ['#22d3ee', '#6366f1', '#a855f7'],
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Total GMV per Curriculum',
        },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });

  ensureChart('costChart', {
    type: 'bar',
    data: {
      labels: data.strategies,
      datasets: [
        {
          label: 'Operational Spend',
          data: data.operationalCostData,
          backgroundColor: 'rgba(14, 165, 233, 0.85)',
          stack: 'cost',
        },
        {
          label: 'FM Spend',
          data: data.fmCostData,
          backgroundColor: 'rgba(244, 114, 182, 0.85)',
          stack: 'cost',
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: 'Spend Profile (USD)' },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true },
      },
    },
  });

  ensureChart('roiChart', {
    type: 'line',
    data: {
      labels: data.strategies,
      datasets: [
        {
          label: 'ROI (Total)',
          data: data.roiTotalData,
          fill: false,
          borderColor: '#facc15',
          tension: 0.3,
        },
        {
          label: 'ROI (Foundation Model)',
          data: data.roiFmData,
          fill: false,
          borderColor: '#4ade80',
          borderDash: [6, 4],
          tension: 0.3,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: 'Return Profiles' },
      },
      scales: { y: { beginAtZero: true } },
    },
  });

  ensureChart('allocationChart', {
    type: 'radar',
    data: {
      labels: data.taskList,
      datasets: data.strategies.map((name, index) => ({
        label: name,
        data: data.allocationData[index],
        fill: true,
        backgroundColor: `rgba(${50 + index * 60}, ${100 + index * 40}, 240, 0.2)`,
        borderColor: `rgba(${50 + index * 60}, ${100 + index * 40}, 240, 1)`,
        pointBackgroundColor: '#f8fafc',
      })),
    },
    options: {
      plugins: {
        title: { display: true, text: 'Task Allocation by Strategy' },
      },
      scales: {
        r: {
          angleLines: { color: 'rgba(148, 163, 184, 0.3)' },
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          suggestedMin: 0,
        },
      },
    },
  });

  renderEvents(data.events);
}

function renderEvents(events) {
  const container = document.getElementById('eventsLog');
  container.innerHTML = '';
  events.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'event-card';
    const heading = document.createElement('h3');
    heading.textContent = entry.strategy;
    card.appendChild(heading);

    const list = document.createElement('ul');
    if (entry.paused) {
      const pauseItem = document.createElement('li');
      pauseItem.innerHTML = `<strong>Owner Pause</strong> • ${entry.paused} steps held`;
      list.appendChild(pauseItem);
    }
    const timeline = [...entry.owner, ...entry.thermostat, ...entry.sentinel]
      .filter((event) => event)
      .sort((a, b) => (a.step || 0) - (b.step || 0));
    timeline.forEach((event) => {
      const item = document.createElement('li');
      item.innerHTML = describeEvent(event);
      list.appendChild(item);
    });
    if (!list.childElementCount) {
      const item = document.createElement('li');
      item.textContent = 'No interventions triggered.';
      list.appendChild(item);
    }
    card.appendChild(list);
    container.appendChild(card);
  });
}

function describeEvent(event) {
  const action = (event.action || 'event').replace(/_/g, ' ');
  const step = event.step !== undefined ? `Step ${event.step}` : 'Step –';
  const details = Object.entries(event)
    .filter(([key]) => !['action', 'step'].includes(key))
    .map(([key, value]) => {
      if (typeof value === 'number') {
        return `${key}: ${value.toFixed(3)}`;
      }
      if (Array.isArray(value)) {
        return `${key}: ${value.join(', ')}`;
      }
      if (typeof value === 'object' && value !== null) {
        return `${key}: ${JSON.stringify(value)}`;
      }
      return `${key}: ${value}`;
    })
    .join(' • ');
  return `<strong>${step}</strong> • ${action}${details ? ` — ${details}` : ''}`;
}

async function load() {
  try {
    const metrics = await fetchMetrics();
    const dataset = buildDatasets(metrics);
    renderCharts(dataset);
  } catch (error) {
    alert(error.message);
  }
}

loadButton.addEventListener('click', load);
load();
