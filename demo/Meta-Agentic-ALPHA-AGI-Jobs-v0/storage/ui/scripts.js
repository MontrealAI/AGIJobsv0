const governanceButton = document.querySelector('[data-action="open-governance"]');
if (governanceButton) {
  governanceButton.addEventListener('click', () => {
    alert(
      'Governance controls routed via AGI Jobs v0 (v2) timelock. Approvals required: 2. Use dashboard to co-sign.'
    );
  });
}

async function loadLatestReport() {
  try {
    const response = await fetch('../latest_run.json');
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const metric = document.querySelector('.metric strong');
    if (metric && payload.estimatedAlphaProbability) {
      metric.textContent = `${(payload.estimatedAlphaProbability * 100).toFixed(1)}%`;
    }
  } catch (error) {
    console.warn('Unable to hydrate dashboard', error);
  }
}

loadLatestReport();
