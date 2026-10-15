import {
  bytes,
  decode,
  artifacts,
  review,
  pack,
  unpack,
  MAX_BYTES,
  BUNDLE_MAX_BYTES,
} from './model.mjs';
const $ = (id) => document.getElementById(id),
  key = 'agijobsv0.initiative-ledger.session.v1';
const fr = {
  skip: 'Aller au registre',
  eyebrow: 'AUTONOMISATION SUPERINTELLIGENTE / EXERCICE BORNÉ',
  heading: 'Donnez à une initiative\nune trace de preuves.',
  lead: 'Distinguez une affirmation rapportée d’un critère vérifié. Suivez les dépendances. Repérez ce qui exige encore un jugement humain.',
  boundaryTitle: 'Une vérification précise et limitée',
  boundary:
    'Ce registre compare les observations fournies aux critères fournis. Il ne vérifie ni l’origine des sources, ni l’impact réel, ni une approbation humaine indépendante.',
  local:
    'Exécution dans votre navigateur. Aucun appel fournisseur, aucune transaction ni règlement.',
  step1: '01 / DONNÉES FOURNIES',
  inputTitle: 'Votre dossier de preuves',
  inputHelp:
    'Chargez l’exemple synthétique ou importez un dossier JSON UTF-8. Toute modification d’une observation exige son empreinte SHA-256 exacte.',
  example: 'Charger l’exemple',
  cli: 'Vérifier l’exemple CLI',
  packetLabel: 'Dossier JSON (256 Kio maximum)',
  limits:
    '1–30 initiatives · 0–30 sources · 16 Kio par source · entiers 0–1 000 000 000 · gte / lte',
  evaluate: 'Évaluer le dossier',
  restore: 'Restaurer la dernière session vérifiée',
  importPacket: 'Importer un dossier JSON',
  importBundle: 'Importer un lot d’artefacts exacts',
  step2: '02 / REGISTRE RECALCULÉ',
  resultTitle: 'Ce que les preuves étayent',
  exportBundle: 'Exporter le lot de récupération',
  exportPacket: 'Exporter le dossier exact',
  exportReport: 'Exporter le rapport',
  reviewLimit:
    'La revue des artefacts utilise le même évaluateur pour recalculer les données fournies. Un lot entièrement remplacé mais cohérent peut réussir. Son origine demeure non vérifiée.',
  readTitle: 'Comprendre les trois signaux',
  read: 'Critère satisfait : le nombre fourni respecte le seuil. En attente : une dépendance n’est pas prête. Prêt pour revue humaine : le critère et ses dépendances sont prêts. Aucun de ces signaux n’est une approbation ou un impact démontré.',
  recoverTitle: 'Conserver les preuves exactes',
  recover:
    'Le lot conserve les octets du dossier, du registre, du rapport et du reçu. L’import recalcule le résultat et rejette une sortie modifiée même si le reçu est recalculé. La dernière session réussie est conservée sur cet appareil si le stockage est disponible.',
  forget: 'Effacer la session enregistrée',
  guide: 'Lire le guide du moteur',
  footer: 'Preuves fournies. Blocages visibles. Jugement humain.',
};
const en = Object.fromEntries(
  [...document.querySelectorAll('[data-t]')].map((e) => [
    e.dataset.t,
    e.textContent,
  ])
);
const messages = {
  en: {
    idle: 'Load an example or supply a packet to begin.',
    dirty: 'Input changed. Evaluate again before exporting.',
    busy: 'Checking exact bytes and recomputing the ledger…',
    verified:
      'Artifact verification passed. Supplied origin remains unverified.',
    evaluated: 'Packet evaluated. Supplied origin remains unverified.',
    error: 'Check failed: ',
    saved: ' Last verified session saved on this device.',
    unsaved: ' Browser storage unavailable; export a recovery bundle.',
    forgot: 'Saved session removed.',
    missing: 'No saved session on this device.',
    ready: 'ready for human review',
    held: 'Held for review',
    met: 'Criterion met',
    unmet: 'Criterion unmet',
    none: 'No evidence',
    blocked: 'Blocked by',
    claim: 'Reported claim',
    observed: 'Reported value',
    unknown: 'not supplied',
    criterion: 'Criterion',
    source: 'Source SHA-256',
    count: 'initiatives ready for human review',
    notApproval:
      'Readiness is not approval. Source authenticity, real-world impact and independent human approval: unverified.',
  },
  fr: {
    idle: 'Chargez un exemple ou fournissez un dossier pour commencer.',
    dirty: 'Données modifiées. Réévaluez avant d’exporter.',
    busy: 'Vérification des octets et recalcul du registre…',
    verified:
      'Vérification des artefacts réussie. Origine fournie non vérifiée.',
    evaluated: 'Dossier évalué. Origine fournie non vérifiée.',
    error: 'Échec de la vérification : ',
    saved: ' Dernière session vérifiée enregistrée sur cet appareil.',
    unsaved: ' Stockage indisponible; exportez un lot de récupération.',
    forgot: 'Session enregistrée effacée.',
    missing: 'Aucune session enregistrée sur cet appareil.',
    ready: 'prêt pour revue humaine',
    held: 'En attente de revue',
    met: 'Critère satisfait',
    unmet: 'Critère non satisfait',
    none: 'Aucune preuve',
    blocked: 'Bloqué par',
    claim: 'Affirmation rapportée',
    observed: 'Valeur rapportée',
    unknown: 'non fournie',
    criterion: 'Critère',
    source: 'SHA-256 de la source',
    count: 'initiatives prêtes pour revue humaine',
    notApproval:
      'La préparation n’est pas une approbation. Authenticité, impact réel et approbation humaine indépendante : non vérifiés.',
  },
};
let lang =
    new URL(location.href).searchParams.get('lang') === 'fr' ? 'fr' : 'en',
  revision = 0,
  result = null,
  status = 'idle',
  detail = '',
  storageNote = '',
  packetRaw = null;
const node = (tag, text, cls) => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
function frenchError(message) {
  if (!message) return '';
  const labels = {
    Packet: 'Dossier',
    Evidence: 'Preuve',
    Observation: 'Observation',
    Initiative: 'Initiative',
    Criterion: 'Critère',
    Receipt: 'Reçu',
    Bundle: 'Lot',
    'Bundle files': 'Fichiers du lot',
    Title: 'Titre',
    'Evidence label': 'Libellé de preuve',
    'Evidence source': 'Source de preuve',
    Metric: 'Mesure',
    Unit: 'Unité',
    'Initiative title': 'Titre de l’initiative',
    'Reported claim': 'Affirmation rapportée',
  };
  for (const [suffix, translation] of [
    [' has missing or unknown fields', ' : champs absents ou inconnus'],
    [
      ' must be nonempty bounded Unicode text',
      ' : texte Unicode non vide dans la limite autorisée requis',
    ],
  ]) {
    if (message.endsWith(suffix)) {
      const label = message.slice(0, -suffix.length);
      return (labels[label] || 'Champ') + translation;
    }
  }
  if (message.startsWith('Duplicate JSON field: '))
    return 'Champ JSON répété : ' + message.slice(22);
  const translations = {
    'UTF-8 JSON byte limit exceeded': 'Limite d’octets JSON UTF-8 dépassée',
    'Unterminated JSON string': 'Chaîne JSON non terminée',
    'JSON nesting limit': 'Limite d’imbrication JSON dépassée',
    'Expected field': 'Nom de champ attendu',
    'Expected colon': 'Deux-points attendu',
    'Expected comma': 'Virgule attendue',
    'Invalid JSON value': 'Valeur JSON invalide',
    'Unexpected JSON content': 'Contenu JSON inattendu',
    'Invalid identifier':
      'Identifiant invalide : 1 à 40 lettres minuscules, chiffres ou traits d’union',
    'Values and thresholds must be lexical integers from 0 to 1000000000':
      'Les valeurs et seuils doivent être écrits comme des entiers de 0 à 1 000 000 000',
    'Unsupported packet schema': 'Schéma de dossier non pris en charge',
    'Supply 1–30 initiatives': 'Fournissez 1 à 30 initiatives',
    'Supply at most 30 evidence records': 'Fournissez au plus 30 preuves',
    'Duplicate evidence identifier': 'Identifiant de preuve répété',
    'Evidence byte hash mismatch or source exceeds 16 KiB':
      'Empreinte des octets incorrecte ou source dépassant 16 Kio',
    'Duplicate initiative identifier': 'Identifiant d’initiative répété',
    'Dependencies must be unique identifiers':
      'Les dépendances doivent être des identifiants uniques',
    'Criterion operator must be gte or lte':
      'L’opérateur du critère doit être gte ou lte',
    'Unknown evidence identifier': 'Identifiant de preuve inconnu',
    'Unknown initiative dependency': 'Dépendance d’initiative inconnue',
    'Cyclic dependencies detected': 'Cycle de dépendances détecté',
    'Evidence metric/unit must match its criterion exactly':
      'La mesure et l’unité de la preuve doivent correspondre exactement au critère',
    'Artifact exceeds 256 KiB': 'L’artefact dépasse 256 Kio',
    'Artifact content/hash differs from recomputed supplied-input result':
      'Le contenu ou l’empreinte de l’artefact diffère du résultat recalculé',
    'Bundle exceeds byte limit': 'Le lot dépasse la limite d’octets',
    'Unsupported bundle schema': 'Schéma de lot non pris en charge',
    'Invalid base64 artifact': 'Artefact base64 invalide',
    'No file selected': 'Aucun fichier sélectionné',
    'File exceeds byte limit': 'Le fichier dépasse la limite d’octets',
    'CLI artifact unavailable': 'Artefact CLI indisponible',
    'No saved session on this device.':
      'Aucune session enregistrée sur cet appareil.',
  };
  if (translations[message]) return translations[message];
  if (message === messages.fr.missing) return message;
  if (/encod|decod|UTF-8/i.test(message)) return 'Encodage UTF-8 invalide';
  if (/JSON|position|token|character/i.test(message))
    return 'Syntaxe JSON invalide : vérifiez les guillemets, les séparateurs et les caractères';
  if (/storage|quota|denied|access/i.test(message))
    return 'Le stockage du navigateur est indisponible';
  return 'Lecture impossible. Vérifiez le fichier fourni et réessayez.';
}
function render() {
  const t = messages[lang];
  document.documentElement.lang = lang;
  document.title =
    lang === 'fr'
      ? 'Registre de preuves des initiatives · AGI Jobs'
      : 'Initiative Evidence Ledger · AGI Jobs';
  document
    .querySelectorAll('[data-t]')
    .forEach((e) => (e.textContent = (lang === 'fr' ? fr : en)[e.dataset.t]));
  $('language').textContent = lang === 'fr' ? 'English' : 'Français';
  $('language').lang = lang === 'fr' ? 'en' : 'fr';
  $('status').textContent =
    t[status] +
    (lang === 'fr' ? frenchError(detail) : detail) +
    (storageNote ? t[storageNote] : '');
  $('status').className = status === 'error' ? 'error' : '';
  $('summary').replaceChildren();
  $('ledger').replaceChildren();
  for (const id of ['export-bundle', 'export-packet', 'export-report'])
    $(id).disabled = !result;
  if (!result) return;
  const l = result.ledger;
  $('summary').append(
    node('p', l.title),
    node('span', `${l.readyCount} / ${l.initiativeCount}`, 'summary-number'),
    node('p', t.count),
    node('p', t.notApproval, 'quiet')
  );
  for (const i of l.entries) {
    const li = node('li', '');
    li.append(
      node('h3', i.title),
      node(
        'span',
        i.readyForHumanReview ? t.ready : t.held,
        'badge ' + (i.readyForHumanReview ? '' : 'held')
      ),
      node('p', `${t.claim}: ${i.reportedClaim}`, 'claim'),
      node(
        'p',
        `${t.criterion}: ${i.criterion.metric} ${
          i.criterion.operator === 'gte' ? '≥' : '≤'
        } ${i.criterion.threshold} ${i.criterion.unit}`
      ),
      node(
        'p',
        `${t.observed}: ${i.reportedValue ?? t.unknown} · ${
          t[
            i.criterionOutcome === 'criterion-met'
              ? 'met'
              : i.criterionOutcome === 'criterion-unmet'
              ? 'unmet'
              : 'none'
          ]
        }`
      )
    );
    if (i.blockedBy.length)
      li.append(node('p', `${t.blocked}: ${i.blockedBy.join(', ')}`, 'held'));
    if (i.sourceSha256)
      li.append(node('p', `${t.source}: ${i.sourceSha256}`, 'hash'));
    $('ledger').append(li);
  }
}
function invalidate() {
  revision++;
  result = null;
  status = 'dirty';
  detail = '';
  storageNote = '';
  render();
  return revision;
}
async function run(operation) {
  const token = invalidate();
  status = 'busy';
  render();
  try {
    const next = await operation();
    if (token !== revision) return;
    result = next;
    packetRaw = next.files['packet.json'];
    $('packet').value = decode(packetRaw);
    status = next.accepted ? 'verified' : 'evaluated';
    try {
      localStorage.setItem(key, decode(pack(next.files)));
      storageNote = 'saved';
    } catch {
      storageNote = 'unsaved';
    }
    render();
  } catch (e) {
    if (token !== revision) return;
    status = 'error';
    detail = e.message;
    render();
  }
}
async function readFile(file, max) {
  if (!file) throw Error('No file selected');
  if (file.size > max) throw Error('File exceeds byte limit');
  return new Uint8Array(await file.arrayBuffer());
}
$('packet').addEventListener('input', () => {
  packetRaw = null;
  invalidate();
});
$('evaluate').onclick = () => {
  const raw = packetRaw ?? bytes($('packet').value);
  run(() => artifacts(raw));
};
$('example').onclick = () =>
  run(async () =>
    artifacts(
      new Uint8Array(
        await (await fetch('./cli-example/packet.json')).arrayBuffer()
      )
    )
  );
$('cli').onclick = () =>
  run(async () => {
    const files = {};
    await Promise.all(
      ['packet.json', 'ledger.json', 'report.md', 'receipt.json'].map(
        async (n) => {
          const r = await fetch('./cli-example/' + n);
          if (!r.ok) throw Error('CLI artifact unavailable');
          files[n] = new Uint8Array(await r.arrayBuffer());
        }
      )
    );
    return review(files);
  });
$('import-packet').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) run(async () => artifacts(await readFile(file, MAX_BYTES)));
};
$('import-bundle').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file)
    run(async () => review(unpack(await readFile(file, BUNDLE_MAX_BYTES))));
};
$('restore').onclick = () =>
  run(async () => {
    const saved = localStorage.getItem(key);
    if (!saved) throw Error(messages[lang].missing);
    return review(unpack(bytes(saved)));
  });
$('forget').onclick = () => {
  invalidate();
  try {
    localStorage.removeItem(key);
    status = 'forgot';
  } catch (e) {
    status = 'error';
    detail = e.message;
  }
  render();
};
function download(raw, name) {
  const url = URL.createObjectURL(
    new Blob([raw], { type: 'application/octet-stream' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export-bundle').onclick = () => {
  if (result) download(pack(result.files), 'initiative-evidence-bundle.json');
};
$('export-packet').onclick = () => {
  if (result) download(result.files['packet.json'], 'packet.json');
};
$('export-report').onclick = () => {
  if (result) download(result.files['report.md'], 'report.md');
};
$('language').onclick = () => {
  lang = lang === 'en' ? 'fr' : 'en';
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
  render();
};
render();
