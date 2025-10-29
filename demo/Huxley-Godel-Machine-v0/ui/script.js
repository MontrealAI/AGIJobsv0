(function () {
  'use strict';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const activateStep = (step) => {
    document.querySelectorAll('[data-step]').forEach((el) => {
      if (Number(el.getAttribute('data-step')) === step) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  };

  async function cycleSteps() {
    const steps = Array.from(document.querySelectorAll('[data-step]'));
    if (steps.length === 0) return;
    let index = 0;
    while (true) {
      const stepNumber = Number(steps[index % steps.length].getAttribute('data-step'));
      activateStep(stepNumber);
      const paceRaw = document.body.dataset.pace;
      const paceMs = Number(paceRaw || 2000);
      // eslint-disable-next-line no-await-in-loop
      await sleep(paceMs);
      index += 1;
    }
  }

  const currency = (value) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const percent = (value) => `${(value * 100).toFixed(1)}%`;

  const DEFAULT_TIMELINE = '../reports/timeline.json';

  async function fetchTimeline(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to fetch timeline from ${path}`);
    }
    return response.json();
  }

  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          resolve(parsed);
        } catch (error) {
          reject(new Error('Selected file is not valid JSON.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read selected file.'));
      reader.readAsText(file);
    });
  }

  function buildMermaid(agents, highlight) {
    const lines = ['graph TD'];
    agents.forEach((agent) => {
      const label =
        `${agent.agent_id}[${agent.agent_id}\\n` +
        `q=${agent.quality.toFixed(2)}\\n` +
        `S=${agent.direct_success}/F=${agent.direct_failure}\\n` +
        `C=${agent.clade_success}/${agent.clade_failure}]`;
      lines.push(label);
      if (agent.parent_id) {
        lines.push(`${agent.parent_id} --> ${agent.agent_id}`);
      }
    });
    if (highlight) {
      lines.push(`style ${highlight} fill:#f4d03f,stroke:#f1c40f,stroke-width:4px`);
    }
    agents
      .filter((agent) => agent.status !== 'active')
      .forEach((agent) => {
        const fill = agent.status === 'pruned' ? '#7f8c8d' : '#5dade2';
        lines.push(`style ${agent.agent_id} fill:${fill},stroke:#2c3e50,stroke-width:2px`);
      });
    return lines.join('\n');
  }

  function updateMermaid(diagram) {
    const container = document.querySelector('#observatory-mermaid');
    if (!container) return;
    container.textContent = diagram;
    if (window.mermaid) {
      window.mermaid.init(undefined, container);
    }
  }

  function renderSummaryCards(snapshot) {
    const container = document.querySelector('#observatory-cards');
    if (!container) return;
    container.innerHTML = '';
    const cards = [
      {
        title: 'GMV',
        value: currency(snapshot.gmv),
        subtitle: 'Total gross merchandise value',
      },
      {
        title: 'Cost',
        value: currency(snapshot.cost),
        subtitle: 'Total execution spend',
      },
      {
        title: 'ROI',
        value: snapshot.roi === Infinity ? '∞' : snapshot.roi.toFixed(2),
        subtitle: 'Return on investment',
      },
      {
        title: 'Success cadence',
        value: percent(snapshot.successes / Math.max(1, snapshot.successes + snapshot.failures)),
        subtitle: `${snapshot.successes} wins vs ${snapshot.failures} lessons`,
      },
    ];
    cards.forEach((card) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'col-md-6 col-xl-3';
      const box = document.createElement('div');
      box.className = 'observatory-card h-100';
      const title = document.createElement('h3');
      title.textContent = card.title;
      const value = document.createElement('p');
      value.textContent = card.value;
      const subtitle = document.createElement('small');
      subtitle.textContent = card.subtitle;
      box.append(title, value, subtitle);
      wrapper.append(box);
      container.append(wrapper);
    });
  }

  function renderAgentsTable(agents, highlight) {
    const table = document.querySelector('#observatory-table tbody');
    if (!table) return;
    table.innerHTML = '';
    if (!agents.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'text-center text-muted';
      cell.textContent = 'No agent lineage available yet. Run the demo to generate one!';
      row.append(cell);
      table.append(row);
      return;
    }
    const sorted = [...agents].sort((a, b) => b.direct_success - a.direct_success || a.depth - b.depth);
    sorted.forEach((agent) => {
      const row = document.createElement('tr');
      if (agent.agent_id === highlight) {
        row.classList.add('table-warning');
        row.classList.add('text-dark');
      }
      row.innerHTML = `
        <td>${agent.agent_id}${agent.agent_id === highlight ? ' ⭐' : ''}</td>
        <td>${(agent.quality * 100).toFixed(1)}%</td>
        <td>${agent.direct_success}/${agent.direct_failure}</td>
        <td>${agent.clade_success}/${agent.clade_failure}</td>
        <td>${agent.depth}</td>
      `;
      table.append(row);
    });
  }

  function updateAlert(message, variant = 'dark') {
    const alert = document.querySelector('#observatory-alert');
    if (!alert) return;
    alert.className = `alert alert-${variant} border-secondary`;
    alert.textContent = message;
  }

  function handleTimeline(timeline) {
    if (!Array.isArray(timeline) || timeline.length === 0) {
      updateAlert('Timeline is empty. Run the demo to generate artefacts.', 'warning');
      return;
    }
    const latest = timeline[timeline.length - 1];
    renderSummaryCards(latest);
    renderAgentsTable(latest.agents || [], latest.best_agent_id || null);
    updateMermaid(buildMermaid(latest.agents || [], latest.best_agent_id || null));
    updateAlert(`Loaded ${timeline.length} steps. Highlighting ${latest.best_agent_id || 'best available agent'}.`, 'success');
  }

  async function loadDefaultTimeline() {
    try {
      updateAlert('Fetching timeline from reports…', 'info');
      const data = await fetchTimeline(DEFAULT_TIMELINE);
      handleTimeline(data);
    } catch (error) {
      updateAlert(error.message, 'danger');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const paceEnv = Number(new URLSearchParams(window.location.search).get('pace'));
    if (!Number.isNaN(paceEnv) && paceEnv > 0) {
      document.body.dataset.pace = paceEnv;
    } else {
      const paceFromEnv = Number(window.localStorage.getItem('hgm-guided-pace'));
      if (paceFromEnv > 0) {
        document.body.dataset.pace = paceFromEnv;
      }
    }

    if (window.mermaid) {
      window.mermaid.initialize({ startOnLoad: true, theme: 'dark' });
    }

    const fileInput = document.querySelector('#timeline-file');
    if (fileInput) {
      fileInput.addEventListener('change', async (event) => {
        const [file] = event.target.files;
        if (!file) return;
        try {
          updateAlert(`Parsing ${file.name}…`, 'info');
          const data = await parseFile(file);
          handleTimeline(data);
        } catch (error) {
          updateAlert(error.message, 'danger');
        }
      });
    }

    const loadDefaultButton = document.querySelector('#load-default');
    if (loadDefaultButton) {
      loadDefaultButton.addEventListener('click', () => {
        loadDefaultTimeline().catch((error) => updateAlert(error.message, 'danger'));
      });
    }

    cycleSteps().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to animate storyline', err);
    });
  });
})();
