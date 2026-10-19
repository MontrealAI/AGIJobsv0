// Browser experiences are linked directly; the existing catalog remains complete.
export const featuredRoutes = {
  successor: 'successor/mission/',
  culture: 'experiments/culture/',
  kardashev: 'experiments/kardashev-ii/',
};

export function renderHeroSpotlight(base) {
  return `<nav class="hero-spotlight" aria-label="Featured demo shortcuts">
    <span>IN THE SPOTLIGHT</span>
    <a class="hero-flagship-shortcut" href="${base}${featuredRoutes.successor}">SUCCESSOR Ω <span aria-hidden="true">→</span></a>
    <a href="${base}${featuredRoutes.culture}">CULTURE Studio <span aria-hidden="true">↗</span></a>
    <a href="${base}${featuredRoutes.kardashev}">Kardashev II <span aria-hidden="true">↗</span></a>
    <a href="${base}experiments/alpha-agi-mark/">Alpha Mark <span aria-hidden="true">↗</span></a>
    <a href="${base}experiments/phase6/">Phase 6 <span aria-hidden="true">↗</span></a>
  </nav>`;
}

export function renderSuccessorFlagship(base) {
  return `<section id="successor-flagship" class="section-wrap successor-feature" aria-labelledby="successor-feature-title">
    <div class="successor-feature-frame">
      <div class="successor-feature-heading"><div><p class="eyebrow">SUCCESSOR Ω / THE FLAGSHIP</p><h2 id="successor-feature-title">An advantage worth building.<br>A mission you can advance.</h2><p class="successor-feature-lead">Bring a high-value business opportunity or a frontier mathematics question. Compare and improve strategies, examine a different formulation and prepare bounded work for an agent using Computer Use. Keep the mission, methods and source evidence together.</p><div class="successor-feature-actions"><a class="button primary" data-feature-launch="successor" href="${base}${featuredRoutes.successor}">Start my mission <span aria-hidden="true">→</span></a><a class="text-link" href="${base}successor/mission/fr/" lang="fr" hreflang="fr">Ouvrir en français <span aria-hidden="true">→</span></a></div><p class="successor-feature-free">Free mission planning · No account, wallet or API key</p></div>
      <div class="successor-feature-art" aria-hidden="true"><svg viewBox="0 0 450 300" focusable="false"><defs><radialGradient id="successor-feature-glow"><stop stop-color="#a06bd2" stop-opacity=".26"/><stop offset="1" stop-color="#a06bd2" stop-opacity="0"/></radialGradient><linearGradient id="successor-feature-edge"><stop stop-color="#d8b3f5"/><stop offset="1" stop-color="#efd69c"/></linearGradient></defs><ellipse cx="225" cy="150" rx="204" ry="143" fill="url(#successor-feature-glow)"/><g fill="none" stroke="#a382b9" stroke-opacity=".3"><ellipse cx="225" cy="150" rx="180" ry="74" transform="rotate(-22 225 150)"/><ellipse cx="225" cy="150" rx="125" ry="123"/><path d="M45 150H405M225 24V276" stroke-dasharray="2 9"/></g><g fill="none" stroke="url(#successor-feature-edge)" stroke-width="1.5"><path d="M225 150L111 77L83 203L225 150L342 83L369 214L225 150M111 77L342 83M83 203L369 214"/></g><g fill="#281936" stroke="#d2b0ed"><circle cx="111" cy="77" r="19"/><circle cx="342" cy="83" r="19"/><circle cx="83" cy="203" r="13"/><circle cx="369" cy="214" r="13"/></g><g fill="#b8e7d7"><circle cx="225" cy="28" r="4"/><circle cx="224" cy="274" r="4"/></g><circle cx="225" cy="150" r="64" fill="#24152f" stroke="#d5b4e1"/><circle cx="225" cy="150" r="74" fill="none" stroke="#d5b4e1" stroke-opacity=".3"/><text x="225" y="174" text-anchor="middle" fill="#efd69c" font-family="Georgia,serif" font-size="85">Ω</text><g fill="#efd69c" font-family="Georgia,serif" font-size="24" text-anchor="middle"><text x="111" y="84">α</text><text x="342" y="90">✧</text></g><g fill="#f0dfb9"><circle cx="37" cy="48" r="1.5"/><circle cx="408" cy="44" r="1.5"/><circle cx="409" cy="259" r="1.5"/><circle cx="44" cy="266" r="1.5"/></g></svg><span>OWN THE INSTITUTION. PRESERVE THE MISSION.</span></div></div>
      <div class="successor-feature-steps"><article><span>01 / DEVELOP · LEVEL 3</span><h3>Improve the strategy.</h3><p>Discover, test, combine and improve strategies. Keep alternatives, failed attempts and the reasons behind the next candidate.</p></article><article><span>02 / REFRAME · LEVEL 4</span><h3>Question the approach.</h3><p>Explore a fundamentally different approach while preserving the outcome, evidence standards and constraints that actually matter.</p></article><article><span>03 / OPERATE · COMPUTER USE</span><h3>Put it to work. Keep the evidence.</h3><p>Prepare an exact task for your own Computer Use runtime. Bring back the sources, work and unresolved verification obligations.</p></article></div>
      <p class="successor-feature-scope">Start with a bounded mission and public, non-personal inputs. Execute through your own environment. A prepared mission is a starting point for real work; independent proof and demonstrated value still have to be earned.</p>
    </div>
  </section>`;
}

function cultureArt() {
  return `<div class="spotlight-art culture-art" aria-hidden="true">
    <span class="art-coordinate">01 / THE KNOWLEDGE COMMONS</span>
    <svg viewBox="0 0 600 240" focusable="false">
      <defs>
        <radialGradient id="culture-halo"><stop stop-color="#b181ff" stop-opacity=".3"/><stop offset="1" stop-color="#b181ff" stop-opacity="0"/></radialGradient>
        <linearGradient id="culture-edge"><stop stop-color="#9f78e5"/><stop offset="1" stop-color="#a2e0d0"/></linearGradient>
      </defs>
      <ellipse cx="300" cy="124" rx="205" ry="118" fill="url(#culture-halo)"/>
      <g fill="none" stroke="#a581d9" stroke-opacity=".23">
        <ellipse cx="300" cy="124" rx="196" ry="78" transform="rotate(-12 300 124)"/>
        <ellipse cx="300" cy="124" rx="139" ry="104" transform="rotate(12 300 124)"/>
      </g>
      <g stroke="url(#culture-edge)" stroke-width="1.4" fill="none">
        <path d="M300 124L166 74L105 141L201 187L300 124L424 67L488 138L395 195L300 124M166 74L286 35L424 67M201 187L395 195M300 124L488 138"/>
        <path d="M286 35L300 124L105 141M424 67L395 195" stroke-dasharray="3 6" opacity=".55"/>
      </g>
      <g fill="#241b39" stroke="#c3a2f8" stroke-width="1.5">
        <circle cx="166" cy="74" r="14"/><circle cx="424" cy="67" r="14"/>
        <circle cx="201" cy="187" r="11"/><circle cx="395" cy="195" r="11"/>
      </g>
      <g fill="#b5eddf"><circle cx="105" cy="141" r="5"/><circle cx="488" cy="138" r="5"/><circle cx="286" cy="35" r="5"/></g>
      <circle cx="300" cy="124" r="43" fill="#251735" stroke="#b68cea"/>
      <circle cx="300" cy="124" r="51" fill="none" stroke="#b68cea" stroke-opacity=".3"/>
      <path d="M300 97L308 116L327 124L308 132L300 151L292 132L273 124L292 116Z" fill="#dbc3ff"/>
      <g fill="#ede0ff"><circle cx="66" cy="60" r="1.5"/><circle cx="526" cy="45" r="1.5"/><circle cx="548" cy="186" r="1"/><circle cx="72" cy="213" r="1"/></g>
    </svg>
    <span class="art-caption">CREATE <i></i> EVALUATE <i></i> CONNECT</span>
  </div>`;
}

function kardashevArt() {
  return `<div class="spotlight-art kardashev-art" aria-hidden="true">
    <span class="art-coordinate">02 / THE CIVILIZATION MODEL</span>
    <svg viewBox="0 0 600 240" focusable="false">
      <defs>
        <radialGradient id="stellar-halo"><stop stop-color="#ecc48c" stop-opacity=".28"/><stop offset="1" stop-color="#bc8aff" stop-opacity="0"/></radialGradient>
        <radialGradient id="stellar-core" cx="35%" cy="30%"><stop stop-color="#fff0d0"/><stop offset=".45" stop-color="#e7be83"/><stop offset="1" stop-color="#91649a"/></radialGradient>
        <linearGradient id="stellar-ring"><stop stop-color="#9470ca"/><stop offset=".5" stop-color="#edd7b1"/><stop offset="1" stop-color="#a2e0d0"/></linearGradient>
      </defs>
      <ellipse cx="300" cy="126" rx="217" ry="118" fill="url(#stellar-halo)"/>
      <g fill="none" stroke="#b3a0d6" stroke-opacity=".24">
        <ellipse cx="300" cy="126" rx="231" ry="74" transform="rotate(-12 300 126)"/>
        <path d="M76 126H524M300 18V233" stroke-dasharray="2 7"/>
      </g>
      <circle cx="300" cy="126" r="47" fill="url(#stellar-core)"/>
      <g fill="none" stroke="url(#stellar-ring)">
        <ellipse cx="300" cy="126" rx="161" ry="58" transform="rotate(-22 300 126)" stroke-width="1.5"/>
        <ellipse cx="300" cy="126" rx="112" ry="91" transform="rotate(24 300 126)"/>
        <ellipse cx="300" cy="126" rx="64" ry="104" transform="rotate(24 300 126)" stroke-opacity=".65"/>
      </g>
      <g fill="#20172f" stroke="#dcc5a7" stroke-width="1.5">
        <path d="M144 156l10-6 10 6v12l-10 6-10-6Z M435 79l10-6 10 6v12l-10 6-10-6Z M362 205l8-5 8 5v10l-8 5-8-5Z"/>
      </g>
      <g fill="#b5eddf"><circle cx="203" cy="56" r="4"/><circle cx="405" cy="171" r="4"/></g>
      <g fill="#ede0ff"><circle cx="81" cy="46" r="1.5"/><circle cx="510" cy="33" r="1"/><circle cx="539" cy="202" r="1.5"/><circle cx="103" cy="211" r="1"/></g>
    </svg>
    <span class="art-caption">ENERGY <i></i> COMPUTE <i></i> GOVERNANCE</span>
  </div>`;
}

export function renderFeaturedDemos(base, catalog) {
  const guide = (name) => {
    const demo = catalog.find((entry) => entry.name === name);
    if (!demo)
      throw new Error(`Featured demo is missing from catalog: ${name}`);
    return `${base}demos/${encodeURIComponent(demo.id)}/`;
  };
  return `<section id="featured" class="section-wrap spotlight-section" aria-labelledby="featured-title">
    <div class="section-heading spotlight-heading">
      <div><p class="eyebrow">TWO WORLDS. READY TO EXPLORE.</p><h2 id="featured-title">From shared knowledge<br>to stellar ambition.</h2></div>
      <p>Meet the featured demos.<br>Open either experience in your browser.<br><span>No installation. No wallet. No sign-in.</span></p>
    </div>
    <div class="spotlight-grid">
      <article class="spotlight-card spotlight-culture" aria-labelledby="culture-feature-title">
        ${cultureArt()}
        <div class="spotlight-content">
          <div class="spotlight-meta"><span class="spotlight-mode">Interactive preview</span><span>Learning &amp; culture</span></div>
          <h3 id="culture-feature-title">CULTURE <em>Studio</em></h3>
          <p class="spotlight-description">Turn a lesson into a shared artifact, put it through a self-play round, and follow how knowledge connects.</p>
          <ol class="spotlight-steps">
            <li><span>Create</span> Draft a teaching artifact and trace its lineage.</li>
            <li><span>Evaluate</span> Compare simulated students, scores and difficulty.</li>
            <li><span>Connect</span> Explore the culture graph and export your evidence.</li>
          </ol>
          <div class="spotlight-actions"><a class="button primary" data-feature-launch="culture" href="${base}${
    featuredRoutes.culture
  }">Open CULTURE Studio <span aria-hidden="true">↗</span></a><a class="text-link" href="${guide(
    'CULTURE-v0'
  )}" aria-label="CULTURE Studio walkthrough and sources">Walkthrough &amp; sources <span aria-hidden="true">→</span></a></div>
          <p class="spotlight-scope">Browser-only session with local templates and simulated students. Export before reloading to keep your evidence.</p>
        </div>
      </article>
      <article class="spotlight-card spotlight-kardashev" aria-labelledby="kardashev-feature-title">
        ${kardashevArt()}
        <div class="spotlight-content">
          <div class="spotlight-meta"><span class="spotlight-mode">Simulation command deck</span><span>AGI Jobs Platform</span></div>
          <h3 id="kardashev-feature-title">Kardashev <em>II Scale</em></h3>
          <p class="spotlight-description">Start with verifiable computer work, then explore civilization-scale energy, compute and human governance.</p>
          <ol class="spotlight-steps">
            <li><span>Scope</span> Explore ten task drafts and plan workers against review capacity.</li>
            <li><span>Inspect</span> Follow energy budgets, mission graphs, stress scenarios and governance proposals.</li>
            <li><span>Compare</span> Explore the main, Sovereign Lattice and Stellar models.</li>
          </ol>
          <div class="spotlight-actions"><a class="button primary" data-feature-launch="kardashev" href="${base}${
    featuredRoutes.kardashev
  }">Enter the command deck <span aria-hidden="true">↗</span></a><a class="text-link" href="${guide(
    'AGI-Jobs-Platform-at-Kardashev-II-Scale'
  )}" aria-label="Kardashev II walkthrough and sources">Walkthrough &amp; sources <span aria-hidden="true">→</span></a></div>
          <p class="spotlight-scope">Read-only, deterministic model snapshots with synthetic inputs. No live infrastructure or transactions.</p>
        </div>
      </article>
    </div>
    <article class="mark-home-callout" aria-labelledby="mark-feature-title"><div><span class="work-number">ALPHA AGI MARK / NEW INTERACTIVE LAB</span><h3 id="mark-feature-title">Capital to capability.</h3><p>Plan a useful mission, compare worker and review capacity, and export a scoped USDC work proposal. Browser-only simulation; no live execution or settlement.</p></div><a class="button secondary" href="${base}experiments/alpha-agi-mark/">Open the mission lab ↗</a></article>
    <article class="mark-home-callout" aria-labelledby="phase6-feature-title"><div><span class="work-number">PHASE 6 / MULTI-DOMAIN EXPANSION</span><h3 id="phase6-feature-title">More domains. One standard of proof.</h3><p>Allocate one dispatch wave across five specialties, reserve independent review capacity and export a reproducible synthetic task. Inspect the complete configuration and preserved systems maps.</p></div><a class="button secondary" href="${base}experiments/phase6/">Open the expansion lab ↗</a></article>
    <article class="mark-home-callout" aria-labelledby="phase8-feature-title"><div><span class="work-number">PHASE 8 / UNIVERSAL VALUE WORK LAB</span><h3 id="phase8-feature-title">Intelligence becomes useful work.</h3><p>Choose from ten work categories, explore worker and review capacity, and export a scoped work order. Open the preserved governance atlas to inspect the wider system.</p></div><a class="button secondary" href="${base}experiments/phase8/workbench/">Open the work lab ↗</a></article>
    <div class="spotlight-footer"><p><span aria-hidden="true">✧</span> Start with a question. Explore the system. Inspect the evidence.</p><a class="text-link" href="#explore">Browse all ${
      catalog.length
    } catalog entries <span aria-hidden="true">↓</span></a></div>
  </section>`;
}
