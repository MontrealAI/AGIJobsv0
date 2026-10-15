export const fr = {
  skip: 'Aller aux preuves',
  directory: 'Répertoire des démos',
  eyebrow: 'POLARIS / QUORUM ET REPRISE',
  heading: 'Conserver la politique. Examiner les preuves.',
  lead: 'Suivez un quorum de révélation manqué et un comité de remplacement dans de vrais reçus de chaîne jetable. Explorez séparément des hypothèses alternatives.',
  notice:
    'Revue hors ligne de cohérence d’un cas EVM local. Ce navigateur ne déploie aucun contrat, ne connecte aucun portefeuille et n’atteste aucune chaîne. Jetons, registre de missions et identité sont simulés.',
  receiptTitle: '1. Examiner les reçus enregistrés',
  reset: 'Restaurer le cas fourni',
  receiptNote:
    'Le cas fourni contient deux missions simulées distinctes sur une EVM jetable locale. La mission 1 est finalisée ; la mission 2 utilise un nouveau comité, sans rouvrir la première. Les reçus importés sont des données fournies ; réussir les contrôles de cohérence n’authentifie pas leur origine.',
  import: 'Rouvrir un cas ou des preuves vérifiées · JSON, 256 Kio maximum',
  first: 'Résultat initial enregistré',
  replacement: 'Résultat de remplacement enregistré',
  claims:
    'Ces résultats enregistrés sont confrontés aux journaux canoniques des reçus. Si un contrôle de cohérence échoue, les résultats revendiqués restent non vérifiés.',
  checks: 'Contrôles de cohérence recalculés',
  contracts: 'Contrats du cas et composants simulés',
  policy: 'Politique avant / après',
  receipts: 'Examiner reçus canoniques, journaux et observations des mises',
  download: 'Télécharger le cas',
  evidence: 'Télécharger la revue recalculée',
  raw: 'Examiner le JSON complet de la revue',
  calculatorTitle: '2. Explorer une alternative hypothétique',
  calculatorNotice:
    'Ce calculateur ne réexécute pas l’EVM et ne modifie pas les reçus ci-dessus. Il prédit uniquement les règles fixes de quorum et d’approbation du cas.',
  reveals: 'Révélations du premier comité · 0 à 3',
  approvals: 'Approbations du remplacement · 0 à 3',
  calculate: 'Calculer les résultats attendus',
  calculatorScope:
    'Les trois validateurs de remplacement révèlent. Au moins deux approbations satisfont le seuil de 66 %. Chaque absent du premier tour perd 1 % de sa mise simulée. Les votes révélés du premier comité sont supposés favorables.',
  method: 'Reproduire l’exécution locale réelle',
  methodText:
    'Utilisez la commande Hardhat protégée originale pour de nouveaux reçus. Elle exige une chaîne fraîche, sans fork, dans le processus, ID 31337. Les contrats originaux de validation et de mise sont exercés avec des dépendances simulées explicites. Ce cas ne confère aucun pouvoir mainnet ou travail rémunéré.',
  privacy:
    'Les fichiers restent dans cet onglet, sans sauvegarde automatique. Rouvrir des preuves ignore la revue enregistrée et recalcule à partir du cas fourni.',
  source: 'Environnement original, vérificateur, cas et guide local',
  footer:
    'POLARIS · Cohérence des reçus, sans attestation de chaîne · Aucun pouvoir de règlement',
};
export const names = {
  'Two disjoint committees cover exactly six funded validators':
    'Deux comités distincts regroupent exactement six validateurs avec mises',
  'Disposable fixture boundary': 'Limite du cas jetable',
  'Quorum policy retained': 'Politique de quorum conservée',
  'Mocks clearly identified': 'Composants simulés identifiés',
  'Quorum failure records reveal deficit':
    'L’échec du quorum enregistre le déficit',
  'Each missing revealer receives one ban':
    'Chaque absent reçoit une exclusion',
  'Six unique funded fixture validators':
    'Six validateurs uniques avec mises simulées',
  'Observed stakes and bans match receipts':
    'Mises et exclusions correspondent aux reçus',
  'Employer receives exact mock penalties':
    'L’employeur reçoit les pénalités simulées exactes',
  'Replacement uses three fresh funded validators':
    'Le remplacement utilise trois nouveaux validateurs financés',
  'Replacement reveals meet unchanged quorum':
    'Le remplacement atteint le quorum inchangé',
};
export const words = {
  en: {
    loading: 'Reading and recomputing fixture…',
    pass: 'Consistency checks pass',
    fail: 'Consistency checks failed',
    success: 'Success',
    failed: 'Failed',
    unverified: 'Unverified claim',
    mock: 'Mock dependency',
    original: 'Original contract implementation',
    hash: 'SHA-256 of downloaded fixture bytes',
    error: 'Invalid fixture or review unavailable.',
    ready: 'Fixture reopened and review recomputed.',
    prediction: 'Hypothetical only',
    first: 'First',
    replacement: 'Replacement',
    missing: 'Missing revealers',
    checking: 'Checking…',
  },
  fr: {
    loading: 'Lecture et recalcul du cas…',
    pass: 'Contrôles de cohérence réussis',
    fail: 'Échec des contrôles de cohérence',
    success: 'Réussite',
    failed: 'Échec',
    unverified: 'Déclaration non vérifiée',
    mock: 'Dépendance simulée',
    original: 'Implémentation originale du contrat',
    hash: 'SHA-256 des octets du cas téléchargé',
    error: 'Cas invalide ou revue indisponible.',
    ready: 'Cas rouvert et revue recalculée.',
    prediction: 'Hypothèse uniquement',
    first: 'Initial',
    replacement: 'Remplacement',
    missing: 'Révélations manquantes',
    checking: 'Vérification…',
  },
};
export function checkName(name, lang) {
  if (lang !== 'fr') return name;
  if (names[name]) return names[name];
  return name
    .replace(/^first:/, 'Initial :')
    .replace(/^recovery:/, 'Remplacement :')
    .replace(
      'receipt tally binds participation and approvals',
      'le décompte du reçu confirme participation et approbations'
    )
    .replace('successful receipt', 'reçu réussi')
    .replace('log provenance', 'provenance des journaux')
    .replace(
      'event binds observed outcome',
      'événement lié au résultat observé'
    )
    .replace(
      'unchanged policy decides outcome',
      'la politique inchangée détermine le résultat'
    )
    .replace(
      'weighted tally matches declared votes',
      'le décompte pondéré correspond aux votes déclarés'
    );
}
