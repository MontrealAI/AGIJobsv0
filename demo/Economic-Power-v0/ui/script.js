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
    id: 'ownerDominionScore',
    label: 'Owner Dominion',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Composite dominion index across command coverage, custody, and safety mesh readiness.',
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
    id: 'assertionPassRate',
    label: 'Assertion Pass Rate',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Share of verification assertions passing unstoppable thresholds.',
  },
  {
    id: 'economicDominanceIndex',
    label: 'Economic Dominance',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Composite dominance index fusing ROI, automation, and sovereign control.',
  },
  {
    id: 'capitalVelocity',
    label: 'Capital Velocity',
    formatter: (value) => `${value.toFixed(2)} AGI/h`,
    description: 'Treasury conversion rate into validated value per hour.',
  },
  {
    id: 'globalExpansionReadiness',
    label: 'Global Expansion Readiness',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Readiness index for unlocking mainnet pilots and planetary rollout.',
  },
  {
    id: 'shockResilienceScore',
    label: 'Shock Resilience',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Composite resilience score fusing guardrails, emergency response, and treasury buffers.',
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

function renderOwnerDominion(summary) {
  const dominion = summary.ownerDominion;
  const scoreEl = document.getElementById('dominion-score');
  const classificationEl = document.getElementById('dominion-classification');
  const summaryEl = document.getElementById('dominion-summary');
  const readinessEl = document.getElementById('dominion-readiness');
  const guardrailList = document.getElementById('dominion-guardrails');
  const signalsContainer = document.getElementById('dominion-signals');
  const actionsList = document.getElementById('dominion-actions');

  if (!scoreEl || !classificationEl || !summaryEl || !readinessEl || !guardrailList || !signalsContainer || !actionsList) {
    return;
  }

  if (!dominion) {
    scoreEl.textContent = '—';
    classificationEl.textContent = 'Unavailable';
    summaryEl.textContent = 'Dominion report unavailable.';
    readinessEl.textContent = '';
    guardrailList.innerHTML = '';
    actionsList.innerHTML = '';
    signalsContainer.innerHTML = '';
    return;
  }

  scoreEl.textContent = `${(dominion.score * 100).toFixed(1)}%`;
  const classificationLabel = dominion.classification.replace(/-/g, ' ');
  classificationEl.textContent = classificationLabel;
  classificationEl.className = `dominion-chip dominion-${dominion.classification}`;
  summaryEl.textContent = dominion.summary;
  readinessEl.textContent = `Coverage ${(dominion.readiness.coverage * 100).toFixed(1)}% • Safety ${(dominion.readiness.safety * 100).toFixed(1)}% • Custody ${(dominion.readiness.control * 100).toFixed(1)}% • Response ${dominion.readiness.responseMinutes}m`;

  guardrailList.innerHTML = '';
  if (dominion.guardrails.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No guardrails published – authorise guardrail scripts to preserve dominion.';
    guardrailList.append(li);
  } else {
    for (const guardrail of dominion.guardrails) {
      const li = document.createElement('li');
      li.textContent = guardrail;
      guardrailList.append(li);
    }
  }

  signalsContainer.innerHTML = '';
  for (const signal of dominion.signals) {
    const span = document.createElement('span');
    span.textContent = signal;
    signalsContainer.append(span);
  }

  actionsList.innerHTML = '';
  if (dominion.recommendedActions.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Dominion secure – continue automated cadence.';
    actionsList.append(li);
  } else {
    for (const action of dominion.recommendedActions) {
      const li = document.createElement('li');
      li.textContent = action;
      actionsList.append(li);
    }
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
  const shockResilience = summary.shockResilience || {
    score: 0,
    classification: 'attention',
    summary: 'Shock resilience telemetry unavailable.',
    drivers: [],
    recommendations: [],
  };

  const safetyScoreEl = document.getElementById('safety-score');
  if (safetyScoreEl) {
    safetyScoreEl.textContent = `${(safetyMesh.safetyScore * 100).toFixed(1)}%`;
  }

  const safetyResponseEl = document.getElementById('safety-response');
  if (safetyResponseEl) {
    safetyResponseEl.textContent = `Response readiness: ${safetyMesh.responseMinutes} minutes (target ≤ ${safetyMesh.targetResponseMinutes} minutes)`;
  }

  const shockScoreEl = document.getElementById('shock-score');
  const shockClassificationEl = document.getElementById('shock-classification');
  const shockSummaryEl = document.getElementById('shock-summary');
  if (shockScoreEl) {
    shockScoreEl.textContent = `${(shockResilience.score * 100).toFixed(1)}%`;
  }
  if (shockClassificationEl) {
    shockClassificationEl.textContent = shockResilience.classification.replace(/-/g, ' ');
    shockClassificationEl.className = `shock-chip shock-${shockResilience.classification}`;
  }
  if (shockSummaryEl) {
    shockSummaryEl.textContent = shockResilience.summary;
  }

  const shockDrivers = document.getElementById('shock-drivers');
  if (shockDrivers) {
    shockDrivers.innerHTML = '';
    if (shockResilience.drivers && shockResilience.drivers.length > 0) {
      for (const driver of shockResilience.drivers) {
        const li = document.createElement('li');
        li.textContent = driver;
        shockDrivers.append(li);
      }
    } else {
      const li = document.createElement('li');
      li.textContent = 'No drivers published.';
      shockDrivers.append(li);
    }
  }

  const shockActions = document.getElementById('shock-actions');
  if (shockActions) {
    shockActions.innerHTML = '';
    if (shockResilience.recommendations && shockResilience.recommendations.length > 0) {
      for (const rec of shockResilience.recommendations) {
        const li = document.createElement('li');
        li.textContent = rec;
        shockActions.append(li);
      }
    } else {
      const li = document.createElement('li');
      li.textContent = 'Shock resilience already impregnable.';
      shockActions.append(li);
    }
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
  flow.textContent = summary.mermaidFlow;
  timeline.textContent = summary.mermaidTimeline;
  if (command) {
    command.textContent = summary.ownerCommandMermaid;
    await mermaid.run({ nodes: [flow, timeline, command] });
  } else {
    await mermaid.run({ nodes: [flow, timeline] });
  }
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

function renderAutopilot(summary) {
  const missionEl = document.getElementById('autopilot-mission');
  const cadenceEl = document.getElementById('autopilot-cadence');
  const dominanceEl = document.getElementById('autopilot-dominance');
  const guardrailList = document.getElementById('autopilot-guardrails');
  const tableBody = document.querySelector('#autopilot-table tbody');
  if (!missionEl || !cadenceEl || !dominanceEl || !guardrailList || !tableBody) {
    return;
  }
  const autopilot = summary.ownerAutopilot || {
    mission: 'Autopilot unavailable',
    cadenceHours: 0,
    dominanceScore: 0,
    guardrails: [],
    telemetry: {
      economicDominanceIndex: 0,
      capitalVelocity: 0,
      globalExpansionReadiness: 0,
      shockResilienceScore: 0,
    },
    commandSequence: [],
  };
  missionEl.textContent = autopilot.mission;
  cadenceEl.textContent = `${autopilot.cadenceHours.toFixed(1)}h cadence`;
  dominanceEl.textContent = `${(autopilot.telemetry.economicDominanceIndex * 100).toFixed(1)}% dominance • ${autopilot.telemetry.capitalVelocity.toFixed(2)} AGI/h • ${(autopilot.telemetry.globalExpansionReadiness * 100).toFixed(1)}% readiness • ${(autopilot.telemetry.shockResilienceScore * 100).toFixed(1)}% shock resilience`;
  guardrailList.innerHTML = '';
  for (const guardrail of autopilot.guardrails) {
    const li = document.createElement('li');
    li.textContent = guardrail;
    guardrailList.append(li);
  }
  tableBody.innerHTML = '';
  if (autopilot.commandSequence.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'No deterministic command sequence published.';
    row.append(cell);
    tableBody.append(row);
    return;
  }
  for (const command of autopilot.commandSequence) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${command.surface}</td>
      <td><code>${command.script}</code></td>
      <td>${command.objective}</td>
    `;
    tableBody.append(row);
  }
}

function renderGlobalExpansion(summary) {
  const readinessEl = document.getElementById('expansion-readiness');
  const tableBody = document.querySelector('#expansion-table tbody');
  if (!readinessEl || !tableBody) {
    return;
  }
  readinessEl.textContent = `${(summary.metrics.globalExpansionReadiness * 100).toFixed(1)}%`;
  tableBody.innerHTML = '';
  const phases = summary.globalExpansionPlan || [];
  if (phases.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'Expansion roadmap not yet generated.';
    row.append(cell);
    tableBody.append(row);
    return;
  }
  for (const phase of phases) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${phase.phase}</td>
      <td>${phase.focus}</td>
      <td>${phase.horizonHours}h</td>
      <td>${(phase.readiness * 100).toFixed(1)}%</td>
      <td>${phase.commands.join(', ')}</td>
    `;
    tableBody.append(row);
    if (phase.telemetryHooks?.length) {
      const telemetryRow = document.createElement('tr');
      const telemetryCell = document.createElement('td');
      telemetryCell.colSpan = 5;
      telemetryCell.className = 'expansion-telemetry';
      telemetryCell.textContent = `Telemetry hooks: ${phase.telemetryHooks.join(', ')}`;
      telemetryRow.append(telemetryCell);
      tableBody.append(telemetryRow);
    }
  }
}

async function bootstrap(dataPath = defaultDataPath) {
  const summary = await loadSummary(dataPath);
  renderMetricCards(summary);
  renderOwnerTable(summary);
  renderOwnerDominion(summary);
  renderCommandCatalog(summary);
  renderAssignments(summary);
  renderSovereignty(summary);
  renderGovernanceLedger(summary);
  renderDeployment(summary);
  renderAssertions(summary);
  renderTrajectory(summary);
  renderAutopilot(summary);
  renderGlobalExpansion(summary);
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
  renderOwnerDominion(summary);
  renderCommandCatalog(summary);
  renderAssignments(summary);
  renderSovereignty(summary);
  renderGovernanceLedger(summary);
  renderDeployment(summary);
  renderAssertions(summary);
  renderTrajectory(summary);
  renderAutopilot(summary);
  renderGlobalExpansion(summary);
  await renderMermaid(summary);
  updateFooter(summary);
  window.currentSummary = summary;
}

setupFileHandlers();
bootstrap().catch(console.error);
