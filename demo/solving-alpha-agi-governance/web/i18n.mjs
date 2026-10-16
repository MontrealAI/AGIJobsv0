// SPDX-License-Identifier: MIT
export let language = 'en';
export const word = (en, fr) => (language === 'fr' ? fr : en);
const translations = {
  'Skip to rehearsal': 'Aller à la simulation',
  'AGI JOBS · DEMO OBSERVATORY': 'AGI JOBS · OBSERVATOIRE DES DÉMOS',
  'LOCAL SIMULATION': 'SIMULATION LOCALE',
  'GOVERNANCE / BEFORE A DECISION BECOMES ACTION':
    'GOUVERNANCE / AVANT QUE LA DÉCISION DEVIENNE ACTION',
  'Rehearse the vote.': 'Simulez le vote.',
  'Understand the boundary.': 'Comprenez les limites.',
  'Test a maintenance-budget proposal against quorum, approval, available funds and owner controls. See exactly why it passes or stops.':
    'Testez une proposition de budget de maintenance selon le quorum, l’approbation, les fonds disponibles et les contrôles du propriétaire. Voyez pourquoi elle passe ou s’arrête.',
  'This is an offline decision model. Votes are supplied examples, funds are hypothetical and no contract is called. A passing rehearsal neither enacts the proposal nor authorizes settlement.':
    'Modèle de décision hors ligne : les votes sont des exemples, les fonds sont hypothétiques et aucun contrat n’est appelé. Une simulation réussie n’exécute pas la proposition et n’autorise aucun règlement.',
  'Your proposal': 'Votre proposition',
  'Reset example': 'Réinitialiser l’exemple',
  'Proposal title': 'Titre de la proposition',
  'Requested amount (cents)': 'Montant demandé (centimes)',
  'Available budget (cents)': 'Budget disponible (centimes)',
  'One consistent hypothetical currency. Integer cents avoid rounding ambiguity.':
    'Une seule monnaie hypothétique. Les centimes entiers évitent les ambiguïtés d’arrondi.',
  'Decision policy': 'Politique de décision',
  'Total eligible vote weight': 'Poids total des votes admissibles',
  'Quorum (%)': 'Quorum (%)',
  'Approval threshold (%)': 'Seuil d’approbation (%)',
  'Quorum uses cast / eligible weight. Approval uses approved / all cast weight, including abstentions.':
    'Le quorum compare les votes exprimés aux votes admissibles. L’approbation inclut les abstentions dans le dénominateur.',
  'Owner controls present': 'Contrôles du propriétaire présents',
  Pause: 'Pause',
  'Budget limit': 'Limite de budget',
  Review: 'Révision',
  'All three controls are required by this example policy. Their checkboxes describe assumptions, not deployed controls.':
    'Les trois contrôles sont requis par cette politique. Les cases décrivent des hypothèses, pas des contrôles déployés.',
  'The listed required controls describe assumptions, not deployed controls.':
    'Les contrôles requis décrivent des hypothèses, pas des contrôles déployés.',
  'Supplied votes': 'Votes fournis',
  'Reopen scenario or evidence JSON (maximum 1 MB)':
    'Rouvrir un scénario ou des preuves JSON (maximum 1 Mo)',
  'Evaluate proposal →': 'Évaluer la proposition →',
  'READY WHEN YOU ARE': 'PRÊT POUR VOTRE ÉVALUATION',
  'Four gates.': 'Quatre critères.',
  'No hidden approval.': 'Aucune approbation cachée.',
  'Run the example, then raise the quorum, reduce the budget or remove pause control. Every result is computed from the inputs shown.':
    'Lancez l’exemple, puis augmentez le quorum, réduisez le budget ou retirez la pause. Chaque résultat est calculé à partir des données affichées.',
  'REHEARSAL RESULT': 'RÉSULTAT DE LA SIMULATION',
  'Download scenario': 'Télécharger le scénario',
  'Download evidence': 'Télécharger les preuves',
  'Inspect the full evidence': 'Examiner les preuves complètes',
  'Take it to the local engine.': 'Vérifiez avec le moteur local.',
  'Download the exact scenario and rerun it with the independent Python implementation. Compare each gate, totals and the SHA-256 of the scenario bytes.':
    'Téléchargez le scénario exact et relancez-le avec l’implémentation Python indépendante. Comparez chaque critère, les totaux et le SHA-256 du fichier.',
  'Exit code 0 means the rehearsal passes; 1 means a policy gate rejects it; 2 means invalid input. No proposal is enacted in any case.':
    'Le code de sortie 0 indique une simulation réussie; 1, un rejet par la politique; 2, des données invalides. Aucune proposition n’est exécutée.',
  'Changing any input clears the old result and disables export until you evaluate again.':
    'Toute modification efface l’ancien résultat et bloque l’exportation jusqu’à une nouvelle évaluation.',
  'AGI Jobs · Useful experiments, inspectable evidence. No wallet or provider required.':
    'AGI Jobs · Expériences utiles et preuves vérifiables. Aucun portefeuille ni fournisseur requis.',
};
const nodes = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
  const node = walker.currentNode;
  if (node.parentElement.closest('script,style,pre')) continue;
  const compact = node.textContent.trim().replace(/\s+/g, ' ');
  if (translations[compact])
    nodes.push([node, node.textContent, translations[compact]]);
}
export function toggle() {
  language = language === 'en' ? 'fr' : 'en';
  document.documentElement.lang = language;
  for (const [node, en, fr] of nodes)
    node.textContent = language === 'fr' ? fr : en;
  const button = document.getElementById('language');
  button.textContent = language === 'fr' ? 'EN' : 'FR';
  button.lang = language === 'fr' ? 'en' : 'fr';
  button.setAttribute(
    'aria-label',
    language === 'fr' ? 'Switch to English' : 'Passer en français'
  );
}
