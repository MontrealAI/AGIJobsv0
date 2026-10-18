import { frontierMissionCopy } from '../../website/assets/frontier-mission-copy.mjs';
import {
  renderFrontierDeskMarkup,
  renderFrontierDeskDocument,
} from '../../website/assets/frontier-desk.mjs';
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
export { renderFrontierDeskDocument };

export function renderFrontierMissionPage(base, revision, language = 'en') {
  const t = frontierMissionCopy[language];
  if (!t) throw new Error('Unsupported frontier mission language');
  const field = (id, label, rows, max, help = '') =>
    `<div class="fm-field"><label for="fm-${id}">${esc(label)}</label>${
      help ? `<p id="fm-${id}-help" class="fm-help">${esc(help)}</p>` : ''
    }${
      rows
        ? `<textarea id="fm-${id}" rows="${rows}" maxlength="${max}" required${
            help ? ` aria-describedby="fm-${id}-help"` : ''
          }></textarea>`
        : `<input id="fm-${id}" maxlength="${max}" required>`
    }</div>`;
  const button = (id, label, style = 'secondary', extra = '') =>
    `<button id="fm-${id}" type="button" class="fm-button fm-${style}" ${extra}>${esc(
      label
    )}</button>`;
  return `<main id="main" class="section-wrap fm-page" lang="${language}" data-frontier-mission data-language="${language}" data-base="${esc(
    base
  )}" data-revision="${esc(
    revision
  )}"><link rel="stylesheet" href="${base}assets/frontier-mission.css"><script type="module" src="${base}assets/frontier-mission.js"></script><nav class="fm-topline" aria-label="${esc(
    t.language
  )}"><a href="${base}successor/">← ${esc(
    t.home
  )}</a><div><a href="${base}successor/mission/" lang="en" hreflang="en"${
    language === 'en' ? ' aria-current="page"' : ''
  }>English</a><a href="${base}successor/mission/fr/" lang="fr" hreflang="fr"${
    language === 'fr' ? ' aria-current="page"' : ''
  }>Français</a></div></nav>
  <section class="fm-hero" aria-labelledby="fm-title-heading"><div><p class="fm-eyebrow">${esc(
    t.kicker
  )}</p><h1 id="fm-title-heading">${t.title
    .split('\n')
    .map(esc)
    .join('<br>')}</h1><p class="fm-lead">${esc(
    t.intro
  )}</p><div class="fm-actions"><a class="fm-button fm-primary" href="#fm-brief-form">${esc(
    t.launch
  )} →</a><button type="button" class="fm-text-button" data-preset="mathematics">${esc(
    t.mathLink
  )} ↗</button></div><p class="fm-help">${esc(
    t.free
  )}</p></div><aside class="fm-vision"><div class="fm-vision-top"><span aria-hidden="true">α</span><p class="fm-eyebrow">${esc(
    t.previewLabel
  )}</p><span aria-hidden="true">Ω</span></div><h2>${t.previewTitle
    .split('\n')
    .map(esc)
    .join(
      '<br>'
    )}</h2><div class="fm-capability"><span aria-hidden="true">↗</span><div><h3>${esc(
    t.previewOne
  )}</h3><p>${esc(
    t.previewOneText
  )}</p></div></div><div class="fm-capability"><span aria-hidden="true">Ⅲ</span><div><h3>${esc(
    t.previewTwo
  )}</h3><p>${esc(
    t.previewTwoText
  )}</p></div></div><div class="fm-capability"><span aria-hidden="true">Ⅳ</span><div><h3>${esc(
    t.previewThree
  )}</h3><p>${esc(t.previewThreeText)}</p></div></div></aside></section>
  <section class="fm-section" id="fm-brief-form" aria-labelledby="fm-setup-title"><div class="fm-section-heading"><div><p class="fm-eyebrow">${esc(
    t.setup
  )}</p><h2 id="fm-setup-title">${esc(t.setupTitle)}</h2></div><p>${esc(
    t.setupIntro
  )}</p></div><div class="fm-preset-options"><button class="fm-preset" type="button" data-preset="business"><span aria-hidden="true">↗</span><strong>${esc(
    t.business
  )}</strong></button><button class="fm-preset" type="button" data-preset="mathematics"><span aria-hidden="true">∑</span><strong>${esc(
    t.mathematics
  )}</strong></button></div><p class="fm-help">${esc(
    t.presetHelp
  )}</p><form id="fm-form" class="fm-card">${field(
    'title',
    t.missionTitle,
    0,
    180
  )}${field('question', t.question, 3, 3000)}${field(
    'outcome',
    t.outcome,
    3,
    3000
  )}<div class="fm-grid-two">${field('current', t.current, 4, 3000)}${field(
    'alternative',
    t.alternative,
    4,
    3000
  )}</div>${field(
    'requirements',
    t.requirements,
    5,
    8000,
    t.requirementsHelp
  )}<div class="fm-source-heading"><h3>${esc(
    t.evidenceTitle
  )}</h3><p class="fm-help">${esc(
    t.evidenceHelp
  )}</p></div><div id="fm-source-list"></div>${button(
    'add-source',
    t.addSource
  )}<div class="fm-field"><label for="fm-license">${esc(
    t.license
  )}</label><input id="fm-license" maxlength="1000" required></div><label class="fm-check"><input type="checkbox" id="fm-rights" required><span>${esc(
    t.rights
  )}</span></label><details class="fm-detail"><summary>${esc(
    t.budget
  )}</summary><div class="fm-budget-grid">${[
    ['turns', t.turns, 1, 30, 12],
    ['actions', t.actions, 1, 100, 60],
    ['seconds', t.seconds, 10, 600, 300],
    ['review', t.review, 1, 120, 20],
  ]
    .map(
      ([id, label, min, max, value]) =>
        `<div class="fm-field"><label for="fm-${id}">${esc(
          label
        )}</label><input id="fm-${id}" type="number" min="${min}" max="${max}" step="1" value="${value}" required></div>`
    )
    .join(
      ''
    )}</div></details><div class="fm-actions"><button id="fm-prepare" class="fm-button fm-primary" type="submit" disabled>${esc(
    t.prepare
  )} →</button></div><p class="fm-help">${esc(
    t.local
  )}</p></form><p id="fm-status" role="status" tabindex="-1" class="fm-status">${esc(
    t.ready
  )}</p><noscript><p>${esc(t.noJS)}</p></noscript></section>
  <div id="fm-results" hidden><section class="fm-section" aria-labelledby="fm-results-title"><div class="fm-section-heading"><div><p class="fm-eyebrow">${esc(
    t.results
  )}</p><h2 id="fm-results-title">${esc(t.resultsTitle)}</h2></div><p>${esc(
    t.resultsIntro
  )}</p></div><p class="fm-state-label">${esc(
    t.preparedLabel
  )}</p><div class="fm-brief-grid"><article class="fm-card"><h3>${esc(
    t.brief
  )}</h3><pre id="fm-brief-output" class="fm-brief-text" tabindex="0"></pre></article><aside class="fm-start-desk"><div class="fm-orbit" aria-hidden="true">Ω</div><h3>${esc(
    t.openDesk
  )}</h3><p>${esc(
    t.workspaceHelp
  )}</p><a id="fm-public-desk" class="fm-button fm-primary" href="${base}successor/mission/desk/${
    language === 'fr' ? 'fr/' : ''
  }" target="_blank" rel="noopener noreferrer">${esc(
    t.openDesk
  )} ↗</a><p id="fm-desk-link-status" class="fm-help"></p></aside></div><div class="fm-grid-two"><article class="fm-card"><p class="fm-eyebrow">01 / COMPUTER USE</p><h3>${esc(
    t.workTitle
  )}</h3><p>${esc(t.workHelp)}</p><label for="fm-work-prompt">${esc(
    t.workPrompt
  )}</label><textarea id="fm-work-prompt" rows="10" readonly></textarea><div class="fm-actions">${button(
    'copy-work',
    t.copy
  )}</div></article><article class="fm-card"><p class="fm-eyebrow">02 / ALPHA COMPUTER TASK</p><h3>${esc(
    t.alphaTitle
  )}</h3><p>${esc(t.alphaHelp)}</p><div class="fm-actions">${button(
    'download-task',
    t.task,
    'primary'
  )}${button(
    'download-desk',
    t.desk
  )}</div><a class="fm-inline-link" href="https://github.com/MontrealAI/AGIJobsv0/blob/${esc(
    revision
  )}/docs/successor/COMPUTER_USE_LEVELS.md">${esc(
    t.runtimeGuide
  )} →</a><p class="fm-help">${esc(
    t.boundary
  )}</p></article></div></section><section class="fm-section fm-retain" aria-labelledby="fm-retain-title"><div><p class="fm-eyebrow">SUCCESSOR Ω</p><h2 id="fm-retain-title">${esc(
    t.retainTitle
  )}</h2><p>${esc(t.retainHelp)}</p></div><div class="fm-actions">${button(
    'download-brief',
    t.downloadBrief
  )}${button(
    'download-mission',
    t.downloadMission,
    'primary'
  )}</div></section><details class="fm-detail"><summary>JSON · ${esc(
    t.brief
  )}</summary><pre tabindex="0"><code id="fm-mission-json">{}</code></pre></details></div>
  <section class="fm-restore"><label class="fm-file" for="fm-import">${esc(
    t.importLabel
  )}<input type="file" id="fm-import" accept=".json,application/json"></label><p class="fm-help">${esc(
    t.importHelp
  )}</p><p id="fm-imported-workspace" class="fm-help" hidden></p></section><aside class="fm-boundary"><p>${esc(
    t.boundary
  )}</p></aside><details class="fm-supporting"><summary>${esc(
    t.supporting
  )}</summary><div class="fm-supporting-links"><a href="https://github.com/MontrealAI/AGIJobsv0/blob/${esc(
    revision
  )}/docs/successor/MISSION_STUDIO.md">${esc(
    t.guide
  )} →</a><a href="${base}successor/research/${
    language === 'fr' ? 'fr/' : ''
  }">${esc(t.sourceLab)} →</a><a href="${base}successor/computer/${
    language === 'fr' ? 'fr/' : ''
  }">${esc(t.computerLab)} →</a><a href="${base}successor/alpha/">${esc(
    t.alphaLab
  )} →</a></div></details></main>`;
}

export function renderFrontierDesk(base, revision, language = 'en') {
  return `<main id="main" class="section-wrap fm-page fm-desk-page" data-frontier-desk-page data-language="${
    language === 'fr' ? 'fr' : 'en'
  }" data-base="${esc(base)}" data-revision="${esc(
    revision
  )}"><link rel="stylesheet" href="${base}assets/frontier-mission.css"><script type="module" src="${base}assets/frontier-mission.js"></script><nav class="fm-topline" aria-label="${
    language === 'fr' ? 'Navigation de la mission' : 'Mission navigation'
  }"><a href="${base}successor/mission/${language === 'fr' ? 'fr/' : ''}">← ${
    language === 'fr' ? 'Studio de mission' : 'Mission Studio'
  }</a><div><a href="${base}successor/mission/desk/" lang="en">English</a><a href="${base}successor/mission/desk/fr/" lang="fr">Français</a></div></nav>${renderFrontierDeskMarkup(
    null,
    { language }
  )}</main>`;
}
