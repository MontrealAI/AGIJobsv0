export const fr = {
  skip: 'Aller aux preuves',
  directory: 'Répertoire des démos',
  eyebrow: 'ICONIC / BUREAU DES PREUVES FOURNISSEUR',
  heading: 'Un bon livrable. Des preuves claires.',
  lead: 'Vérifiez la comparaison fournisseur indépendamment. Examinez ensuite les champs déclarés d’usage, de budget et de nettoyage encore manquants.',
  notice:
    'Examen hors ligne de preuves fournies. Cette page ne pilote aucun ordinateur, n’appelle aucun fournisseur IA, ne commande rien et n’atteste aucune exécution. Les coûts déclarés ne sont pas des factures vérifiées.',
  packet: 'Dossier déclaré',
  reset: 'Restaurer l’exemple',
  unknown:
    'Laissez l’usage ou le coût vide pour conserver « inconnu ». Zéro est un zéro déclaré, pas une donnée absente. Coûts en micro-USD entiers : 1 000 000 = 1 USD.',
  execution: 'Conditions d’exécution déclarées',
  import: 'Rouvrir JSON · dossier : 1 Mo; enveloppe de preuves : 2 Mo',
  privacy:
    'Les entrées restent dans cet onglet, sans sauvegarde automatique. Les résultats et empreintes importés sont ignorés ; le dossier est vérifié à nouveau.',
  run: 'Vérifier les livrables et examiner les déclarations',
  result: 'Deux questions distinctes',
  artifactQuestion: 'Les livrables respectent-ils les critères du cas ?',
  packetQuestion: 'Les champs déclarés sont-ils complets selon la politique ?',
  notAttested:
    'Même si les deux réussissent, executionAttested, costAttested, admitted, productionApproved et settlementApproved restent faux.',
  artifactChecks: '11 vérifications des livrables',
  packetChecks: 'Contrôles des champs déclarés',
  unresolved: 'Contrôles non résolus',
  inspect: 'Examiner les devis sources et livrables fournis',
  fixtureNote:
    'Cas fournisseur synthétique : 40 unités chacun. Livraison admissible en 7 jours maximum. Les totaux incluent le transport ; aucun achat n’est effectué.',
  download: 'Télécharger le dossier',
  evidence: 'Télécharger les preuves vérifiées',
  raw: 'Examiner le résultat JSON complet',
  method: 'Ce que cet examen établit',
  scope:
    'Le dossier initial contient des livrables d’un laboratoire de navigateur scripté. Les empreintes et calculs peuvent être vérifiés ici. L’usage des jetons et le coût n’ont pas été mesurés et restent inconnus. Compléter les déclarations n’atteste pas indépendamment l’exécution, le nettoyage, l’usage fournisseur ou le coût.',
  tamper:
    'Pour examiner un autre dossier, modifiez le JSON exporté et rouvrez-le. Les livrables sont affichés comme texte, jamais exécutés. Modifier un livrable sans son empreinte correspondante fait échouer le contrôle d’intégrité.',
  source: 'Démo originale, provenance du laboratoire et revue Python locale',
  footer:
    'ICONIC · Examen borné des preuves · Aucun pouvoir d’exécution ou de règlement',
};
export const names = {
  inputTokens: ['Reported input tokens', 'Jetons d’entrée déclarés'],
  outputTokens: ['Reported output tokens', 'Jetons de sortie déclarés'],
  reportedCostMicrousd: [
    'Reported cost · micro-USD',
    'Coût déclaré · micro-USD',
  ],
  maximumCalls: ['Maximum provider calls', 'Maximum d’appels fournisseur'],
  maximumInputTokens: ['Maximum input tokens', 'Maximum de jetons d’entrée'],
  maximumOutputTokens: ['Maximum output tokens', 'Maximum de jetons de sortie'],
  maximumCostMicrousd: ['Maximum cost · micro-USD', 'Coût maximum · micro-USD'],
  providerCalls: ['Reported provider calls', 'Appels fournisseur déclarés'],
  externalFetches: ['Reported external fetches', 'Requêtes externes déclarées'],
  browserObserved: [
    'Browser observation reported',
    'Observation du navigateur déclarée',
  ],
  workerTerminated: [
    'Worker termination reported',
    'Arrêt du processus déclaré',
  ],
  productionApproved: [
    'Packet claims production approval',
    'Le dossier revendique une approbation de production',
  ],
  settlementApproved: [
    'Packet claims settlement approval',
    'Le dossier revendique une approbation de règlement',
  ],
  artifactAcceptance: ['Artifact acceptance', 'Acceptation des livrables'],
  taskIdentity: ['Exact task identity', 'Identité exacte de la tâche'],
  browserObservationReported: [
    'Browser observation reported',
    'Observation du navigateur déclarée',
  ],
  cleanupReported: ['Cleanup reported', 'Nettoyage déclaré'],
  zeroExternalFetchesReported: [
    'Zero external fetches reported',
    'Zéro requête externe déclaré',
  ],
  callsWithinPolicy: ['Calls within policy', 'Appels conformes à la politique'],
  usageKnown: ['Usage and cost known', 'Usage et coût connus'],
  inputWithinPolicy: [
    'Input tokens within policy',
    'Jetons d’entrée conformes',
  ],
  outputWithinPolicy: [
    'Output tokens within policy',
    'Jetons de sortie conformes',
  ],
  reportedCostWithinPolicy: [
    'Reported cost within policy',
    'Coût déclaré conforme',
  ],
  authorityClaimsAbsent: [
    'No authority claims',
    'Aucune revendication d’autorité',
  ],
};
export const artifactNames = {
  'Exactly two unique deliverables': 'Exactement deux livrables uniques',
  'Integrity: comparison.json': 'Intégrité : comparison.json',
  'Integrity: recommendation.md': 'Intégrité : recommendation.md',
  'Delivery limit is 7 days': 'Limite de livraison de 7 jours',
  'All quotes appear once': 'Chaque devis apparaît une fois',
  'Boreal: total and eligibility': 'Boreal : total et admissibilité',
  'Laurentian: total and eligibility': 'Laurentian : total et admissibilité',
  'Stellar: total and eligibility': 'Stellar : total et admissibilité',
  'Lowest eligible total wins': 'Le total admissible le plus bas gagne',
  'No purchase claimed': 'Aucun achat revendiqué',
  'Brief names the recommendation and no-purchase boundary':
    'La note précise la recommandation et l’absence d’achat',
};
export const words = {
  en: {
    pass: 'Pass',
    fail: 'Needs attention',
    complete: 'Reported fields complete',
    incomplete: 'Incomplete',
    none: 'None under this reported policy',
    ready: 'Ready to inspect. Unknown usage stays unknown.',
    stale: 'Inputs changed. Recompute before using results.',
    working: 'Checking artifact hashes and policy…',
    hash: 'SHA-256 of downloaded packet bytes',
    error: 'Invalid packet or verification unavailable.',
    loaded: 'Packet reopened and independently recomputed.',
    loading: 'Reading packet…',
    mode: 'Reported execution mode',
  },
  fr: {
    pass: 'Réussite',
    fail: 'À examiner',
    complete: 'Champs déclarés complets',
    incomplete: 'Incomplet',
    none: 'Aucun selon cette politique déclarée',
    ready: 'Prêt à examiner. L’usage inconnu reste inconnu.',
    stale: 'Entrées modifiées. Recalculez avant d’utiliser les résultats.',
    working: 'Vérification des empreintes et de la politique…',
    hash: 'SHA-256 des octets du dossier téléchargé',
    error: 'Dossier invalide ou vérification indisponible.',
    loaded: 'Dossier rouvert et recalculé indépendamment.',
    loading: 'Lecture du dossier…',
    mode: 'Mode d’exécution déclaré',
  },
};
