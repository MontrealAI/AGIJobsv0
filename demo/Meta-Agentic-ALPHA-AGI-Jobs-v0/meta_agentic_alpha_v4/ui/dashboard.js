const DATA_URL = "dashboard-data-v4.json";

const formatPercent = (value) =>
  typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";

const renderMetric = (container, field, formatter = formatPercent) => {
  const node = container.querySelector(`[data-field="${field}"]`);
  if (!node) return;
  const value = window.__metaAgentic?.[field];
  node.textContent = formatter(value);
};

const renderOwnerControls = (payload) => {
  const container = document.getElementById("owner-controls");
  container.innerHTML = "";
  const { controlTower = {}, plan = {}, mission = {} } = payload;
  const panels = controlTower.consolePanels || [];

  const actionsCard = document.createElement("div");
  actionsCard.className = "card";
  actionsCard.innerHTML = `
    <h3>Quick Actions</h3>
    <ul>${(controlTower.ownerActions || [])
      .map((action) => `<li>${action}</li>`)
      .join("")}</ul>
  `;
  container.appendChild(actionsCard);

  panels.forEach((panel) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${panel.label}</h3>
      <p>${panel.description}</p>
    `;
    container.appendChild(card);
  });

  if (mission?.opportunityDomains) {
    const missionCard = document.createElement("div");
    missionCard.className = "card";
    missionCard.innerHTML = `
      <h3>Opportunity Domains</h3>
      <ul>${mission.opportunityDomains.map((item) => `<li>${item}</li>`).join("")}</ul>
    `;
    container.appendChild(missionCard);
  }

  const planCard = document.createElement("div");
  planCard.className = "card";
  planCard.innerHTML = `
    <h3>Plan</h3>
    <ul>
      <li><strong>Budget Max:</strong> ${plan.budget?.max ?? "—"}</li>
      <li><strong>Approvals:</strong> ${(plan.approvals || []).join(", ")}</li>
      <li><strong>Confirmations:</strong> ${(plan.confirmations || []).join(", ")}</li>
    </ul>
  `;
  container.appendChild(planCard);
};

const renderDetails = (payload) => {
  const scenarioNode = document.getElementById("scenario-details");
  const planNode = document.getElementById("plan-details");
  scenarioNode.innerHTML = "";
  planNode.innerHTML = "";

  const { scenario = {}, owner = {}, treasury = {}, gasless = {} } = payload;

  const addDetail = (container, key, value) => {
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    container.appendChild(dt);
    container.appendChild(dd);
  };

  addDetail(scenarioNode, "Title", scenario.title || "—");
  addDetail(scenarioNode, "Owner", owner.address || "—");
  addDetail(scenarioNode, "Guardians", (owner.guardians || []).join(", "));
  addDetail(scenarioNode, "Emergency Pause", owner.emergency_pause ? "Enabled" : "Disabled");

  addDetail(planNode, "Budget Max", payload.plan?.budget?.max ?? "—");
  addDetail(planNode, "Treasury Token", treasury.token || "AGIALPHA");
  addDetail(planNode, "Gasless Bundler", gasless.bundler || "—");
  addDetail(planNode, "Paymaster", gasless.paymaster || "—");

  const missionDomains = document.getElementById("mission-domains");
  missionDomains.innerHTML = (payload.mission?.opportunity_domains || [])
    .map((item) => `<li>${item}</li>`)
    .join("");

  const guardianList = document.getElementById("guardian-list");
  guardianList.innerHTML = (payload.confirmations || [])
    .map((entry) => `<li>${entry}</li>`)
    .join("");
};

const renderPhases = (payload) => {
  const tbody = document.querySelector("#phase-table tbody");
  tbody.innerHTML = "";
  (payload.phaseScores || []).forEach((score) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${score.label}</td>
      <td>${score.state}</td>
      <td>${(score.completion * 100).toFixed(0)}%</td>
      <td>${score.weight.toFixed(2)}</td>
      <td>${score.metric}</td>
    `;
    tbody.appendChild(tr);
  });
};

const renderDiagrams = (payload) => {
  mermaid.initialize({ startOnLoad: false, theme: "dark" });
  const timeline = document.getElementById("timeline-diagram");
  const operatingSystem = document.getElementById("operating-system-diagram");
  const ownerControl = document.getElementById("owner-control-diagram");

  const diagrams = [
    [timeline, payload.timeline],
    [operatingSystem, payload.operatingSystem],
    [ownerControl, payload.ownerControlMap],
  ];

  diagrams.forEach(([node, definition], index) => {
    if (!node || !definition) return;
    const id = `mermaid-v4-${index}-${Math.random().toString(36).slice(2, 8)}`;
    mermaid.render(id, definition).then(({ svg }) => {
      node.innerHTML = svg;
    });
  });
};

const renderConsoleActions = (payload) => {
  const list = document.getElementById("console-actions");
  list.innerHTML = (payload.consoleActions || []).map((action) => `<li><code>${action}</code></li>`).join("");
};

const renderScoreboard = (payload) => {
  const scoreboardNode = document.getElementById("scoreboard-json");
  const scoreboard = payload.scoreboard || {};
  scoreboardNode.textContent = JSON.stringify(scoreboard, null, 2);
};

const render = (payload) => {
  window.__metaAgentic = payload;
  const metrics = document.getElementById("hero-metrics");
  renderMetric(metrics, "alphaReadiness");
  renderMetric(metrics, "alphaCompoundingIndex");
  renderMetric(metrics, "alphaDominance");
  renderMetric(metrics, "governanceAlignment");
  renderOwnerControls(payload);
  renderDetails(payload);
  renderPhases(payload);
  renderDiagrams(payload);
  renderConsoleActions(payload);
  renderScoreboard(payload);
};

const bootstrap = async () => {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load dashboard data (${response.status})`);
    const payload = await response.json();
    render(payload);
  } catch (error) {
    console.error(error);
    const fallback = document.createElement("div");
    fallback.className = "panel";
    fallback.innerHTML = `
      <h2>Dashboard data unavailable</h2>
      <p>${error.message}</p>
    `;
    document.body.prepend(fallback);
  }
};

document.addEventListener("DOMContentLoaded", bootstrap);
