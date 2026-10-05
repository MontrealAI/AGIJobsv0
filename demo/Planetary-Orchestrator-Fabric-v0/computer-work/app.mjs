import { plan, brief } from './model.mjs';
const $ = (id) => document.getElementById(id);
const fr = {
  eyebrow: 'UNE MISSION. UN MONDE DE CAPACITÉS.',
  title: 'Une intelligence qui accomplit le travail.',
  intro:
    'Coordonnez le travail à l’écran sur Terre, Luna, Mars et Hélios. Précisez la tâche. Réservez les ressources. Vérifiez le résultat.',
  badge: 'RÉPÉTITION SYNTHÉTIQUE · AUCUNE EXÉCUTION · AUCUN PAIEMENT',
  scope: 'Définir la tâche',
  scopeNote: 'Droits, entrées, livrable',
  route: 'Répartir les capacités',
  routeNote: 'Compétences, budget, révision',
  execute: 'Produire les preuves',
  verify: 'Révision indépendante',
  verifyNote: 'Acceptation avant règlement',
  workbench: 'ATELIER DE MISSION',
  planTitle: 'Quels travaux peut-on accepter ?',
  reset: 'Rétablir les paramètres',
  explain:
    'Dix tâches synthétiques. Calculs USDC exacts. Opérateurs distincts pour la création et la révision. Les tâches sont examinées dans l’ordre : ce plan transparent ne cherche pas un optimum.',
  budget: 'Budget de mission (USDC)',
  review: 'Minutes de révision au total',
  outage: 'Simuler une panne supplémentaire',
  none: 'Aucune',
  calculate: 'Calculer la répartition',
  tableCaption:
    'Plan d’admission — les tâches retenues ne consomment ni budget ni temps de révision',
  job: 'Tâche',
  reward: 'Récompense · USDC',
  decision: 'Décision',
  assignment: 'Créateur / réviseur',
  allocation: 'Télécharger allocation.json',
  brief: 'Télécharger brief.md',
  source: 'Données sources',
  task: 'Tâche pour l’agent',
  exportNote:
    'Ces exports décrivent un plan. Ils ne donnent aucune autorisation à la passerelle, ne réalisent pas ces tâches et n’autorisent aucun règlement.',
  policy: 'Voir la politique et l’empreinte des sources',
  opportunity: 'LA POSSIBILITÉ',
  marketTitle: 'L’écran est un espace de travail.',
  marketText:
    'La vision du projet suppose 40 000 milliards de dollars de travail annuel à l’écran. Il s’agit d’une hypothèse non vérifiée, pas d’une demande mesurée ni du revenu de la plateforme.',
  capture: 'Part illustrative de cette hypothèse',
  marketNote:
    'Valeur brute annuelle illustrative, avant adoption, fiabilité, coûts et frais de marché. Ce n’est pas une prévision.',
  handoff: 'DU PLAN À LA PREUVE',
  handoffTitle: 'Confier une tâche bien délimitée.',
  handoffText:
    'Cette tâche demande à OpenClaw ou ChatGPT Work de créer et d’exporter le plan de référence. Un vérificateur local indépendant évalue ces fichiers. Les dix travaux proposés nécessitent chacun une tâche et un évaluateur distincts.',
  step1: 'Rétablissez les paramètres et téléchargez la tâche pour l’agent.',
  step2:
    'Utilisez un environnement dédié ayant accès uniquement à cet atelier local.',
  step3:
    'Exportez les deux fichiers et vérifiez-les avec la commande du guide.',
  guide: 'Ouvrir le guide opérateur →',
  handoffNote:
    'OpenClaw utilise l’adaptateur Responses existant, avec admission explicite. ChatGPT Work utilise une tâche de bureau ou de navigateur pilotée par l’opérateur. La disponibilité dépend de l’installation et des permissions.',
  footer:
    'L’échelle planétaire est la vision. Le travail mesurable et vérifiable en est l’unité. Les diagrammes et commandes de simulation d’origine sont conservés.',
};
const originals = new Map(
  [...document.querySelectorAll('[data-i18n]')].map((el) => [
    el,
    el.textContent,
  ])
);
let board,
  digest,
  allocation,
  lang = 'en';
const tr = (en, french) => (lang === 'fr' ? french : en);
const reasons = {
  eligible: ['Eligible', 'Admissible'],
  'data-rights': ['Data rights unconfirmed', 'Droits non confirmés'],
  margin: ['No positive estimated margin', 'Marge estimée non positive'],
  'worker-capacity': [
    'No qualified worker slot',
    'Capacité qualifiée indisponible',
  ],
  'review-capacity': [
    'Independent review unavailable',
    'Révision indépendante indisponible',
  ],
  budget: ['Budget exhausted', 'Budget insuffisant'],
};
function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function invalidate() {
  allocation = undefined;
  $('allocation').disabled = $('brief').disabled = true;
  $('metrics').replaceChildren();
  $('jobs').replaceChildren();
}
function td(text, tag = 'td') {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}
function render() {
  const t = allocation.totals;
  $('metrics').replaceChildren(
    ...[
      [
        tr('Jobs planned / held', 'Tâches prévues / retenues'),
        `${t.planned} / ${t.held}`,
      ],
      [tr('USDC reserved', 'USDC réservés'), t.reservedUsdc],
      [tr('USDC remaining', 'USDC restants'), t.remainingUsdc],
      [
        tr('Review minutes', 'Minutes de révision'),
        `${t.reviewMinutes} / ${allocation.inputs.reviewMinutes}`,
      ],
    ].map(([label, value]) => {
      const el = document.createElement('div');
      el.className = 'metric';
      el.append(td(label, 'span'), td(value, 'strong'));
      return el;
    })
  );
  $('jobs').replaceChildren(
    ...allocation.jobs.map((j, i) => {
      const row = document.createElement('tr'),
        job = board.jobs[i],
        title = td('', 'td'),
        decision = td('');
      title.append(
        td(`${j.jobId} · ${lang === 'fr' ? job.titleFr : job.title}`, 'strong'),
        td(job.acceptance, 'small')
      );
      const badge = td(
        j.status === 'planned' ? tr('Planned', 'Prévu') : tr('Held', 'Retenu'),
        'span'
      );
      badge.className = 'decision ' + j.status;
      decision.append(
        badge,
        td(reasons[j.reason][lang === 'fr' ? 1 : 0], 'small')
      );
      row.append(
        title,
        td(j.rewardUsdc),
        decision,
        td(j.worker ? `${j.worker} / ${j.reviewer}` : '—')
      );
      return row;
    })
  );
  $('workers').replaceChildren(
    ...board.workers.map((w) => {
      const el = td(
        `${w.shard.toUpperCase()} · ${w.id} · ${
          w.online && !allocation.inputs.offline.includes(w.id)
            ? tr('online', 'en ligne')
            : tr('offline', 'hors ligne')
        }`,
        'span'
      );
      el.className =
        'worker' +
        (!w.online || allocation.inputs.offline.includes(w.id)
          ? ' offline'
          : '');
      return el;
    })
  );
  $('policy').textContent = `SHA-256: ${digest}\n\n${
    board.policy
  }\n\n${JSON.stringify(
    { workers: board.workers, reviewers: board.reviewers },
    null,
    2
  )}`;
  $('allocation').disabled = $('brief').disabled = false;
  status(
    tr(
      'Plan ready. Download both files for independent review.',
      'Plan prêt. Téléchargez les deux fichiers pour une révision indépendante.'
    )
  );
}
function calculate(event) {
  event?.preventDefault();
  invalidate();
  try {
    if (!board) throw new Error('Source unavailable');
    allocation = plan(board, digest, {
      budgetUsdc: $('budget').value,
      reviewMinutes: Number($('review').value),
      offline: $('outage').value ? [$('outage').value] : [],
    });
    render();
  } catch (error) {
    status(
      tr('Unable to plan: ', 'Calcul impossible : ') + error.message,
      true
    );
  }
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function market() {
  const gross = (40000000000000n * BigInt($('capture').value)) / 100000n;
  $('market-value').textContent =
    new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(gross) + tr(' / year', ' / an');
}
$('controls').addEventListener('submit', calculate);
for (const id of ['budget', 'review', 'outage'])
  $(id).addEventListener('input', () => {
    invalidate();
    status(
      tr(
        'Inputs changed. Build a new allocation.',
        'Paramètres modifiés. Recalculez la répartition.'
      )
    );
  });
$('reset').addEventListener('click', () => {
  $('budget').value = board.budgetUsdc;
  $('review').value = board.reviewMinutes;
  $('outage').value = '';
  calculate();
});
$('allocation').addEventListener('click', () => {
  if (allocation)
    download(
      'allocation.json',
      JSON.stringify(allocation, null, 2) + '\n',
      'application/json'
    );
});
$('brief').addEventListener('click', () => {
  if (allocation) download('brief.md', brief(allocation), 'text/markdown');
});
$('language').addEventListener('change', () => {
  lang = $('language').value;
  document.documentElement.lang = lang;
  $('language-label').textContent = tr('Language', 'Langue');
  for (const [el, text] of originals)
    el.textContent = lang === 'fr' ? fr[el.dataset.i18n] ?? text : text;
  if (allocation) render();
  market();
});
$('capture').addEventListener('change', market);
market();
try {
  const response = await fetch('board.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const source = await response.text();
  digest = [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
    ),
  ]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  board = JSON.parse(source);
  for (const w of board.workers.filter((x) => x.online)) {
    const option = td(w.id, 'option');
    option.value = w.id;
    $('outage').append(option);
  }
  $('calculate').disabled = $('reset').disabled = false;
  calculate();
} catch (error) {
  invalidate();
  status(
    tr(
      'Source unavailable. Restart the local server and reload. ',
      'Source indisponible. Redémarrez le serveur local. '
    ) + error.message,
    true
  );
}
