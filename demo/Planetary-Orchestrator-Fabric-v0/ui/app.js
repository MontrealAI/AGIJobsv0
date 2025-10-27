const DATA_PATHS = ["data/latest.json", "data/fabric-ci.json", "data/sample.json"];

async function loadData() {
  for (const path of DATA_PATHS) {
    try {
      const response = await fetch(path, { cache: "no-cache" });
      if (!response.ok) continue;
      const payload = await response.json();
      if (payload?.report) {
        return { path, payload };
      }
    } catch (error) {
      console.warn(`Failed to load ${path}`, error);
    }
  }
  throw new Error("No telemetry JSON available. Run npm run demo:planetary-fabric:run first.");
}

function setStatus(text, status) {
  const banner = document.getElementById("status-banner");
  banner.textContent = text;
  banner.classList.remove("ok", "warn");
  banner.classList.add(status);
}

function renderUnstoppable(report) {
  const scoreEl = document.getElementById("unstoppable-score");
  const floorEl = document.getElementById("unstoppable-floor");
  const needle = document.getElementById("unstoppable-needle");
  const summary = document.getElementById("unstoppable-summary");

  const score = report.unstoppableScore * 100;
  const floor = report.ownerControls.unstoppableScoreFloor * 100;
  scoreEl.textContent = `${score.toFixed(2)}%`;
  floorEl.textContent = `${floor.toFixed(2)}%`;
  const angle = Math.min(180, Math.max(0, (score / 100) * 180));
  needle.style.transform = `rotate(${angle}deg)`;
  const pass = score >= floor;
  summary.textContent = pass
    ? `Unstoppable score locked above floor (≥${floor.toFixed(2)}%). Planetary fabric confirmed owner-dominant.`
    : `Score dipped below floor – rerun CI ritual immediately.`;
  setStatus(
    pass
      ? `Unstoppable ${score.toFixed(2)}% · checkpoint ${report.checkpointCreated}`
      : `Attention: unstoppable ${score.toFixed(2)}% below floor ${floor.toFixed(2)}%`,
    pass ? "ok" : "warn"
  );
}

function renderThroughput(report) {
  document.getElementById("jobs-completed").textContent = report.completedJobs.toLocaleString();
  document.getElementById("jobs-total").textContent = report.totalJobsRequested.toLocaleString();
  document.getElementById("jobs-reassign").textContent = report.reassignments.toLocaleString();
  document.getElementById("jobs-cross").textContent = report.crossShardTransfers.toLocaleString();
  document.getElementById("jobs-spillover").textContent = report.spillovers.toLocaleString();
  document.getElementById("jobs-latency").textContent = report.averageLatencyMs.toFixed(2);
}

function renderShards(report) {
  const tbody = document.getElementById("shard-table");
  tbody.innerHTML = "";
  report.shardSummaries.forEach((shard) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${shard.id}</td>
      <td>${shard.completed.toLocaleString()}</td>
      <td>${(shard.failureRate * 100).toFixed(2)}%</td>
      <td>${shard.spillovers.toLocaleString()}</td>
      <td>${shard.crossRegionIntake.toLocaleString()}</td>
      <td>${shard.maxQueueDepth.toLocaleString()}</td>
      <td>${shard.averageLatencyMs.toFixed(2)}</td>
    `;
    if (shard.failureRate >= 0.02) {
      row.classList.add("warn");
    }
    tbody.appendChild(row);
  });
}

function renderNodes(report) {
  const tbody = document.getElementById("node-table");
  tbody.innerHTML = "";
  report.nodeSummaries.forEach((node) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${node.id}</td>
      <td>${node.shard}</td>
      <td>${node.assignments.toLocaleString()}</td>
      <td>${node.failures.toLocaleString()}</td>
      <td>${node.capacity}</td>
      <td>${node.meanThroughput}</td>
      <td><span class="status-pill ${node.online ? "online" : "offline"}">${node.online ? "Online" : "Offline"}</span></td>
    `;
    tbody.appendChild(row);
  });
}

function renderTimeline(report, payload) {
  const info = document.getElementById("checkpoint-info");
  info.textContent = `Checkpoint path ${report.checkpointPath} · Created ${report.checkpointCreated}`;
  const list = document.getElementById("timeline-list");
  list.innerHTML = "";
  const events = [
    {
      title: "Run initialised",
      detail: `Snapshot created ${payload.timestamp}`,
    },
    {
      title: "Checkpoint persisted",
      detail: `File saved to ${report.checkpointPath}`,
    },
    {
      title: "Resume verified",
      detail: `${report.completedJobs.toLocaleString()} / ${report.totalJobsRequested.toLocaleString()} jobs finished with unstoppable ${(report.unstoppableScore * 100).toFixed(2)}%`,
    },
  ];
  events.forEach((event) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${event.title}</strong><p>${event.detail}</p>`;
    list.appendChild(item);
  });
}

async function bootstrap() {
  try {
    const { payload, path } = await loadData();
    const report = payload.report;
    renderUnstoppable(report);
    renderThroughput(report);
    renderShards(report);
    renderNodes(report);
    renderTimeline(report, payload);
    const banner = document.getElementById("status-banner");
    banner.dataset.source = path;
  } catch (error) {
    console.error(error);
    setStatus(error.message, "warn");
  }
}

bootstrap();
