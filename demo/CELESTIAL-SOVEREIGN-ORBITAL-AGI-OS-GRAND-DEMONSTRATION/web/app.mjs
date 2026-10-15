import { evaluate } from './engine.mjs';
import { parseJSON } from './json.mjs';
import { fr, words } from './i18n.mjs';
const $ = (id) => document.getElementById(id),
  original = new Map(
    [...document.querySelectorAll('[data-t]')].map((e) => [e, e.textContent])
  ),
  dims = ['energyUnits', 'computeUnits'],
  fields = ['normalCapacity', 'outageCapacity', 'protectedReserve'];
let lang =
    new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en',
  revision = 0,
  current = null,
  next = 0;
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
      ? 'Celestial • Planification des ressources'
      : 'Celestial • Resource contingency desk';
  for (const row of $('jobs').children)
    row
      .querySelector('button')
      .setAttribute(
        'aria-label',
        `${w('remove')} ${row.querySelector('[data-field=id]').value}`
      );
  if (current) render();
}
function input(parent, key, value, id, max) {
  const wrap = node('div'),
    label = translated('label', key),
    e = node('input');
  label.htmlFor = id;
  e.id = id;
  e.dataset.field = key;
  e.value = value;
  e.required = true;
  if (max !== undefined) {
    e.type = 'number';
    e.min = 0;
    e.max = max;
    e.step = 1;
  } else e.maxLength = key === 'id' ? 40 : 100;
  wrap.append(label, e);
  parent.append(wrap);
  return e;
}
function addJob(j) {
  const row = node('fieldset');
  row.className = 'job-grid';
  const n = next++;
  for (const key of ['id', 'label', 'priority', ...dims])
    input(
      row,
      key,
      j[key],
      `job-${n}-${key}`,
      key === 'priority' ? 100 : dims.includes(key) ? 1000000 : undefined
    );
  const remove = translated('button', 'remove');
  remove.type = 'button';
  remove.onclick = () => {
    row.remove();
    invalidate();
  };
  row.append(remove);
  $('jobs').append(row);
  translate();
}
function populate(s) {
  $('title').value = s.title;
  $('capacities').replaceChildren();
  for (const field of fields) {
    const section = node('fieldset'),
      legend = translated('legend', field);
    section.className = 'pair';
    section.append(legend);
    for (const d of dims)
      input(section, d, s[field][d], `${field}-${d}`, 1000000);
    $('capacities').append(section);
  }
  $('jobs').replaceChildren();
  for (const j of s.jobs) addJob(j);
  translate();
}
function integerText(value) {
  if (!/^(0|[1-9][0-9]*)$/.test(value))
    throw Error('Use whole-number digits without decimals or exponents');
  return Number(value);
}
function read() {
  const s = {
    schema: 'agijobs.celestial-resource-contingency.v1',
    title: $('title').value,
  };
  for (const f of fields) {
    s[f] = {};
    for (const d of dims) {
      const value = $(`${f}-${d}`).value;
      if (value === '') throw Error('Empty resource field');
      s[f][d] = integerText(value);
    }
  }
  s.jobs = [...$('jobs').children].map((row) =>
    Object.fromEntries(
      [...row.querySelectorAll('input')].map((e) => {
        if (e.value === '') throw Error('Empty request field');
        return [
          e.dataset.field,
          ['id', 'label'].includes(e.dataset.field)
            ? e.value
            : integerText(e.value),
        ];
      })
    )
  );
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
function failure(e) {
  current = null;
  $('result').hidden = true;
  $('error').hidden = false;
  $('error').textContent = `${w('error')} ${e.message}`;
  $('status').textContent = '';
}
function render() {
  if (!current) return;
  const r = current.result;
  $('summary').textContent = w(r.outage.dispatchPaused ? 'paused' : 'ready');
  $('phases').replaceChildren();
  for (const key of ['normal', 'outage']) {
    const p = r[key],
      section = node('section');
    section.append(node('h3', w(key)));
    for (const field of [
      'reserveHeld',
      'reserveShortfall',
      'allocated',
      'remaining',
    ])
      section.append(
        node(
          'p',
          `${w(field)}: ${w('energyUnits')} ${p[field].energyUnits} · ${w(
            'computeUnits'
          )} ${p[field].computeUnits}`
        )
      );
    const list = node('ul');
    for (const j of p.jobs)
      list.append(
        node(
          'li',
          `${j.label} (${j.id}) · ${w(j.status)}${
            j.reasons.length ? ' · ' + j.reasons.map(w).join(', ') : ''
          }`
        )
      );
    section.append(list);
    $('phases').append(section);
  }
  $('changes').textContent = `${w('displaced')}: ${
    r.displacedIds.join(', ') || w('none')
  }. ${w('newly')}: ${r.newlySelectedIds.join(', ') || w('none')}.`;
  $('raw').textContent = JSON.stringify(r, null, 2);
  $('digest').textContent = `${w('hash')}: ${current.hash}`;
  $('result').hidden = false;
  $('status').textContent = w('ready');
}
async function compute(s, ticket) {
  const result = evaluate(s),
    bytes = JSON.stringify(s, null, 2) + '\n';
  $('status').textContent = w('pending');
  if (!crypto.subtle) throw Error('Web Crypto required');
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
    await compute(read(), ticket);
  } catch (e) {
    if (ticket === revision) failure(e);
  }
};
for (const type of ['input', 'change'])
  $('planner').addEventListener(type, () => {
    invalidate();
    translate();
  });
$('add').onclick = () => {
  if ($('jobs').children.length >= 50) return;
  invalidate();
  let n = 1;
  const ids = [...$('jobs').querySelectorAll('[data-field=id]')].map(
    (e) => e.value
  );
  while (ids.includes('request-' + n)) n++;
  addJob({
    id: 'request-' + n,
    label: lang === 'fr' ? 'Nouvelle demande' : 'New request',
    priority: 50,
    energyUnits: 1,
    computeUnits: 1,
  });
};
async function restore() {
  const ticket = invalidate();
  $('import').value = '';
  try {
    const response = await fetch('scenario.json');
    if (!response.ok) throw Error('Example unavailable');
    const s = parseJSON(await response.text());
    if (ticket !== revision) return;
    evaluate(s);
    populate(s);
  } catch (e) {
    if (ticket === revision) failure(e);
  }
}
$('reset').onclick = restore;
$('import').onchange = async () => {
  const ticket = invalidate(),
    file = $('import').files[0];
  if (!file) return;
  try {
    if (file.size > 262144) throw Error('256 KiB maximum');
    let s = parseJSON(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer())
    );
    if (ticket !== revision) return;
    if (s?.schema === 'agijobs.celestial-browser-evidence.v1') {
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
    populate(s);
    await compute(s, ticket);
  } catch (e) {
    if (ticket === revision) failure(e);
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
function download(text, name) {
  const u = URL.createObjectURL(new Blob([text], { type: 'application/json' })),
    a = node('a');
  a.href = u;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
$('download').onclick = () => {
  if (current) download(current.bytes, 'celestial-scenario.json');
};
$('evidence').onclick = () => {
  if (current)
    download(
      JSON.stringify(
        {
          schema: 'agijobs.celestial-browser-evidence.v1',
          scenario: current.scenario,
          result: current.result,
          downloadedScenarioSha256: current.hash,
          hashScope: 'Exact UTF-8 bytes of celestial-scenario.json',
        },
        null,
        2
      ) + '\n',
      'celestial-evidence.json'
    );
};
translate();
restore();
