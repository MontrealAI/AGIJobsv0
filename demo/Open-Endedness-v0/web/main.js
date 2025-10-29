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
  const gmvData = strategies.map((name) => metrics[name].total_revenue);
  const roiData = strategies.map((name) => metrics[name].roi);
  const tasks = new Set();
  strategies.forEach((name) => {
    Object.keys(metrics[name].task_frequency).forEach((task) => tasks.add(task));
  });
  const taskList = Array.from(tasks);
  const allocationData = strategies.map((name) => {
    return taskList.map((task) => metrics[name].task_frequency[task] || 0);
  });
  return { strategies, gmvData, roiData, taskList, allocationData };
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

  ensureChart('roiChart', {
    type: 'line',
    data: {
      labels: data.strategies,
      datasets: [
        {
          label: 'ROI (GMV / FM Spend)',
          data: data.roiData,
          fill: false,
          borderColor: '#facc15',
          tension: 0.3,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: 'Return on Foundation Model Spend' },
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
