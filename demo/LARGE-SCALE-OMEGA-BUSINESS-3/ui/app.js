'use strict';
let report,
  selected = 0,
  french = false;
const byId = (id) => document.getElementById(id);
const t = (en, fr) => (french ? fr : en);
const money = (value) => {
  const n = BigInt(value),
    sign = n < 0n ? '-' : '',
    abs = n < 0n ? -n : n;
  return (
    sign +
    (abs / 1000000n).toLocaleString(french ? 'fr-CA' : 'en-CA') +
    '.' +
    (abs % 1000000n).toString().padStart(6, '0')
  );
};
function node(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}
function link(label, file) {
  const a = node('a', label, 'button');
  a.href = '/download/' + file;
  a.download = '';
  return a;
}
function status(job) {
  return job.status === 'evidence-ready'
    ? t('Checks passed · review required', 'Calculs validés · révision requise')
    : job.status === 'deferred'
    ? t('Deferred · capacity or budget', 'Reporté · capacité ou budget')
    : t('Rejected · inspect evidence', 'Rejeté · examiner les preuves');
}
function render() {
  if (!report) return;
  const statusBox = byId('run-status');
  statusBox.replaceChildren();
  statusBox.hidden = report.successful && report.phases.length === 0;
  if (!statusBox.hidden) {
    statusBox.append(
      node(
        'p',
        report.successful
          ? t(
              'Rehearsal phases completed. Human acceptance remains required.',
              'Phases de répétition terminées. Acceptation humaine requise.'
            )
          : t(
              'This run contains rejected evidence or failed phases. Inspect the report before proceeding.',
              'Cette exécution contient des résultats rejetés ou des phases en échec. Examinez le rapport.'
            )
      )
    );
    for (const phase of report.phases)
      statusBox.append(
        node(
          'p',
          `${phase.label}: ${phase.status}${
            phase.error ? ' — ' + phase.error : ''
          }`
        )
      );
  }
  const metrics = byId('metrics');
  metrics.replaceChildren();
  for (const [value, label] of [
    [
      `${report.totals.fixtureAccepted} / ${report.totals.admitted}`,
      t('Fixture checks passed', 'Contrôles synthétiques réussis'),
    ],
    [
      money(report.totals.proposedBudgetMicros).replace(/\.000000$/, ''),
      t('USDC • proposed planning budgets', 'USDC • budgets proposés'),
    ],
    [
      `${report.review.reservedMinutes} / ${report.review.capacityMinutes}`,
      t('Modeled review minutes reserved', 'Minutes de révision réservées'),
    ],
    ['0', t('Actual payouts • USDC', 'Paiements réels • USDC')],
  ]) {
    const m = node('div', undefined, 'metric');
    m.append(node('strong', value), node('span', label));
    metrics.append(m);
  }
  const list = byId('mission-list');
  list.replaceChildren();
  report.jobs.forEach((job, index) => {
    const b = node('button', undefined, 'mission');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(index === selected));
    b.setAttribute('aria-controls', 'detail');
    b.append(
      node('small', `0${index + 1} / ${job.key.toUpperCase()}`),
      node('h3', job.employer),
      node('p', job.workGoal),
      node('span', status(job), 'state')
    );
    b.addEventListener('click', () => {
      selected = index;
      render();
      byId('mission-list').children[index].focus();
    });
    list.append(b);
  });
  const job = report.jobs[selected],
    detail = byId('detail');
  detail.replaceChildren();
  const top = node('div', undefined, 'detail-top'),
    brief = node('div');
  brief.append(
    node('p', t('SELECTED WORK ORDER', 'MANDAT SÉLECTIONNÉ'), 'eyebrow'),
    node('h2', job.employer),
    node('p', job.workGoal),
    node('p', status(job), 'tag')
  );
  brief.append(
    node(
      'p',
      t(
        `Human review: required. Planned deadline: ${job.deadlineHours} hours. Agent identity is illustrative and unverified.`,
        `Révision humaine requise. Délai prévu : ${job.deadlineHours} heures. L’identité de l’agent est illustrative et non vérifiée.`
      ),
      'muted'
    )
  );
  if (job.admission.reason) brief.append(node('p', job.admission.reason));
  const table = node('table', undefined, 'budget-table');
  const caption = node(
    'caption',
    t(
      'Planning amounts • USDC, six decimals',
      'Montants prévus • USDC, six décimales'
    )
  );
  table.append(caption);
  const tbody = node('tbody');
  for (const [label, key] of [
    [t('Customer budget', 'Budget client'), 'budgetMicros'],
    [t('Modeled worker cost', 'Coût agent estimé'), 'workerCostMicros'],
    [t('Modeled human review', 'Révision humaine estimée'), 'reviewCostMicros'],
    [t('Modeled platform fee', 'Frais de plateforme estimés'), 'feeMicros'],
    [t('Unallocated budget', 'Budget non affecté'), 'remainingMicros'],
  ]) {
    const row = node('tr'),
      th = node('th', label);
    th.scope = 'row';
    row.append(th, node('td', money(job.economics[key])));
    tbody.append(row);
  }
  table.append(tbody);
  top.append(brief, table);
  detail.append(top);
  detail.append(
    node(
      'h3',
      t(
        'Inspect the inputs. Download the handoff. Check the result.',
        'Examiner les données. Télécharger le mandat. Vérifier le résultat.'
      )
    )
  );
  const downloads = node('div', undefined, 'downloads');
  for (const [key, label] of [
    ['input', t('Source input', 'Données sources')],
    ['task', t('Agent task', 'Mandat agent')],
    ['candidate', t('Candidate JSON', 'Résultat JSON')],
    ['dossier', t('Dossier', 'Dossier')],
    ['checker', t('Checker verdict', 'Verdict du contrôle')],
  ])
    if (job.files[key]) downloads.append(link(label, job.files[key]));
  detail.append(downloads);
  const source = report.artifacts.find((a) => a.path === job.files.input);
  detail.append(node('p', `SHA-256 · ${source.sha256}`, 'hash'));
  detail.append(
    node(
      'p',
      t('Legacy mission, preserved: ', 'Mission historique conservée : ') +
        job.mission,
      'muted'
    )
  );
  byId('run-id').textContent = `${report.runId} · ${
    report.planningNetwork
  } (${t('planning label only', 'contexte prévu seulement')})`;
  capacityPreview();
}
function capacityPreview() {
  if (!report) return;
  const capacity = Number(byId('capacity').value);
  byId('capacity-value').textContent = String(capacity);
  let minutes = 0,
    count = 0;
  // The saved run carries its per-job admission effort; schema policy is fetched below.
  for (const job of report.jobs)
    if (
      job.admission.estimatedReviewMinutes <= report.reviewLimit &&
      minutes + job.admission.estimatedReviewMinutes <= capacity &&
      BigInt(job.economics.remainingMicros) >= 0n
    ) {
      minutes += job.admission.estimatedReviewMinutes;
      count++;
    }
  byId('capacity-result').textContent = t(
    `${count} of ${report.jobs.length} jobs fit; ${minutes} minutes reserved. Preview only.`,
    `${count} mandat(s) sur ${report.jobs.length} admissible(s); ${minutes} minutes réservées. Aperçu seulement.`
  );
}
byId('capacity').addEventListener('input', capacityPreview);
byId('language').addEventListener('click', () => {
  french = !french;
  document.documentElement.lang = french ? 'fr' : 'en';
  byId('language').textContent = french ? 'EN' : 'FR';
  byId('language').setAttribute(
    'aria-label',
    french ? 'Switch to English' : 'Passer en français'
  );
  document.querySelectorAll('[data-en]').forEach((el) => {
    el.textContent = el.dataset[french ? 'fr' : 'en'].replaceAll('\\n', '\n');
  });
  render();
});
(async () => {
  try {
    const response = await fetch('/api/report');
    if (!response.ok) throw new Error('Report unavailable');
    report = await response.json();
    const source = await fetch('/download/scenario.json');
    if (!source.ok) throw new Error('Scenario unavailable');
    const scenario = await source.json();
    report.reviewLimit = scenario.businessPolicy.maxReviewerMinutesPerJob;
    const totalRequiredMinutes = report.jobs.reduce(
      (total, job) => total + job.admission.estimatedReviewMinutes,
      0
    );
    byId('capacity').max = String(
      Math.max(60, report.review.capacityMinutes, totalRequiredMinutes)
    );
    byId('capacity').value = String(report.review.capacityMinutes);
    render();
  } catch (error) {
    byId('error').hidden = false;
    byId('error').textContent =
      t(
        'Unable to load verified evidence. Restart the dashboard and inspect the terminal. ',
        'Impossible de charger les preuves. Relancez le tableau de bord et consultez le terminal. '
      ) + error.message;
  }
})();
