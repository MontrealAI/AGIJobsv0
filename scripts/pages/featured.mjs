// Browser experiences are linked directly; the existing catalog remains complete.
export const featuredRoutes = {
  culture: 'experiments/culture/',
  kardashev: 'experiments/kardashev-ii/',
};

export function renderHeroSpotlight(base) {
  return `<nav class="hero-spotlight" aria-label="Featured demo shortcuts">
    <span>IN THE SPOTLIGHT</span>
    <a href="${base}${featuredRoutes.culture}">CULTURE Studio <span aria-hidden="true">↗</span></a>
    <a href="${base}${featuredRoutes.kardashev}">Kardashev II <span aria-hidden="true">↗</span></a>
  </nav>`;
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
          <p class="spotlight-description">Explore how a civilization-scale mission balances energy, compute, work and human governance.</p>
          <ol class="spotlight-steps">
            <li><span>Inspect</span> Follow energy budgets, allocations and mission graphs.</li>
            <li><span>Review</span> Read stress scenarios, warnings and governance proposals.</li>
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
    <div class="spotlight-footer"><p><span aria-hidden="true">✧</span> Start with a question. Explore the system. Inspect the evidence.</p><a class="text-link" href="#explore">Browse all ${
      catalog.length
    } catalog entries <span aria-hidden="true">↓</span></a></div>
  </section>`;
}
