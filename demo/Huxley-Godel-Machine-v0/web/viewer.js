const SUMMARY_FIELDS = [
  { key: "gmv", label: "Total GMV" },
  { key: "cost", label: "Total Cost" },
  { key: "profit", label: "Net Profit" },
  { key: "roi", label: "ROI (x)" },
];

const currency = (value) => `$ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function loadTelemetry() {
  const response = await fetch("../artifacts/hgm_run.json");
  if (!response.ok) {
    throw new Error("Run the demo to generate artifacts/ hgm_run.json");
  }
  return response.json();
}

function renderSummary(data) {
  const container = document.querySelector("#summary-cards");
  container.innerHTML = "";
  for (const field of SUMMARY_FIELDS) {
    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("h3");
    title.textContent = field.label;
    const value = document.createElement("p");
    value.textContent = field.key === "roi" ? data.ledger[field.key].toFixed(2) : currency(data.ledger[field.key]);
    card.append(title, value);
    container.append(card);
  }
  if (data.baseline_profit !== null) {
    const liftCard = document.createElement("div");
    liftCard.className = "card";
    const title = document.createElement("h3");
    title.textContent = "Profit Lift vs Baseline";
    const lift = data.hgm_profit - data.baseline_profit;
    const pct = data.baseline_profit === 0 ? Infinity : (lift / Math.abs(data.baseline_profit)) * 100;
    const value = document.createElement("p");
    value.innerHTML = `${currency(lift)} <span style="font-size:0.85rem">(${pct.toFixed(1)}%)</span>`;
    liftCard.append(title, value);
    container.append(liftCard);
  }
}

function renderLineage(data) {
  const container = document.querySelector("#lineage");
  container.innerHTML = "";
  const stats = new Map();
  for (const event of data.agent_events) {
    const record = stats.get(event.agent_id) || {
      agentId: event.agent_id,
      evaluations: 0,
      successes: 0,
      quality: event.payload.quality ?? 0,
      lastStep: event.step,
    };
    if (event.action === "EXPAND") {
      record.quality = event.payload.quality;
      record.lastStep = event.step;
    } else if (event.action === "EVALUATE") {
      record.evaluations += 1;
      record.successes += event.payload.success || 0;
      record.quality = event.payload.quality;
      record.lastStep = event.step;
    }
    stats.set(event.agent_id, record);
  }
  const sorted = Array.from(stats.values()).sort((a, b) => b.successes - a.successes);
  for (const record of sorted) {
    const card = document.createElement("div");
    card.className = "lineage-card";
    card.innerHTML = `
      <h3>${record.agentId}${record.agentId === data.final_agent_id ? " ⭐" : ""}</h3>
      <p><strong>Quality:</strong> ${(record.quality * 100).toFixed(1)}%</p>
      <p><strong>Evaluations:</strong> ${record.evaluations}</p>
      <p><strong>Successes:</strong> ${record.successes}</p>
      <p><strong>Last Step:</strong> ${record.lastStep}</p>
    `;
    container.append(card);
  }
  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.textContent = "Run the demo to see the HGM lineage blossom.";
    container.append(empty);
  }
}

async function init() {
  try {
    const telemetry = await loadTelemetry();
    renderSummary(telemetry);
    renderLineage(telemetry);
  } catch (error) {
    const container = document.querySelector("#summary-cards");
    container.innerHTML = `<div class="card"><h3>Ready to Run</h3><p>${error.message}</p></div>`;
  }
}

init();
