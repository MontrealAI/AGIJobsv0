import { review, validateEvidence } from './reviewer.mjs';
import { parseJSON } from './json.mjs';
import { calculate } from './calculator.mjs';
import { fr, words, checkName } from './i18n.mjs';
function integerText(value) {
  if (!/^(0|[1-9][0-9]*)$/.test(value))
    throw Error('Whole-number digits required');
  return Number(value);
}
const $ = (id) => document.getElementById(id),
  original = new Map(
    [...document.querySelectorAll('[data-t]')].map((e) => [e, e.textContent])
  );
let lang =
    new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en',
  revision = 0,
  current = null,
  prediction = null;
const w = (k) => words[lang][k] ?? k;
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
function translate() {
  $('calculator-error').hidden = true;
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
      ? 'Polaris • Explorateur des preuves de quorum'
      : 'Polaris • Quorum evidence explorer';
}
function render() {
  if (!current) return;
  const { fixture, result, hash } = current;
  $('review-status').textContent = w(result.accepted ? 'pass' : 'fail');
  for (const [key, round] of [
    ['first', fixture.first],
    ['replacement', fixture.recovery],
  ])
    $(key).textContent = result.accepted
      ? w(round.observedSuccess ? 'success' : 'failed')
      : w('unverified');
  $('checks').replaceChildren(
    ...result.checks.map((c) =>
      node('li', `${c.passed ? '✓' : '✗'} ${checkName(c.name, lang)}`)
    )
  );
  $('contracts').replaceChildren(
    ...Object.entries(fixture.contracts).map(([name, c]) =>
      node('li', `${name}: ${w(c.mock ? 'mock' : 'original')} · ${c.address}`)
    )
  );
  $('policy').textContent = JSON.stringify(
    { before: fixture.policyBefore, after: fixture.policyAfter },
    null,
    2
  );
  $('receipts').textContent = JSON.stringify(
    {
      first: fixture.first,
      firstStakes: fixture.firstStakes,
      employerAfterFirst: fixture.employerAfterFirst,
      recovery: fixture.recovery,
    },
    null,
    2
  );
  $('raw').textContent = JSON.stringify(result, null, 2);
  $('digest').textContent = `${w('hash')}: ${hash}`;
  $('result').hidden = false;
  $('status').textContent = w('ready');
}
function renderPrediction() {
  if (!prediction) return;
  $('prediction').hidden = false;
  $('prediction-summary').textContent = `${w('prediction')}: ${w('first')} ${w(
    prediction.firstExpectedSuccess ? 'success' : 'failed'
  )}; ${w('replacement')} ${w(
    prediction.replacementExpectedSuccess ? 'success' : 'failed'
  )}; ${w('missing')}: ${prediction.missingRevealers}.`;
  $('prediction-json').textContent = JSON.stringify(prediction, null, 2);
}
function invalidate() {
  revision++;
  current = null;
  $('result').hidden = true;
  $('error').hidden = true;
  $('status').textContent = w('loading');
  return revision;
}
function error(e) {
  current = null;
  $('result').hidden = true;
  $('error').hidden = false;
  $('error').textContent = `${w('error')} ${e.message}`;
  $('status').textContent = '';
}
function parse(text) {
  const value = parseJSON(text);
  let fixture = value;
  if (value?.schema === 'agijobs.polaris-browser-evidence.v1') {
    const expected = [
      'schema',
      'fixture',
      'result',
      'downloadedFixtureSha256',
      'hashScope',
    ]
      .sort()
      .join('|');
    if (Object.keys(value).sort().join('|') !== expected)
      throw Error('Unexpected evidence fields');
    fixture = value.fixture;
  }
  validateEvidence(fixture);
  return fixture;
}
async function compute(text, ticket) {
  const fixture = parse(text),
    result = review(fixture),
    bytes = JSON.stringify(fixture, null, 2) + '\n';
  if (!crypto.subtle) throw Error('Web Crypto is required');
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes))
    ),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  if (ticket !== revision) return;
  current = { fixture, result, bytes, hash };
  render();
  $('status').textContent = w('ready');
}
async function restore() {
  const ticket = invalidate();
  $('import').value = '';
  try {
    const response = await fetch('fixture.json');
    if (!response.ok) throw Error('Bundled fixture unavailable');
    const text = await response.text();
    if (ticket !== revision) return;
    await compute(text, ticket);
  } catch (e) {
    if (ticket === revision) error(e);
  }
}
$('import').onchange = async () => {
  const ticket = invalidate(),
    file = $('import').files[0];
  if (!file) return;
  try {
    if (file.size > 262144) throw Error('256 KiB maximum');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      await file.arrayBuffer()
    );
    if (ticket !== revision) return;
    await compute(text, ticket);
  } catch (e) {
    if (ticket === revision) error(e);
  } finally {
    if ($('import').files[0] === file) $('import').value = '';
  }
};
$('reset').onclick = restore;
$('language').onclick = () => {
  lang = lang === 'fr' ? 'en' : 'fr';
  translate();
  render();
  renderPrediction();
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
};
$('calculator').onsubmit = (e) => {
  e.preventDefault();
  $('calculator-error').hidden = true;
  try {
    prediction = calculate(
      integerText($('reveals').value),
      integerText($('approvals').value)
    );
    renderPrediction();
  } catch (e) {
    prediction = null;
    $('prediction').hidden = true;
    $('calculator-error').hidden = false;
    $('calculator-error').textContent =
      lang === 'fr'
        ? 'Saisissez uniquement les chiffres d’un entier de 0 à 3.'
        : 'Enter whole-number digits from 0 to 3 only.';
  }
};
for (const type of ['input', 'change'])
  $('calculator').addEventListener(type, () => {
    $('calculator-error').hidden = true;
    prediction = null;
    $('prediction').hidden = true;
  });
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
  if (current) download(current.bytes, 'polaris-fixture.json');
};
$('evidence').onclick = () => {
  if (current)
    download(
      JSON.stringify(
        {
          schema: 'agijobs.polaris-browser-evidence.v1',
          fixture: current.fixture,
          result: current.result,
          downloadedFixtureSha256: current.hash,
          hashScope: 'Exact UTF-8 bytes of polaris-fixture.json',
        },
        null,
        2
      ) + '\n',
      'polaris-evidence.json'
    );
};
translate();
restore();
