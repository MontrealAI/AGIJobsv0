import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const defaultDataPath = 'data/default-summary.json';
const metricMap = [
  {
    id: 'roiMultiplier',
    label: 'ROI Multiplier',
    formatter: (value) => `${value.toFixed(2)}×`,
    description: 'Aggregate productivity lift versus escrowed value.',
  },
  {
    id: 'netYield',
    label: 'Net Yield (AGI)',
    formatter: (value) => formatNumber(value),
    description: 'Total economic value minus all payouts and buffers.',
  },
  {
    id: 'paybackHours',
    label: 'Payback Horizon',
    formatter: (value) => `${value.toFixed(1)} hours`,
    description: 'Time until generated value overtakes capital committed.',
  },
  {
    id: 'throughputJobsPerDay',
    label: 'Throughput',
    formatter: (value) => `${value.toFixed(2)} jobs/day`,
    description: 'Completed jobs per 24h once the loop stabilises.',
  },
  {
    id: 'validatorConfidence',
    label: 'Validator Confidence',
    formatter: (value) => `${(value * 100).toFixed(2)}%`,
    description: 'Average validator approval confidence in commit–reveal.',
  },
  {
    id: 'automationScore',
    label: 'Automation Score',
    formatter: (value) => value.toFixed(3),
    description: 'Autonomous orchestration coverage for the scenario.',
  },
  {
    id: 'stabilityIndex',
    label: 'Stability Index',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'System resilience combining validator strength and risk buffers.',
  },
  {
    id: 'ownerCommandCoverage',
    label: 'Owner Command Coverage',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Share of critical surfaces with deterministic owner command paths.',
  },
  {
    id: 'treasuryAfterRun',
    label: 'Treasury After Run (AGI)',
    formatter: (value) => formatNumber(value),
    description: 'Treasury balance projected after validator rewards and payouts.',
  },
  {
    id: 'sovereignControlScore',
    label: 'Sovereign Control Score',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Share of smart contracts fully custodied by owner multi-sig safes.',
  },
  {
    id: 'sovereignSafetyScore',
    label: 'Sovereign Safety Mesh',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Composite readiness across pause, alerting, coverage, and scripted responses.',
  },
  {
    id: 'commandLatencyMinutes',
    label: 'Command Latency',
    formatter: (value) => `${value.toFixed(1)} min`,
    description: 'Median multi-sig response time to execute emergency programs.',
  },
  {
    id: 'drillReadiness',
    label: 'Drill Readiness',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Composite readiness across sovereign command drills.',
  },
  {
    id: 'redundancyCoverage',
    label: 'Redundancy Coverage',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Health of failover meshes protecting the orchestration stack.',
  },
  {
    id: 'escalationCoverage',
    label: 'Escalation Coverage',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Escalation playbooks covering emergency contact surfaces.',
  },
  {
    id: 'resilienceScore',
    label: 'Resilience Score',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Overall unstoppable resilience index combining drills, redundancy, and escalation.',
  },
  {
    id: 'expansionScore',
    label: 'Expansion Score',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Composite readiness of the global expansion mesh.',
  },
  {
    id: 'globalReachScore',
    label: 'Global Reach',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Regional launch readiness across sovereign expansion zones.',
  },
  {
    id: 'l2ActivationScore',
    label: 'L2 Activation',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Layer-2 deployment readiness and finality posture.',
  },
  {
    id: 'liquidityCoverageScore',
    label: 'Liquidity Coverage',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Bridge capacity and SLA strength across sovereign liquidity routes.',
  },
  {
    id: 'assertionPassRate',
    label: 'Assertion Pass Rate',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Share of verification assertions passing unstoppable thresholds.',
  },
];

async function loadSummary(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load summary data from ${path}`);
  }
  return response.json();
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function renderMetricCards(summary) {
  const container = document.getElementById('metric-cards');
  container.innerHTML = '';
  for (const metric of metricMap) {
    const card = document.createElement('article');
    card.className = 'metric-card';
    const heading = document.createElement('h3');
    heading.textContent = metric.label;
    const valueEl = document.createElement('strong');
    valueEl.textContent = metric.formatter(summary.metrics[metric.id]);
    const desc = document.createElement('span');
    desc.textContent = metric.description;
    card.append(heading, valueEl, desc);
    container.append(card);
  }
}

function renderOwnerTable(summary) {
  const tbody = document.querySelector('#owner-table tbody');
  tbody.innerHTML = '';
  for (const control of summary.ownerControl.controls) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${control.parameter}</td>
      <td>${control.current}</td>
      <td>${control.target}</td>
      <td><code>${control.script}</code></td>
      <td>${control.description}</td>
    `;
    tbody.append(row);
  }
}

function renderProgramTable(tableId, programs) {
  const table = document.querySelector(`#${tableId} tbody`);
  if (!table) {
    return;
  }
  table.innerHTML = '';
  if (programs.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'No programs defined – authorise scripts to preserve total control.';
    row.append(cell);
    table.append(row);
    return;
  }
  for (const program of programs) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${program.target}</td>
      <td><code>${program.script}</code></td>
      <td>${program.description}</td>
    `;
    table.append(row);
  }
}

function renderCommandCatalog(summary) {
  renderProgramTable('catalog-jobs', summary.ownerCommandPlan.jobPrograms);
  renderProgramTable('catalog-validators', summary.ownerCommandPlan.validatorPrograms);
  renderProgramTable('catalog-adapters', summary.ownerCommandPlan.adapterPrograms);
  renderProgramTable('catalog-modules', summary.ownerCommandPlan.modulePrograms);
  renderProgramTable('catalog-treasury', summary.ownerCommandPlan.treasuryPrograms);
  renderProgramTable('catalog-orchestrator', summary.ownerCommandPlan.orchestratorPrograms);
}

function renderAssignments(summary) {
  const tbody = document.querySelector('#assignment-table tbody');
  tbody.innerHTML = '';
  for (const assignment of summary.assignments) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${assignment.jobName}</strong></td>
      <td>
        <span>${assignment.agentName}</span><br />
        <small>${assignment.agentEns}</small>
      </td>
      <td>${(assignment.endHour - assignment.startHour).toFixed(1)}</td>
      <td>${formatNumber(assignment.rewardAgi)}</td>
      <td>${formatNumber(assignment.rewardStable)}</td>
      <td>${assignment.validatorNames.join(', ')}</td>
      <td>${(assignment.validatorConfidence * 100).toFixed(2)}%</td>
      <td>${formatNumber(assignment.netValue)}</td>
    `;
    tbody.append(row);
  }
}

function renderSovereignty(summary) {
  const pauseResume = document.getElementById('pause-resume');
  pauseResume.innerHTML = `
    <p><strong>Pause:</strong> <code>${summary.ownerSovereignty.pauseScript}</code></p>
    <p><strong>Resume:</strong> <code>${summary.ownerSovereignty.resumeScript}</code></p>
    <p><strong>Median response:</strong> ${summary.ownerSovereignty.responseMinutes} minutes</p>
  `;

  const safetyMesh = summary.sovereignSafetyMesh || {
    safetyScore: 0,
    responseMinutes: 0,
    targetResponseMinutes: 0,
    responseScore: 0,
    circuitBreakerScore: 0,
    alertCoverageScore: 0,
    coverageScore: 0,
    scriptScore: 0,
    alertChannels: [],
    notes: [],
  };

  const safetyScoreEl = document.getElementById('safety-score');
  if (safetyScoreEl) {
    safetyScoreEl.textContent = `${(safetyMesh.safetyScore * 100).toFixed(1)}%`;
  }

  const safetyResponseEl = document.getElementById('safety-response');
  if (safetyResponseEl) {
    safetyResponseEl.textContent = `Response readiness: ${safetyMesh.responseMinutes} minutes (target ≤ ${safetyMesh.targetResponseMinutes} minutes)`;
  }

  const safetyTable = document.querySelector('#safety-metrics tbody');
  if (safetyTable) {
    safetyTable.innerHTML = '';
    const metrics = [
      ['Response assurance', safetyMesh.responseScore],
      ['Circuit breaker coverage', safetyMesh.circuitBreakerScore],
      ['Alert coverage', safetyMesh.alertCoverageScore],
      ['Command coverage', safetyMesh.coverageScore],
      ['Script depth', safetyMesh.scriptScore],
    ];
    for (const [label, value] of metrics) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${label}</td>
        <td>${(value * 100).toFixed(1)}%</td>
      `;
      safetyTable.append(row);
    }
  }

  const coveragePercent = document.getElementById('coverage-percent');
  const coverageNarrative = document.getElementById('coverage-narrative');
  if (coveragePercent && coverageNarrative) {
    coveragePercent.textContent = `${(summary.ownerCommandPlan.commandCoverage * 100).toFixed(1)}%`;
    coverageNarrative.textContent = summary.ownerCommandPlan.coverageNarrative;
  }

  const coverageTable = document.querySelector('#coverage-table tbody');
  if (coverageTable) {
    coverageTable.innerHTML = '';
    const detail = summary.ownerCommandPlan.coverageDetail || {};
    const labelMap = {
      jobs: 'Job programs',
      validators: 'Validator programs',
      stablecoinAdapters: 'Stablecoin adapters',
      modules: 'Protocol modules',
      parameters: 'Parameter overrides',
      pause: 'Emergency pause',
      resume: 'Resume procedure',
      treasury: 'Treasury playbooks',
      orchestrator: 'Orchestrator mesh',
    };
    for (const [surface, ratio] of Object.entries(detail)) {
      const row = document.createElement('tr');
      const label = labelMap[surface] || surface;
      const percent = typeof ratio === 'number' ? (ratio * 100).toFixed(1) : '—';
      row.innerHTML = `
        <td>${label}</td>
        <td>${percent}%</td>
      `;
      coverageTable.append(row);
    }
  }

  const emergencyList = document.getElementById('emergency-contacts');
  emergencyList.innerHTML = '';
  for (const contact of summary.ownerSovereignty.emergencyContacts) {
    const li = document.createElement('li');
    li.textContent = contact;
    emergencyList.append(li);
  }

  const alertList = document.getElementById('alert-channels');
  if (alertList) {
    alertList.innerHTML = '';
    if ((summary.ownerSovereignty.alertChannels || []).length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No alert channels configured.';
      alertList.append(li);
    } else {
      for (const channel of summary.ownerSovereignty.alertChannels) {
        const li = document.createElement('li');
        li.textContent = channel;
        alertList.append(li);
      }
    }
  }

  const safetyNotes = document.getElementById('safety-notes');
  if (safetyNotes) {
    safetyNotes.innerHTML = '';
    const notes = safetyMesh.notes ?? [];
    if (notes.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'All sovereign safety vectors locked at unstoppable thresholds.';
      safetyNotes.append(li);
    } else {
      for (const note of notes) {
        const li = document.createElement('li');
        li.textContent = note;
        safetyNotes.append(li);
      }
    }
  }

  const circuitBody = document.querySelector('#circuit-table tbody');
  circuitBody.innerHTML = '';
  for (const circuit of summary.ownerSovereignty.circuitBreakers) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${circuit.metric}</td>
      <td>${circuit.comparator} ${circuit.threshold}</td>
      <td><code>${circuit.action}</code></td>
      <td>${circuit.description}</td>
    `;
    circuitBody.append(row);
  }

  const upgradeBody = document.querySelector('#upgrade-table tbody');
  upgradeBody.innerHTML = '';
  for (const upgrade of summary.ownerSovereignty.upgradePaths) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${upgrade.module}</td>
      <td><code>${upgrade.script}</code></td>
      <td>${upgrade.description}</td>
    `;
    upgradeBody.append(row);
  }
}

function renderGlobalExpansion(summary) {
  const profile = summary.globalExpansion || {
    expansionScore: 0,
    globalReachScore: 0,
    l2ActivationScore: 0,
    liquidityCoverageScore: 0,
    narrative: 'Global expansion profile unavailable — regenerate reports.',
    regions: [],
    l2Deployments: [],
    bridges: [],
    commandScripts: [],
  };

  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  const expansionScoreEl = document.getElementById('expansion-score');
  if (expansionScoreEl) {
    expansionScoreEl.textContent = percent(profile.expansionScore);
  }
  const reachEl = document.getElementById('expansion-reach');
  if (reachEl) {
    reachEl.textContent = percent(profile.globalReachScore);
  }
  const l2El = document.getElementById('expansion-l2');
  if (l2El) {
    l2El.textContent = percent(profile.l2ActivationScore);
  }
  const liquidityEl = document.getElementById('expansion-liquidity');
  if (liquidityEl) {
    liquidityEl.textContent = percent(profile.liquidityCoverageScore);
  }

  const narrativeEl = document.getElementById('expansion-narrative');
  if (narrativeEl) {
    narrativeEl.textContent = profile.narrative ?? '';
  }

  const regionBody = document.querySelector('#expansion-region-table tbody');
  if (regionBody) {
    regionBody.innerHTML = '';
    if (profile.regions.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'No regions published — execute regional scale programs to unlock planetary reach.';
      row.append(cell);
      regionBody.append(row);
    } else {
      for (const region of profile.regions) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${region.name}</td>
          <td>${region.status.replace('-', ' ')}</td>
          <td>${percent(region.readinessScore)}</td>
          <td>${formatNumber(region.throughputCapacity)} jobs/day • ${percent(region.coverageScore)}</td>
          <td><code>${region.command}</code><br /><small>${region.notes}</small></td>
        `;
        regionBody.append(row);
      }
    }
  }

  const l2Body = document.querySelector('#expansion-l2-table tbody');
  if (l2Body) {
    l2Body.innerHTML = '';
    if (profile.l2Deployments.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'No L2 deployments staged — execute L2 upgrade programs.';
      row.append(cell);
      l2Body.append(row);
    } else {
      for (const deployment of profile.l2Deployments) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${deployment.chain}</td>
          <td>${deployment.status.replace('-', ' ')}</td>
          <td>${percent(deployment.readinessScore)}</td>
          <td>${deployment.finalityMinutes.toFixed(1)} min</td>
          <td>${Math.round(deployment.transactionsPerSecond)} tps</td>
          <td><code>${deployment.command}</code><br /><small>${deployment.contractSet.join(', ')}</small></td>
        `;
        l2Body.append(row);
      }
    }
  }

  const bridgeBody = document.querySelector('#expansion-bridge-table tbody');
  if (bridgeBody) {
    bridgeBody.innerHTML = '';
    if (profile.bridges.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'No liquidity bridges established — authorize bridge programs to sustain global flow.';
      row.append(cell);
      bridgeBody.append(row);
    } else {
      for (const bridge of profile.bridges) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${bridge.source} → ${bridge.target}</td>
          <td>${bridge.status}</td>
          <td>${percent(bridge.reliabilityScore)}</td>
          <td>${formatNumber(bridge.capacityMillions)}M • SLA ${bridge.slaMinutes} min</td>
          <td><code>${bridge.command}</code></td>
        `;
        bridgeBody.append(row);
      }
    }
  }

  const commandList = document.getElementById('expansion-commands');
  if (commandList) {
    commandList.innerHTML = '';
    if (profile.commandScripts.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No expansion commands scripted — sync command catalog.';
      commandList.append(li);
    } else {
      for (const script of profile.commandScripts) {
        const li = document.createElement('li');
        li.innerHTML = `<code>${script}</code>`;
        commandList.append(li);
      }
    }
  }
}

function renderResilience(summary) {
  const profile = summary.resilienceProfile || {
    unstoppableScore: 0,
    responseLatencyMinutes: 0,
    drillReadiness: 0,
    redundancyCoverage: 0,
    escalationCoverage: 0,
    drills: [],
    redundancies: [],
    escalationMatrix: [],
  };

  const scoreEl = document.getElementById('resilience-score');
  if (scoreEl) {
    scoreEl.textContent = `${(profile.unstoppableScore * 100).toFixed(1)}%`;
  }

  const latencyEl = document.getElementById('resilience-latency');
  if (latencyEl) {
    latencyEl.textContent = `Median command latency ${profile.responseLatencyMinutes.toFixed(1)} minutes`;
  }

  const coverageEl = document.getElementById('resilience-coverage');
  if (coverageEl) {
    coverageEl.textContent = `Drill readiness ${(profile.drillReadiness * 100).toFixed(1)}% • Redundancy ${(profile.redundancyCoverage * 100).toFixed(1)}% • Escalation ${(profile.escalationCoverage * 100).toFixed(1)}%`;
  }

  const drillBody = document.querySelector('#drill-table tbody');
  if (drillBody) {
    drillBody.innerHTML = '';
    if (profile.drills.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'No drills configured – schedule rehearsals to maintain unstoppable readiness.';
      row.append(cell);
      drillBody.append(row);
    } else {
      for (const drill of profile.drills) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${drill.name}</td>
          <td>${drill.frequencyHours}h</td>
          <td>${drill.targetResponseMinutes} min</td>
          <td>${(drill.readiness * 100).toFixed(1)}%</td>
          <td><code>${drill.script}</code></td>
        `;
        drillBody.append(row);
      }
    }
  }

  const redundancyBody = document.querySelector('#redundancy-table tbody');
  if (redundancyBody) {
    redundancyBody.innerHTML = '';
    if (profile.redundancies.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'No redundancies declared – deploy failover meshes immediately.';
      row.append(cell);
      redundancyBody.append(row);
    } else {
      for (const redundancy of profile.redundancies) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${redundancy.capability}</td>
          <td>${redundancy.status.replace('-', ' ')}</td>
          <td>${(redundancy.coverage * 100).toFixed(1)}%</td>
          <td><code>${redundancy.script}</code></td>
        `;
        redundancyBody.append(row);
      }
    }
  }

  const escalationList = document.getElementById('escalation-list');
  if (escalationList) {
    escalationList.innerHTML = '';
    if (profile.escalationMatrix.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No escalation routes published – wire emergency paging loops.';
      escalationList.append(li);
    } else {
      for (const escalation of profile.escalationMatrix) {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${escalation.trigger}:</strong> ${escalation.response} → <span>${escalation.ownerContact}</span>`;
        escalationList.append(li);
      }
    }
  }
}

function renderGovernanceLedger(summary) {
  const analysisEl = document.getElementById('ledger-analysis');
  const executionEl = document.getElementById('ledger-execution');
  const coverageEl = document.getElementById('ledger-coverage');
  const alertList = document.getElementById('ledger-alerts');
  const tableBody = document.querySelector('#ledger-table tbody');

  if (!analysisEl || !executionEl || !coverageEl || !alertList || !tableBody) {
    return;
  }

  const ledger = summary.governanceLedger;
  if (!ledger) {
    analysisEl.textContent = 'N/A';
    executionEl.textContent = 'N/A';
    coverageEl.textContent = 'N/A';
    alertList.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'alert-pill alert-info';
    li.textContent = 'Governance ledger unavailable.';
    alertList.append(li);
    tableBody.innerHTML = '';
    return;
  }

  const analysisDate = new Date(ledger.analysisTimestamp);
  analysisEl.textContent = Number.isNaN(analysisDate.getTime())
    ? ledger.analysisTimestamp
    : analysisDate.toLocaleString();

  const executionDate = new Date(summary.executionTimestamp ?? summary.generatedAt);
  executionEl.textContent = Number.isNaN(executionDate.getTime())
    ? summary.executionTimestamp ?? summary.generatedAt
    : executionDate.toLocaleString();

  coverageEl.textContent = `${(ledger.commandCoverage * 100).toFixed(1)}%`;

  alertList.innerHTML = '';
  const alerts = ledger.alerts ?? [];
  if (alerts.length === 0) {
    const li = document.createElement('li');
    li.className = 'alert-pill alert-success';
    li.textContent = 'All governance surfaces are green.';
    alertList.append(li);
  } else {
    for (const alert of alerts) {
      const li = document.createElement('li');
      li.className = `alert-pill alert-${alert.severity}`;
      const header = document.createElement('strong');
      header.textContent = alert.summary;
      const details = document.createElement('span');
      details.textContent = alert.details.join(' • ');
      li.append(header, details);
      alertList.append(li);
    }
  }

  tableBody.innerHTML = '';
  for (const module of ledger.modules ?? []) {
    const row = document.createElement('tr');
    const auditLag =
      typeof module.auditLagDays === 'number'
        ? `${module.auditLagDays.toFixed(1)} days`
        : 'Unknown';
    const notes = module.notes && module.notes.length > 0 ? module.notes.join(', ') : '—';
    row.innerHTML = `
      <td>${module.name}</td>
      <td>${module.custody}</td>
      <td>${module.status.replace('-', ' ')}</td>
      <td>${auditLag}</td>
      <td><code>${module.upgradeScript}</code></td>
      <td>${notes}</td>
    `;
    tableBody.append(row);
  }
}

function renderDeployment(summary) {
  const deployment = summary.deployment;
  const networkEl = document.getElementById('deployment-network');
  const explorerEl = document.getElementById('deployment-explorer');
  const treasuryEl = document.getElementById('deployment-treasury');
  const governanceEl = document.getElementById('deployment-governance');
  const scoreEl = document.getElementById('deployment-score');
  const automationList = document.getElementById('deployment-automation');
  const adapterList = document.getElementById('deployment-adapters');
  const tableBody = document.querySelector('#deployment-table tbody');
  const observabilityList = document.getElementById('deployment-observability');

  if (!deployment) {
    networkEl.textContent = 'No deployment data available';
    explorerEl.textContent = '';
    explorerEl.removeAttribute('href');
    treasuryEl.textContent = 'N/A';
    governanceEl.textContent = 'N/A';
    scoreEl.textContent = 'N/A';
    automationList.innerHTML = '';
    adapterList.innerHTML = '';
    tableBody.innerHTML = '';
    observabilityList.innerHTML = '';
    return;
  }

  networkEl.textContent = `${deployment.network.name} • Chain ID ${deployment.network.chainId}`;
  const explorerLabel = deployment.network.explorer.replace(/^https?:\/\//, '');
  explorerEl.href = deployment.network.explorer;
  explorerEl.textContent = explorerLabel || 'Open explorer';
  treasuryEl.textContent = deployment.treasuryOwner;
  governanceEl.textContent = deployment.governanceSafe;
  scoreEl.textContent = `${(summary.metrics.sovereignControlScore * 100).toFixed(1)}%`;

  automationList.innerHTML = '';
  const automationEntries = [
    ['Matching engine', deployment.automation.matchingEngine],
    ['Validator orchestrator', deployment.automation.validatorOrchestrator],
    ['Notification hub', deployment.automation.notificationHub],
  ];
  for (const [label, value] of automationEntries) {
    const li = document.createElement('li');
    li.textContent = `${label}: ${value}`;
    automationList.append(li);
  }

  adapterList.innerHTML = '';
  for (const adapter of deployment.stablecoinAdapters) {
    const li = document.createElement('li');
    li.textContent = `${adapter.name} • swap ${adapter.swapFeeBps} bps • slippage ${adapter.slippageBps} bps`;
    adapterList.append(li);
  }

  tableBody.innerHTML = '';
  for (const module of deployment.modules) {
    const row = document.createElement('tr');
    const lastAudit = new Date(module.lastAudit);
    const auditDisplay = Number.isNaN(lastAudit.getTime())
      ? module.lastAudit
      : lastAudit.toLocaleDateString();
    row.innerHTML = `
      <td>${module.name}</td>
      <td><code>${module.address}</code></td>
      <td>${module.version}</td>
      <td><code>${module.owner}</code></td>
      <td>${module.status.replace('-', ' ')}</td>
      <td>${auditDisplay}</td>
      <td><code>${module.upgradeScript}</code></td>
    `;
    const descriptionRow = document.createElement('tr');
    const descriptionCell = document.createElement('td');
    descriptionCell.colSpan = 7;
    descriptionCell.className = 'module-description-cell';
    descriptionCell.textContent = module.description;
    descriptionRow.append(descriptionCell);
    tableBody.append(row, descriptionRow);
  }

  observabilityList.innerHTML = '';
  for (const dashboard of deployment.observability.dashboards) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = dashboard;
    link.textContent = dashboard;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    li.append(link);
    observabilityList.append(li);
  }
}

function renderAssertions(summary) {
  const container = document.getElementById('assertion-grid');
  if (!container) return;
  container.innerHTML = '';
  const assertions = summary.assertions ?? [];
  for (const assertion of assertions) {
    const card = document.createElement('article');
    card.className = `assertion-card assertion-${assertion.outcome}`;
    card.setAttribute('role', 'listitem');

    const header = document.createElement('div');
    header.className = 'assertion-card-header';

    const title = document.createElement('h3');
    title.textContent = assertion.title;
    header.append(title);

    const severity = document.createElement('span');
    severity.className = `assertion-badge severity-${assertion.severity}`;
    severity.textContent = assertion.severity.toUpperCase();
    header.append(severity);

    const status = document.createElement('p');
    status.className = 'assertion-status';
    const symbol = assertion.outcome === 'pass' ? '✓' : '✕';
    status.innerHTML = `<span aria-hidden="true">${symbol}</span> ${
      assertion.outcome === 'pass' ? 'Pass' : 'Fail'
    }`;

    const summaryText = document.createElement('p');
    summaryText.className = 'assertion-summary';
    summaryText.textContent = assertion.summary;

    const metrics = document.createElement('p');
    metrics.className = 'assertion-metric';
    if (typeof assertion.metric === 'number' || typeof assertion.target === 'number') {
      const metricValue =
        typeof assertion.metric === 'number'
          ? assertion.metric.toFixed(3)
          : '—';
      const targetValue =
        typeof assertion.target === 'number' ? assertion.target.toFixed(3) : '—';
      metrics.textContent = `Metric ${metricValue} • Target ${targetValue}`;
    } else {
      metrics.textContent = '';
    }

    const evidenceList = document.createElement('ul');
    evidenceList.className = 'assertion-evidence';
    const evidence = assertion.evidence ?? [];
    for (const line of evidence.slice(0, 3)) {
      const li = document.createElement('li');
      li.textContent = line;
      evidenceList.append(li);
    }

    card.append(header, status, summaryText);
    if (metrics.textContent) {
      card.append(metrics);
    }
    if (evidenceList.childElementCount > 0) {
      card.append(evidenceList);
    }
    container.append(card);
  }
}

async function renderMermaid(summary) {
  mermaid.initialize({ startOnLoad: false, theme: 'dark' });
  const flow = document.getElementById('mermaid-flow');
  const timeline = document.getElementById('mermaid-timeline');
  const command = document.getElementById('mermaid-command');
  const expansion = document.getElementById('mermaid-expansion');
  flow.textContent = summary.mermaidFlow;
  timeline.textContent = summary.mermaidTimeline;
  if (command) {
    command.textContent = summary.ownerCommandMermaid;
  }
  if (expansion) {
    expansion.textContent = summary.globalExpansionMermaid;
  }
  const nodes = [flow, timeline]
    .concat(command ? [command] : [])
    .concat(expansion ? [expansion] : []);
  await mermaid.run({ nodes });
}

function updateFooter(summary) {
  const footer = document.getElementById('generated-at');
  footer.textContent = `• Generated at ${new Date(summary.generatedAt).toLocaleString()}`;
}

function renderTrajectory(summary) {
  const tbody = document.querySelector('#trajectory-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const entry of summary.treasuryTrajectory || []) {
    const row = document.createElement('tr');
    const windowHours = (entry.endHour - entry.startHour).toFixed(1);
    row.innerHTML = `
      <td>${entry.step}</td>
      <td>${entry.jobName}</td>
      <td>${windowHours}</td>
      <td>${formatNumber(entry.treasuryAfterJob)}</td>
      <td>${formatNumber(entry.netYield)}</td>
      <td>${(entry.validatorConfidence * 100).toFixed(2)}%</td>
      <td>${(entry.automationLift * 100).toFixed(2)}%</td>
    `;
    tbody.append(row);
  }
}

async function bootstrap(dataPath = defaultDataPath) {
  const summary = await loadSummary(dataPath);
  renderMetricCards(summary);
  renderOwnerTable(summary);
  renderCommandCatalog(summary);
  renderAssignments(summary);
  renderSovereignty(summary);
  renderGlobalExpansion(summary);
  renderResilience(summary);
  renderGovernanceLedger(summary);
  renderDeployment(summary);
  renderAssertions(summary);
  renderTrajectory(summary);
  await renderMermaid(summary);
  updateFooter(summary);
  window.currentSummary = summary;
}

function setupFileHandlers() {
  const fileInput = document.getElementById('file-input');
  const dropzone = document.querySelector('.dropzone');
  const reloadButton = document.getElementById('reload-default');

  reloadButton.addEventListener('click', () => {
    bootstrap().catch(console.error);
  });

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = await file.text();
    const summary = JSON.parse(data);
    await renderSummary(summary);
  });

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const data = await file.text();
    const summary = JSON.parse(data);
    await renderSummary(summary);
  });
}

async function renderSummary(summary) {
  renderMetricCards(summary);
  renderOwnerTable(summary);
  renderCommandCatalog(summary);
  renderAssignments(summary);
  renderSovereignty(summary);
  renderGlobalExpansion(summary);
  renderResilience(summary);
  renderGovernanceLedger(summary);
  renderDeployment(summary);
  renderAssertions(summary);
  renderTrajectory(summary);
  await renderMermaid(summary);
  updateFooter(summary);
  window.currentSummary = summary;
}

setupFileHandlers();
bootstrap().catch(console.error);
