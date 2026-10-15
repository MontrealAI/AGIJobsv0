export const fr = {
  skip: 'Aller aux points de reprise',
  directory: 'Répertoire des démos',
  heading: 'Suspendre. Rouvrir. Recalculer le travail.',
  lead: 'Examinez cinq étapes déterministes réelles. Rouvrez un point de reprise, vérifiez ses sources et sa chaîne d’empreintes, puis continuez après revue indépendante des livrables.',
  notice:
    'Devis fournisseurs synthétiques et code local uniquement. Aucun fournisseur IA, session de contrôle informatique, achat ou règlement. Le rejeu navigateur n’atteste ni persistance disque ni exécution physique.',
  controls: '1. Examiner ou générer un rejeu',
  reset: 'Examiner l’exécution locale fournie',
  start: 'Démarrer dans le navigateur',
  startError: 'Démarrer avec une recommandation erronée',
  startHint:
    'Le travail commence par la validation des devis fixes. Avancez étape par étape, exportez, puis rouvrez pour recalculer les données conservées. Sans export, les changements disparaissent.',
  import: 'Rouvrir point de reprise ou preuves · JSON UTF-8, 256 Kio maximum',
  results: '2. Examiner les étapes recalculées',
  advance: 'Calculer l’étape suivante',
  artifacts: 'Contenu des livrables',
  checks: 'Contrôles indépendants des livrables',
  bounds:
    'La cohérence des sources et données n’authentifie pas l’auteur d’une exécution. Les verdicts importés sont ignorés. Les indicateurs du reçu original décrivent le cas déterministe ; cette page ajoute le contexte de rejeu navigateur sans revendiquer de contrôle informatique.',
  download: 'Télécharger le point de reprise',
  evidence: 'Télécharger la revue recalculée',
  raw: 'Examiner le rejeu et la revue complets',
  pins: 'Examiner les empreintes des sources de cette version',
  method: 'Exécuter le pipeline local original',
  methodText:
    'La commande Node écrit des étapes immuables et recalcule les enregistrements conservés après interruption du processus. Cette preuve ne garantit pas la durabilité après panne électrique. Le navigateur intègre le moteur original exact et le vérificateur One-Box avec un adaptateur SHA-256 borné.',
  privacy:
    'Les fichiers restent dans cet onglet. Aucun point de reprise disque automatique. Téléchargez avant de fermer, puis rouvrez avec la même version des sources.',
  source: 'Environnement original, guide de reprise et tests',
  footer:
    'OMEGA · Points de reprise recalculés · Aucun pouvoir de production ni règlement',
};
export const words = {
  en: {
    supplied:
      'Supplied checkpoint data. Recomputing consistency does not authenticate its execution origin.',
    complete: 'All five stages recompute successfully.',
    rejected:
      'Independent review rejected the work. Export is available for inspection; advancement is blocked.',
    paused: 'Verified retained stages',
    none: 'Not produced yet',
    hash: 'SHA-256 of downloaded replay bytes',
    loading: 'Recomputing source-bound replay…',
    ready: 'Replay recomputed.',
    error: 'Cannot verify this replay.',
    validate: 'Validate fixed quotes',
    compare: 'Compare eligible totals',
    write: 'Write two deliverables',
    review: 'Independently review artifacts',
    export: 'Export checked receipt',
    browser:
      'Browser-local deterministic replay; no persistent storage attestation.',
    bundled:
      'Bundled local checkpoint evidence; supplied data consistency only.',
  },
  fr: {
    supplied:
      'Données de reprise fournies. Recalculer leur cohérence n’authentifie pas l’origine de l’exécution.',
    complete: 'Les cinq étapes sont recalculées avec succès.',
    rejected:
      'La revue indépendante rejette le travail. Export disponible pour examen ; progression bloquée.',
    paused: 'Étapes conservées vérifiées',
    none: 'Pas encore produit',
    hash: 'SHA-256 des octets du rejeu téléchargé',
    loading: 'Recalcul du rejeu lié aux sources…',
    ready: 'Rejeu recalculé.',
    error: 'Impossible de vérifier ce rejeu.',
    validate: 'Valider les devis fixes',
    compare: 'Comparer les totaux admissibles',
    write: 'Rédiger deux livrables',
    review: 'Vérifier indépendamment les livrables',
    export: 'Exporter le reçu contrôlé',
    browser:
      'Rejeu déterministe dans le navigateur ; aucune attestation de stockage persistant.',
    bundled:
      'Points de reprise locaux fournis ; cohérence des données uniquement.',
  },
};
export function checkName(name, lang) {
  if (lang !== 'fr') return name;
  const names = {
    'Exactly two unique deliverables': 'Exactement deux livrables uniques',
    'Delivery limit is 7 days': 'Délai maximal de sept jours',
    'All quotes appear once': 'Chaque devis apparaît une fois',
    'Lowest eligible total wins':
      'Le total admissible le plus faible est retenu',
    'No purchase claimed': 'Aucun achat revendiqué',
    'Brief names the recommendation and no-purchase boundary':
      'Le texte nomme la recommandation et précise l’absence d’achat',
  };
  return (
    names[name] ??
    name
      .replace('Integrity:', 'Intégrité :')
      .replace(': total and eligibility', ': total et admissibilité')
  );
}
