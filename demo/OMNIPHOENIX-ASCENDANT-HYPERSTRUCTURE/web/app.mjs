import { fr, messages } from './i18n.mjs';
const encoder = new TextEncoder();
const decode = (bytes) =>
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
export function rawInteger(value, { optional = false, minimum = 0 } = {}) {
  if (optional && value === '') return null;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw Error('integer');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < minimum || n > 365000)
    throw Error('integer');
  return n;
}
export function mountDesk(
  document,
  desk,
  originalBytes,
  { save = defaultSave } = {}
) {
  let language = 'en',
    report = null,
    acceptedBytes = null,
    sourceBytes = null,
    sourceText = '',
    epoch = 0,
    state = 'dirty',
    detail = '',
    rows = [],
    disposed = false;
  const $ = (id) => document.getElementById(id);
  const translations = [...document.querySelectorAll('[data-i18n]')].map(
    (el) => [el, el.textContent]
  );
  const text = (key) => messages[language][key];
  const el = (tag, content, className) => {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  };
  const showStatus = () => {
    $('status').dataset.state = state;
    $('status').textContent = text(state) + (detail ? ' ' + detail : '');
  };
  function invalidate(next = 'dirty', error = '') {
    epoch++;
    report = null;
    acceptedBytes = null;
    state = next;
    detail = error;
    $('results').hidden = true;
    $('metrics').replaceChildren();
    $('trace').replaceChildren();
    $('fingerprints').replaceChildren();
    $('download-source').disabled = true;
    $('download-recovery').disabled = true;
    showStatus();
  }
  function failure(error) {
    invalidate(
      'error',
      error.message === 'integer' ? text('integer') : error.message
    );
  }
  function drawControls(jobs, controls = { delays: [], blockedJobIds: [] }) {
    rows = jobs.map((job, i) => {
      const card = el('div', undefined, 'job-control'),
        title = el('h3', job.id),
        description = el('p', job.title);
      const label = el('label', text('delay'));
      label.htmlFor = `delay-${i}`;
      const input = el('input');
      input.id = `delay-${i}`;
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 20;
      input.autocomplete = 'off';
      input.value = String(
        controls.delays.find((x) => x.id === job.id)?.days ?? 0
      );
      input.dataset.jobId = job.id;
      const blockLabel = el('label', undefined, 'block-label'),
        checkbox = el('input'),
        caption = el('span', text('block'));
      checkbox.type = 'checkbox';
      checkbox.id = `block-${i}`;
      checkbox.checked = controls.blockedJobIds.includes(job.id);
      blockLabel.htmlFor = checkbox.id;
      blockLabel.append(checkbox, caption);
      input.addEventListener('input', () => invalidate());
      checkbox.addEventListener('change', () => invalidate());
      card.append(title, description, label, input, blockLabel);
      return { id: job.id, card, input, checkbox, label, caption };
    });
    $('job-controls').replaceChildren(...rows.map((r) => r.card));
  }
  function controls() {
    return {
      delays: rows
        .map((r) => ({ id: r.id, days: rawInteger(r.input.value) }))
        .filter((r) => r.days !== 0),
      blockedJobIds: rows.filter((r) => r.checkbox.checked).map((r) => r.id),
      horizonDays: rawInteger($('horizon').value, {
        optional: true,
        minimum: 1,
      }),
    };
  }
  function value(v, suffix = '') {
    return v === null ? text('unknown') : String(v) + suffix;
  }
  function render() {
    if (!report) return;
    const b = report.baseline,
      s = report.scenario,
      unit = ' ' + b.currency;
    const metrics = [
      ['baseline', value(b.criticalPathDays, ' ' + text('days'))],
      ['scenario', value(s.criticalPathDays, ' ' + text('days'))],
      ['delta', value(s.criticalPathDeltaDays, ' ' + text('days'))],
      ['finite', value(s.finiteSubgraphCriticalPathDays, ' ' + text('days'))],
      ['exposure', s.blockedRewardExposure + unit],
      ['allocated', b.allocatedRewards + unit],
      ['reserve', b.unallocatedBudget + unit],
      ['budget', b.budget + unit],
      [
        'horizon',
        s.scheduleWithinHorizon === null
          ? text('unknown')
          : text(s.scheduleWithinHorizon ? 'yes' : 'no'),
      ],
    ];
    $('metrics').replaceChildren(
      ...metrics.map(([label, v]) => {
        const card = el('div', undefined, 'metric');
        card.dataset.metric = label;
        card.append(el('span', text(label)), el('strong', v));
        return card;
      })
    );
    $('trace').replaceChildren(
      ...s.jobs.map((job, i) => {
        const card = el('article', undefined, 'job-trace');
        card.dataset.job = job.id;
        card.append(
          el('h3', job.id + ' · ' + text(job.status)),
          el('p', job.title)
        );
        const dl = el('dl');
        for (const [k, v] of [
          ['baselineFinish', b.jobs[i].finishDay],
          ['start', job.startDay],
          ['finish', job.finishDay],
          ['finishDelta', job.finishDeltaDays],
        ])
          dl.append(el('dt', text(k)), el('dd', value(v, ' ' + text('days'))));
        dl.append(
          el('dt', text('dependencies')),
          el('dd', job.dependencies.join(' · ') || text('none')),
          el('dt', text('origins')),
          el('dd', job.blockedBy.join(' · ') || text('none'))
        );
        card.append(dl, el('h4', text('causes')));
        if (job.causalChains.length) {
          const list = el('ul');
          job.causalChains.forEach((chain) =>
            list.append(el('li', chain.join(' → '), 'chain'))
          );
          card.append(list);
        } else card.append(el('p', text('unaffected')));
        return card;
      })
    );
    const chain = el(
      'p',
      text('critical') + ': ' + (s.criticalPath.join(' → ') || text('none')),
      'chain'
    );
    $('trace').append(chain);
    $('fingerprints').replaceChildren(
      el('dt', text('sourceHash')),
      el('dd', report.sourceSha256),
      el('dt', text('reportHash')),
      el('dd', report.reportSha256)
    );
    $('results').hidden = false;
    $('download-source').disabled = false;
    $('download-recovery').disabled = false;
  }
  function accept(bytes, next, resetControls = false) {
    // Textareas normalize CRLF and CR to LF. Keep the accepted source separate
    // from its display value until the user explicitly edits that value.
    sourceBytes = new Uint8Array(bytes);
    sourceText = decode(bytes);
    acceptedBytes = new Uint8Array(bytes);
    report = next;
    if (resetControls) {
      drawControls(next.baseline.jobs, next.controls);
      $('horizon').value =
        next.controls.horizonDays === null
          ? ''
          : String(next.controls.horizonDays);
    }
    state = 'ready';
    detail = '';
    render();
    showStatus();
  }
  function recompute() {
    const bytes = sourceBytes ?? encoder.encode(sourceText);
    epoch++;
    try {
      const next = desk.analyzeBytes(sourceText, controls());
      const changed =
        next.baseline.jobs.map((j) => j.id).join('\0') !==
        rows.map((r) => r.id).join('\0');
      accept(bytes, next, changed);
    } catch (error) {
      failure(error);
    }
  }
  function reset() {
    invalidate();
    try {
      const next = desk.analyzeBytes(originalBytes);
      $('source-text').value = decode(originalBytes);
      accept(originalBytes, next, true);
    } catch (error) {
      failure(error);
    }
  }
  async function importFile(file, recovery = false) {
    invalidate('loading');
    const ticket = epoch;
    try {
      if (!file) throw Error(text('invalidated'));
      if (file.size > (recovery ? 4194304 : 262144))
        throw Error(text('fileTooLarge'));
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (disposed || ticket !== epoch) return false;
      // Decode without stripping BOM; the authoritative parser rejects it.
      const source = decode(bytes);
      const imported = recovery ? desk.importRecovery(bytes) : null;
      const sourceBytes = imported
        ? encoder.encode(imported.sourceText)
        : bytes;
      const next = imported ? imported.report : desk.analyzeBytes(bytes);
      $('source-text').value = imported ? imported.sourceText : source;
      accept(sourceBytes, next, true);
      state = 'imported';
      showStatus();
      return true;
    } catch (error) {
      if (!disposed && ticket === epoch) failure(error);
      return false;
    }
  }
  $('language').addEventListener('click', () => {
    language = language === 'en' ? 'fr' : 'en';
    document.documentElement.lang = language;
    translations.forEach(
      ([node, en]) =>
        (node.textContent = language === 'fr' ? fr[node.dataset.i18n] : en)
    );
    $('language').textContent = language === 'en' ? 'Français' : 'English';
    $('language').lang = language === 'en' ? 'fr' : 'en';
    rows.forEach((r) => {
      r.label.textContent = text('delay');
      r.caption.textContent = text('block');
    });
    render();
    showStatus();
  });
  $('source-text').addEventListener('input', () => {
    sourceText = $('source-text').value;
    sourceBytes = null;
    invalidate();
  });
  $('horizon').addEventListener('input', () => invalidate());
  $('calculate').addEventListener('click', recompute);
  $('reset').addEventListener('click', reset);
  for (const [id, recovery] of [
    ['plan-file', false],
    ['recovery-file', true],
  ])
    $(id).addEventListener('change', () => {
      const file = $(id).files[0];
      $(id).value = '';
      if (file) void importFile(file, recovery);
    });
  $('download-source').addEventListener('click', () => {
    if (report && acceptedBytes) save(acceptedBytes, 'omniphoenix-source.json');
  });
  $('download-recovery').addEventListener('click', () => {
    if (!report || !acceptedBytes) return;
    try {
      const envelope = desk.exportRecovery(acceptedBytes, report.controls);
      save(
        encoder.encode(JSON.stringify(envelope)),
        'omniphoenix-recovery.json'
      );
    } catch (error) {
      failure(error);
    }
  });
  reset();
  return {
    importFile,
    recompute,
    reset,
    getReport: () => report,
    getEpoch: () => epoch,
    dispose: () => {
      disposed = true;
      invalidate();
    },
  };
}
function defaultSave(bytes, name) {
  const url = URL.createObjectURL(
    new Blob([bytes], { type: 'application/json' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
