import fs from 'node:fs';

export const ecosystem = JSON.parse(
  fs.readFileSync(
    new URL('../../website/data/ecosystem.json', import.meta.url),
    'utf8'
  )
);

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character])
  );

function tokenAddress(id) {
  const token = ecosystem.token;
  return `<div class="ecosystem-address"><a href="${escape(
    token.explorerUrl
  )}" aria-label="Inspect the shared AGIALPHA token on Etherscan"><code id="${id}">${escape(
    token.address
  )}</code></a><button class="text-button ecosystem-copy" type="button" data-copy="${id}" data-copy-label="Token address" hidden>Copy token address</button></div>`;
}

export function renderEcosystemHero(base) {
  return `<aside class="ecosystem-hero-token" aria-label="The shared ecosystem token"><p><strong>$AGIALPHA</strong><span>Ethereum mainnet · 18 decimals</span></p>${tokenAddress(
    'hero-token-address'
  )}<a class="ecosystem-pair-link" href="${base}successor/computer/">Find your Alpha. Build your SUCCESSOR Ω <span aria-hidden="true">→</span></a><a class="text-link" href="${base}ecosystem/">Explore the connection and current contracts →</a></aside>`;
}

export function renderEcosystemIntro(base) {
  return `<section class="section-wrap ecosystem-overview" aria-labelledby="ecosystem-overview-title"><div><p class="eyebrow">TWO COMPLEMENTARY SYSTEMS</p><h2 id="ecosystem-overview-title">A promising idea.<br>A clear path to useful work.</h2><p>AGI Alpha Agent helps explore ideas and develop a plan. AGI Jobs gives a defined task its evidence, review and payment rules. Together, they can turn a selected idea into accountable digital work.</p></div><div class="ecosystem-overview-actions"><p><strong>One shared $AGIALPHA token.</strong><br>Two recorded Ethereum mainnet deployments, with 30 contract instances you can inspect.</p><a class="button primary" href="${base}successor/computer/">Find your Alpha. Build your SUCCESSOR Ω <span aria-hidden="true">→</span></a><a class="text-link" href="${base}ecosystem/">See how they work together <span aria-hidden="true">→</span></a><a class="text-link" href="${base}ecosystem/#contracts">Explore both deployed contract suites ↗</a></div></section>`;
}

function contracts(items) {
  return `<ul class="ecosystem-contract-list">${items
    .map(
      (contract) =>
        `<li data-contract-name="${escape(contract.name)}"><h4>${escape(
          contract.name
        )}</h4><p>${escape(contract.role)}</p><a href="${escape(
          contract.explorerUrl
        )}" aria-label="Inspect ${escape(
          contract.name
        )} on Etherscan"><code>${escape(
          contract.address
        )}</code><span class="ecosystem-explorer-label">View source and contract details ↗</span></a></li>`
    )
    .join('')}</ul>`;
}

export function renderEcosystemPage(base, guideURL) {
  const alpha = ecosystem.suites.find((suite) => suite.id === 'alpha');
  const jobs = ecosystem.suites.find((suite) => suite.id === 'jobs');
  return `<main id="main" class="section-wrap ecosystem-page">
  <div class="breadcrumb"><a href="${base}">Home</a><span>/</span><span>The ecosystem</span></div>
  <header class="ecosystem-heading">
    <p class="eyebrow">AGI ALPHA AGENT + AGI JOBS</p>
    <h1>Ideas that can become<br><em>accountable work.</em></h1>
    <p class="ecosystem-lead">One system helps find a promising direction. The other gives useful work clear rules: what to deliver, how to check it, and when payment can happen. Their shared $AGIALPHA token connects the economic design of both deployed suites.</p>
    <div class="hero-actions"><a class="button primary" href="#example">Follow a practical example <span aria-hidden="true">↓</span></a><a class="button secondary" href="#contracts">Inspect all 30 contracts</a></div>
  </header>
  <nav class="ecosystem-jump-links" aria-label="On this page"><a href="#together">Why use them together</a><a href="#example">An example</a><a href="#token">The shared token</a><a href="#contracts">Deployed contracts</a><a href="#readiness">Evidence and readiness</a></nav>

  <section id="together" class="ecosystem-section" aria-labelledby="together-title">
    <p class="eyebrow">THE PRACTICAL VALUE</p><h2 id="together-title">Explore the possibilities.<br>Make the work checkable.</h2>
    <div class="ecosystem-role-grid">
      <article class="ecosystem-role-card"><span class="ecosystem-role-number" aria-hidden="true">01 / DIRECTION</span><h3>AGI Alpha Agent</h3><p>Explore candidate ideas, compare approaches and form a work plan. Its deployed Ascension suite adds plan ownership, participant admission, risk review, funding and its own job market.</p><a href="${escape(
        alpha.website
      )}">Explore AGI Alpha Agent ↗</a></article>
      <article class="ecosystem-role-card"><span class="ecosystem-role-number" aria-hidden="true">02 / DELIVERY</span><h3>AGI Jobs</h3><p>Turn a bounded request into a work order. Define the deliverable and acceptance checks, admit a worker, collect evidence, coordinate review, handle disputes and settle under the configured protocol rules.</p><a href="${base}start/">Start with one useful task →</a></article>
    </div>
    <div class="ecosystem-benefits"><article><h3>Clearer assignments</h3><p>A promising idea becomes a small, specific request with a deadline and an agreed result.</p></article><article><h3>Reviewable outcomes</h3><p>The worker provides artifacts and evidence that another person or authorized reviewer can inspect.</p></article><article><h3>Reusable knowledge</h3><p>Keep useful methods and lessons for later work. Reusing knowledge still requires the next task’s own permissions and checks.</p></article></div>
    <p class="ecosystem-supporting">The strongest starting points are bounded digital tasks with outputs you can test: a software patch, structured research or a document comparison. Real-world quality still depends on the task, the worker and the review. Contract rules do not establish that an idea is true, valuable or correct.</p>
  </section>

  <section id="example" class="ecosystem-section ecosystem-example" aria-labelledby="example-title">
    <p class="eyebrow">ILLUSTRATIVE WORKFLOW</p><h2 id="example-title">Improve an open-source tool.</h2><p class="ecosystem-lead">A team wants a CSV importer to handle one troublesome file correctly. Here is how the two systems could contribute to that job.</p>
    <ol class="ecosystem-steps"><li><h3>Choose a useful approach</h3><p>The Alpha Agent workflow compares candidate fixes and prepares a plan with the expected benefit and the tests that would support it.</p></li><li><h3>Define one bounded job</h3><p>The requester specifies the bug, permitted source files, deadline and acceptance criteria. The assignment asks for a patch, a small reproduction case and test output.</p></li><li><h3>Deliver and check the evidence</h3><p>An admitted worker prepares the result. An independent reviewer reproduces the bug and checks the patch against the agreed criteria; a failed check remains a failed check.</p></li><li><h3>Complete the agreed process</h3><p>The selected market’s validation, dispute and finalization rules determine whether funds can be released. The team can retain the reviewed method for another authorized task.</p></li></ol>
    <p class="ecosystem-note">This is an example of the intended collaboration. It does not report a completed paid job or an automatically connected mainnet workflow.</p>
    <div class="hero-actions"><a class="button primary" href="${base}successor/computer/">Try Computer Use and develop strategies →</a><a class="button secondary" href="${base}successor/alpha/">Reconcile catalogs in the free laboratory →</a><a class="button secondary" href="${base}successor/research/">Build a source-grounded evidence brief →</a><a class="text-link" href="${base}successor/build/">Explore the historical reproducible workshop ↗</a><a class="button secondary" href="${base}start/example/">Try the simple guided example →</a><a class="button secondary" href="${base}work/">Design your own job</a></div>
  </section>

  <section id="token" class="ecosystem-section" aria-labelledby="token-title">
    <p class="eyebrow">THE SHARED ETHEREUM MAINNET TOKEN</p><h2 id="token-title">$AGIALPHA</h2>
    <div class="ecosystem-token-panel"><div><span class="ecosystem-token-symbol" aria-hidden="true">✧</span><div><h3>AGI ALPHA</h3><p>Ethereum mainnet · chain ID 1 · 18 decimals</p></div></div>${tokenAddress(
      'ecosystem-token-address'
    )}<p>Both deployment records name this same token address. The contracts use it for their configured funding, stake, fee and settlement operations. Each suite has its own rules and participant requirements.</p><a class="text-link" href="${escape(
    ecosystem.token.explorerUrl
  )}">Read the token’s explorer record ↗</a></div>
    <p class="ecosystem-supporting">The token is a shared dependency of the two suites and is separate from the 30 contract instances listed below. The public examples and planning tools remain available without a wallet or token payment.</p>
    <h3 class="ecosystem-subheading">How the connection works</h3><p>The pairing requires an operator to connect compatible job interfaces and admit the right identities. Sharing a token does not create an automatic bridge between the deployed markets.</p>
    <details class="ecosystem-details"><summary>For operators: market routing and identity admission</summary><div><p>The deployed Alpha MARK contract has an immutable connection to its Alpha job market. It cannot simply be pointed at the Jobs JobRegistry. A Jobs connection needs a separately configured and reviewed adapter or workflow.</p><p>The two systems also use different ENS identity namespaces. Jobs admission must explicitly enable the required Alpha identity aliases or another supported admission path; the shared token alone grants no participant role.</p><p>Use the exact deployed contract interfaces and source revisions when evaluating an integration. Current repository code may contain changes absent from the deployed instances.</p><div class="inline-links"><a href="${escape(
      alpha.deploymentGuideUrl
    )}">Alpha deployment guide ↗</a><a href="${guideURL(
    'docs/computer-work.md'
  )}">Jobs integration guide ↗</a><a href="${escape(
    jobs.sourceUrl
  )}">Jobs deployed source ↗</a></div></div></details>
  </section>

  <section id="contracts" class="ecosystem-section" aria-labelledby="contracts-title">
    <p class="eyebrow">DEPLOYED ON ETHEREUM MAINNET</p><h2 id="contracts-title">Two suites.<br>30 contract instances.</h2><p class="ecosystem-lead">Explore the 5 Alpha instances and all 25 Jobs instances. Each full address links to its Etherscan contract page. These are components of two systems; the count is not a count of separate protocols.</p>
    <p class="ecosystem-supporting">This directory lists the fresh Alpha and Jobs suites recorded 18 October 2026. Historical deployment records remain available below. Explorer source verification and deployment records identify the published contracts; they do not establish current ownership, pause state, security or readiness for funding.</p>
    <div class="ecosystem-inventory-links"><a href="#alpha-contracts">Alpha · 5 instances ↓</a><a href="#jobs-contracts">Jobs · 15 main components ↓</a><a href="#jobs-implementations">Jobs · 10 fixed implementations ↓</a><a href="${base}ecosystem/contracts.json" download>Download the address directory ↓</a></div>
    <section id="alpha-contracts" class="ecosystem-contract-group" aria-labelledby="alpha-contracts-title"><div class="ecosystem-group-heading"><div><p class="eyebrow">AGI ALPHA AGENT / ASCENSION</p><h3 id="alpha-contracts-title">Ideas, admission, risk and funded work</h3><p>5 current contract instances · recorded 18 October 2026</p></div><a href="${escape(
      alpha.recordUrl
    )}">Inspect the pinned deployment record ↗</a></div>${contracts(
    alpha.contracts
  )}</section>
    <section id="jobs-contracts" class="ecosystem-contract-group" aria-labelledby="jobs-contracts-title"><div class="ecosystem-group-heading"><div><p class="eyebrow">AGI JOBS / PROTOCOL AND COORDINATOR</p><h3 id="jobs-contracts-title">The work lifecycle and its controls</h3><p>14 protocol components + 1 deployment coordinator · recorded 18 October 2026</p></div><a href="${escape(
      jobs.recordUrl
    )}">Inspect the pinned deployment record ↗</a></div>${contracts(
    jobs.contracts.filter((contract) => contract.kind !== 'implementation')
  )}</section>
    <section id="jobs-implementations" class="ecosystem-contract-group" aria-labelledby="jobs-implementations-title"><div class="ecosystem-group-heading"><div><p class="eyebrow">AGI JOBS / INTERNAL IMPLEMENTATIONS</p><h3 id="jobs-implementations-title">The fixed logic behind three core components</h3><p>10 additional instances execute logic for JobRegistry, StakeManager and ValidationModule. Their addresses are fixed by the deployment; they are not ten extra user-facing markets.</p></div><a href="${escape(
      jobs.addressMapUrl
    )}">Inspect the pinned address map ↗</a></div>${contracts(
    jobs.contracts.filter((contract) => contract.kind === 'implementation')
  )}</section>
  </section>

  <section id="readiness" class="ecosystem-section" aria-labelledby="readiness-title">
    <p class="eyebrow">EVIDENCE AND NEXT STEPS</p><h2 id="readiness-title">Know what each record establishes.</h2><p class="ecosystem-lead">Both suites have recorded Ethereum mainnet deployments. Live operations also require the right deployed release, identities, configuration, independent review and commissioning.</p>
    <div class="ecosystem-role-grid"><article class="ecosystem-evidence-card"><h3>Alpha · current 18 October suite</h3><p>Five fresh contracts have recorded Etherscan EXACT_MATCH results. The two one-time bindings have finalized receipts. The scoped authority snapshot at block 26,220,072 names the governor for all three owner-bearing contracts. These dated observations do not approve activation or public funding.</p><p>${escape(
      alpha.sourceNote
    )}</p><a href="${escape(
    alpha.deploymentGuideUrl
  )}">Read the current deployment evidence ↗</a><a href="${escape(
    alpha.historicalRecordUrl
  )}">Inspect the historical 11 October archive ↗</a><a href="${escape(
    alpha.currentReadinessUrl
  )}">Check the current Alpha readiness guidance ↗</a></article><article class="ecosystem-evidence-card"><h3>Jobs · current 18 October suite</h3><p>The pinned record lists 25 exact runtime/source-metadata matches and 46 named state checks at finalized block 26,221,285. All eight managed modules were paused; the creator owned none of these 25 contracts. Production approval and activation remain false.</p><p>The deployed source is <a href="${escape(
    jobs.sourceUrl
  )}">818b3a24</a>; current publication equivalence is not assumed. Explorer observations were separately timed and are not block-pinned. This directory makes no fresh live RPC check.</p><a href="${escape(
    jobs.deploymentGuideUrl
  )}">Read the dated deployment guide ↗</a><a href="${escape(
    jobs.historicalRecordUrl
  )}">Inspect the historical 12 October archive ↗</a><a href="${escape(
    guideURL('docs/production/CURRENT_MAINNET_DEPLOYMENT.md') ||
      jobs.currentReadinessUrl
  )}">Check the current Jobs deployment guidance ↗</a></article></div>
    <p class="ecosystem-supporting">The directory is built from source-pinned public records and makes no live RPC calls. Use the explorer links and current operator guides to investigate a specific deployment. The quality of a live result still depends on its task, worker and independent review.</p>
    <div class="ecosystem-next"><div><h3>Start with something you can explain and check.</h3><p>Prepare one useful request, decide what success looks like and explore the evidence before moving to a configured service.</p></div><div class="hero-actions"><a class="button primary" href="${base}start/">Start here →</a><a class="button secondary" href="${guideURL(
    'docs/ECOSYSTEM.md'
  )}">Read the repository guide</a><a class="text-link" href="${escape(
    alpha.website
  )}ecosystem/">See the Alpha view of the ecosystem ↗</a></div></div>
  </section>
</main>`;
}
