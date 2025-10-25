import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`);
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`);
  return response.text();
}

function setStatus(element, ok) {
  element.textContent = ok ? "Nominal" : "Intervention required";
  element.classList.toggle("status-ok", ok);
  element.classList.toggle("status-fail", !ok);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function renderMetrics(telemetry) {
  document.querySelector("#dominance-score").textContent = `${telemetry.dominance.score.toFixed(1)} / 100`;
  document.querySelector("#monthly-value").textContent = `$${formatNumber(telemetry.dominance.monthlyValueUSD / 1_000_000_000_000)}T monthly throughput`;
  document.querySelector("#resilience").textContent = `${(telemetry.dominance.averageResilience * 100).toFixed(2)}% resilience`;
  document.querySelector("#energy-utilisation").textContent = `${(telemetry.energy.utilisationPct * 100).toFixed(2)}% utilisation`;
  document.querySelector("#energy-margin").textContent = `${(telemetry.energy.marginPct * 100).toFixed(2)}% safety margin`;
  document.querySelector("#coverage").textContent = `${Math.round(telemetry.governance.averageCoverageSeconds)}s coverage`;
  setStatus(document.querySelector("#coverage-status"), telemetry.governance.coverageOk);
  setStatus(document.querySelector("#energy-status"), telemetry.energy.tripleCheck && telemetry.energy.warnings.length === 0);
  const bridgeList = document.querySelector("#bridge-statuses");
  bridgeList.innerHTML = "";
  for (const [name, data] of Object.entries(telemetry.bridges)) {
    const li = document.createElement("li");
    li.textContent = `${name}: ${data.latencySeconds}s latency · ${data.bandwidthGbps} Gbps · ${data.protocol}`;
    li.classList.add(data.withinFailsafe ? "status-ok" : "status-fail");
    bridgeList.appendChild(li);
  }
}

async function renderMermaidDiagram(path) {
  const source = await fetchText(path);
  await mermaid.initialize({ theme: "dark", securityLevel: "loose" });
  const { svg } = await mermaid.render("kardashev-diagram", source);
  const container = document.querySelector("#mermaid-container");
  container.innerHTML = svg;
}

function attachReflectionButton(telemetry) {
  const button = document.querySelector("#reflect-button");
  button.addEventListener("click", () => {
    const checklist = [
      { label: "Manifesto hash", ok: telemetry.manifest.manifestoHashMatches },
      { label: "Self-improvement plan hash", ok: telemetry.manifest.planHashMatches },
      { label: "Guardian coverage", ok: telemetry.governance.coverageOk },
      { label: "Energy triple check", ok: telemetry.energy.tripleCheck },
      ...Object.entries(telemetry.bridges).map(([name, data]) => ({ label: `Bridge ${name}`, ok: data.withinFailsafe })),
    ];
    const list = document.querySelector("#reflection-checklist");
    list.innerHTML = "";
    checklist.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.label}: ${item.ok ? "✅" : "❌"}`;
      li.classList.add(item.ok ? "status-ok" : "status-fail");
      list.appendChild(li);
    });
  });
}

async function bootstrap() {
  try {
    const telemetry = await fetchJson("./output/kardashev-telemetry.json");
    renderMetrics(telemetry);
    attachReflectionButton(telemetry);
    await renderMermaidDiagram("./output/kardashev-mermaid.mmd");
  } catch (error) {
    console.error(error);
    const container = document.querySelector("#mermaid-container");
    container.textContent = `Failed to load assets: ${error}`;
    container.classList.add("status-fail");
  }
}

bootstrap();
