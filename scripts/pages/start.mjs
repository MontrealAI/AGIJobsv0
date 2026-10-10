const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );

const copy = {
  en: {
    title: 'Start here',
    home: 'AGI Jobs home',
    skip: 'Skip to the guide',
    language: 'Language',
    larger: 'Larger text',
    eyebrow: 'USEFUL WORK. PLANETARY AMBITION.',
    heading: 'A big idea.<br><em>A simple first step.</em>',
    intro:
      'Tell us what you want to do. We’ll help you find your way, one step at a time.',
    welcome: 'No technical experience needed.',
    free: 'Free guided preview',
    account: 'No account or wallet needed',
    preview:
      'Explore and prepare here. Posting jobs, running agents and payments require a separately configured service.',
    steps: ['Choose', 'Prepare', 'Next step'],
    stepLabel: 'Your progress',
    step: 'Step',
    of: 'of',
    choose: 'What would you like to do?',
    chooseHelp: 'Choose the option that sounds most like you.',
    roles: [
      [
        'buyer',
        'I need work done',
        'Turn an idea into a clear job brief.',
        '01',
      ],
      [
        'worker',
        'I want to do work',
        'Learn how to connect an AI agent.',
        '02',
      ],
      [
        'reviewer',
        'I want to review work',
        'Check a delivery against what was requested.',
        '03',
      ],
      [
        'explorer',
        'I’m just exploring',
        'See how it works with a simple example.',
        '04',
      ],
    ],
    chooseError: 'Choose one of the four options to continue.',
    next: 'Continue',
    back: 'Back',
    restart: 'Start again',
    prepare: 'Let’s make it concrete.',
    prepareHelp: 'A small, clear starting point makes the next step easier.',
    goalLabel: 'What would you like done?',
    goalHelp:
      'One or two sentences are enough. Use public information only; leave out private details.',
    goalPlaceholder:
      'For example: Compare three public software tools and explain their differences.',
    examples: 'Need an idea? Choose an example to fill in the box.',
    presets: [
      [
        'research',
        'Compare information',
        'Compare three public software tools. Deliver a table of their features, links to the original sources, and a short explanation of the differences.',
      ],
      [
        'feature',
        'Improve a website',
        'Improve the navigation of a public website so people can find its main pages on a phone. Deliver the code changes and a short guide to checking them.',
      ],
      [
        'tests',
        'Check software',
        'Test the main features of a public software project. Deliver repeatable tests, the results, and clear steps to reproduce any problems.',
      ],
    ],
    goalError:
      'Please describe the work in at least 10 characters. You can also choose an example.',
    selected: 'Example added. You can edit it in the box below.',
    workerTitle: 'Your agent needs a clear assignment.',
    workerItems: [
      'Start with the local setup guide and a practice job.',
      'Give the agent only the tools, files and limits that job needs.',
      'Deliver the finished work and the evidence a reviewer can check.',
    ],
    workerNote:
      'Connecting a real worker needs technical setup. The next step explains the supported routes. This guide does not register an agent or promise earnings.',
    reviewerTitle: 'Good work should be easy to check.',
    reviewerItems: [
      'Read the original task and its acceptance criteria.',
      'Compare the delivered files and evidence with that task.',
      'Record what passed, what failed and what is still unknown.',
    ],
    reviewerNote:
      'The browser reviewer checks local files and records your findings. It does not approve a payment. An operator supplies the task and delivery files.',
    explorerTitle: 'Imagine a simple comparison job.',
    explorerItems: [
      'You ask for a comparison of three public software tools.',
      'An agent delivers a comparison table with source links.',
      'A reviewer checks the facts against the original sources.',
    ],
    explorerNote:
      'Clear request → useful delivery → independent review. Try a browser example next, with no installation or money involved.',
    ready: 'Your next step is ready.',
    readyHelp: 'You can come back to this guide whenever you need it.',
    brief: 'YOUR JOB BRIEF',
    buyerTitle: 'A useful job starts with a clear request.',
    buyerNote:
      'Your draft is ready to refine. Next, add the source links, decide how the result will be checked, and set a budget with your operator.',
    buyerAction: 'Continue to the job planner',
    download: 'Save my editable draft',
    handoffNote:
      'Continuing carries your draft in this browser tab and clears the transfer after opening. Save a copy if you want to keep it.',
    workerAction: 'Open the worker setup guide',
    reviewerAction: 'Open the evidence reviewer',
    explorerAction: 'Try the job walkthrough',
    workerReady: 'Start with a practice assignment.',
    reviewerReady: 'Bring the task and its delivery files.',
    explorerReady: 'Watch a job move from request to review.',
    toolsLanguage:
      'The detailed tools and technical guides are currently in English.',
    draftSaved:
      'Editable draft saved. Open it in the job planner to continue later.',
    storageError:
      'Your browser cannot carry this draft to the next page. Save the editable draft, then open it using “Open saved editable draft” in the planner.',
    openPlanner: 'Open the planner',
    privacy:
      'Your words stay on your device. This guide has no uploads, trackers or sign-up form.',
    simple: 'A clear path from idea to outcome.',
    how: [
      [
        'Describe the work',
        'Say what you need and what a good result looks like.',
      ],
      [
        'Check the delivery',
        'Review the files, sources and results against your request.',
      ],
      [
        'Decide what happens next',
        'Accept the work or ask for changes through your configured service.',
      ],
    ],
    faq: 'A little help, if you need it.',
    questions: [
      [
        'Do I need to know about AI or cryptocurrency?',
        'No. You can explore this guide and prepare a draft without either. The detailed setup guides explain what a live service needs.',
      ],
      [
        'Will clicking Continue spend money?',
        'No. This guide does not connect a wallet, post a job, hire a worker or make a payment. Any live service needs separate setup and approval.',
      ],
      [
        'What kind of work is a good starting point?',
        'A small task with public or synthetic inputs and a result someone can check: compare public information, improve an open-source website, or test software.',
      ],
      [
        'Can I come back later?',
        'Yes. On the final step of the job-request path, choose “Save my editable draft”. Open that file in the job planner later. Refreshing this guide clears unsaved text.',
      ],
      [
        'Where can I get more help?',
        'Open the setup guide or current readiness record below. The complete demo collection remains available from the home page.',
      ],
    ],
    nojs: 'The guided steps need JavaScript. You can still choose a destination below and read the explanations on this page.',
    direct: 'Choose a destination',
    docs: 'Setup guide',
    readiness: 'Current readiness',
    collection: 'Explore all demos',
    source: 'Source code',
    footer: 'Useful work, one clear step at a time.',
  },
  fr: {
    title: 'Commencer',
    home: 'Accueil AGI Jobs',
    skip: 'Aller au guide',
    language: 'Langue',
    larger: 'Texte plus grand',
    eyebrow: 'DU TRAVAIL UTILE. UNE AMBITION PLANÉTAIRE.',
    heading: 'Une grande idée.<br><em>Un premier pas simple.</em>',
    intro:
      'Dites-nous ce que vous voulez faire. Nous vous guiderons, une étape à la fois.',
    welcome: 'Aucune expérience technique nécessaire.',
    free: 'Guide gratuit',
    account: 'Sans compte ni portefeuille',
    preview:
      'Explorez et préparez votre projet ici. Publier un travail, lancer un agent et effectuer un paiement exigent un service configuré séparément.',
    steps: ['Choisir', 'Préparer', 'Prochaine étape'],
    stepLabel: 'Votre progression',
    step: 'Étape',
    of: 'sur',
    choose: 'Que souhaitez-vous faire?',
    chooseHelp: 'Choisissez l’option qui vous correspond.',
    roles: [
      [
        'buyer',
        'J’ai un travail à faire réaliser',
        'Transformer une idée en demande claire.',
        '01',
      ],
      [
        'worker',
        'Je veux réaliser du travail',
        'Apprendre à connecter un agent IA.',
        '02',
      ],
      [
        'reviewer',
        'Je veux vérifier un résultat',
        'Comparer une livraison à la demande.',
        '03',
      ],
      [
        'explorer',
        'Je veux simplement découvrir',
        'Comprendre à l’aide d’un exemple simple.',
        '04',
      ],
    ],
    chooseError: 'Choisissez une des quatre options pour continuer.',
    next: 'Continuer',
    back: 'Retour',
    restart: 'Recommencer',
    prepare: 'Passons au concret.',
    prepareHelp: 'Un objectif simple et précis facilite la suite.',
    goalLabel: 'Quel travail souhaitez-vous faire réaliser?',
    goalHelp:
      'Une ou deux phrases suffisent. Utilisez uniquement des informations publiques, sans détails privés.',
    goalPlaceholder:
      'Par exemple : comparer trois logiciels publics et expliquer leurs différences.',
    examples: 'Besoin d’une idée? Choisissez un exemple pour remplir le champ.',
    presets: [
      [
        'research',
        'Comparer des informations',
        'Comparer trois logiciels publics. Livrer un tableau de leurs fonctions, les liens vers les sources originales et une courte explication des différences.',
      ],
      [
        'feature',
        'Améliorer un site web',
        'Améliorer la navigation d’un site web public pour retrouver ses pages principales sur un téléphone. Livrer les modifications du code et un court guide pour les vérifier.',
      ],
      [
        'tests',
        'Vérifier un logiciel',
        'Tester les fonctions principales d’un logiciel public. Livrer des tests reproductibles, les résultats et les étapes permettant de reproduire les problèmes.',
      ],
    ],
    goalError:
      'Décrivez le travail en au moins 10 caractères. Vous pouvez aussi choisir un exemple.',
    selected:
      'Exemple ajouté. Vous pouvez le modifier dans le champ ci-dessous.',
    workerTitle: 'Votre agent a besoin d’une mission claire.',
    workerItems: [
      'Commencez par le guide de configuration et un travail d’essai.',
      'Donnez à l’agent les outils, les fichiers et les limites nécessaires à ce travail.',
      'Livrez le résultat et les éléments qu’une autre personne pourra vérifier.',
    ],
    workerNote:
      'Connecter un véritable agent exige une configuration technique. Le guide suivant explique les options prises en charge. Cette page n’inscrit aucun agent et ne promet aucun revenu.',
    reviewerTitle: 'Un bon travail doit pouvoir se vérifier.',
    reviewerItems: [
      'Lisez la demande originale et ses critères d’acceptation.',
      'Comparez les fichiers livrés et les preuves à cette demande.',
      'Notez ce qui réussit, ce qui échoue et ce qui reste inconnu.',
    ],
    reviewerNote:
      'L’outil de vérification lit des fichiers locaux et consigne vos conclusions. Il n’autorise aucun paiement. Un opérateur fournit la demande et les fichiers livrés.',
    explorerTitle: 'Imaginez un simple travail de comparaison.',
    explorerItems: [
      'Vous demandez une comparaison de trois logiciels publics.',
      'Un agent livre un tableau comparatif avec les liens vers ses sources.',
      'Une autre personne vérifie les faits dans les sources originales.',
    ],
    explorerNote:
      'Demande claire → livraison utile → vérification indépendante. Essayez ensuite un exemple dans votre navigateur, sans installation ni paiement.',
    ready: 'Votre prochaine étape est prête.',
    readyHelp: 'Vous pouvez revenir à ce guide quand vous le souhaitez.',
    brief: 'VOTRE DEMANDE',
    buyerTitle: 'Un travail utile commence par une demande claire.',
    buyerNote:
      'Votre brouillon est prêt à être précisé. Ajoutez ensuite les sources, les critères de vérification et un budget avec votre opérateur.',
    buyerAction: 'Ouvrir le planificateur de travail',
    download: 'Enregistrer mon brouillon modifiable',
    handoffNote:
      'Votre brouillon passe au planificateur dans cet onglet. Le transfert est effacé à l’ouverture. Enregistrez une copie pour le conserver.',
    workerAction: 'Ouvrir le guide des agents',
    reviewerAction: 'Ouvrir l’outil de vérification',
    explorerAction: 'Essayer le parcours d’un travail',
    workerReady: 'Commencez par un travail d’essai.',
    reviewerReady: 'Préparez la demande et les fichiers livrés.',
    explorerReady: 'Suivez un travail, de la demande à la vérification.',
    toolsLanguage:
      'Les outils détaillés et les guides techniques sont actuellement en anglais.',
    draftSaved:
      'Brouillon modifiable enregistré. Ouvrez-le dans le planificateur pour continuer plus tard.',
    storageError:
      'Votre navigateur ne peut pas transférer le brouillon. Enregistrez-le, puis utilisez « Open saved editable draft » dans le planificateur pour l’ouvrir.',
    openPlanner: 'Ouvrir le planificateur',
    privacy:
      'Votre texte reste sur votre appareil. Ce guide ne transmet aucun fichier et ne contient ni traceur ni formulaire d’inscription.',
    simple: 'De l’idée au résultat, en toute clarté.',
    how: [
      [
        'Décrivez le travail',
        'Expliquez votre besoin et ce qui constituerait un bon résultat.',
      ],
      [
        'Vérifiez la livraison',
        'Comparez les fichiers, les sources et les résultats à votre demande.',
      ],
      [
        'Décidez de la suite',
        'Acceptez le travail ou demandez des modifications dans votre service configuré.',
      ],
    ],
    faq: 'Un peu d’aide, au besoin.',
    questions: [
      [
        'Dois-je connaître l’IA ou les cryptomonnaies?',
        'Non. Ce guide permet de découvrir le fonctionnement et de préparer un brouillon sans ces connaissances. Les guides techniques expliquent les exigences d’un service réel.',
      ],
      [
        'Le bouton Continuer dépense-t-il de l’argent?',
        'Non. Ce guide ne connecte aucun portefeuille, ne publie aucun travail, n’engage aucun agent et n’effectue aucun paiement. Un service réel exige une configuration et une approbation distinctes.',
      ],
      [
        'Par quel travail commencer?',
        'Choisissez une petite tâche utilisant des données publiques ou synthétiques, avec un résultat vérifiable : comparer des informations, améliorer un site ouvert ou tester un logiciel.',
      ],
      [
        'Puis-je continuer plus tard?',
        'Oui. À la dernière étape du parcours de demande, choisissez « Enregistrer mon brouillon modifiable ». Ouvrez ce fichier dans le planificateur plus tard. Actualiser ce guide efface le texte non enregistré.',
      ],
      [
        'Où trouver plus d’aide?',
        'Ouvrez le guide de configuration ou le bilan de préparation ci-dessous. La collection complète des démonstrations reste accessible depuis l’accueil.',
      ],
    ],
    nojs: 'Le parcours guidé nécessite JavaScript. Vous pouvez choisir une destination ci-dessous et lire les explications de cette page.',
    direct: 'Choisir une destination',
    docs: 'Guide de configuration',
    readiness: 'Bilan de préparation',
    collection: 'Toutes les démonstrations',
    source: 'Code source',
    footer: 'Du travail utile, une étape claire à la fois.',
  },
};

export function renderStartPage({ base, guide, revision, lang = 'en' }) {
  const t = copy[lang];
  if (!t) throw new Error('Unsupported onboarding language');
  const routes = {
    buyer: base + 'work/',
    worker: guide('docs/computer-work.md'),
    reviewer: base + 'review/',
    explorer: base + '#walkthrough',
  };
  const action = (role) => t[role + 'Action'];
  const list = (items) =>
    `<ol class="simple-list">${items
      .map((s) => `<li>${escape(s)}</li>`)
      .join('')}</ol>`;
  const direct = `<nav class="direct-links" aria-label="${
    t.direct
  }">${Object.entries(routes)
    .map(([role, href]) => `<a href="${href}">${escape(action(role))} →</a>`)
    .join('')}</nav>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#211039"><meta name="description" content="${escape(
    t.intro
  )}"><meta name="referrer" content="strict-origin-when-cross-origin"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${
    t.title
  } · AGI Jobs</title><link rel="canonical" href="https://montrealai.github.io${base}start/${
    lang === 'fr' ? 'fr/' : ''
  }"><link rel="alternate" hreflang="en" href="https://montrealai.github.io${base}start/"><link rel="alternate" hreflang="fr" href="https://montrealai.github.io${base}start/fr/"><link rel="icon" href="${base}assets/favicon.svg"><link rel="stylesheet" href="${base}assets/start.css"><script type="module" src="${base}assets/start.js"></script></head>
  <body data-base="${base}"><a class="skip-link" href="#guide">${
    t.skip
  }</a><header class="header wrap"><a class="brand" href="${base}" aria-label="${
    t.home
  }"><span class="brand-symbol" aria-hidden="true">✦</span> AGI <strong>JOBS</strong></a><div class="preferences"><button id="large-text" type="button" aria-pressed="false" hidden><span aria-hidden="true">A<span class="big-a">A</span></span> ${
    t.larger
  }</button><nav aria-label="${
    t.language
  }"><a href="${base}start/" lang="en" hreflang="en" ${
    lang === 'en' ? 'aria-current="page"' : ''
  }>English</a><span aria-hidden="true">/</span><a href="${base}start/fr/" lang="fr" hreflang="fr" ${
    lang === 'fr' ? 'aria-current="page"' : ''
  }>Français</a></nav></div></header>
  <main id="main" class="wrap"><section class="welcome"><div class="welcome-copy"><p class="eyebrow">${
    t.eyebrow
  }</p><h1>${t.heading}</h1><p class="intro">${
    t.intro
  }</p><p class="welcome-note">${
    t.welcome
  }</p><div class="trust"><span><i aria-hidden="true">✓</i>${
    t.free
  }</span><span><i aria-hidden="true">✓</i>${
    t.account
  }</span></div><div class="constellation" aria-hidden="true"><span class="orb orb-one"></span><span class="orb orb-two"></span><span class="orb orb-three"></span><span class="orbit"></span><span class="orbit tilted"></span><span class="core">✦</span><span class="star star-one">✧</span><span class="star star-two">✧</span></div><p class="scope-note">${
    t.preview
  }</p></div>
  <div id="guide" class="guide" tabindex="-1"><div id="guide-fallback"><h2>${
    t.direct
  }</h2><p>${t.nojs}</p>${direct}<p>${t.toolsLanguage}</p></div>
  <div id="wizard" hidden data-role-error="${escape(
    t.chooseError
  )}" data-goal-error="${escape(t.goalError)}" data-example-status="${escape(
    t.selected
  )}" data-saved-status="${escape(t.draftSaved)}" data-transfer-error="${escape(
    t.storageError
  )}">
    <ol class="progress" aria-label="${t.stepLabel}">${t.steps
    .map(
      (s, i) =>
        `<li data-progress="${i}"><span aria-hidden="true">${
          i + 1
        }</span><span>${s}</span></li>`
    )
    .join('')}</ol>
    <section data-step="0"><p class="step-count">${t.step} 1 ${
    t.of
  } 3</p><h2 tabindex="-1">${t.choose}</h2><p class="step-help">${
    t.chooseHelp
  }</p><fieldset class="choices"><legend class="sr-only">${
    t.choose
  }</legend>${t.roles
    .map(
      ([id, title, subtitle]) =>
        `<label class="choice"><input type="radio" name="role" value="${id}"><span><strong>${escape(
          title
        )}</strong><small>${escape(
          subtitle
        )}</small></span><span class="choice-arrow" aria-hidden="true">↗</span></label>`
    )
    .join('')}</fieldset></section>
    <section data-step="1" hidden><p class="step-count">${t.step} 2 ${
    t.of
  } 3</p><h2 tabindex="-1">${t.prepare}</h2><p class="step-help">${
    t.prepareHelp
  }</p><div data-detail="buyer" hidden><p class="example-label">${
    t.examples
  }</p><div class="examples">${t.presets
    .map(
      ([id, title, goal]) =>
        `<button type="button" data-preset="${id}" data-goal="${escape(
          goal
        )}">${escape(title)}</button>`
    )
    .join('')}</div><label class="field-label" for="start-goal">${
    t.goalLabel
  }</label><textarea id="start-goal" rows="5" maxlength="2000" aria-describedby="goal-help guide-status" placeholder="${escape(
    t.goalPlaceholder
  )}"></textarea><p id="goal-help" class="field-help">${t.goalHelp}</p></div>${[
    'worker',
    'reviewer',
    'explorer',
  ]
    .map(
      (r) =>
        `<div data-detail="${r}" hidden><h3>${t[r + 'Title']}</h3>${list(
          t[r + 'Items']
        )}<p class="note">${t[r + 'Note']}</p></div>`
    )
    .join('')}</section>
    <section data-step="2" hidden><p class="step-count">${t.step} 3 ${
    t.of
  } 3</p><h2 tabindex="-1">${t.ready}</h2><p class="step-help">${
    t.readyHelp
  }</p><div data-result="buyer" hidden><div class="brief"><p class="eyebrow">${
    t.brief
  }</p><p id="goal-summary"></p></div><p>${
    t.buyerNote
  }</p><a class="button primary" id="planner-handoff" href="${
    routes.buyer
  }#from-start">${
    t.buyerAction
  } <span aria-hidden="true">→</span></a><button class="button secondary" id="save-start-draft" type="button">${
    t.download
  } <span aria-hidden="true">↓</span></button><p class="field-help">${
    t.handoffNote
  }</p><a id="planner-fallback" href="${routes.buyer}" hidden>${
    t.openPlanner
  } →</a></div>${['worker', 'reviewer', 'explorer']
    .map(
      (r) =>
        `<div data-result="${r}" hidden><div class="ready-icon" aria-hidden="true">✓</div><h3>${
          t[r + 'Ready']
        }</h3><p>${t[r + 'Note']}</p><a class="button primary" href="${
          routes[r]
        }">${action(r)} <span aria-hidden="true">→</span></a></div>`
    )
    .join('')}<p class="field-help">${t.toolsLanguage}</p></section>
    <p id="guide-status" role="status" tabindex="-1"></p><div class="wizard-actions"><button type="button" class="button secondary" id="guide-back" hidden>← ${
      t.back
    }</button><button type="button" class="button primary" id="guide-next">${
    t.next
  } <span aria-hidden="true">→</span></button><button type="button" class="text-button" id="guide-restart" hidden>${
    t.restart
  }</button></div>
  </div><p class="privacy"><span aria-hidden="true">◇</span> ${
    t.privacy
  }</p></div></section>
  <section class="how" aria-labelledby="how-title"><p class="eyebrow">AGI JOBS</p><h2 id="how-title">${
    t.simple
  }</h2><div class="how-grid">${t.how
    .map(
      ([title, body], i) =>
        `<article><span class="how-number">0${
          i + 1
        }</span><h3>${title}</h3><p>${body}</p></article>`
    )
    .join('')}</div></section>
  <section class="faq" aria-labelledby="faq-title"><h2 id="faq-title">${
    t.faq
  }</h2>${t.questions
    .map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`)
    .join('')}</section>
  </main><footer class="wrap footer"><p>✦ AGI JOBS <span>${
    t.footer
  }</span></p><nav aria-label="${t.direct}"><a href="${guide(
    'docs/START_HERE.md'
  )}">${t.docs} ↗</a><a href="${guide('docs/production/readiness.md')}">${
    t.readiness
  } ↗</a><a href="${base}#explore">${
    t.collection
  } ↗</a><a href="https://github.com/MontrealAI/AGIJobsv0/tree/${revision}">${
    t.source
  } ↗</a></nav></footer></body></html>`;
}
