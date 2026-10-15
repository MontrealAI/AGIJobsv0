function integerText(value) {
  if (!/^(0|[1-9][0-9]*)$/.test(value))
    throw Error('Use whole-number digits without decimals or exponents');
  return Number(value);
}
// SPDX-License-Identifier: MIT
import { evaluate, parseScenario } from './engine.mjs';
import { word, toggle } from './i18n.mjs';
let proposalId = 'maintenance-001',
  requiredControls = ['pause', 'budget', 'review'];
const $ = (id) => document.getElementById(id);
let revision = 0,
  evidence = null,
  scenarioText = null;
const defaults = [
  ['operations', 40, 'approve'],
  ['maintenance', 30, 'approve'],
  ['risk', 20, 'reject'],
];
function clear() {
  revision++;
  evidence = null;
  scenarioText = null;
  $('result').hidden = true;
  $('empty').hidden = false;
  $('error').hidden = true;
  $('status').textContent = '';
}
function drawVotes(votes) {
  $('votes').replaceChildren();
  for (const { voter: name, weight, choice } of votes) {
    const row = document.createElement('div');
    row.className = 'vote';
    row.dataset.voter = name;
    const heading = document.createElement('h4');
    heading.textContent = name;
    row.append(heading);
    const pair = document.createElement('div');
    pair.className = 'pair';
    for (const key of ['weight', 'choice']) {
      const label = document.createElement('label');
      label.textContent =
        key === 'weight'
          ? word('Vote weight', 'Poids du vote')
          : word('Vote choice', 'Choix du vote');
      const el = document.createElement(key === 'weight' ? 'input' : 'select');
      el.dataset.key = key;
      if (key === 'weight') {
        el.type = 'number';
        el.min = 1;
        el.max = 1000000000;
        el.step = 1;
        el.required = true;
        el.value = weight;
      } else {
        for (const value of ['approve', 'reject', 'abstain']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = {
            approve: word('approve', 'approuver'),
            reject: word('reject', 'rejeter'),
            abstain: word('abstain', 'abstention'),
          }[value];
          el.append(option);
        }
        el.value = choice;
      }
      label.append(el);
      pair.append(label);
    }
    row.append(pair);
    $('votes').append(row);
  }
}
function drawControls(controls) {
  const box = $('controls');
  box.replaceChildren();
  const legend = document.createElement('legend');
  legend.textContent = word(
    'Owner controls present',
    'Contrôles du propriétaire présents'
  );
  box.append(legend);
  for (const name of [...new Set([...requiredControls, ...controls])]) {
    const label = document.createElement('label'),
      input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.control = name;
    input.id = ['pause', 'budget', 'review'].includes(name)
      ? name
      : 'control-' + name;
    input.checked = controls.includes(name);
    label.append(
      input,
      document.createTextNode(
        name +
          (requiredControls.includes(name)
            ? word(' (required)', ' (requis)')
            : word(' (additional)', ' (supplémentaire)'))
      )
    );
    box.append(label);
  }
}
function load(scenario) {
  evaluate(scenario);
  clear();
  proposalId = scenario.proposal.id;
  requiredControls = [...scenario.policy.requiredControls];
  for (const [id, value] of Object.entries({
    title: scenario.title,
    requested: scenario.proposal.requestedCents,
    available: scenario.proposal.availableCents,
    eligible: scenario.policy.eligibleWeight,
    quorum: scenario.policy.quorumPercent,
    approval: scenario.policy.approvalPercent,
  }))
    $(id).value = value;
  drawControls(scenario.controls);
  drawVotes(scenario.votes);
}
function reset() {
  load({
    schema: 'agijobs.governance-rehearsal.v1',
    title: 'Approve a bounded maintenance budget',
    proposal: {
      id: 'maintenance-001',
      requestedCents: 420000,
      availableCents: 500000,
    },
    policy: {
      eligibleWeight: 100,
      quorumPercent: 60,
      approvalPercent: 67,
      requiredControls: ['pause', 'budget', 'review'],
    },
    controls: ['pause', 'budget', 'review'],
    votes: defaults.map(([voter, weight, choice]) => ({
      voter,
      weight,
      choice,
    })),
  });
}
const number = (id) => integerText($(id).value);
function read(raw = false) {
  const numeric = (id) => (raw ? $(id).value : number(id));
  return {
    schema: 'agijobs.governance-rehearsal.v1',
    title: $('title').value,
    proposal: {
      id: proposalId,
      requestedCents: numeric('requested'),
      availableCents: numeric('available'),
    },
    policy: {
      eligibleWeight: numeric('eligible'),
      quorumPercent: numeric('quorum'),
      approvalPercent: numeric('approval'),
      requiredControls: [...requiredControls],
    },
    controls: [...$('controls').querySelectorAll('input:checked')].map(
      (el) => el.dataset.control
    ),
    votes: [...$('votes').children].map((row) => ({
      voter: row.dataset.voter,
      weight: raw
        ? row.querySelector('[data-key=weight]').value
        : integerText(row.querySelector('[data-key=weight]').value),
      choice: row.querySelector('select').value,
    })),
  };
}
function render() {
  const { scenario, result } = evidence;
  $('result').hidden = false;
  $('empty').hidden = true;
  $('decision').textContent = result.accepted
    ? word('Passes the rehearsal.', 'La simulation réussit.')
    : word('Stopped by the policy.', 'Arrêt selon la politique.');
  $('summary').textContent = result.accepted
    ? word(
        'Every modeled gate passes. No proposal has been enacted; no settlement has been authorized.',
        'Tous les critères modélisés sont respectés. Aucune proposition exécutée, aucun règlement autorisé.'
      )
    : word(
        `Failed gates: ${result.reasons.join(
          ', '
        )}. No proposal has been enacted.`,
        `Critères non respectés : ${result.reasons.join(
          ', '
        )}. Aucune proposition exécutée.`
      );
  $('checks').replaceChildren();
  const descriptions = {
    quorum: word(
      `Cast ${result.castWeight} / eligible ${scenario.policy.eligibleWeight}; requires ${scenario.policy.quorumPercent}%`,
      `Exprimés ${result.castWeight} / admissibles ${scenario.policy.eligibleWeight}; seuil ${scenario.policy.quorumPercent}%`
    ),
    approval: word(
      `Approved ${result.approvedWeight} / all cast ${result.castWeight}; requires ${scenario.policy.approvalPercent}%`,
      `Approuvés ${result.approvedWeight} / exprimés ${result.castWeight}; seuil ${scenario.policy.approvalPercent}%`
    ),
    budget: word(
      `Requested ${result.requestedCents} / available ${scenario.proposal.availableCents} cents`,
      `Demandés ${result.requestedCents} / disponibles ${scenario.proposal.availableCents} centimes`
    ),
    ownerControls: result.missingControls.length
      ? word(
          `Missing: ${result.missingControls.join(', ')}`,
          `Manquants : ${result.missingControls.join(', ')}`
        )
      : word(
          'All required controls are present in the supplied model',
          'Tous les contrôles requis sont présents dans le modèle'
        ),
  };
  for (const [key, passed] of Object.entries(result.checks)) {
    const li = document.createElement('li');
    li.textContent = `${passed ? 'PASS' : 'STOP'} · ${key}: ${
      descriptions[key]
    }`;
    $('checks').append(li);
  }
  $('metrics').replaceChildren();
  for (const [name, value] of [
    [word('Approved weight', 'Poids approuvé'), result.approvedWeight],
    [
      word('Remaining modeled cents', 'Centimes restants modélisés'),
      result.remainingCentsIfApproved,
    ],
  ]) {
    const div = document.createElement('div'),
      span = document.createElement('span'),
      strong = document.createElement('strong');
    span.textContent = name;
    strong.textContent = value;
    div.append(span, strong);
    $('metrics').append(div);
  }
  $('artifact').textContent = JSON.stringify(evidence, null, 2);
  $('status').textContent = word(
    'Result calculated locally. Downloads contain this exact scenario and its computed result.',
    'Résultat calculé localement. Les téléchargements contiennent ce scénario exact et son résultat calculé.'
  );
}
$('form').addEventListener('input', (event) => {
  if (event.target !== $('import')) clear();
});
$('form').addEventListener('change', (event) => {
  if (event.target !== $('import')) clear();
});
$('reset').onclick = reset;
$('form').onsubmit = async (event) => {
  event.preventDefault();
  clear();
  const token = revision;
  try {
    const scenario = read(),
      result = evaluate(scenario);
    const text = JSON.stringify(scenario, null, 2) + '\n';
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    if (token !== revision) return;
    scenarioText = text;
    evidence = {
      schema: 'agijobs.governance-browser-evidence.v1',
      scenario,
      result,
      downloadedScenarioSha256: [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
      hashScope:
        'Exact UTF-8 bytes of the downloadable scenario.json, including final newline. Not the repository fixture digest.',
    };
    render();
  } catch (error) {
    if (token !== revision) return;
    clear();
    $('error').hidden = false;
    $('error').textContent =
      word('Check your scenario: ', 'Vérifiez votre scénario : ') +
      error.message;
  }
};
function download(name, text) {
  const url = URL.createObjectURL(
      new Blob([text], { type: 'application/json' })
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('scenario-download').onclick = () => {
  if (evidence) download('scenario.json', scenarioText);
};
$('evidence-download').onclick = () => {
  if (evidence)
    download(
      'governance-evidence.json',
      JSON.stringify(evidence, null, 2) + '\n'
    );
};
$('language').onclick = () => {
  const s = read(true);
  toggle();
  drawVotes(s.votes);
  drawControls(s.controls);
  if (evidence) render();
};
$('import').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  clear();
  const token = revision;
  try {
    if (file.size > 1000000) throw new Error('Scenario exceeds 1 MB');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      await file.arrayBuffer()
    );
    if (token !== revision) return;
    load(parseScenario(text));
  } catch (error) {
    if (token !== revision) return;
    clear();
    $('error').hidden = false;
    $('error').textContent =
      word('Check your scenario: ', 'Vérifiez votre scénario : ') +
      error.message;
  } finally {
    event.target.value = '';
  }
};
reset();
