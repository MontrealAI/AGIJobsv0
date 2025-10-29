const loadButton = document.getElementById('loadButton');
const fileInput = document.getElementById('fileInput');
const chartCanvas = document.getElementById('complianceChart');
let chartContext = chartCanvas.getContext('2d');

loadButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFile);

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      renderDashboard(data);
    } catch (err) {
      alert('Invalid JSON payload.');
    }
  };
  reader.readAsText(file);
}

function renderDashboard(data) {
  const state = data.state;
  const compliance = data.compliance;
  const ens = data.ens || {};
  document.getElementById('stakeLocked').textContent = formatNumber(state.stake_locked);
  document.getElementById('totalRewards').textContent = formatNumber(state.total_rewards);
  document.getElementById('antifragilityIndex').textContent = state.antifragility_index.toFixed(2);
  document.getElementById('strategicAlpha').textContent = state.strategic_alpha_index.toFixed(2);
  document.getElementById('activeJobs').textContent = state.active_jobs;
  document.getElementById('complianceScore').textContent = compliance.overall.toFixed(2);
  document.getElementById('ensDomain').textContent = ens.domain || '–';
  document.getElementById('ensOwner').textContent = ens.owner || '–';
  document.getElementById('ensSource').textContent = ens.source || '–';

  const labels = [];
  const values = [];
  Object.values(compliance.dimensions).forEach((dimension) => {
    labels.push(dimension.name);
    values.push(dimension.score);
  });
  drawRadarChart(labels, values);
  renderAudit(state.audit_log || []);
  renderStakeLedger(data.stake_ledger || []);
  renderAutopilot(data.autopilot);
}

function drawRadarChart(labels, values) {
  const ctx = chartContext;
  ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  const centerX = chartCanvas.width / 2;
  const centerY = chartCanvas.height / 2;
  const radius = Math.min(centerX, centerY) - 20;
  const stepAngle = (Math.PI * 2) / labels.length;

  ctx.strokeStyle = 'rgba(127, 207, 255, 0.4)';
  ctx.fillStyle = 'rgba(74, 208, 255, 0.35)';
  ctx.beginPath();

  labels.forEach((label, index) => {
    const value = values[index];
    const angle = index * stepAngle - Math.PI / 2;
    const pointRadius = radius * value;
    const x = centerX + Math.cos(angle) * pointRadius;
    const y = centerY + Math.sin(angle) * pointRadius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.fill();

  ctx.fillStyle = '#7fcfff';
  ctx.font = '14px Inter, sans-serif';
  labels.forEach((label, index) => {
    const angle = index * stepAngle - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (radius + 14);
    const y = centerY + Math.sin(angle) * (radius + 14);
    ctx.fillText(label, x - 30, y);
  });
}

function renderAudit(entries) {
  const container = document.getElementById('auditLog');
  container.innerHTML = '';
  entries.slice().reverse().forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry;
    container.appendChild(li);
  });
}

function renderStakeLedger(events) {
  const tableBody = document.getElementById('stakeLedger');
  tableBody.innerHTML = '';
  if (!Array.isArray(events) || events.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No stake events recorded yet.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }
  events.forEach((event) => {
    const row = document.createElement('tr');
    appendCell(row, event.event || '—');
    appendCell(row, formatNumber(event.amount || 0));
    appendCell(row, formatNumber(event.total_locked || 0));
    appendCell(row, event.timestamp || '—');
    tableBody.appendChild(row);
  });
}

function appendCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  row.appendChild(cell);
}

function renderAutopilot(autopilot) {
  const summary = document.getElementById('autopilotSummary');
  const container = document.getElementById('autopilotReports');
  container.innerHTML = '';
  if (!autopilot) {
    summary.textContent = 'No autopilot execution detected yet.';
    return;
  }
  summary.textContent = `Executed ${autopilot.executed_cycles}/${autopilot.cycles} cycles with ${autopilot.safety_drills} safety drills.`;
  (autopilot.reports || []).forEach((report) => {
    const card = document.createElement('article');
    const heading = document.createElement('h3');
    heading.textContent = `Cycle ${report.cycle}`;
    card.appendChild(heading);

    const decisionList = document.createElement('ul');
    (report.decisions || []).forEach((decision) => {
      const li = document.createElement('li');
      li.textContent = `${decision.job_id}: expected ${formatNumber(decision.expected_value)} | confidence ${(decision.confidence * 100).toFixed(1)}%`;
      decisionList.appendChild(li);
    });
    card.appendChild(decisionList);
    container.appendChild(card);
  });
}

function formatNumber(value) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
