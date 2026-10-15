import { evaluate, parseScenario } from './engine.mjs';
import example from './example.mjs';
import { fr, words } from './i18n.mjs';
const $ = (id) => document.getElementById(id),
  form = $('form');
let lang =
    new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en',
  revision = 0,
  current = null;
const original = new Map(
  [...document.querySelectorAll('[data-t]')].map((e) => [e, e.textContent])
);
const w = (k) => words[lang][k] ?? k;
function node(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function invalidate() {
  revision++;
  current = null;
  $('result').hidden = true;
  $('error').hidden = true;
  $('status').textContent = w('stale');
}
function field(row, name, value, type = 'text', options = {}) {
  const wrap = node('div'),
    id = `job-${row.dataset.key}-${name}`,
    label = node('label', w(name));
  label.htmlFor = id;
  const input = node(type === 'select' ? 'select' : 'input');
  input.id = id;
  input.dataset.field = name;
  if (type === 'select') {
    for (const v of ['success', 'fail']) {
      const o = node('option', w(v));
      o.value = v;
      input.append(o);
    }
  } else input.type = type;
  Object.assign(input, options);
  input.value = value;
  wrap.append(label, input);
  row.querySelector('.job-grid').append(wrap);
  return input;
}
let serial = 0;
function addJob(j, recovered) {
  const row = node('article', undefined, 'job');
  row.dataset.key = ++serial;
  row.append(node('h3', j.id), node('div', undefined, 'job-grid'));
  field(row, 'id', j.id, 'text', { required: true, maxLength: 60 });
  field(row, 'label', j.label, 'text', { required: true, maxLength: 120 });
  field(row, 'cost', j.costCents, 'number', {
    required: true,
    min: '1',
    max: '10000000000',
    step: '1',
  });
  field(row, 'duration', j.durationMinutes, 'number', {
    required: true,
    min: '1',
    max: '10080',
    step: '1',
  });
  field(row, 'dependencies', j.dependsOn.join(', '));
  const outcome = field(row, 'outcome', j.outcome, 'select');
  const label = node('label', undefined, 'recovery-check'),
    check = node('input');
  check.type = 'checkbox';
  check.dataset.field = 'recover';
  check.checked = recovered;
  check.disabled = j.outcome !== 'fail';
  label.append(check, document.createTextNode(w('recover')));
  row.append(label);
  const remove = node('button', `${w('remove')} ${j.id}`, 'quiet');
  remove.type = 'button';
  remove.onclick = () => {
    row.remove();
    invalidate();
  };
  row.append(remove);
  row.addEventListener('input', () => {
    const id = row.querySelector('[data-field=id]').value;
    row.querySelector('h3').textContent = id;
    remove.textContent = `${w('remove')} ${id}`;
  });
  outcome.addEventListener('change', () => {
    check.disabled = outcome.value !== 'fail';
    if (check.disabled) check.checked = false;
  });
  $('jobs').append(row);
}
function load(s) {
  $('title').value = s.title;
  $('budget').value = s.budgetCents;
  $('jobs').replaceChildren();
  for (const j of s.jobs) addJob(j, s.recoveredIds.includes(j.id));
}
function input() {
  const jobs = [],
    recoveredIds = [];
  for (const row of $('jobs').children) {
    const val = (k) => row.querySelector(`[data-field=${k}]`).value;
    const id = val('id');
    jobs.push({
      id,
      label: val('label'),
      costCents: Number(val('cost')),
      durationMinutes: Number(val('duration')),
      dependsOn: val('dependencies')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      outcome: val('outcome'),
    });
    if (row.querySelector('[data-field=recover]').checked)
      recoveredIds.push(id);
  }
  return {
    schema: 'agijobs.atlas-recovery.v1',
    title: $('title').value,
    budgetCents: Number($('budget').value),
    jobs,
    recoveredIds,
  };
}
function translate() {
  document.documentElement.lang = lang;
  for (const [e, text] of original)
    e.textContent = lang === 'fr' ? fr[e.dataset.t] ?? text : text;
  $('language').textContent = lang === 'fr' ? 'EN' : 'FR';
  $('language').setAttribute(
    'aria-label',
    lang === 'fr' ? 'Switch to English' : 'Passer en français'
  );
  document.title =
    lang === 'fr'
      ? 'Atlas • Simulation de reprise'
      : 'Atlas • Recovery rehearsal';
}
function states(target, list) {
  $(target).replaceChildren(
    ...list.map((s) =>
      node(
        'li',
        `${s.id}: ${w(s.status)}${
          s.finishMinute === null ? '' : ` · ${w('minute')} ${s.finishMinute}`
        }${s.blockedBy ? ` · ${s.blockedBy.join(', ')}` : ''}${
          s.shortfallCents
            ? ` · ${w('shortfall')} ${s.shortfallCents} ${w('cents')}`
            : ''
        }`
      )
    )
  );
}
function render() {
  if (!current) return;
  const r = current.result;
  $('result-title').textContent = w(r.accepted ? 'complete' : 'blocked');
  $('metrics').replaceChildren(
    ...[
      ['initial', r.firstPass.spentCents],
      ['spent', r.spentCents],
      ['remaining', r.remainingCents],
      ['time', r.completionMinute ?? w('none')],
    ].map(([k, v]) => {
      const d = node('div');
      d.append(node('span', w(k)), node('strong', String(v)));
      return d;
    })
  );
  states('first', r.firstPass.jobs);
  states('after', r.jobs);
  $('attempts').replaceChildren(
    ...r.attempts.map((a) =>
      node(
        'li',
        `${a.id} · ${w('phase')} ${a.phase} · ${w(a.status)} · ${
          a.costCents
        } ${w('cents')} · ${w('minute')} ${a.startMinute} → ${a.finishMinute}`
      )
    )
  );
  $('raw').textContent = JSON.stringify(r, null, 2);
  $('evidence').disabled = !current.hash;
  $('digest').textContent = current.hash
    ? `${w('hash')}: ${current.hash}`
    : w(crypto.subtle ? 'pendingHash' : 'unavailable');
  $('result').hidden = false;
}
function error(e) {
  current = null;
  $('result').hidden = true;
  $('error').hidden = false;
  $('error').textContent = `${w('invalid')} ${e.message}`;
  $('status').textContent = '';
}
async function run(focus = false) {
  const ticket = ++revision;
  try {
    const scenario = input(),
      result = evaluate(scenario),
      bytes = JSON.stringify(scenario, null, 2) + '\n';
    current = { scenario, result, bytes, hash: null };
    $('error').hidden = true;
    render();
    $('status').textContent = '';
    if (focus) $('result-title').focus();
    if (crypto.subtle) {
      const hash = [
        ...new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes))
        ),
      ]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      if (ticket !== revision || !current) return;
      current.hash = hash;
      render();
    }
  } catch (e) {
    if (ticket === revision) error(e);
  }
}
form.addEventListener('submit', (e) => {
  e.preventDefault();
  run(true);
});
for (const event of ['input', 'change'])
  form.addEventListener(event, (e) => {
    if (e.target !== $('import')) invalidate();
  });
$('reset').onclick = () => {
  invalidate();
  load(structuredClone(example));
  $('import').value = '';
  $('status').textContent = w('ready');
};
$('add').onclick = () => {
  if ($('jobs').children.length >= 100) {
    $('status').textContent = w('limit');
    return;
  }
  invalidate();
  let id = 'job' + ++serial;
  const ids = new Set(input().jobs.map((j) => j.id));
  while (ids.has(id)) id = 'job' + ++serial;
  addJob(
    {
      id,
      label: lang === 'fr' ? 'Nouvelle tâche' : 'New job',
      costCents: 100,
      durationMinutes: 5,
      dependsOn: [],
      outcome: 'success',
    },
    false
  );
};
$('language').onclick = () => {
  const s = input(),
    prior = current,
    rawBudget = $('budget').value,
    rawFields = [...$('jobs').querySelectorAll('[data-field]')].map((e) => ({
      value: e.value,
      checked: e.checked,
    }));
  lang = lang === 'en' ? 'fr' : 'en';
  translate();
  load(s);
  $('budget').value = rawBudget;
  [...$('jobs').querySelectorAll('[data-field]')].forEach((e, i) => {
    e.value = rawFields[i].value;
    if (e.type === 'checkbox') e.checked = rawFields[i].checked;
  });
  if (prior) render();
  else $('status').textContent = w('ready');
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
};
$('import').onchange = async () => {
  invalidate();
  const ticket = revision,
    file = $('import').files[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw Error('1 MB maximum');
    $('status').textContent = w('loading');
    const raw = await file.text();
    if (ticket !== revision) return;
    const s = parseScenario(raw);
    load(s);
    await run();
    if (current) $('status').textContent = w('loaded');
  } catch (e) {
    if (ticket === revision) error(e);
  } finally {
    if ($('import').files[0] === file) $('import').value = '';
  }
};
function download(text, name) {
  const url = URL.createObjectURL(
      new Blob([text], { type: 'application/json' })
    ),
    a = node('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('download').onclick = () => {
  if (current) download(current.bytes, 'atlas-scenario.json');
};
$('evidence').onclick = () => {
  if (current?.hash)
    download(
      JSON.stringify(
        {
          schema: 'agijobs.atlas-browser-evidence.v1',
          scenario: current.scenario,
          result: current.result,
          downloadedScenarioSha256: current.hash,
          hashScope: 'Exact UTF-8 bytes of atlas-scenario.json',
        },
        null,
        2
      ) + '\n',
      'atlas-evidence.json'
    );
};
translate();
load(structuredClone(example));
$('status').textContent = w('ready');
