import { evaluate, parseStrictJson } from './engine.mjs';
import { fr, words } from './i18n.mjs';
const $ = (id) => document.getElementById(id),
  original = new Map(
    [...document.querySelectorAll('[data-t]')].map((e) => [e, e.textContent])
  );
let lang =
    new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en',
  serial = 0,
  revision = 0,
  current = null;
const w = (k) => words[lang][k] ?? k;
function node(tag, text) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}
function translated(tag, key) {
  const e = node(tag, w(key));
  e.dataset.w = key;
  return e;
}
function translate() {
  document.documentElement.lang = lang;
  for (const [e, text] of original)
    e.textContent = lang === 'fr' ? fr[e.dataset.t] ?? text : text;
  for (const e of document.querySelectorAll('[data-w]'))
    e.textContent = w(e.dataset.w);
  $('language').textContent = lang === 'fr' ? 'EN' : 'FR';
  $('language').setAttribute(
    'aria-label',
    lang === 'fr' ? 'Switch to English' : 'Passer en français'
  );
  document.title =
    lang === 'fr'
      ? 'Zenith • Rapprochement régional'
      : 'Zenith • Regional reconciliation desk';
  for (const row of document.querySelectorAll(
    '#regions fieldset,#jobs fieldset'
  ))
    row
      .querySelector('button')
      .setAttribute(
        'aria-label',
        `${w('remove')} ${row.querySelector('[data-field=id]').value}`
      );
  if (current) render();
}
function field(parent, key, value, amount = false) {
  const div = node('div'),
    label = translated('label', key),
    e = node('input');
  e.id = 'field-' + serial++;
  e.dataset.field = key;
  e.value = value;
  e.required = true;
  label.htmlFor = e.id;
  if (amount) {
    e.inputMode = 'numeric';
    e.pattern = '0|[1-9][0-9]{0,23}';
    e.maxLength = 24;
  } else e.maxLength = key === 'id' || key === 'regionId' ? 40 : 100;
  div.append(label, e);
  parent.append(div);
  return e;
}
function addRow(type, data) {
  const row = node('fieldset');
  row.className = 'job-grid';
  const keys =
    type === 'regions'
      ? ['id', 'name', 'allocationUnits']
      : ['id', 'label', 'regionId', 'plannedUnits', 'reportedUnits'];
  for (const key of keys)
    field(row, key, data[key] ?? '', key.endsWith('Units'));
  if (type === 'jobs') {
    const label = translated('label', 'unknown'),
      check = node('input');
    check.type = 'checkbox';
    check.dataset.field = 'unknown';
    check.id = 'unknown-' + serial++;
    check.checked = data.reportedUnits === null;
    label.htmlFor = check.id;
    row.append(label, check);
    const reported = row.querySelector('[data-field=reportedUnits]');
    reported.disabled = check.checked;
    reported.required = !check.checked;
    check.onchange = () => {
      reported.disabled = check.checked;
      reported.required = !check.checked;
    };
  }
  const remove = translated('button', 'remove');
  remove.type = 'button';
  remove.onclick = () => {
    row.remove();
    invalidate();
  };
  row.append(remove);
  $(type).append(row);
  translate();
}
function load(s) {
  $('title').value = s.title;
  $('unit').value = s.unit;
  $('total').value = s.totalUnits;
  for (const type of ['regions', 'jobs']) {
    $(type).replaceChildren();
    for (const row of s[type]) addRow(type, row);
  }
  translate();
}
function input() {
  const s = {
    schema: 'agijobs.zenith-regional-reconciliation.v1',
    title: $('title').value,
    unit: $('unit').value,
    totalUnits: $('total').value,
  };
  for (const type of ['regions', 'jobs'])
    s[type] = [...$(type).children].map((row) => {
      const entry = {};
      for (const e of row.querySelectorAll('[data-field]'))
        if (e.dataset.field !== 'unknown') entry[e.dataset.field] = e.value;
      if (type === 'jobs' && row.querySelector('[data-field=unknown]').checked)
        entry.reportedUnits = null;
      return entry;
    });
  return s;
}
function invalidate() {
  revision++;
  current = null;
  $('result').hidden = true;
  $('error').hidden = true;
  $('status').textContent = '';
  return revision;
}
function error(e) {
  current = null;
  $('result').hidden = true;
  $('error').hidden = false;
  $('error').textContent = `${w('error')} ${e.message}`;
  $('status').textContent = '';
}
function render() {
  if (!current) return;
  const r = current.result;
  let status = !r.reportedComplete
    ? 'incomplete'
    : !r.allocationBalanced
    ? 'unbalanced'
    : r.fullyFundedAfterProposal
    ? 'covered'
    : 'partial';
  $('summary').textContent = w(status);
  const planned = current.scenario.jobs.reduce(
      (a, j) => a + BigInt(j.plannedUnits),
      0n
    ),
    reported = r.reportedComplete
      ? current.scenario.jobs.reduce((a, j) => a + BigInt(j.reportedUnits), 0n)
      : null;
  $('totals').textContent = `${w('planned')}: ${planned} · ${w('reported')}: ${
    reported === null ? w('unknownValue') : reported
  } · ${r.unit}`;
  $('balances').replaceChildren();
  for (const region of r.regions) {
    const section = node('section');
    section.append(node('h3', `${region.name} (${region.id})`));
    for (const [key, value] of [
      ['allocationUnits', region.allocationUnits],
      ['plannedUnits', region.plannedUnits],
      ['known', region.knownReportedUnits],
      ['variance', region.reportedVarianceUnits],
      ['headroom', region.reportedHeadroomUnits],
    ])
      section.append(
        node(
          'p',
          `${w(key)}: ${value === null ? w('unknownValue') : value} ${r.unit}`
        )
      );
    $('balances').append(section);
  }
  $('proposals').replaceChildren(
    ...(r.proposals.length
      ? r.proposals.map((p) =>
          node(
            'li',
            `${p.fromRegionId} → ${p.toRegionId}: ${p.units} ${r.unit}`
          )
        )
      : [node('li', w('none'))])
  );
  $('uncovered').textContent = `${w('uncovered')}: ${
    r.uncoveredDeficitUnits === null
      ? w('unknownValue')
      : r.uncoveredDeficitUnits
  } ${r.unit}`;
  $('raw').textContent = JSON.stringify(r, null, 2);
  $('digest').textContent = `${w('hash')}: ${current.hash}`;
  $('result').hidden = false;
  $('status').textContent = w('ready');
}
async function compute(s, ticket) {
  const result = evaluate(s),
    bytes = JSON.stringify(s, null, 2) + '\n';
  if (!crypto.subtle) throw Error('Web Crypto required');
  $('status').textContent = w('pending');
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes))
    ),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  if (ticket !== revision) return;
  current = { scenario: s, result, bytes, hash };
  render();
}
$('planner').onsubmit = async (e) => {
  e.preventDefault();
  const ticket = invalidate();
  try {
    await compute(input(), ticket);
  } catch (e) {
    if (ticket === revision) error(e);
  }
};
for (const event of ['input', 'change'])
  $('planner').addEventListener(event, () => {
    invalidate();
    translate();
  });
for (const type of ['regions', 'jobs'])
  $(type === 'regions' ? 'add-region' : 'add-job').onclick = () => {
    if ($(type).children.length >= (type === 'regions' ? 30 : 100)) {
      $('status').textContent = w('limit');
      return;
    }
    invalidate();
    let n = 1;
    const ids = [...$(type).querySelectorAll('[data-field=id]')].map(
      (e) => e.value
    );
    while (ids.includes(type + '-' + n)) n++;
    addRow(
      type,
      type === 'regions'
        ? {
            id: type + '-' + n,
            name: lang === 'fr' ? 'Nouvelle région' : 'New region',
            allocationUnits: '0',
          }
        : {
            id: type + '-' + n,
            label: lang === 'fr' ? 'Nouvelle tâche' : 'New work',
            regionId:
              $('regions').querySelector('[data-field=id]')?.value ?? '',
            plannedUnits: '0',
            reportedUnits: null,
          }
    );
  };
async function restore() {
  const ticket = invalidate();
  $('import').value = '';
  try {
    const response = await fetch('scenario.json');
    if (!response.ok) throw Error('Example unavailable');
    const s = parseStrictJson(await response.text());
    if (ticket !== revision) return;
    evaluate(s);
    load(s);
  } catch (e) {
    if (ticket === revision) error(e);
  }
}
$('reset').onclick = restore;
$('import').onchange = async () => {
  const ticket = invalidate(),
    file = $('import').files[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw Error('1 MB maximum');
    let s = parseStrictJson(
      new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    );
    if (ticket !== revision) return;
    if (s?.schema === 'agijobs.zenith-browser-evidence.v1') {
      if (
        Object.keys(s).sort().join('|') !==
        [
          'schema',
          'scenario',
          'result',
          'downloadedScenarioSha256',
          'hashScope',
        ]
          .sort()
          .join('|')
      )
        throw Error('Unknown evidence fields');
      s = s.scenario;
    }
    evaluate(s);
    load(s);
    await compute(s, ticket);
  } catch (e) {
    if (ticket === revision) error(e);
  } finally {
    if ($('import').files[0] === file) $('import').value = '';
  }
};
$('language').onclick = () => {
  lang = lang === 'fr' ? 'en' : 'fr';
  translate();
  const u = new URL(location.href);
  u.searchParams.set('lang', lang);
  history.replaceState(null, '', u);
};
function download(bytes, name) {
  const u = URL.createObjectURL(
      new Blob([bytes], { type: 'application/json' })
    ),
    a = node('a');
  a.href = u;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
$('download').onclick = () => {
  if (current) download(current.bytes, 'zenith-scenario.json');
};
$('evidence').onclick = () => {
  if (current)
    download(
      JSON.stringify(
        {
          schema: 'agijobs.zenith-browser-evidence.v1',
          scenario: current.scenario,
          result: current.result,
          downloadedScenarioSha256: current.hash,
          hashScope: 'Exact UTF-8 bytes of zenith-scenario.json',
        },
        null,
        2
      ) + '\n',
      'zenith-evidence.json'
    );
};
translate();
restore();
