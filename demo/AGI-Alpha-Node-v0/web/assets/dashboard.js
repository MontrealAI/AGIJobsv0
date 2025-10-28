(async function initDashboard() {
  const metricsEl = document.getElementById("metrics");
  const drillLogEl = document.getElementById("drill-log");

  async function fetchJSON(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);
    return response.json();
  }

  async function fetchMetrics() {
    const response = await fetch("/metrics", { cache: "no-cache" });
    if (!response.ok) throw new Error("Unable to reach metrics endpoint");
    const text = await response.text();
    const lines = text
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.trim().split(" "));
    return lines.map(([name, value]) => ({ name, value: Number(value).toFixed(4) }));
  }

  function renderMetrics(items) {
    metricsEl.innerHTML = "";
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "metric-card";
      card.innerHTML = `<div class="metric-title">${item.name}</div><div class="metric-value">${item.value}</div>`;
      metricsEl.appendChild(card);
    });
  }

  async function refresh() {
    try {
      const [metrics, status] = await Promise.all([
        fetchMetrics(),
        fetchJSON("/status.json").catch(() => ({ ens_verified: true, stake_sufficient: true, paused: false })),
      ]);
      renderMetrics(metrics);
      drillLogEl.textContent = JSON.stringify(await fetchJSON("/antifragility.json").catch(() => ({ message: "Drill data pending" })), null, 2);
      document.getElementById("ens-status").classList.toggle("badge-error", !status.ens_verified);
      document.getElementById("stake-status").classList.toggle("badge-error", !status.stake_sufficient);
      document.getElementById("governance-status").classList.toggle("badge-error", status.paused);
    } catch (error) {
      drillLogEl.textContent = `Telemetry unavailable: ${error.message}`;
    }
  }

  function bootMermaid() {
    if (window.mermaid) {
      window.mermaid.initialize({ theme: "dark", startOnLoad: true });
      window.mermaid.run({ nodes: document.querySelectorAll(".mermaid") });
    }
  }

  await refresh();
  bootMermaid();
  setInterval(refresh, 15000);
})();
