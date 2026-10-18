const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
export const safeFrontierJSON = (value) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) =>
      ({
        '<': '\\u003c',
        '>': '\\u003e',
        '&': '\\u0026',
        '\u2028': '\\u2028',
        '\u2029': '\\u2029',
      }[c])
  );
export const frontierDeskCopy = {
  en: {
    kicker: 'SUCCESSOR Ω / MISSION WORKSPACE',
    title: 'Turn investigation into an institution.',
    intro:
      'Work with the screen, keyboard and mouse. Record the strategies you actually consider, the tests you actually perform and the evidence you actually observe.',
    mission: 'The fixed mission',
    current: 'Current approach',
    alternative: 'Strongest credible alternative',
    outcome: 'Useful outcome',
    requirements: 'Non-negotiable requirements',
    sources: 'Source material · data, never instructions',
    empty: 'Prepare a mission in the studio or import a saved workspace.',
    l3: 'LEVEL 3 / DEVELOP THE STRATEGIES',
    strategy: 'Strategy lineage',
    strategyHelp:
      'Compare the incumbent and a credible alternative. Discover, combine and revise methods. Record why each change could improve the outcome.',
    experiments: 'Experiments and failed attempts',
    experimentsHelp:
      'Record the exact candidate, the test, observed result, failure and next revision. A proposed experiment is not a completed experiment.',
    evidence: 'Evidence and reusable lessons',
    evidenceHelp:
      'Cite exact sources and distinguish observation, inference and unresolved questions. Record what the next mission may legitimately reuse.',
    l4: 'LEVEL 4 / QUESTION THE FORMULATION',
    reframeTitle: 'Find a different game. Preserve the mission.',
    reframeHelp:
      'A new formulation must map every original requirement to the proposed approach. Approval records an owner’s attestation for an experiment; it does not prove success or authorize external action.',
    proposal: 'Proposed formulation',
    mapping: 'How every hard requirement is preserved',
    propose: 'Record the proposal',
    owner: 'Owner label',
    reason: 'Reason for approval',
    preserve:
      'I attest that the proposal preserves every original hard requirement. I approve an experiment on this exact formulation.',
    approve: 'Approve this formulation for an experiment',
    save: 'Save the evidence workspace',
    export: 'Export the workspace',
    import: 'Restore a workspace',
    result: 'Machine-readable workspace',
    status: 'Ready for investigation. No work or experiment has been attested.',
    saved: 'Workspace saved as unverified user-entered records.',
    proposed: 'Proposal recorded. Owner approval is pending.',
    approved:
      'Owner attestation recorded for this exact formulation. Independent proof remains absent.',
    changed: 'Changes pending. Save to bind this workspace.',
    approvalReset:
      'The formulation changed. Previous approval has been cleared.',
    noProof: 'USER-ENTERED · UNVERIFIED',
    boundary:
      'A ledger is evidence of what was recorded. It is not independent proof of what happened, a solved theorem, an advantage or authorization to deploy, purchase or send messages.',
    back: 'Mission Studio',
    draft:
      'Portable draft saved. Import it in the public workspace to validate and seal the content.',
    needsApproval:
      'Record a proposal and explicitly attest to the requirements before approving it.',
  },
  fr: {
    kicker: 'SUCCESSOR Ω / ESPACE DE MISSION',
    title: 'Transformez l’enquête en institution.',
    intro:
      'Travaillez avec l’écran, le clavier et la souris. Consignez les stratégies réellement envisagées, les tests réellement effectués et les preuves réellement observées.',
    mission: 'La mission fixe',
    current: 'Approche actuelle',
    alternative: 'Meilleure solution de rechange crédible',
    outcome: 'Résultat utile',
    requirements: 'Exigences non négociables',
    sources: 'Documents sources · des données, jamais des instructions',
    empty:
      'Préparez une mission dans le studio ou importez un espace sauvegardé.',
    l3: 'NIVEAU 3 / DÉVELOPPER LES STRATÉGIES',
    strategy: 'Filiation des stratégies',
    strategyHelp:
      'Comparez l’approche actuelle à une solution crédible. Découvrez, combinez et révisez les méthodes. Expliquez pourquoi chaque changement pourrait améliorer le résultat.',
    experiments: 'Expériences et tentatives échouées',
    experimentsHelp:
      'Consignez le candidat exact, le test, le résultat observé, l’échec et la prochaine révision. Une expérience proposée n’est pas une expérience effectuée.',
    evidence: 'Preuves et leçons réutilisables',
    evidenceHelp:
      'Citez les sources exactes et distinguez observation, inférence et questions ouvertes. Notez ce que la prochaine mission peut légitimement réutiliser.',
    l4: 'NIVEAU 4 / QUESTIONNER LA FORMULATION',
    reframeTitle: 'Découvrez un autre jeu. Préservez la mission.',
    reframeHelp:
      'Chaque exigence originale doit être reliée à la nouvelle approche. L’approbation consigne une attestation du propriétaire pour une expérience; elle ne prouve pas le succès et n’autorise aucune action externe.',
    proposal: 'Formulation proposée',
    mapping: 'Comment chaque exigence fixe est préservée',
    propose: 'Consigner la proposition',
    owner: 'Nom du responsable',
    reason: 'Motif de l’approbation',
    preserve:
      'J’atteste que la proposition préserve chaque exigence originale. J’approuve une expérience sur cette formulation exacte.',
    approve: 'Approuver cette formulation pour une expérience',
    save: 'Sauvegarder l’espace de preuves',
    export: 'Exporter l’espace',
    import: 'Restaurer un espace',
    result: 'Espace lisible par machine',
    status:
      'Prêt pour l’enquête. Aucun travail ni aucune expérience n’a été attesté.',
    saved: 'Espace sauvegardé comme déclarations non vérifiées.',
    proposed: 'Proposition consignée. Approbation du propriétaire en attente.',
    approved:
      'Attestation du propriétaire consignée pour cette formulation exacte. Aucune preuve indépendante.',
    changed: 'Modifications en attente. Sauvegardez pour lier cet espace.',
    approvalReset:
      'La formulation a changé. L’approbation précédente a été retirée.',
    noProof: 'DÉCLARATIONS · NON VÉRIFIÉES',
    boundary:
      'Le journal démontre ce qui a été consigné. Il ne constitue pas une preuve indépendante des faits, un théorème résolu, un avantage ni une autorisation de déployer, acheter ou envoyer des messages.',
    back: 'Studio de mission',
    draft:
      'Brouillon portable sauvegardé. Importez-le dans l’espace public pour valider et lier son contenu.',
    needsApproval:
      'Consignez une proposition et attestez explicitement du respect des exigences avant de l’approuver.',
  },
};

export function renderFrontierDeskMarkup(
  mission = null,
  { language = 'en' } = {}
) {
  const t = frontierDeskCopy[language === 'fr' ? 'fr' : 'en'];
  const field = (id, label, help, max, rows = 7) =>
    `<div class="fm-field"><label for="fd-${id}">${escapeHTML(label)}</label>${
      help
        ? `<p id="fd-${id}-help" class="fm-help">${escapeHTML(help)}</p>`
        : ''
    }<textarea id="fd-${id}" rows="${rows}" maxlength="${max}"${
      help ? ` aria-describedby="fd-${id}-help"` : ''
    }></textarea></div>`;
  return `<div data-frontier-desk data-language="${
    language === 'fr' ? 'fr' : 'en'
  }"><p class="fm-eyebrow">${escapeHTML(t.kicker)}</p><h1>${escapeHTML(
    t.title
  )}</h1><p class="fm-lead">${escapeHTML(
    t.intro
  )}</p><aside class="fm-boundary"><strong>${escapeHTML(
    t.noProof
  )}</strong><p>${escapeHTML(
    t.boundary
  )}</p></aside><section class="fm-card fd-mission" aria-labelledby="fd-mission-title"><p class="fm-eyebrow">${escapeHTML(
    t.mission
  )}</p><h2 id="fd-mission-title">${escapeHTML(
    mission?.title || t.empty
  )}</h2><p id="fd-question">${escapeHTML(
    mission?.question || ''
  )}</p><h3>${escapeHTML(t.outcome)}</h3><p id="fd-outcome">${escapeHTML(
    mission?.outcome || ''
  )}</p><div class="fm-grid-two"><div><h3>${escapeHTML(
    t.current
  )}</h3><p id="fd-current">${escapeHTML(
    mission?.currentApproach || ''
  )}</p></div><div><h3>${escapeHTML(
    t.alternative
  )}</h3><p id="fd-alternative">${escapeHTML(
    mission?.credibleAlternative || ''
  )}</p></div></div><h3>${escapeHTML(
    t.requirements
  )}</h3><ol id="fd-requirements">${(mission?.hardRequirements || [])
    .map((v) => `<li>${escapeHTML(v)}</li>`)
    .join('')}</ol><details><summary>${escapeHTML(
    t.sources
  )}</summary><div id="fd-sources"></div></details><p id="fd-mission-digest" class="fm-digest">${escapeHTML(
    mission?.digest || ''
  )}</p></section><section class="fm-section" aria-labelledby="fd-l3-title"><p class="fm-eyebrow" id="fd-l3-title">${escapeHTML(
    t.l3
  )}</p>${field('strategy', t.strategy, t.strategyHelp, 18000)}${field(
    'experiments',
    t.experiments,
    t.experimentsHelp,
    18000
  )}${field(
    'evidence',
    t.evidence,
    t.evidenceHelp,
    18000
  )}</section><section class="fm-section" aria-labelledby="fd-l4-title"><p class="fm-eyebrow">${escapeHTML(
    t.l4
  )}</p><h2 id="fd-l4-title">${escapeHTML(
    t.reframeTitle
  )}</h2><p class="fm-help">${escapeHTML(
    t.reframeHelp
  )}</p><div class="fm-card">${field(
    'proposal',
    t.proposal,
    '',
    6000,
    4
  )}${field(
    'mapping',
    t.mapping,
    '',
    6000,
    4
  )}<button type="button" class="fm-button fm-secondary" id="fd-propose">${escapeHTML(
    t.propose
  )}</button><div class="fm-grid-two fd-approval"><div class="fm-field"><label for="fd-owner">${escapeHTML(
    t.owner
  )}</label><input id="fd-owner" maxlength="100"></div><div class="fm-field"><label for="fd-reason">${escapeHTML(
    t.reason
  )}</label><textarea id="fd-reason" maxlength="1000" rows="2"></textarea></div></div><label class="fm-check"><input id="fd-preserve" type="checkbox"><span>${escapeHTML(
    t.preserve
  )}</span></label><button type="button" class="fm-button fm-secondary" id="fd-approve">${escapeHTML(
    t.approve
  )}</button><p id="fd-approval-status" class="fm-help" role="status"></p></div></section><div class="fm-actions"><button type="button" id="fd-save" class="fm-button fm-primary">${escapeHTML(
    t.save
  )}</button><button type="button" id="fd-export" class="fm-button fm-secondary">${escapeHTML(
    t.export
  )}</button><label class="fm-file" for="fd-import">${escapeHTML(
    t.import
  )}<input id="fd-import" type="file" accept=".json,application/json"></label></div><p id="fd-status" role="status" tabindex="-1" class="fm-status">${escapeHTML(
    t.status
  )}</p><details class="fm-detail"><summary>${escapeHTML(
    t.result
  )}</summary><pre tabindex="0"><code id="fd-result">{}</code></pre></details><script type="application/json" id="fd-config">${safeFrontierJSON(
    { mission, language, t }
  )}</script></div>`;
}

// This initializer is also embedded in the networkless, exported native task HTML.
// Standalone records are explicitly unsealed drafts; the public module validates and seals them.
export function initFrontierDesk(root, configuration = {}, callbacks = {}) {
  const embedded = JSON.parse(root.querySelector('#fd-config').textContent);
  const config = { ...embedded, ...configuration };
  const t = config.t || embedded.t,
    $ = (id) => root.querySelector(`#fd-${id}`);
  let mission = config.mission,
    workspace = config.workspace || null,
    editGeneration = 0,
    activeGuard = null;
  const fixedProvenance = {
    classification: 'USER_ENTERED_UNVERIFIED',
    executionStatus: 'NOT_ATTESTED',
    independentProof: false,
    productionApproved: false,
    authorityCreated: 'NONE',
  };
  const blank = () => ({
    schemaVersion: '1.0.0',
    kind: 'FrontierMissionWorkspace',
    missionDigest: mission?.digest,
    strategyLedger: '',
    experimentLedger: '',
    evidenceLedger: '',
    reframing: {
      proposal: '',
      hardRequirementMapping: '',
      status: 'NOT_PROPOSED',
      ownerApproval: null,
    },
    provenance: { ...fixedProvenance },
  });
  function status(message) {
    $('status').textContent = message;
  }
  function showResult(value) {
    $('result').textContent = JSON.stringify(value, null, 2);
  }
  function renderMission() {
    $('mission-title').textContent = mission?.title || t.empty;
    $('question').textContent = mission?.question || '';
    $('outcome').textContent = mission?.outcome || '';
    $('current').textContent = mission?.currentApproach || '';
    $('alternative').textContent = mission?.credibleAlternative || '';
    $('mission-digest').textContent = mission?.digest || '';
    $('requirements').replaceChildren(
      ...(mission?.hardRequirements || []).map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      })
    );
    $('sources').replaceChildren(
      ...(mission?.sources || []).map((source) => {
        const item = document.createElement('article'),
          link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.title;
        if (config.standalone) {
          link.target = '_self';
          link.addEventListener('click', (event) => {
            event.preventDefault();
            const viewer = root.querySelector('#fd-source-viewer');
            viewer.replaceChildren();
            const close = document.createElement('button');
            close.type = 'button';
            close.id = 'fd-source-close';
            close.textContent =
              config.language === 'fr'
                ? 'Fermer la source et revenir au journal'
                : 'Close source and return to the ledger';
            const frame = document.createElement('iframe');
            frame.id = 'fd-source-frame';
            frame.title = source.title;
            frame.setAttribute('sandbox', '');
            frame.referrerPolicy = 'no-referrer';
            frame.src = source.url;
            close.addEventListener('click', () => {
              viewer.replaceChildren();
              viewer.hidden = true;
              link.focus();
            });
            viewer.append(close, frame);
            viewer.hidden = false;
            viewer.scrollIntoView({ block: 'start' });
            close.focus();
          });
        }
        item.append(link);
        const address = document.createElement('p');
        address.textContent = source.url;
        address.style.overflowWrap = 'anywhere';
        item.append(address);
        if (source.text) {
          const excerpt = document.createElement('pre');
          excerpt.textContent = source.text;
          item.append(excerpt);
        }
        return item;
      })
    );
    for (const id of ['save', 'export', 'propose', 'approve'])
      $(id).disabled = !mission;
  }
  function assertCurrent() {
    if (
      activeGuard &&
      (activeGuard.generation !== editGeneration ||
        activeGuard.missionDigest !== mission?.digest)
    )
      throw new Error(
        'The workspace changed during this action. Review the current draft and try again.'
      );
  }
  function setWorkspace(next) {
    assertCurrent();
    workspace = next ? JSON.parse(JSON.stringify(next)) : null;
    $('strategy').value = next?.strategyLedger || '';
    $('experiments').value = next?.experimentLedger || '';
    $('evidence').value = next?.evidenceLedger || '';
    $('proposal').value = next?.reframing?.proposal || '';
    $('mapping').value = next?.reframing?.hardRequirementMapping || '';
    $('owner').value = next?.reframing?.ownerApproval?.ownerLabel || '';
    $('reason').value = next?.reframing?.ownerApproval?.reason || '';
    $('preserve').checked =
      next?.reframing?.ownerApproval?.hardRequirementsPreserved === true;
    $('approval-status').textContent =
      next?.reframing?.status || 'NOT_PROPOSED';
    if (next) showResult(next);
  }
  function collect() {
    const next = JSON.parse(JSON.stringify(workspace || blank()));
    next.strategyLedger = $('strategy').value;
    next.experimentLedger = $('experiments').value;
    next.evidenceLedger = $('evidence').value;
    const proposal = $('proposal').value,
      mapping = $('mapping').value;
    if (
      proposal !== next.reframing.proposal ||
      mapping !== next.reframing.hardRequirementMapping
    ) {
      next.reframing = {
        proposal,
        hardRequirementMapping: mapping,
        status: proposal || mapping ? 'PROPOSED' : 'NOT_PROPOSED',
        ownerApproval: null,
      };
    }
    next.provenance = { ...fixedProvenance };
    return next;
  }
  function draftEnvelope() {
    const value = collect();
    return {
      kind: 'FrontierDeskDraft',
      missionDigest: mission?.digest,
      strategyLedger: value.strategyLedger,
      experimentLedger: value.experimentLedger,
      evidenceLedger: value.evidenceLedger,
      reframing: {
        proposal: value.reframing.proposal,
        hardRequirementMapping: value.reframing.hardRequirementMapping,
      },
    };
  }
  async function act(handler, fallback) {
    if (activeGuard) return false;
    activeGuard = {
      generation: editGeneration,
      missionDigest: mission?.digest,
    };
    root.setAttribute('aria-busy', 'true');
    const controls = [...root.querySelectorAll('button,input,textarea')].map(
      (node) => [node, node.disabled]
    );
    for (const [node] of controls) node.disabled = true;
    try {
      await (handler ? handler(api) : fallback());
      return true;
    } catch (error) {
      status(error.message);
      return false;
    } finally {
      for (const [node, disabled] of controls) node.disabled = disabled;
      for (const id of ['save', 'export', 'propose', 'approve'])
        $(id).disabled = !mission;
      activeGuard = null;
      root.setAttribute('aria-busy', 'false');
    }
  }
  function clearApproval() {
    editGeneration++;
    if (!workspace) return;
    $('preserve').checked = false;
    $('approval-status').textContent = t.approvalReset;
    status(t.changed);
  }
  for (const id of ['strategy', 'experiments', 'evidence'])
    $(id).addEventListener('input', () => {
      editGeneration++;
      status(t.changed);
    });
  for (const id of ['proposal', 'mapping'])
    $(id).addEventListener('input', clearApproval);
  $('save').addEventListener('click', () =>
    act(callbacks.onSave, () => {
      workspace = collect();
      showResult(draftEnvelope());
      status(t.draft);
    })
  );
  $('propose').addEventListener('click', () =>
    act(callbacks.onPropose, () => {
      if (!$('proposal').value.trim() || !$('mapping').value.trim())
        throw new Error(t.needsApproval);
      workspace = collect();
      workspace.reframing.status = 'PROPOSED';
      workspace.reframing.ownerApproval = null;
      showResult(draftEnvelope());
      $('approval-status').textContent = 'PROPOSED';
      status(t.proposed);
    })
  );
  $('approve').addEventListener('click', () =>
    act(callbacks.onApprove, () => {
      throw new Error(
        'Owner approval must be recorded by the owner in the public workspace. The task cannot self-approve.'
      );
    })
  );
  $('export').addEventListener('click', () =>
    act(callbacks.onExport, () => {
      const blob = new Blob(
          [
            JSON.stringify(
              {
                kind: 'FrontierDeskDraftEnvelope',
                mission,
                draft: draftEnvelope(),
              },
              null,
              2
            ),
          ],
          { type: 'application/json' }
        ),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'successor-omega-workspace-draft.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status(t.draft);
    })
  );
  $('import').addEventListener('change', () =>
    act(callbacks.onImport, () => {
      throw new Error(
        'Restore this package in the public Mission Studio workspace to validate its content bindings.'
      );
    })
  );
  for (const id of ['owner', 'reason', 'preserve'])
    $(id).addEventListener('input', () => {
      editGeneration++;
      status(t.changed);
    });
  const api = {
    runAction: (handler) => act(handler, () => {}),
    assertCurrent,
    get mission() {
      return mission;
    },
    get workspace() {
      return workspace;
    },
    collect,
    setWorkspace,
    showResult,
    status,
    fields: $,
    replace(m, next) {
      assertCurrent();
      mission = m;
      if (activeGuard) activeGuard.missionDigest = m.digest;
      renderMission();
      setWorkspace(next);
    },
    draftEnvelope,
  };
  const sourceViewer = document.createElement('section');
  sourceViewer.id = 'fd-source-viewer';
  sourceViewer.hidden = true;
  sourceViewer.setAttribute(
    'aria-label',
    config.language === 'fr'
      ? 'Lecteur de source isolé'
      : 'Isolated source reader'
  );
  $('sources').after(sourceViewer);
  renderMission();
  setWorkspace(workspace);
  if (config.standalone) {
    $('approve').hidden = true;
    root.querySelector('.fd-approval').hidden = true;
    $('preserve').closest('label').hidden = true;
  }
  root.dataset.ready = 'true';
  return api;
}

export function renderFrontierDeskDocument(
  mission,
  { language = 'en', workspace = null } = {}
) {
  const title =
    language === 'fr'
      ? 'SUCCESSOR Ω · Espace de mission'
      : 'SUCCESSOR Ω · Mission workspace';
  const markup = renderFrontierDeskMarkup(mission, { language });
  const script = `(${initFrontierDesk.toString()})(document.querySelector('[data-frontier-desk]'),${safeFrontierJSON(
    { mission, workspace, standalone: true }
  )});`;
  return `<!doctype html><html lang="${
    language === 'fr' ? 'fr' : 'en'
  }"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHTML(
    title
  )}</title><style>${frontierDeskStandaloneCSS}</style></head><body><main class="fm-page fm-desk-page" id="main">${markup}</main><script>${script}</script></body></html>`;
}

export const frontierDeskStandaloneCSS = `[hidden]{display:none!important}*{box-sizing:border-box}body{margin:0;background:#130d1e;color:#f8f2ff;font:16px/1.65 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:36px 24px}h1{font-size:clamp(32px,5vw,60px);line-height:1.1}h2{font-size:30px;line-height:1.2}h3{font-size:20px}a{color:#efd69c}label{font-weight:650;display:block}input,textarea,button{font:inherit}textarea,input:not([type=checkbox]){width:100%;color:#faf5ff;background:#21162f;border:1px solid #91759f;border-radius:6px;padding:12px}textarea{resize:vertical}button,.fm-file{padding:12px 18px;border:1px solid #a085b5;border-radius:6px;background:#352246;color:#f8f2ff;cursor:pointer}.fm-primary{color:#25192e;background:#efd69c}.fm-field{margin:22px 0}.fm-card,.fm-boundary{padding:24px;border:1px solid #695376;border-radius:12px;margin:24px 0}.fm-section{margin:45px 0}.fm-help,.fm-lead{color:#c6bad8}.fm-eyebrow{color:#efd69c;font-size:11px;letter-spacing:1.4px}.fm-grid-two{display:grid;grid-template-columns:1fr 1fr;gap:20px}.fm-actions{display:flex;gap:15px;flex-wrap:wrap}.fm-check{display:flex;gap:12px;margin:22px 0}.fm-check input{flex:none;width:20px;height:20px}.fm-file input{display:block;width:100%;margin-top:8px;max-width:250px}iframe{display:block;width:100%;height:550px;background:white;border:1px solid #91759f;margin-top:15px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#1d142b;padding:14px;max-width:100%}.fm-digest{font:11px/1.6 monospace;overflow-wrap:anywhere}:focus-visible{outline:3px solid #b8e7d7;outline-offset:4px}@media(max-width:650px){main{padding:25px 16px}.fm-card,.fm-boundary{padding:18px}.fm-grid-two{grid-template-columns:1fr}}`;
