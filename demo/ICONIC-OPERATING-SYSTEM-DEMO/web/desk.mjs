function integerText(value) {
  if (!/^(0|[1-9][0-9]*)$/.test(value))
    throw Error('Use whole-number digits without decimals or exponents');
  return Number(value);
}
import { evaluate, parsePacket, sha256, boundedPacket } from './engine.mjs';
import { example, quotes } from './fixtures.mjs';
import { fr, names, words, artifactNames } from './i18n.mjs';
const $ = (id) => document.getElementById(id),
  form = $('form'),
  original = new Map(
    [...document.querySelectorAll('[data-t]')].map((e) => [e, e.textContent])
  );
let lang =
    new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en',
  packet = structuredClone(example),
  current = null,
  revision = 0;
const w = (k) => words[lang][k] ?? k,
  label = (k) => names[k]?.[lang === 'fr' ? 1 : 0] ?? k;
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
const fields = [
  ...Object.keys(example.usage).map((k) => ['usage', k, true]),
  ...Object.keys(example.policy).map((k) => ['policy', k, false]),
  ['execution', 'providerCalls', false],
  ['execution', 'externalFetches', false],
];
function build() {
  const raw = new Map(
    [...$('fields').querySelectorAll('input')].map((e) => [e.id, e.value])
  );
  $('fields').replaceChildren();
  for (const [group, key, optional] of fields) {
    const wrap = node('div'),
      l = node('label', label(key)),
      input = node('input');
    l.htmlFor = key;
    input.id = key;
    input.type = 'number';
    input.min = '0';
    input.max = group === 'execution' ? '100000' : '1000000000000';
    input.step = '1';
    input.required = !optional;
    input.value = raw.has(key) ? raw.get(key) : packet[group][key] ?? '';
    wrap.append(l, input);
    $('fields').append(wrap);
  }
  $('conditions').replaceChildren();
  for (const key of [
    'browserObserved',
    'workerTerminated',
    'productionApproved',
    'settlementApproved',
  ]) {
    const l = node('label'),
      input = node('input');
    input.id = key;
    input.type = 'checkbox';
    input.checked =
      key in packet.execution ? packet.execution[key] : packet[key];
    l.append(input, document.createTextNode(label(key)));
    $('conditions').append(l);
  }
  const mode = node('p', `${w('mode')}: ${packet.execution.mode}`);
  $('conditions').append(mode);
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
      ? 'ICONIC • Bureau des preuves fournisseur'
      : 'ICONIC • Supplier evidence desk';
}
function input(raw = false) {
  const p = structuredClone(packet);
  for (const [group, key, optional] of fields) {
    const value = $(key).value;
    p[group][key] = raw
      ? value
      : optional && value === ''
      ? null
      : integerText(value);
  }
  for (const key of ['browserObserved', 'workerTerminated'])
    p.execution[key] = $(key).checked;
  for (const key of ['productionApproved', 'settlementApproved'])
    p[key] = $(key).checked;
  return p;
}
function invalidate() {
  revision++;
  current = null;
  $('result').hidden = true;
  $('error').hidden = true;
  $('status').textContent = w('stale');
}
function load(p) {
  packet = structuredClone(p);
  $('fields').replaceChildren();
  build();
}
function render() {
  if (!current) return;
  const r = current.result;
  $('artifact-status').textContent = w(
    r.artifactReview.accepted ? 'pass' : 'fail'
  );
  $('packet-status').textContent = w(
    r.packetComplete ? 'complete' : 'incomplete'
  );
  $('artifact-checks').replaceChildren(
    ...r.artifactReview.checks.map((c) =>
      node(
        'li',
        `${w(c.passed ? 'pass' : 'fail')}: ${
          lang === 'fr' ? artifactNames[c.name] ?? c.name : c.name
        }`
      )
    )
  );
  $('packet-checks').replaceChildren(
    ...Object.entries(r.checks).map(([k, v]) =>
      node('li', `${w(v ? 'pass' : 'fail')}: ${label(k)}`)
    )
  );
  $('unresolved').textContent = r.unresolvedGates.length
    ? r.unresolvedGates.map(label).join(' · ')
    : w('none');
  $('quotes').textContent = JSON.stringify(quotes, null, 2);
  $('artifacts').replaceChildren(
    ...current.packet.receipt.artifacts.map((f) => {
      const d = node('section');
      d.append(node('h3', f.name), node('pre', f.content));
      return d;
    })
  );
  $('raw').textContent = JSON.stringify(r, null, 2);
  $('digest').textContent = `${w('hash')}: ${current.hash}`;
  $('result').hidden = false;
}
function error(e) {
  current = null;
  $('result').hidden = true;
  $('error').hidden = false;
  $('error').textContent = `${w('error')} ${e.message}`;
  $('status').textContent = '';
}
async function run(focus = false) {
  const ticket = ++revision;
  current = null;
  $('result').hidden = true;
  $('error').hidden = true;
  $('status').textContent = w('working');
  try {
    const p = boundedPacket(input()),
      bytes = JSON.stringify(p),
      result = await evaluate(p),
      hash = await sha256(bytes);
    if (ticket !== revision) return;
    current = { packet: p, result, bytes, hash };
    packet = structuredClone(p);
    render();
    $('status').textContent = '';
    if (focus) $('result-title').focus();
  } catch (e) {
    if (ticket === revision) error(e);
  }
}
form.addEventListener('submit', (e) => {
  e.preventDefault();
  run(true);
});
for (const type of ['input', 'change'])
  form.addEventListener(type, (e) => {
    if (e.target !== $('import')) invalidate();
  });
$('reset').onclick = () => {
  invalidate();
  load(example);
  $('import').value = '';
  $('status').textContent = w('ready');
};
$('language').onclick = () => {
  const raw = [...$('fields').querySelectorAll('input')].map((e) => [
    e.id,
    e.value,
  ]);
  packet = input(true);
  lang = lang === 'fr' ? 'en' : 'fr';
  translate();
  build();
  for (const [id, value] of raw) $(id).value = value;
  if (current) render();
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
    if (file.size > 2000000) throw Error('2 MB envelope maximum');
    $('status').textContent = w('loading');
    const text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(await file.arrayBuffer());
    if (ticket !== revision) return;
    load(parsePacket(text));
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
  if (current) download(current.bytes, 'supplier-packet.json');
};
$('evidence').onclick = () => {
  if (current)
    download(
      JSON.stringify({
        schema: 'agijobs.supplier-browser-evidence.v1',
        packet: current.packet,
        result: current.result,
        downloadedPacketSha256: current.hash,
        hashScope: 'Exact UTF-8 bytes of supplier-packet.json',
      }),
      'supplier-evidence.json'
    );
};
translate();
load(packet);
$('status').textContent = w('ready');
