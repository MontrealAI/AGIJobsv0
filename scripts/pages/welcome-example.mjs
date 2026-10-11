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
    title: 'Try a simple example',
    home: 'AGI Jobs home',
    skip: 'Skip to the example',
    language: 'Language',
    larger: 'Larger text',
    eyebrow: 'A LITTLE PRACTICE. A CLEARER PICTURE.',
    heading: 'See how an idea becomes <em>useful work.</em>',
    intro:
      'Help a local club make its website easier to use. Follow a request, explore a sample delivery, and try a review.',
    reassurance: 'Take your time. There is no test to pass.',
    begin: 'Start the example',
    practice: 'A fictional practice example',
    boundary:
      'Everything here was prepared in advance. No AI is running, no job is posted, and no money is spent.',
    reset:
      'Practice choices are not saved to a file or account. Your existing request in the guide stays unchanged.',
    guide: 'Prepare my own request',
    guideHelp: 'Ready for your idea? The guide helps you put it into words.',
    steps: ['Your request', 'A sample delivery', 'Your review'],
    progress: 'Explore the three steps',
    step: 'Step',
    of: 'of',
    requestTitle: 'Start with what you need.',
    requestHelp:
      'You do not need to know how to build a website. Explain the problem and what a useful result would look like.',
    youAsk: 'YOU ASK',
    request:
      '“Help people find our club’s next meeting on a phone. Make the time and place easy to read.”',
    deliverHeading: 'Ask for something you can check',
    deliverables: [
      'An updated page with a clear meeting time and place.',
      'A short explanation of what changed.',
      'A way to check that it works on a phone.',
    ],
    tip: 'A clear request gives the person or AI agent doing the work a useful starting point. An AI agent is software that can use tools to carry out a task.',
    deliveryTitle: 'Look at what changed.',
    deliveryHelp:
      'In a real job, the worker would deliver their work for review. Here, compare two prepared versions of a fictional page.',
    before: 'Original page',
    after: 'Clearer page',
    switchLabel: 'Choose a version to view',
    club: 'Neighbourhood Garden Club',
    publicPage: 'Fictional club website',
    original:
      'Welcome to our club. We share gardening ideas and enjoy growing things together. There is always something to learn, whether you have a garden or a few pots. Our next meeting is Wednesday at 10 a.m. in the community garden at 12 Garden Lane. New members are welcome. Bring your questions and come say hello.',
    invite: 'A little greener, together.',
    nextMeeting: 'Our next meeting',
    time: 'Wednesday · 10 a.m.',
    place: 'Community garden · 12 Garden Lane',
    welcome: 'New to gardening? You are welcome here.',
    changesTitle: 'What is different?',
    changes:
      'The meeting details have their own heading. Short lines and more space make the page easier to scan. The meeting time and place are unchanged.',
    reviewTitle: 'Does it meet the request?',
    reviewHelp:
      'A delivery still needs checking. Look at the clearer page again, then choose what you can confirm for yourself.',
    inspect: 'Look at the sample page again',
    checklist: 'What can you confirm?',
    questions: [
      'I can find the meeting time.',
      'I can find where the meeting is.',
      'I can read the details comfortably on my screen.',
    ],
    check: 'See my choices',
    none: 'You have not selected anything yet. Look at the sample and choose only what you can confirm. It is fine to need changes.',
    some: 'You selected {count} of 3 checks. The remaining questions still need your attention. In a real review, explain what needs to change before accepting the work.',
    all: 'You selected all 3 checks in this practice. In a real job, you would also check the actual files and agreed requirements before accepting any work.',
    changed:
      'Your choices changed. Select “See my choices” to review them again.',
    reviewBoundary:
      'These are your practice selections, not verified test results or approval of a real job.',
    nextTitle: 'Your idea can start with one sentence.',
    nextHelp:
      'The guided welcome helps you prepare and save a request. A separately configured service is needed to post jobs, run agents or make payments.',
    back: 'Back',
    next: ['See a sample delivery', 'Try reviewing it'],
    nojs: 'Read the three steps below at your own pace. The interactive version switch and review feedback require JavaScript.',
    more: 'Explore AGI Jobs',
    footer: 'Useful work, one clear step at a time.',
    source: 'Source',
  },
  fr: {
    title: 'Essayer un exemple simple',
    home: 'Accueil AGI Jobs',
    skip: 'Aller à l’exemple',
    language: 'Langue',
    larger: 'Texte plus grand',
    eyebrow: 'UN PEU DE PRATIQUE. LES IDÉES PLUS CLAIRES.',
    heading: 'Voyez comment une idée devient <em>un travail utile.</em>',
    intro:
      'Aidez un club de quartier à rendre son site plus facile à utiliser. Suivez une demande, découvrez un exemple de résultat et essayez de le vérifier.',
    reassurance: 'Prenez votre temps. Il n’y a pas d’examen à réussir.',
    begin: 'Commencer l’exemple',
    practice: 'Un exemple fictif pour s’exercer',
    boundary:
      'Tout a été préparé à l’avance. Aucune IA ne s’exécute, aucun travail n’est publié et aucun paiement n’est effectué.',
    reset:
      'Vos choix d’exercice ne sont pas enregistrés dans un fichier ou un compte. Votre demande dans le guide reste inchangée.',
    guide: 'Préparer ma propre demande',
    guideHelp: 'Prêt à décrire votre idée? Le guide vous aide à la formuler.',
    steps: ['Votre demande', 'Un exemple de résultat', 'Votre vérification'],
    progress: 'Explorer les trois étapes',
    step: 'Étape',
    of: 'sur',
    requestTitle: 'Commencez par votre besoin.',
    requestHelp:
      'Vous n’avez pas besoin de savoir créer un site. Expliquez le problème et ce que serait un résultat utile.',
    youAsk: 'VOUS DEMANDEZ',
    request:
      '« Aidez les gens à trouver notre prochaine rencontre sur un téléphone. Rendez l’heure et le lieu faciles à lire. »',
    deliverHeading: 'Demandez un résultat que vous pouvez vérifier',
    deliverables: [
      'Une page mise à jour avec l’heure et le lieu de la rencontre bien en vue.',
      'Une courte explication des changements.',
      'Une façon de vérifier le résultat sur un téléphone.',
    ],
    tip: 'Une demande claire donne un bon point de départ à la personne ou à l’agent IA qui réalise le travail. Un agent IA est un logiciel qui utilise des outils pour accomplir une tâche.',
    deliveryTitle: 'Regardez ce qui a changé.',
    deliveryHelp:
      'Dans un vrai travail, le résultat serait livré pour vérification. Ici, comparez deux versions préparées d’une page fictive.',
    before: 'Page originale',
    after: 'Page plus claire',
    switchLabel: 'Choisir une version à regarder',
    club: 'Club de jardinage du quartier',
    publicPage: 'Site fictif du club',
    original:
      'Bienvenue dans notre club. Nous partageons des idées de jardinage et le plaisir de faire pousser des plantes. Il y a toujours quelque chose à apprendre, que vous ayez un jardin ou quelques pots. Notre prochaine rencontre est mercredi à 10 h au jardin communautaire, au 12, rue du Jardin. Les nouveaux membres sont les bienvenus. Venez nous saluer et poser vos questions.',
    invite: 'Un peu plus de verdure, ensemble.',
    nextMeeting: 'Notre prochaine rencontre',
    time: 'Mercredi · 10 h',
    place: 'Jardin communautaire · 12, rue du Jardin',
    welcome: 'Vous débutez en jardinage? Vous êtes les bienvenus.',
    changesTitle: 'Quelle est la différence?',
    changes:
      'Les détails de la rencontre ont leur propre titre. Des lignes courtes et plus d’espace facilitent la lecture. L’heure et le lieu sont inchangés.',
    reviewTitle: 'Le résultat répond-il à la demande?',
    reviewHelp:
      'Un résultat livré doit encore être vérifié. Regardez la page plus claire, puis cochez ce que vous pouvez confirmer vous-même.',
    inspect: 'Revoir l’exemple de page',
    checklist: 'Que pouvez-vous confirmer?',
    questions: [
      'Je trouve l’heure de la rencontre.',
      'Je trouve le lieu de la rencontre.',
      'Je lis les détails confortablement sur mon écran.',
    ],
    check: 'Voir mes choix',
    none: 'Vous n’avez encore rien coché. Regardez l’exemple et cochez seulement ce que vous pouvez confirmer. Il est tout à fait possible de demander des changements.',
    some: 'Vous avez coché {count} critères sur 3. Les autres questions demandent encore votre attention. Dans une vraie vérification, expliquez ce qui doit changer avant d’accepter le travail.',
    all: 'Vous avez coché les 3 critères de cet exercice. Dans un vrai travail, il faudrait aussi vérifier les fichiers livrés et les exigences convenues avant d’accepter le résultat.',
    changed:
      'Vos choix ont changé. Sélectionnez « Voir mes choix » pour les revoir.',
    reviewBoundary:
      'Il s’agit de vos choix d’exercice, pas de résultats de tests vérifiés ni de l’approbation d’un vrai travail.',
    nextTitle: 'Votre idée peut commencer par une phrase.',
    nextHelp:
      'Le guide vous aide à préparer et à enregistrer une demande. Publier un travail, lancer un agent ou payer exige un service configuré séparément.',
    back: 'Retour',
    next: ['Voir un exemple de résultat', 'Essayer de le vérifier'],
    nojs: 'Lisez les trois étapes ci-dessous à votre rythme. Le changement interactif de version et les réponses à vos choix nécessitent JavaScript.',
    more: 'Explorer AGI Jobs',
    footer: 'Du travail utile, une étape claire à la fois.',
    source: 'Source',
  },
};

export function renderWelcomeExample({ base, revision, lang = 'en' }) {
  const t = copy[lang];
  if (!t) throw new Error('Unsupported example language');
  const route = (language) =>
    `${base}start/${language === 'fr' ? 'fr/' : ''}example/`;
  const start = `${base}start/${lang === 'fr' ? 'fr/' : ''}#guide`;
  const messages = Object.fromEntries(
    ['next', 'none', 'some', 'all', 'changed'].map((key) => [key, t[key]])
  );
  const sample = () =>
    `<div class="club-page"><p class="sample-label">${t.publicPage}</p><p class="club-name"><span aria-hidden="true">✿</span> ${t.club}</p><p class="club-invite">${t.invite}</p><div class="meeting"><p class="meeting-label">${t.nextMeeting}</p><p class="meeting-time">${t.time}</p><p>${t.place}</p></div><p class="club-welcome">${t.welcome}</p></div>`;
  const heading = (i, title, help) =>
    `<p class="example-count">${t.step} ${i + 1} ${
      t.of
    } 3</p><h2 tabindex="-1">${title}</h2><p class="example-help">${help}</p>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#211039"><meta name="description" content="${escape(
    t.intro
  )}"><meta name="referrer" content="strict-origin-when-cross-origin"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${
    t.title
  } · AGI Jobs</title><link rel="canonical" href="https://montrealai.github.io${route(
    lang
  )}"><link rel="alternate" hreflang="en" href="https://montrealai.github.io${route(
    'en'
  )}"><link rel="alternate" hreflang="fr" href="https://montrealai.github.io${route(
    'fr'
  )}"><link rel="icon" href="${base}assets/favicon.svg"><link rel="stylesheet" href="${base}assets/start.css"><link rel="stylesheet" href="${base}assets/welcome-example.css"><script type="module" src="${base}assets/welcome-example.js"></script></head>
  <body class="example-page"><a class="skip-link" href="#example">${
    t.skip
  }</a><header class="header wrap"><a class="brand" href="${base}" aria-label="${
    t.home
  }"><span class="brand-symbol" aria-hidden="true">✦</span> AGI <strong>JOBS</strong></a><div class="preferences"><button id="example-large-text" type="button" aria-pressed="false" hidden><span aria-hidden="true">A<span class="big-a">A</span></span> ${
    t.larger
  }</button><nav aria-label="${t.language}"><a href="${route(
    'en'
  )}" lang="en" hreflang="en" ${
    lang === 'en' ? 'aria-current="page"' : ''
  }>English</a><span aria-hidden="true">/</span><a href="${route(
    'fr'
  )}" lang="fr" hreflang="fr" ${
    lang === 'fr' ? 'aria-current="page"' : ''
  }>Français</a></nav></div></header>
  <main id="main" class="wrap example-layout"><div class="example-intro"><p class="eyebrow">${
    t.eyebrow
  }</p><h1>${t.heading}</h1><p class="intro">${
    t.intro
  }</p><p class="example-reassurance">${
    t.reassurance
  }</p><a class="begin-example button secondary" href="#example">${
    t.begin
  } <span aria-hidden="true">→</span></a><div class="practice-note"><span aria-hidden="true">✧</span><div><strong>${
    t.practice
  }</strong><p>${t.boundary}</p></div></div><div class="example-shortcut"><p>${
    t.guideHelp
  }</p><a href="${start}">${
    t.guide
  } <span aria-hidden="true">→</span></a></div></div>
  <div id="example" class="guide example-guide" tabindex="-1" data-messages="${escape(
    JSON.stringify(messages)
  )}"><nav aria-label="${t.progress}"><ol class="example-progress">${t.steps
    .map(
      (s, i) =>
        `<li><a href="#example-step-${i}" data-example-go="${i}"><span aria-hidden="true">${
          i + 1
        }</span>${s}</a></li>`
    )
    .join('')}</ol></nav><noscript><p class="example-help">${
    t.nojs
  }</p></noscript>
  <section id="example-step-0" data-example-step="0">${heading(
    0,
    t.requestTitle,
    t.requestHelp
  )}<div class="request-card"><p class="example-count">${
    t.youAsk
  }</p><blockquote>${t.request}</blockquote></div><h3 class="deliver-heading">${
    t.deliverHeading
  }</h3><ul class="delivery-list">${t.deliverables
    .map((s) => `<li>${s}</li>`)
    .join('')}</ul><p class="example-tip">${t.tip}</p></section>
  <section id="example-step-1" data-example-step="1">${heading(
    1,
    t.deliveryTitle,
    t.deliveryHelp
  )}<div id="example-versions" class="example-versions" role="group" aria-label="${
    t.switchLabel
  }" hidden><button type="button" data-example-preview="before" aria-pressed="false">${
    t.before
  }</button><button type="button" data-example-preview="after" aria-pressed="true">${
    t.after
  }</button></div><div data-example-panel="before"><p class="version-label">${
    t.before
  }</p><div class="club-page club-original"><p class="sample-label">${
    t.publicPage
  }</p><p class="club-name">${t.club}</p><p>${
    t.original
  }</p></div></div><div data-example-panel="after"><p class="version-label">${
    t.after
  }</p>${sample()}</div><div class="example-explanation"><h3>${
    t.changesTitle
  }</h3><p>${t.changes}</p></div></section>
  <section id="example-step-2" data-example-step="2">${heading(
    2,
    t.reviewTitle,
    t.reviewHelp
  )}<details class="example-inspect" open><summary>${
    t.inspect
  }</summary>${sample()}</details><fieldset class="example-checklist"><legend>${
    t.checklist
  }</legend>${t.questions
    .map(
      (q, i) =>
        `<label><input type="checkbox" id="example-check-${i}"><span>${q}</span></label>`
    )
    .join(
      ''
    )}</fieldset><button id="example-check" class="button secondary" type="button" hidden>${
    t.check
  }</button><p id="example-result" class="example-result" role="status" aria-live="polite" aria-atomic="true"></p><p class="example-tip">${
    t.reviewBoundary
  }</p><div class="example-next"><h3>${t.nextTitle}</h3><p>${
    t.nextHelp
  }</p><a class="button primary" href="${start}">${
    t.guide
  } <span aria-hidden="true">→</span></a></div></section>
  <div class="example-actions" hidden><button id="example-back" class="button secondary" type="button">${
    t.back
  }</button><button id="example-next" class="button primary" type="button">${
    t.next[0]
  } <span aria-hidden="true">→</span></button></div><p class="example-reset">${
    t.reset
  }</p></div></main>
  <footer class="footer wrap"><p>${t.footer}</p><nav><a href="${base}">${
    t.more
  }</a><a href="https://github.com/MontrealAI/AGIJobsv0/tree/${escape(
    revision
  )}">${t.source} ${escape(
    revision.slice(0, 7)
  )}</a></nav></footer></body></html>`;
}
