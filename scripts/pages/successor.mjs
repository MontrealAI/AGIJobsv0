import { successorCopy } from '../../website/assets/successor-copy.mjs';
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );

export function renderSuccessorPage(base, revision, language = 'en') {
  if (!successorCopy[language])
    throw new Error('Unsupported SUCCESSOR language');
  const t = successorCopy[language];
  const panel = (id, title, explanation, content) =>
    `<section id="omega-${id}" class="omega-panel" aria-labelledby="omega-${id}-title"><p class="eyebrow">${esc(
      id.toUpperCase()
    )}</p><h2 id="omega-${id}-title">${esc(
      title
    )}</h2><p class="omega-muted">${esc(explanation)}</p>${content}</section>`;
  const empty = (id) =>
    `<div id="omega-${id}-content" class="omega-output"><p>${esc(
      t.report
    )}</p></div>`;
  return `<main id="main" class="section-wrap omega-page" lang="${language}" data-successor data-language="${language}" data-revision="${esc(
    revision
  )}">
    <link rel="stylesheet" href="${base}assets/successor.css"><script type="module" src="${base}assets/successor.js"></script>
    <nav class="omega-language" aria-label="${esc(
      t.language
    )}"><a href="${base}successor/" lang="en" hreflang="en"${
    language === 'en' ? ' aria-current="page"' : ''
  }>English</a><a href="${base}successor/fr/" lang="fr" hreflang="fr"${
    language === 'fr' ? ' aria-current="page"' : ''
  }>Français</a></nav>
    <section class="omega-hero"><div><p class="eyebrow">${esc(
      t.kicker
    )}</p><h1>${t.title
    .split('\n')
    .map(esc)
    .join('<br>')}</h1><p class="omega-lead">${esc(
    t.intro
  )}</p><p class="omega-badge">${esc(
    t.scope
  )}</p><a class="button primary" href="#omega-mission">${esc(
    t.chooseTitle
  )} ↓</a></div><div class="omega-emblem" aria-hidden="true"><span>Ω</span><small>MISSION · EVIDENCE · MEMORY</small></div></section>
    <p class="omega-boundary">${esc(t.boundary)}</p>
    <section id="omega-mission" class="omega-panel" aria-labelledby="omega-mission-title"><p class="eyebrow">${esc(
      t.choose
    )}</p><h2 id="omega-mission-title">${esc(
    t.chooseTitle
  )}</h2><div class="omega-missions">${['invoice', 'world', 'resources']
    .map(
      (id, i) =>
        `<article><span class="omega-number">0${i + 1}</span><h3>${esc(
          t[id]
        )}</h3><p>${esc(
          t[id + 'Desc']
        )}</p><button type="button" class="text-button" data-omega-mission="${id}" aria-pressed="${
          id === 'invoice'
        }">${esc(t[id])} →</button></article>`
    )
    .join('')}</div>
      <div class="omega-mission-grid"><form id="omega-form"><label for="omega-select">${esc(
        t.missionLabel
      )}</label><select id="omega-select">${['invoice', 'world', 'resources']
    .map((id) => `<option value="${id}">${esc(t[id])}</option>`)
    .join(
      ''
    )}</select><div id="omega-probability-field" hidden><label for="omega-probability">${esc(
    t.probability
  )}</label><input id="omega-probability" type="number" min="0.05" max="0.95" step="0.05" value="0.5" aria-describedby="omega-probability-help"><p id="omega-probability-help" class="omega-muted">${esc(
    t.probabilityHelp
  )}</p></div><button id="omega-run" type="submit" class="button primary" disabled>${esc(
    t.run
  )} →</button><button id="omega-stop" type="button" class="text-button" disabled>${esc(
    t.stopped
  )}</button></form><details class="omega-constitution" open><summary>${esc(
    t.scopeTitle
  )}</summary><dl><div><dt>${esc(t.owner)}</dt><dd>${esc(
    t.ownerValue
  )}</dd></div><div><dt>${esc(t.outcome)}</dt><dd id="omega-outcome">${esc(
    t.invoiceOutcome
  )}</dd></div><div><dt>${esc(
    t.alternative
  )}</dt><dd id="omega-alternative">${esc(
    t.invoiceAlternative
  )}</dd></div><div><dt>${esc(t.rights)}</dt><dd>${esc(
    t.rightsValue
  )}</dd></div><div><dt>${esc(t.limits)}</dt><dd>${esc(
    t.limitsValue
  )}</dd></div></dl><details><summary>${esc(
    t.exact
  )}</summary><pre tabindex="0" aria-label="${esc(
    t.scopeTitle
  )}"><code id="omega-constitution-json">{}</code></pre></details></details></div>
      <p id="omega-status" class="omega-status" role="status" tabindex="-1">${esc(
        t.ready
      )}</p><noscript><p class="notice">JavaScript / JavaScript requis : <code>npm run successor:demo</code>.</p></noscript>
    </section>
    <aside class="omega-overview" aria-label="${esc(
      t.overview
    )}"><p class="eyebrow">${esc(t.overview)}</p><dl>${[
    ['serving', revision.slice(0, 8)],
    ['candidate', t.noCandidate],
    ['proof', t.absent],
    ['authority', t.noAuthority],
    ['advantage', t.noAdvantage],
    ['budget', '—'],
    ['rollback', t.noRollback],
    ['next', t.nextDefault],
  ]
    .map(
      ([key, value]) =>
        `<div><dt>${esc(t[key])}</dt><dd id="omega-state-${key}">${esc(
          value
        )}</dd></div>`
    )
    .join('')}</dl></aside>
    <nav class="omega-view-nav" aria-label="${esc(t.views)}">${[
    ['world', 'understanding'],
    ['policy', 'policy'],
    ['jobs', 'jobs'],
    ['comparison', 'comparison'],
    ['authority', 'admission'],
    ['chronicle', 'chronicle'],
  ]
    .map(([id, key]) => `<a href="#omega-${id}">${esc(t[key])}</a>`)
    .join('')}</nav>
    <div class="omega-inspection-grid">${panel(
      'world',
      t.understanding,
      t.worldExplanation,
      empty('world')
    )}${panel('policy', t.policy, t.policyExplanation, empty('policy'))}</div>
    ${panel('jobs', t.jobs, t.jobsExplanation, empty('jobs'))}
    ${panel(
      'comparison',
      t.comparison,
      t.comparisonExplanation,
      empty('comparison') +
        `<details><summary>${esc(
          t.exact
        )}</summary><pre tabindex="0" aria-label="${esc(
          t.exact
        )}"><code id="omega-report-json">{}</code></pre></details><div class="omega-actions"><button id="omega-freeze" class="button secondary" type="button" disabled>${esc(
          t.freeze
        )}</button></div><p class="omega-muted">${esc(t.freezeHelp)}</p>`
    )}
    ${panel(
      'authority',
      t.admission,
      t.admissionHelp,
      `<p class="omega-denial">${esc(
        t.noAuthority
      )}</p><div class="omega-actions"><button id="omega-review" class="button secondary" type="button" disabled>${esc(
        t.evaluate
      )}</button><button id="omega-impair" class="text-button" type="button" disabled>${esc(
        t.impair
      )}</button></div><details><summary>${esc(
        t.inspect
      )}</summary><pre tabindex="0" aria-label="${esc(
        t.inspect
      )}"><code id="omega-freeze-json">{}</code></pre></details>`
    )}
    ${panel(
      'chronicle',
      t.ownership,
      t.ownershipHelp,
      `<div class="omega-actions"><button id="omega-export" class="button secondary" type="button" disabled>${esc(
        t.export
      )} ↓</button></div><label for="omega-restore">${esc(
        t.restore
      )}</label><input id="omega-restore" type="file" accept="application/json,.json"><button id="omega-descendant" class="text-button" type="button" disabled>${esc(
        t.descendant
      )}</button><details><summary>${esc(
        t.packDetails
      )}</summary><pre tabindex="0" aria-label="${esc(
        t.packDetails
      )}"><code id="omega-pack-json">{}</code></pre></details><ol id="omega-events" tabindex="0" aria-label="${esc(
        t.chronicle
      )}"><li>${esc(t.noEvents)}</li></ol><p class="omega-muted">${esc(
        t.eventDisclaimer
      )}</p>`
    )}
    <section class="omega-panel omega-local" aria-labelledby="omega-local-title"><p class="eyebrow">${esc(
      t.local
    )}</p><h2 id="omega-local-title">${esc(t.localTitle)}</h2><p>${esc(
    t.localHelp
  )}</p><pre tabindex="0" aria-label="Local CLI"><code>npm run successor:demo\nnpm run successor:test\nnpm run successor:verify</code></pre><a class="text-link" href="https://github.com/MontrealAI/AGIJobsv0/tree/${esc(
    revision
  )}/packages/successor-core">${esc(
    t.source
  )} ↗</a><a class="text-link" href="https://github.com/MontrealAI/AGIJobsv0/blob/${esc(
    revision
  )}/docs/successor/README.md">${esc(t.learn)} ↗</a></section>
    <section class="omega-panel" aria-labelledby="omega-glossary-title"><h2 id="omega-glossary-title">${esc(
      t.glossary
    )}</h2><div class="omega-glossary"><p>${esc(t.beta)}</p><p>${esc(
    t.gym
  )}</p><p>${esc(t.admissionDefinition)}</p><p>${esc(
    t.memory
  )}</p></div></section>
  </main>`;
}
