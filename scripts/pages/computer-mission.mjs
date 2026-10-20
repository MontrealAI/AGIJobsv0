import { computerMissionCopy } from '../../website/assets/computer-mission-copy.mjs';
import { renderComputerReceipt } from './computer-receipt.mjs';
import {
  defaultComputerDeskMission,
  renderComputerDeskMarkup,
  renderComputerDeskDocument,
  computerDeskCSS,
} from '../../website/assets/computer-desk.mjs';

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
export { renderComputerDeskDocument };
export function renderComputerDeskTaskHTML(report, language = 'en') {
  return renderComputerDeskDocument(report.mission, {
    language,
    formulation: report.formulation,
    reportDigest: report.digest,
    frozenProgramDigest: report.frozen.programDigest,
  });
}

export function renderComputerDesk(base, revision, language = 'en') {
  return `<main id="main" class="section-wrap cm-desk-page" data-computer-desk-page data-language="${
    language === 'fr' ? 'fr' : 'en'
  }" data-revision="${esc(
    revision
  )}"><link rel="stylesheet" href="${base}assets/computer-mission.css"><style>${computerDeskCSS}</style><script type="module" src="${base}assets/computer-mission.js"></script>${renderComputerDeskMarkup(
    defaultComputerDeskMission,
    { language, formulation: 'actual_requirements' }
  )}</main>`;
}

export function renderComputerMissionPage(base, revision, language = 'en') {
  const t = computerMissionCopy[language];
  if (!t) throw new Error('Unsupported computer mission language');
  const field = (id, label, input) =>
    `<div class="cm-field"><label for="cm-${id}">${esc(
      label
    )}</label>${input}</div>`;
  const button = (id, label, style = 'primary', attributes = '') =>
    `<button type="button" id="cm-${id}" class="cm-button cm-${style}" ${attributes}>${esc(
      label
    )}</button>`;
  const desk = renderComputerDeskMarkup(defaultComputerDeskMission, {
    language,
    formulation: 'all_early',
  })
    .replace('<h1>', '<h3>')
    .replace('</h1>', '</h3>')
    .replaceAll('<h2', '<h4')
    .replaceAll('</h2>', '</h4>');
  return `<main id="main" class="section-wrap cm-page" lang="${language}" data-computer-mission data-language="${language}" data-base="${esc(
    base
  )}" data-revision="${esc(revision)}">
    <link rel="stylesheet" href="${base}assets/computer-mission.css"><style>${computerDeskCSS}</style><script type="module" src="${base}assets/computer-mission.js"></script>
    <nav class="cm-topline" aria-label="${esc(
      t.language
    )}"><a href="${base}successor/alpha/">← ${esc(
    t.back
  )}</a><div><a href="${base}successor/computer/" lang="en" hreflang="en"${
    language === 'en' ? ' aria-current="page"' : ''
  }>English</a><a href="${base}successor/computer/fr/" lang="fr" hreflang="fr"${
    language === 'fr' ? ' aria-current="page"' : ''
  }>Français</a></div></nav>
    <section class="cm-hero" aria-labelledby="cm-title"><div><p class="cm-eyebrow">${esc(
      t.kicker
    )}</p><h1 id="cm-title">${t.title
    .split('\n')
    .map(esc)
    .join('<br>')}</h1><p class="cm-lead">${esc(
    t.intro
  )}</p><div class="cm-actions">${button(
    'practice',
    t.practice,
    'primary',
    'disabled'
  )}<a class="cm-text-link" href="#cm-real">${esc(
    t.realLink
  )} →</a></div><p class="cm-help">${esc(
    t.free
  )}</p></div><aside class="cm-preview"><div class="cm-preview-top"><span>α</span><p class="cm-eyebrow">${esc(
    t.previewKicker
  )}</p><span>Ω</span></div><h2>${esc(
    t.previewNeed
  )}</h2><div class="cm-approaches"><div><span>01</span><strong>${esc(
    t.previewCurrent
  )}</strong><small>40 × Stellar</small></div><span aria-hidden="true">→</span><div><span>02</span><strong>${esc(
    t.previewNew
  )}</strong><small>10 × Stellar · 30 × Laurentian</small></div></div><p class="cm-help">${esc(
    t.previewNote
  )}</p></aside></section>
    <aside class="cm-mode"><p class="cm-eyebrow">${esc(t.mode)}</p><p>${esc(
    t.modeHelp
  )}</p></aside>
    <section id="cm-setup" class="cm-section" aria-labelledby="cm-setup-title"><div class="cm-heading"><div><p class="cm-eyebrow">${esc(
      t.setup
    )}</p><h2 id="cm-setup-title">${esc(t.setupTitle)}</h2></div><p>${esc(
    t.setupIntro
  )}</p></div><form id="cm-form" class="cm-card"><div class="cm-input-grid">${field(
    'early-units',
    t.earlyUnits,
    '<input id="cm-early-units" type="number" min="0" max="40" step="1" value="10" required>'
  )}${field(
    'early-day',
    t.earlyDay,
    '<input id="cm-early-day" type="number" min="1" max="30" step="1" value="7" required>'
  )}${field(
    'total-units',
    t.totalUnits,
    '<input id="cm-total-units" type="number" min="1" max="40" step="1" value="40" required>'
  )}${field(
    'final-day',
    t.finalDay,
    '<input id="cm-final-day" type="number" min="1" max="30" step="1" value="14" required>'
  )}${field(
    'budget',
    t.budget,
    '<input id="cm-budget" type="text" inputmode="decimal" value="510.00" maxlength="12" required>'
  )}</div><p class="cm-help">${esc(
    t.same
  )}</p><div class="cm-actions"><button type="submit" id="cm-run" class="cm-button cm-primary" disabled>${esc(
    t.construct
  )} →</button>${button(
    'hard-early',
    t.counterexample,
    'quiet',
    'disabled'
  )}</div></form><p id="cm-status" class="cm-status" role="status" tabindex="-1">${esc(
    t.statusReady
  )}</p><p id="cm-edited" class="cm-status" role="status" hidden>${esc(
    t.edited
  )}</p><p class="cm-help">${esc(t.local)}</p></section>
    <div id="cm-results" hidden>
      <section id="cm-strategies" class="cm-section" aria-labelledby="cm-l3-title"><div class="cm-heading"><div><p class="cm-eyebrow">${esc(
        t.l3
      )}</p><h2 id="cm-l3-title">${esc(t.l3Title)}</h2></div><p>${esc(
    t.l3Intro
  )}</p></div><div id="cm-costs" class="cm-metrics"></div><p class="cm-help">${esc(
    t.synthetic
  )}</p><div id="cm-study-counts" class="cm-study-counts"></div><details class="cm-detail"><summary>${esc(
    t.inspectStrategies
  )}</summary><div class="cm-table-wrap" tabindex="0" role="region" aria-label="${esc(
    t.inspectStrategies
  )}"><table><thead><tr><th scope="col">${esc(
    t.attempt
  )}</th><th scope="col">${esc(t.program)}</th><th scope="col">${esc(
    t.outcome
  )}</th><th scope="col">${esc(t.cost)}</th><th scope="col">${esc(
    t.revision
  )}</th></tr></thead><tbody id="cm-attempts"></tbody></table></div><ol id="cm-revisions" class="cm-revisions"></ol><details class="cm-detail"><summary>${esc(
    t.programDetails
  )}</summary><pre tabindex="0"><code id="cm-development-json">{}</code></pre></details></details><details class="cm-detail"><summary>${esc(
    t.freshDetails
  )}</summary><p class="cm-help">${esc(
    t.limits
  )}</p><pre tabindex="0"><code id="cm-frozen-json">{}</code></pre><div id="cm-fresh-cases" class="cm-fresh-cases"></div></details><p class="cm-help">${esc(
    t.limits
  )}</p><p class="cm-help">${esc(t.measurement)}</p></section>
      <section id="cm-reframe-section" class="cm-section" aria-labelledby="cm-l4-title"><div class="cm-heading"><div><p class="cm-eyebrow">${esc(
        t.l4
      )}</p><h2 id="cm-l4-title">${esc(t.l4Title)}</h2></div><p>${esc(
    t.l4Intro
  )}</p></div><div class="cm-reframe-grid"><aside class="cm-card"><p class="cm-eyebrow">${esc(
    t.requirementLabel
  )}</p><dl id="cm-requirements"></dl><p class="cm-eyebrow">${esc(
    t.assumption
  )}</p><p>${esc(
    t.assumptionText
  )}</p><p id="cm-hard-case" class="cm-help" hidden>${esc(
    t.hardCase
  )}</p></aside><form id="cm-reframe-form" class="cm-card">${field(
    'owner',
    t.owner,
    '<input id="cm-owner" maxlength="100" required>'
  )}${field(
    'reason',
    t.reason,
    `<textarea id="cm-reason" rows="3" maxlength="1000" required>${esc(
      t.reasonDefault
    )}</textarea>`
  )}<label class="cm-check"><input id="cm-approval" type="checkbox" required><span>${esc(
    t.approval
  )}</span></label><button type="submit" id="cm-reframe" class="cm-button cm-secondary">${esc(
    t.reframe
  )} →</button></form></div><aside class="cm-retain"><span aria-hidden="true">↺</span><div><h3>${esc(
    t.retainTitle
  )}</h3><p>${esc(t.retainBody)}</p><p class="cm-help">${esc(t.proof)}: ${esc(
    t.notEstablished
  )} · ${esc(t.authority)}: ${esc(t.none)}</p></div></aside></section>
      <section id="cm-desk-section" class="cm-section" aria-labelledby="cm-desk-title"><div class="cm-heading"><div><p class="cm-eyebrow">${esc(
        t.desk
      )}</p><h2 id="cm-desk-title">${esc(t.deskTitle)}</h2></div><p>${esc(
    t.deskIntro
  )}</p></div><div class="cm-actions">${button(
    'run-desk',
    t.runDesk,
    'secondary'
  )}<p id="cm-desk-mode" class="cm-help">${esc(
    t.deskManual
  )}</p></div><div id="cm-desk-host" class="cm-desk-host">${desk}</div><p id="cm-observed-status" class="cm-help" role="status"></p><details class="cm-detail"><summary>${esc(
    t.observed
  )}</summary><pre tabindex="0"><code id="cm-observed-json">{}</code></pre></details></section>
    </div>
    <section id="cm-real" class="cm-section cm-real" aria-labelledby="cm-real-title"><div class="cm-heading"><div><p class="cm-eyebrow">${esc(
      t.real
    )}</p><h2 id="cm-real-title">${esc(t.realTitle)}</h2></div><p>${esc(
    t.realIntro
  )}</p></div><div class="cm-real-grid"><article class="cm-card"><span class="cm-path-number">01 / COMPUTER USE</span><h3>${esc(
    t.workTitle
  )}</h3><p>${esc(
    t.workText
  )}</p><a id="cm-public-desk" class="cm-button cm-primary" href="${base}successor/computer/desk/${
    language === 'fr' ? '?lang=fr' : ''
  }" target="_blank" rel="noopener noreferrer">${esc(
    t.openDesk
  )} ↗</a><label for="cm-work-prompt">${esc(
    t.workPrompt
  )}</label><textarea id="cm-work-prompt" rows="8" readonly></textarea>${button(
    'copy-work',
    t.copyWork,
    'secondary',
    'disabled'
  )}</article><article class="cm-card"><span class="cm-path-number">02 / ALPHA COMPUTER TASK</span><h3>${esc(
    t.alphaTitle
  )}</h3><p>${esc(
    t.alphaText
  )}</p><div class="cm-actions cm-downloads">${button(
    'task',
    t.downloadTask,
    'primary',
    'disabled'
  )}${button(
    'desk-download',
    t.downloadDesk,
    'secondary',
    'disabled'
  )}</div><p id="cm-task-state" class="cm-help">${esc(
    t.noTask
  )}</p><details class="cm-detail"><summary>${esc(
    t.runtimeDetails
  )}</summary><p class="cm-help">${esc(
    t.runtimeHelp
  )}</p><a class="cm-text-link" href="https://github.com/MontrealAI/AGIJobsv0/blob/${esc(
    revision
  )}/docs/computer-work.md">${esc(
    t.runtimeGuide
  )} ↗</a><p><a class="cm-text-link" href="https://github.com/MontrealAI/AGIJobsv0/blob/${esc(
    revision
  )}/docs/successor/COMPUTER_USE_LEVELS.md">${esc(
    t.runtimeDetails
  )} →</a></p></details></article></div><p id="cm-provider-state" class="cm-status">${esc(
    t.notRun
  )}</p><div class="cm-card cm-import-evidence">${field(
    'evidence-input',
    t.importEvidence,
    '<input id="cm-evidence-input" type="file" accept="application/json,.json" disabled>'
  )}<p class="cm-help">${esc(
    t.importEvidenceHelp
  )}</p><p id="cm-evidence-status" class="cm-help" role="status"></p><details class="cm-detail"><summary>${esc(
    t.observed
  )}</summary><pre tabindex="0"><code id="cm-import-review">{}</code></pre></details></div></section>
    <section id="cm-save" class="cm-section" aria-labelledby="cm-save-title"><div class="cm-heading"><div><p class="cm-eyebrow">${esc(
      t.keep
    )}</p><h2 id="cm-save-title">${esc(t.keepTitle)}</h2></div><p>${esc(
    t.keepIntro
  )}</p></div><div class="cm-save-grid"><div class="cm-card"><p id="cm-no-report" class="cm-help">${esc(
    t.noReport
  )}</p><div class="cm-actions cm-downloads">${button(
    'export',
    t.report,
    'primary',
    'disabled'
  )}${button('readable', t.readable, 'secondary', 'disabled')}${button(
    'evidence-export',
    t.evidence,
    'secondary',
    'disabled'
  )}</div><details class="cm-detail"><summary>${esc(
    t.jobs
  )}</summary><p class="cm-help">${esc(t.jobsHelp)}</p>${button(
    'jobs',
    t.jobs,
    'secondary',
    'disabled'
  )}<div id="cm-jobs-result" hidden>${button(
    'jobs-download',
    t.jobsDownload,
    'secondary'
  )}<pre tabindex="0"><code id="cm-jobs-json">{}</code></pre></div></details><details class="cm-detail"><summary>${esc(
    t.inspectReport
  )}</summary><pre tabindex="0"><code id="cm-report-json">{}</code></pre></details><details class="cm-detail"><summary>${esc(
    t.history
  )}</summary><ol id="cm-history"></ol></details></div><div class="cm-card">${field(
    'restore',
    t.restore,
    '<input id="cm-restore" type="file" accept="application/json,.json">'
  )}<p class="cm-help">${esc(t.restoreHelp)}</p><p class="cm-help">${esc(
    t.local
  )}</p></div></div></section>
    ${renderComputerReceipt(language, base)}
    <section class="cm-next"><p class="cm-eyebrow">ALPHA · GYM · SPECIALIST ASI · SUCCESSOR Ω</p><h2>${esc(
      t.next
    )}</h2><p>${esc(
    t.nextText
  )}</p><div class="cm-actions"><a href="${base}successor/alpha/">${esc(
    t.alpha
  )} →</a><a href="${base}successor/research/${
    language === 'fr' ? 'fr/' : ''
  }">${esc(t.research)} →</a><a href="${base}ecosystem/#contracts">${esc(
    t.contracts
  )} →</a></div></section>
    <noscript><p class="cm-status">JavaScript is required for local strategy practice. The public desk remains available to a browser with JavaScript. / JavaScript est requis pour cet exercice local.</p></noscript>
  </main>`;
}
