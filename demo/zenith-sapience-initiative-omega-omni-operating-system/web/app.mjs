import { reviewReplay, advance, start } from './replay.mjs';
import { parseJSON } from './json.mjs';
import { fr, words, checkName } from './i18n.mjs';
const $ = (id) => document.getElementById(id),
  original = new Map(
    [...document.querySelectorAll('[data-t]')].map((e) => [e, e.textContent])
  );
let lang =
    new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en',
  revision = 0,
  current = null,
  pins = null;
const w = (k) => words[lang][k] ?? k;
function node(tag, text) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
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
      ? 'Omega • Rejeu des points de reprise'
      : 'Omega • Checkpoint replay desk';
  if (current) render();
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
function render() {
  if (!current) return;
  const { evidence, review, hash } = current;
  $('summary').textContent =
    review.reviewAccepted === false
      ? w('rejected')
      : review.complete
      ? w('complete')
      : `${w('paused')}: ${review.verifiedRetainedStages}/5`;
  $('scope').textContent = w('supplied');
  $('stages').replaceChildren(
    ...review.checks.map((c, i) =>
      node(
        'li',
        `✓ ${w(['validate', 'compare', 'write', 'review', 'export'][i])}`
      )
    )
  );
  $('advance').disabled = review.complete || review.reviewAccepted === false;
  $('artifacts').replaceChildren();
  const artifacts = evidence.records[2]?.data.artifacts ?? [];
  if (!artifacts.length) $('artifacts').append(node('p', w('none')));
  for (const a of artifacts) {
    const details = node('details');
    details.append(node('summary', a.name), node('pre', a.content));
    $('artifacts').append(details);
  }
  const checks = evidence.records[3]?.data.review.checks ?? [];
  $('checks').replaceChildren(
    ...(checks.length
      ? checks.map((c) =>
          node('li', `${c.passed ? '✓' : '✗'} ${checkName(c.name, lang)}`)
        )
      : [node('li', w('none'))])
  );
  $('raw').textContent = JSON.stringify({ evidence, review }, null, 2);
  $('pins').textContent = JSON.stringify(pins, null, 2);
  $('digest').textContent = `${w('hash')}: ${hash}`;
  $('result').hidden = false;
  $('status').textContent = w('ready');
}
async function compute(evidence, ticket) {
  if (!pins) throw Error('Source pins unavailable');
  const review = reviewReplay(evidence, pins),
    bytes = JSON.stringify(evidence, null, 2) + '\n';
  if (!crypto.subtle) throw Error('Web Crypto required');
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes))
    ),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  if (ticket !== revision) return;
  current = { evidence, review, bytes, hash };
  render();
}
async function restore() {
  const ticket = invalidate();
  $('import').value = '';
  try {
    const [p, f] = await Promise.all([
      fetch('source-pins.json'),
      fetch('fixture.json'),
    ]);
    if (!p.ok || !f.ok) throw Error('Bundled evidence unavailable');
    const [pv, fv] = await Promise.all([p.text(), f.text()]);
    if (ticket !== revision) return;
    pins = parseJSON(pv);
    await compute(parseJSON(fv), ticket);
  } catch (e) {
    if (ticket === revision) error(e);
  }
}
$('reset').onclick = restore;
for (const [id, wrong] of [
  ['start', false],
  ['start-error', true],
])
  $(id).onclick = async () => {
    const ticket = invalidate();
    try {
      if (!pins) throw Error('Source pins unavailable');
      await compute(start(pins, wrong), ticket);
    } catch (e) {
      if (ticket === revision) error(e);
    }
  };
$('advance').onclick = async () => {
  if (!current) return;
  const evidence = current.evidence,
    ticket = invalidate();
  try {
    await compute(advance(evidence, pins), ticket);
  } catch (e) {
    if (ticket === revision) error(e);
  }
};
$('import').onchange = async () => {
  const ticket = invalidate(),
    file = $('import').files[0];
  if (!file) return;
  try {
    if (file.size > 262144) throw Error('256 KiB maximum');
    let evidence = parseJSON(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer())
    );
    if (ticket !== revision) return;
    if (evidence?.schema === 'agijobs.omega-browser-evidence.v1') {
      if (
        Object.keys(evidence).sort().join('|') !==
        ['schema', 'evidence', 'review', 'downloadedReplaySha256', 'hashScope']
          .sort()
          .join('|')
      )
        throw Error('Unknown wrapper fields');
      evidence = evidence.evidence;
    }
    await compute(evidence, ticket);
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
  if (current) download(current.bytes, 'omega-replay.json');
};
$('evidence').onclick = () => {
  if (current)
    download(
      JSON.stringify(
        {
          schema: 'agijobs.omega-browser-evidence.v1',
          evidence: current.evidence,
          review: current.review,
          downloadedReplaySha256: current.hash,
          hashScope: 'Exact UTF-8 bytes of omega-replay.json',
        },
        null,
        2
      ) + '\n',
      'omega-evidence.json'
    );
};
translate();
restore();
