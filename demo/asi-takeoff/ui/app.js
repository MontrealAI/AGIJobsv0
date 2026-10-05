'use strict';
const $ = (id) => document.getElementById(id);
const english = new Map(
  [...document.querySelectorAll('[data-i18n]')].map((el) => [
    el.dataset.i18n,
    el.textContent,
  ])
);
const french = {
  copyCommand: 'Copier la commande',
  downloadTask: 'Tâche et critères d’acceptation',
  downloadSource: 'Source synthétique approuvée',
  downloadAnalysis: 'Exemple d’analyse — aucune preuve d’exécution',
  downloadDossier: 'Exemple de dossier — aucune preuve d’exécution',
  openDiagram: 'Ouvrir le schéma en taille réelle',
  eyebrow: 'DE LA VISION AU TRAVAIL VÉRIFIABLE',
  lead: 'Explorez une mission. Vérifiez les chiffres. Commandez un travail dont les résultats sont vérifiables.',
  notice:
    'Répétition de planification · aucun agent actif · aucune transaction · aucune approbation de production',
  choose: '1. Explorer un scénario',
  scenario: 'Mission',
  refresh: 'Actualiser la source',
  languageNote:
    'Les libellés sont bilingues. Les plans sources et les preuves techniques restent en anglais.',
  handoff: '2. Essayer la tâche informatique',
  task: 'Demandez à un agent OpenClaw ou à une session ChatGPT Work dirigée par un opérateur de vérifier le plan planétaire synthétique. Produisez analysis.json et dossier.md avec les cinq tâches, les totaux budgétaires exacts et le calendrier des dépendances.',
  fixed:
    'Cet exercice fixe utilise le plan planétaire et le port 4176, indépendamment du scénario choisi ci-dessus. Toute modification de la tâche ou de son origine nécessite une nouvelle admission.',
  check:
    'Enregistrez les fichiers UTF-8 exacts, puis lancez ce vérificateur indépendant depuis la racine du dépôt avec vos chemins de fichiers :',
  receiptCheck:
    'Vous avez un reçu de l’adaptateur ? Vérifiez directement ses fichiers intégrés. Remplacez la tâche et le déploiement ci-dessous par les valeurs attendues de votre registre d’admission protégé. Des empreintes concordantes n’authentifient pas un agent.',
  boundary:
    'La validation arithmétique est distincte de la qualité du dossier, de la provenance du travail et du règlement autorisé. Le téléchargement ne lance aucun agent.',
  architecture: '3. Préserver la vision globale',
  opportunity:
    'La vision couvre le travail licite réalisé avec un clavier, une souris et un écran. Chaque catégorie exige des critères mesurables et une fiabilité démontrée.',
  market:
    '40 000 milliards de dollars par an est une hypothèse du projet, pas une estimation de marché vérifiée ni une prévision de revenus. La construction et les opérations du réseau exigent une réalisation physique autorisée séparément.',
  openclaw:
    'Utilisez l’adaptateur Responses existant, un profil dédié admis, une politique appliquée dans l’environnement et un journal persistant.',
  work: 'Utilisez les outils approuvés dans une session dirigée par un opérateur, exportez les fichiers candidats, puis effectuez une vérification indépendante.',
  api: 'Un environnement distinct doit exécuter les actions et renvoyer les observations. Ce studio local ne fournit aucun moteur actif.',
  chain: '4. Répéter le cycle contractuel',
  chainText:
    'Après installation des versions fixées par le dépôt, lancez la démonstration locale à trois tâches. Elle utilise des jetons fictifs et des résultats configurés pour l’agriculture, les infrastructures et la santé.',
  chainBoundary:
    'Les reçus vérifient le comportement contractuel local. Ils ne prouvent pas la réalisation des projets ni une exécution par un fournisseur actif. Consultez README et RUNBOOK pour les autres parcours.',
  footer:
    'Des preuves avant l’acceptation. Une autorisation avant le règlement.',
};
let current = null,
  requestId = 0;
const tr = (en, fr) => ($('language').value === 'fr' ? fr : en);
// HTML formatting must never turn a copied shell command into multiple commands.
for (const code of document.querySelectorAll('code[data-command]'))
  code.textContent = code.textContent.replace(/\s+/g, ' ').trim();
for (const button of document.querySelectorAll('button[data-copy]')) {
  const status = document.createElement('span');
  status.className = 'copy-feedback';
  status.setAttribute('role', 'status');
  button.after(status);
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($(button.dataset.copy).textContent);
      status.textContent = tr('Command copied.', 'Commande copiée.');
    } catch {
      status.textContent = tr(
        'Select and copy the command above.',
        'Sélectionnez et copiez la commande ci-dessus.'
      );
    }
  });
}
function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text);
  if (cls) el.className = cls;
  return el;
}
function render(report) {
  const card = node('article', undefined, 'card');
  card.append(node('h2', report.initiative), node('p', report.objective));
  const metrics = node('div', undefined, 'metrics');
  for (const [title, value, detail] of [
    [
      tr('Planned rewards', 'Récompenses prévues'),
      report.allocatedRewards,
      report.currency,
    ],
    [
      tr('Unallocated budget', 'Budget non alloué'),
      report.unallocatedBudget,
      `${tr('Budget', 'Budget')}: ${report.budget} ${report.currency}`,
    ],
    [
      tr('Illustrative critical path', 'Chemin critique illustratif'),
      `${report.criticalPathDays} ${tr('days', 'jours')}`,
      report.horizonDays === null
        ? tr('No declared day horizon', 'Aucun horizon en jours')
        : `${tr('Planning horizon', 'Horizon prévu')}: ${
            report.horizonDays
          } ${tr('days', 'jours')}`,
    ],
  ]) {
    const box = node('div', undefined, 'metric');
    box.append(
      node('span', title),
      node('strong', value),
      node('span', detail)
    );
    metrics.append(box);
  }
  card.append(metrics, node('p', report.scheduleAssumption, 'muted'));
  for (const observation of report.observations)
    card.append(node('p', observation, 'observation'));
  const wrap = node('div', undefined, 'table-wrap'),
    table = node('table');
  const caption = node(
    'caption',
    tr(
      'Planned jobs and dependencies (illustrative days)',
      'Tâches et dépendances (jours illustratifs)'
    )
  );
  const head = node('thead'),
    row = node('tr');
  for (const text of [
    tr('Job', 'Tâche'),
    tr('Reward', 'Récompense'),
    tr('Depends on', 'Dépend de'),
    tr('Start → finish', 'Début → fin'),
  ]) {
    const th = node('th', text);
    th.scope = 'col';
    row.append(th);
  }
  head.append(row);
  table.append(caption, head);
  const body = node('tbody');
  for (const job of report.jobs) {
    const r = node('tr'),
      title = node('td');
    title.append(node('strong', job.id), node('div', job.title));
    r.append(
      title,
      node('td', job.reward),
      node('td', job.dependencies.join(', ') || '—'),
      node('td', `${job.startDay} → ${job.finishDay}`)
    );
    body.append(r);
  }
  table.append(body);
  wrap.append(table);
  card.append(wrap);
  const details = node('details');
  details.append(
    node(
      'summary',
      tr(
        'Source integrity and execution status',
        'Intégrité de la source et état d’exécution'
      )
    ),
    node(
      'code',
      `SHA-256: ${report.sourceSha256}\nmode: ${report.mode}\nliveProvider: false\ntransactionsSubmitted: false\nproductionApproved: false\nsettlementApproved: false`
    )
  );
  card.append(details);
  const link = node(
    'a',
    tr('Download this source plan', 'Télécharger ce plan source')
  );
  link.href =
    $('scenario').value === 'planetary'
      ? '/project-plan.planetary.json'
      : '/project-plan.json';
  link.download = '';
  const download = node('p');
  download.append(link);
  card.append(download);
  $('mission').replaceChildren(card);
}
async function refresh() {
  const id = ++requestId;
  $('refresh').disabled = true;
  $('mission').setAttribute('aria-busy', 'true');
  $('error').hidden = true;
  current = null;
  $('mission').replaceChildren();
  try {
    const response = await fetch(
      `/api/plan?scenario=${encodeURIComponent($('scenario').value)}`,
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const report = await response.json();
    if (
      report.schemaVersion !== 1 ||
      report.mode !== 'planning-only' ||
      report.productionApproved !== false ||
      report.liveProvider !== false ||
      report.transactionsSubmitted !== false ||
      report.settlementApproved !== false ||
      !Array.isArray(report.jobs)
    )
      throw new Error('Unsupported planning report');
    if (id !== requestId) return;
    current = report;
    render(report);
  } catch (error) {
    if (id !== requestId) return;
    current = null;
    $('mission').replaceChildren();
    $('error').textContent =
      tr(
        'Unable to load the plan. Check the local server and retry. ',
        'Impossible de charger le plan. Vérifiez le serveur local et réessayez. '
      ) + error.message;
    $('error').hidden = false;
  } finally {
    if (id === requestId) {
      $('refresh').disabled = false;
      $('mission').setAttribute('aria-busy', 'false');
    }
  }
}
$('language').addEventListener('change', () => {
  document.documentElement.lang = $('language').value;
  for (const el of document.querySelectorAll('[data-i18n]'))
    el.textContent =
      $('language').value === 'fr'
        ? french[el.dataset.i18n]
        : english.get(el.dataset.i18n);
  if (current) render(current);
});
$('scenario').addEventListener('change', refresh);
$('refresh').addEventListener('click', refresh);
refresh();
