async function fetchCompliance() {
  const response = await fetch('/api/compliance');
  if (!response.ok) {
    throw new Error('Failed to load compliance metrics');
  }
  return response.json();
}

function renderScorecard(data) {
  const container = document.getElementById('scorecard');
  container.innerHTML = '';
  Object.entries(data).forEach(([key, value]) => {
    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('h3');
    title.textContent = key.replace(/_/g, ' ').toUpperCase();
    const metricValue = document.createElement('div');
    metricValue.className = 'value';
    metricValue.textContent = value.toFixed(2);
    card.appendChild(title);
    card.appendChild(metricValue);
    container.appendChild(card);
  });
}

async function init() {
  try {
    const data = await fetchCompliance();
    renderScorecard(data);
  } catch (error) {
    console.error(error);
  }
}

document.addEventListener('DOMContentLoaded', init);
