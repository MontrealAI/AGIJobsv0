import { sourceMissionCopy } from '../../website/assets/source-mission-copy.mjs';

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );

export function renderSourceMissionPage(base, revision, language = 'en') {
  const t = sourceMissionCopy[language];
  if (!t) throw new Error('Unsupported source mission language');
  const field = (id, label, content, help = '') =>
    `<div class="sm-field"><label for="sm-${id}">${esc(
      label
    )}</label>${content}${
      help ? `<p class="sm-help" id="sm-${id}-help">${esc(help)}</p>` : ''
    }</div>`;
  const button = (id, label, style = 'primary', extra = '') =>
    `<button id="sm-${id}" type="button" class="sm-button sm-button-${style}" ${extra}>${esc(
      label
    )}</button>`;
  const sourceDetails = (id) =>
    `<details class="sm-detail"><summary>${esc(
      t.viewContext
    )}</summary><p class="sm-help sm-fingerprint">${esc(
      t.sourceDigest
    )}: <code id="sm-${id}-digest"></code></p><pre id="sm-${id}-source" class="sm-source" tabindex="0" aria-label="${esc(
      t.textLabel
    )}"></pre></details>`;
  return `<main id="main" class="section-wrap sm-page" lang="${language}" data-source-mission data-language="${language}" data-revision="${esc(
    revision
  )}">
    <link rel="stylesheet" href="${base}assets/source-mission.css"><script type="module" src="${base}assets/source-mission.js"></script>
    <nav class="sm-topline" aria-label="${esc(
      t.language
    )}"><a href="${base}successor/">← ${esc(
    t.back
  )}</a><div><a href="${base}successor/research/" lang="en" hreflang="en"${
    language === 'en' ? ' aria-current="page"' : ''
  }>English</a><a href="${base}successor/research/fr/" lang="fr" hreflang="fr"${
    language === 'fr' ? ' aria-current="page"' : ''
  }>Français</a></div></nav>
    <section class="sm-hero" aria-labelledby="sm-title"><div class="sm-hero-copy"><p class="sm-eyebrow">${esc(
      t.kicker
    )}</p><h1 id="sm-title">${t.title
    .split('\n')
    .map(esc)
    .join('<br>')}</h1><p class="sm-lead">${esc(
    t.intro
  )}</p><div class="sm-actions">${button(
    'sample',
    t.sample,
    'primary',
    'disabled'
  )}<a class="sm-text-link" href="#sm-workspace">${esc(
    t.own
  )} ↓</a></div><p class="sm-free">${esc(
    t.free
  )}</p></div><aside class="sm-preview" aria-label="${esc(
    t.heroLabel
  )}"><div class="sm-preview-top"><span class="sm-star" aria-hidden="true">✧</span><span>${esc(
    t.heroLabel
  )}</span><span class="sm-preview-omega" aria-hidden="true">Ω</span></div><h2>${esc(
    t.heroTitle
  )}</h2><blockquote lang="en">“${esc(
    t.heroQuote
  )}”</blockquote><p class="sm-preview-caption">${esc(
    t.heroAttribution
  )}</p><ul>${[t.heroPoint1, t.heroPoint2, t.heroPoint3]
    .map((item) => `<li>${esc(item)}</li>`)
    .join(
      ''
    )}</ul><div class="sm-preview-seal"><span class="sm-dot" aria-hidden="true"></span>${esc(
    t.proof
  )}: ${esc(t.absent)}</div></aside></section>
    <aside class="sm-boundary"><strong>${esc(t.promise)}</strong><p>${esc(
    t.promiseBody
  )}</p></aside>
    <section class="sm-journey" aria-label="${esc(
      t.journey
    )}"><article><p class="sm-eyebrow">${esc(t.lab)}</p><p>${esc(
    t.labText
  )}</p><a href="${base}successor/alpha/">${esc(
    t.labLink
  )} ↗</a></article><article aria-current="step"><p class="sm-eyebrow">${esc(
    t.missionStep
  )}</p><p>${esc(t.missionText)}</p><a href="#sm-workspace">${esc(
    t.own
  )} ↓</a></article><article><p class="sm-eyebrow">${esc(t.reuse)}</p><p>${esc(
    t.reuseText
  )}</p><a href="${base}successor/build/${
    language === 'fr' ? '?lang=fr' : ''
  }">${esc(t.buildLink)} ↗</a></article></section>
    <section id="sm-workspace" class="sm-section" aria-labelledby="sm-workspace-title"><div class="sm-section-heading"><div><p class="sm-eyebrow">01 / ${esc(
      t.workspace
    )}</p><h2 id="sm-workspace-title">${esc(
    t.workspaceTitle
  )}</h2></div><p>${esc(t.workspaceIntro)}</p></div>
      <div class="sm-workspace-grid"><form id="sm-form" class="sm-card"><div class="sm-fields-pair">${field(
        'title-input',
        t.titleLabel,
        `<input id="sm-title-input" name="title" maxlength="180" required placeholder="${esc(
          t.titlePlaceholder
        )}">`
      )}${field(
    'source-title',
    t.sourceTitleLabel,
    `<input id="sm-source-title" name="sourceTitle" maxlength="180" required placeholder="${esc(
      t.sourceTitlePlaceholder
    )}">`
  )}</div>
      ${field(
        'goal',
        t.goalLabel,
        `<textarea id="sm-goal" name="goal" rows="3" maxlength="1000" required placeholder="${esc(
          t.goalPlaceholder
        )}" aria-describedby="sm-goal-help"></textarea>`,
        t.goalHelp
      )}
      ${field(
        'url',
        t.urlLabel,
        '<input id="sm-url" name="url" type="url" maxlength="2048" placeholder="https://…" aria-describedby="sm-url-help">',
        t.urlHelp
      )}
      ${field(
        'text',
        t.textLabel,
        `<textarea id="sm-text" name="text" rows="10" maxlength="40000" required placeholder="${esc(
          t.textPlaceholder
        )}" aria-describedby="sm-text-help"></textarea>`,
        t.textHelp
      )}
      <p id="sm-sample-note" class="sm-sample-note" hidden>${esc(
        t.sampleNote
      )}</p><label class="sm-check"><input id="sm-public" type="checkbox" required><span>${esc(
    t.publicCheck
  )}</span></label>
      <details class="sm-detail"><summary>${esc(t.advanced)}</summary>${field(
    'budget',
    t.quoteBudget,
    '<input id="sm-budget" type="number" value="4" min="3" max="8" step="1" aria-describedby="sm-budget-help">',
    t.quoteBudgetHelp
  )}</details>
      <div class="sm-actions"><button id="sm-create" type="submit" class="sm-button sm-button-primary" disabled>${esc(
        t.create
      )} →</button>${button(
    'clear',
    t.clear,
    'quiet',
    'disabled'
  )}</div><p class="sm-help">${esc(t.replaceWarning)}</p></form>
      <aside class="sm-compass"><div class="sm-compass-mark" aria-hidden="true"><span>Ω</span></div><p class="sm-eyebrow">ALPHA · GYM · SPECIALIST ASI · SUCCESSOR Ω</p><h3>${esc(
        t.promise
      )}</h3><p>${esc(t.local)}</p><dl><div><dt>${esc(t.proof)}</dt><dd>${esc(
    t.absent
  )}</dd></div><div><dt>${esc(t.authority)}</dt><dd>${esc(
    t.none
  )}</dd></div><div><dt>${esc(
    t.revision
  )}</dt><dd><a href="https://github.com/MontrealAI/AGIJobsv0/commit/${esc(
    revision
  )}">${esc(revision.slice(0, 8))}</a></dd></div></dl></aside></div>
      <p id="sm-status" class="sm-status" role="status" tabindex="-1">${esc(
        t.initialStatus
      )}</p><p id="sm-edited-status" class="sm-status" role="status" hidden>${esc(
    t.edited
  )}</p><noscript><p class="sm-status">JavaScript is required for this local workspace. / JavaScript est requis pour cet espace local.</p></noscript>
    </section>
    <div id="sm-results" hidden>
      <section id="sm-brief-section" class="sm-section" aria-labelledby="sm-brief-title"><div class="sm-section-heading"><div><p class="sm-eyebrow">02 / ${esc(
        t.outputKicker
      )}</p><h2 id="sm-brief-title">${esc(
    t.outputTitle
  )}</h2></div><p id="sm-mission-goal"></p></div>
        <div class="sm-method-bar">${field(
          'method',
          t.methodLabel,
          '<select id="sm-method" aria-describedby="sm-method-help"></select>',
          t.methodHelp
        )}<p id="sm-method-description"></p></div>
        <div class="sm-metrics" id="sm-metrics"></div><p class="sm-help sm-metric-boundary">${esc(
          t.coverageMeaning
        )}</p>
        <div class="sm-evidence-grid"><div><h3>${esc(
          t.exactTitle
        )}</h3><p id="sm-source-attribution" class="sm-help"></p><div id="sm-passages" class="sm-passages"></div>${sourceDetails(
    'development'
  )}</div><aside class="sm-card sm-judgment"><p class="sm-eyebrow">${esc(
    t.notesLabel
  )}</p><h3>${esc(t.judgmentTitle)}</h3><p>${esc(
    t.judgmentHelp
  )}</p><label for="sm-brief">${esc(
    t.briefLabel
  )}</label><textarea id="sm-brief" rows="10" maxlength="4000" placeholder="${esc(
    t.briefPlaceholder
  )}"></textarea>${button(
    'save-brief',
    t.saveBrief,
    'secondary'
  )}<p id="sm-notes-status" class="sm-help" role="status"></p><details class="sm-detail"><summary>${esc(
    t.inspectChecks
  )}</summary><ul id="sm-review-questions"></ul></details></aside></div>
        <details class="sm-detail sm-comparison-detail"><summary>${esc(
          t.controls
        )}</summary><div class="sm-table-wrap" tabindex="0" role="region" aria-label="${esc(
    t.controls
  )}"><table><caption>${esc(
    t.coverageMeaning
  )}</caption><thead><tr><th scope="col">${esc(
    t.method
  )}</th><th scope="col">${esc(t.goalWords)}</th><th scope="col">${esc(
    t.sections
  )}</th><th scope="col">${esc(
    t.count
  )}</th></tr></thead><tbody id="sm-comparison"></tbody></table></div></details>
      </section>
      <section id="sm-freeze-section" class="sm-section" aria-labelledby="sm-freeze-title"><div class="sm-section-heading"><div><p class="sm-eyebrow">03 / ${esc(
        t.freezeKicker
      )}</p><h2 id="sm-freeze-title">${esc(t.freezeTitle)}</h2></div><p>${esc(
    t.freezeIntro
  )}</p></div><div class="sm-card sm-freeze-card"><div><p id="sm-frozen-method" class="sm-frozen-method"></p><p class="sm-help">${esc(
    t.freezeHelp
  )}</p></div>${button('freeze', t.freeze, 'secondary')}</div>
        <form id="sm-fresh-form" class="sm-card sm-fresh-form" hidden><div class="sm-fresh-heading"><h3>${esc(
          t.freshText
        )}</h3>${button('fresh-example', t.freshExample, 'quiet')}</div>${field(
    'fresh-title',
    t.freshTitle,
    '<input id="sm-fresh-title" maxlength="180" required>'
  )}${field(
    'fresh-url',
    t.freshURL,
    '<input id="sm-fresh-url" type="url" maxlength="2048" placeholder="https://…">'
  )}${field(
    'fresh-text',
    t.freshText,
    '<textarea id="sm-fresh-text" rows="8" maxlength="40000" required aria-describedby="sm-fresh-text-help"></textarea>',
    t.freshHelp
  )}<label class="sm-check"><input id="sm-fresh-public" type="checkbox" required><span>${esc(
    t.freshCheck
  )}</span></label><label class="sm-check"><input id="sm-fresh-unused" type="checkbox" required><span>${
    language === 'fr'
      ? 'Je n’ai pas utilisé cette source pour choisir ou ajuster la méthode. Cette déclaration ne constitue pas une preuve indépendante.'
      : 'I did not use this source to choose or tune the method. This attestation is not independent proof.'
  }</span></label><button id="sm-confirm" class="sm-button sm-button-primary" type="submit">${esc(
    t.confirm
  )} →</button></form>
        <div id="sm-transfer" hidden><aside class="sm-retain"><span class="sm-retain-symbol" aria-hidden="true">↺</span><div><p class="sm-eyebrow">${
          language === 'fr' ? 'CONSERVER LA MÉTHODE ACTUELLE' : 'KEEP INCUMBENT'
        }</p><h3>${esc(t.transferTitle)}</h3><p>${esc(
    t.transferBody
  )}</p></div></aside><div id="sm-transfer-metrics" class="sm-metrics"></div><p id="sm-fresh-attribution" class="sm-help"></p><div class="sm-transfer-grid"><div><h3>${esc(
    t.candidate
  )}</h3><div id="sm-fresh-candidate" class="sm-passages"></div></div><div><h3>${esc(
    t.incumbent
  )}</h3><div id="sm-fresh-incumbent" class="sm-passages"></div></div></div><details class="sm-detail"><summary>${esc(
    t.controls
  )}</summary><div class="sm-table-wrap" tabindex="0" role="region" aria-label="${esc(
    t.controls
  )}"><table><caption>${esc(
    t.coverageMeaning
  )}</caption><thead><tr><th scope="col">${esc(
    t.method
  )}</th><th scope="col">${esc(t.goalWords)}</th><th scope="col">${esc(
    t.sections
  )}</th><th scope="col">${esc(
    t.count
  )}</th></tr></thead><tbody id="sm-fresh-comparison"></tbody></table></div><div id="sm-fresh-control-passages" class="sm-transfer-grid"></div></details>${sourceDetails(
    'confirmation'
  )}</div>
      </section>
      <section class="sm-human" aria-labelledby="sm-human-title"><h3 id="sm-human-title">${esc(
        t.humanTitle
      )}</h3><ol>${[t.human1, t.human2, t.human3, t.human4]
    .map((item) => `<li>${esc(item)}</li>`)
    .join('')}</ol></section>
    </div>
    <section id="sm-save-section" class="sm-section" aria-labelledby="sm-save-title"><div class="sm-section-heading"><div><p class="sm-eyebrow">04 / ${esc(
      t.saveKicker
    )}</p><h2 id="sm-save-title">${esc(t.saveTitle)}</h2></div><p>${esc(
    t.saveIntro
  )}</p></div><p id="sm-empty-save" class="sm-help">${esc(
    t.noDossier
  )}</p><div class="sm-save-grid"><div class="sm-card"><div class="sm-actions sm-downloads">${button(
    'export',
    t.dossier,
    'primary',
    'disabled'
  )}${button(
    'report',
    t.report,
    'secondary',
    'disabled'
  )}</div><details class="sm-detail"><summary>${esc(
    t.inspectDossier
  )}</summary><pre tabindex="0"><code id="sm-dossier-json">{}</code></pre></details><details class="sm-detail"><summary>${esc(
    t.history
  )}</summary><ol id="sm-history"></ol></details></div><div class="sm-card">${field(
    'restore',
    t.importLabel,
    '<input id="sm-restore" type="file" accept="application/json,.json">',
    t.importHelp
  )}<p class="sm-help">${esc(t.local)}</p></div></div>
      <details class="sm-detail sm-jobs-detail"><summary>${esc(
        t.jobs
      )}</summary><p>${esc(
    t.jobsHelp
  )}</p><p><a class="sm-text-link" href="${base}ecosystem/#contracts">${esc(
    t.contractsLink
  )} →</a></p>${button(
    'jobs',
    t.jobs,
    'secondary',
    'disabled'
  )}<div id="sm-jobs-result" hidden><p class="sm-help" id="sm-jobs-summary"></p>${button(
    'download-jobs',
    t.downloadJobs,
    'secondary'
  )}<details class="sm-detail"><summary>${esc(
    t.inspectJobs
  )}</summary><pre tabindex="0"><code id="sm-jobs-json">{}</code></pre></details></div></details>
    </section>
    <section class="sm-next" aria-labelledby="sm-next-title"><p class="sm-eyebrow">OWN THE INSTITUTION. REPLACE THE MODELS. PRESERVE THE MISSION.</p><h2 id="sm-next-title">${esc(
      t.nextTitle
    )}</h2><p>${esc(
    t.nextText
  )}</p><div class="sm-actions"><a class="sm-button sm-button-primary" href="${base}successor/alpha/">${esc(
    t.labLink
  )} →</a><a class="sm-text-link" href="${base}successor/build/${
    language === 'fr' ? '?lang=fr' : ''
  }">${esc(t.buildLink)} →</a></div></section>
  </main>`;
}
