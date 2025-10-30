async function loadTelemetry() {
  try {
    const response = await fetch('../alphaevolve_summary.json', { cache: 'no-store' });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    const lines = [];
    lines.push('Best Utility: ' + (data.best?.utility ?? 'n/a'));
    for (const entry of data.history ?? []) {
      lines.push(
        `Gen ${entry.generation}: Utility=${entry.utility.toFixed(2)} | GMV=${entry.gmv.toFixed(2)} | Cost=${entry.cost.toFixed(2)} | Latency=${entry.latency.toFixed(2)} | Fairness=${entry.fairness.toFixed(2)}`
      );
    }
    document.getElementById('telemetry').textContent = lines.join('\n');
  } catch (error) {
    console.error('Unable to load telemetry', error);
  }
}

loadTelemetry();
