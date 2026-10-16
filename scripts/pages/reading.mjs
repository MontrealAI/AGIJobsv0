const articles = [
  {
    "id": "prime",
    "title": "AGIJobManagerPrime & AGIJobDiscoveryPrime",
    "url": "https://www.linkedin.com/pulse/agijobmanagerprime-agijobdiscoveryprime-vincent-boucher-itoue/",
    "guide": "docs/ECOSYSTEM.md",
    "topic": {
      "en": "Selection & settlement",
      "fr": "Sélection et règlement"
    },
    "summary": {
      "en": "Understand the historical two-layer design that separates choosing a provider from the rules for delivering and settling the job.",
      "fr": "Comprenez la conception historique à deux couches qui distingue le choix d’un prestataire des règles de livraison et de règlement."
    }
  },
  {
    "id": "talent",
    "title": "Proof of Talent",
    "url": "https://www.linkedin.com/pulse/proof-talent-vincent-boucher-eztke/",
    "guide": "docs/production/readiness.md",
    "topic": {
      "en": "Trials & demonstrated ability",
      "fr": "Essais et capacité démontrée"
    },
    "summary": {
      "en": "Explore funded trials, candidate commitments and explicit judging before awarding the larger assignment.",
      "fr": "Explorez les essais financés, les engagements des candidats et une évaluation explicite avant l’attribution de la mission principale."
    }
  },
  {
    "id": "invention",
    "title": "The Invention Market",
    "url": "https://www.linkedin.com/pulse/invention-market-vincent-boucher-qfhke/",
    "guide": "docs/successor/BUILD_YOUR_OMEGA.md",
    "topic": {
      "en": "Discovery & invention",
      "fr": "Découverte et invention"
    },
    "summary": {
      "en": "Explore a market that allocates problems to capable solvers, pays for discernment and remembers what the work establishes.",
      "fr": "Explorez un marché qui confie les problèmes aux prestataires compétents, finance le discernement et conserve les acquis du travail."
    }
  },
  {
    "id": "sun",
    "title": "THE MACHINE THAT BOUGHT THE SUN",
    "url": "https://www.linkedin.com/pulse/machine-bought-sun-vincent-boucher-kajje/",
    "guide": "docs/production/readiness.md",
    "topic": {
      "en": "Review economics & ambition",
      "fr": "Coût de la revue et ambition"
    },
    "summary": {
      "en": "Connect the cost of checking work with the longer-term possibility that productive intelligence could finance larger industrial ambitions.",
      "fr": "Reliez le coût de la vérification à la possibilité, à long terme, qu’une intelligence productive finance de plus grandes ambitions industrielles."
    }
  }
];

const copy = {
  "en": {
    "eyebrow": "SELECTED READING",
    "title": "The ideas behind the work.",
    "intro": "Explore discovery, review and settlement in the $AGIALPHA ecosystem.",
    "note": "Essays by Vincent Boucher · English originals on LinkedIn. Some describe earlier versions; current guides explain setup, payments and availability. LinkedIn may ask you to sign in.",
    "current": "Explore the current guide",
    "all": "Reading notes and version context",
    "source": "English essay · LinkedIn",
    "boundary": "This repository’s v2 contracts use $AGIALPHA. AGIJobManager is the separate USDC route. An essay or local demonstration does not establish a commissioned live service."
  },
  "fr": {
    "eyebrow": "LECTURES CHOISIES",
    "title": "Les idées derrière le travail.",
    "intro": "Explorez la découverte, la revue et le règlement dans l’écosystème $AGIALPHA.",
    "note": "Articles de Vincent Boucher · Originaux anglais sur LinkedIn. Certains décrivent d’anciennes versions; les guides actuels précisent l’installation, les paiements et la disponibilité. LinkedIn peut demander une connexion.",
    "current": "Explorer le guide actuel",
    "all": "Notes de lecture et contexte des versions",
    "source": "Article anglais · LinkedIn",
    "boundary": "Les contrats v2 de ce dépôt utilisent le $AGIALPHA. AGIJobManager constitue le parcours USDC distinct. Un article ou une démonstration locale n’établit pas l’existence d’un service réel mis en exploitation."
  }
};

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

export function renderReading(guide) {
  const lang = "en";
  const c = copy[lang];
  if (!c) throw new Error("Unsupported reading language");
  const current = (path) => {
    const href = guide(path);
    if (typeof href !== "string" || !href) throw new Error("Missing current reading guide: " + path);
    return escape(href);
  };
  const cards = articles.map((article) => `
    <article class="reading-card" aria-labelledby="reading-${article.id}-title">
      <p class="reading-topic">${escape(article.topic[lang])}</p>
      <h3 id="reading-${article.id}-title"><a href="${escape(article.url)}" lang="en" rel="external noreferrer">${escape(article.title)}</a></h3>
      <p>${escape(article.summary[lang])}</p><p class="reading-source">${escape(c.source)}</p>
      <a class="reading-guide" href="${current(article.guide)}">${escape(c.current)}<span class="sr-only">: ${escape(article.topic[lang])}</span> <span aria-hidden="true">↗</span></a>
    </article>`).join("");
  return `<section id="reading" class="reading-section section-wrap section" aria-labelledby="reading-title">
    <div class="reading-heading"><p class="reading-eyebrow">${escape(c.eyebrow)}</p><h2 id="reading-title">${escape(c.title)}</h2><p>${escape(c.intro)}</p></div>
    <div class="reading-grid">${cards}</div>
    <p class="reading-note">${escape(c.note)}</p><p class="reading-context">${escape(c.boundary)}</p>
    <a class="reading-guide" href="${current("docs/READING.md")}">${escape(c.all)} <span aria-hidden="true">↗</span></a>
  </section>`;
}
