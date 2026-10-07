import { workTypes } from '../../website/assets/work-model.mjs';

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        char
      ])
  );

function constellation() {
  return `<div class="mark-constellation" aria-hidden="true"><svg viewBox="0 0 560 450" focusable="false"><defs><radialGradient id="mark-glow"><stop stop-color="#c7a2ff" stop-opacity=".36"/><stop offset="1" stop-color="#9b63d9" stop-opacity="0"/></radialGradient><linearGradient id="mark-edge"><stop stop-color="#dec2ff"/><stop offset="1" stop-color="#a2e0d0"/></linearGradient></defs><ellipse cx="280" cy="224" rx="228" ry="209" fill="url(#mark-glow)"/><g fill="none" stroke="#ac8be6" stroke-opacity=".26"><ellipse cx="280" cy="224" rx="235" ry="80" transform="rotate(-29 280 224)"/><ellipse cx="280" cy="224" rx="170" ry="154"/><circle cx="280" cy="224" r="202" stroke-dasharray="2 12"/></g><g fill="none" stroke="url(#mark-edge)" stroke-width="1.2"><path d="M280 224L141 111L78 244L205 354L280 224L419 126L474 282L346 372L280 224M141 111L419 126M205 354L346 372M78 244L474 282"/></g><g fill="#241335" stroke="#d3b1ff"><circle cx="141" cy="111" r="19"/><circle cx="419" cy="126" r="19"/><circle cx="205" cy="354" r="13"/><circle cx="346" cy="372" r="13"/></g><g fill="#bcebdd"><circle cx="78" cy="244" r="6"/><circle cx="474" cy="282" r="6"/></g><circle cx="280" cy="224" r="69" fill="#21102d" stroke="#ceabfc"/><circle cx="280" cy="224" r="79" fill="none" stroke="#cfa6ff" stroke-opacity=".35"/><path d="M280 187L290 214L317 224L290 234L280 261L270 234L243 224L270 214Z" fill="#ebd7ff"/><g fill="#e6d5ff"><circle cx="56" cy="69" r="2"/><circle cx="502" cy="69" r="1.5"/><circle cx="95" cy="373" r="1.5"/><circle cx="504" cy="389" r="2"/><circle cx="309" cy="41" r="1.5"/></g></svg><span class="mark-orbit-label mark-orbit-one">CAPITAL</span><span class="mark-orbit-label mark-orbit-two">CAPABILITY</span><span class="mark-orbit-label mark-orbit-three">EVIDENCE</span><div class="mark-art-caption">AMBITION, WITH AN ACCEPTANCE TEST.</div></div>`;
}

export function renderAlphaMarkPage(base, guide) {
  const selected = workTypes.find((type) => type.id === 'science');
  const walkthrough = `${base}demos/alpha-agi-mark/`;
  return `<main id="main" class="section-wrap mark-page">
    <a class="text-link" href="${base}">← AGI Jobs home</a>
    <section class="mark-hero" aria-labelledby="mark-title"><div><p class="eyebrow">ALPHA AGI MARK / CAPITAL TO CAPABILITY</p><h1 id="mark-title">Give ambition<br><em>a working engine.</em></h1><p class="section-description">Turn a mission into funded intent, bounded computer work and evidence someone else can verify. Build useful capacity. Earn the next step.</p><div class="hero-actions"><a class="button primary" href="#mark-lab">Plan a mission ↓</a><a class="text-link" href="${walkthrough}">Inspect the contract demo ↗</a></div><p class="mark-scope">Interactive planning simulation · No sign-in or wallet · Files stay in this tab until downloaded</p></div>${constellation()}</section>
    <div class="mark-boundary"><strong>Two connected ideas. Separate execution.</strong><p>The original Alpha Mark demo explores a native-currency or configured ERC20 bonding-curve market, launch gates and refunds. This lab prepares a USDC-denominated work proposal. Neither browser calculations nor a market launch establish that useful work has been completed.</p></div>
    <section class="section" aria-labelledby="mark-journey-title"><p class="eyebrow">FROM A THESIS TO A USEFUL RESULT</p><h2 id="mark-journey-title">Capital needs a purpose.<br>Work needs proof.</h2><div class="mark-journey">
      <article><span class="work-number">01 / DEFINE</span><h3>A mission with boundaries.</h3><p>Choose a buyer, approved public or licensed inputs, explicit permissions and a deliverable with measurable acceptance criteria.</p></article>
      <article><span class="work-number">02 / EXECUTE</span><h3>Specialists, coordinated.</h3><p>A commissioned OpenClaw worker or operator-led ChatGPT Work session can use its available browser, desktop, file and code tools within the admitted scope.</p></article>
      <article><span class="work-number">03 / VERIFY</span><h3>An independent judgment.</h3><p>Preserve artifacts and source hashes, reproduce the checks and record each acceptance decision. Reserve reviewer time before scaling the worker pool.</p></article>
      <article><span class="work-number">04 / SETTLE</span><h3>Value the buyer accepts.</h3><p>Only an authorized deployment can release funds under its actual rules. Buyer use, review and settlement evidence determine what really happened.</p></article>
    </div></section>
    <section id="mark-lab" class="section" aria-labelledby="mark-lab-title"><div class="section-heading"><div><p class="eyebrow">THE CAPITAL-TO-WORK LAB</p><h2 id="mark-lab-title">Scale the work.<br>Keep the review.</h2></div><p>Change the assumptions and see the limiting resource.<br>All outputs are drafts and modelled capacity.</p></div>
    <p class="notice">Browser-only planning. No source is fetched, worker connected, transaction signed or money moved. Do not enter private information or credentials. Preparation checkboxes record your intentions; they grant no authority.</p>
    <div class="mark-lab-grid"><form id="alpha-mark-form" class="work-form" novalidate>
      <fieldset><legend>1. Define useful work</legend>
        <button type="button" id="mark-example" class="button secondary" disabled>Load an example mission</button><p class="muted">Try an operator-guide job for this public repository. Replaces the work definition and clears preparation acknowledgments; keeps your capacity assumptions.</p>
        <label for="mark-type">Work category</label><select id="mark-type" name="type">${workTypes
          .map(
            (type) =>
              `<option value="${type.id}"${
                type.id === selected.id ? ' selected' : ''
              }>${esc(type.title)}</option>`
          )
          .join('')}</select>
        <label for="mark-goal">Objective</label><textarea id="mark-goal" name="goal" maxlength="2000" rows="3" required>${esc(
          selected.goal
        )}</textarea><button type="button" id="mark-use-objective" class="text-button" disabled>Use category's suggested objective</button>
        <label for="mark-scope">Scope and measurable acceptance detail</label><textarea id="mark-scope" name="scope" maxlength="2000" rows="3" required placeholder="Name the result to reproduce, its units and tolerance, and the buyer’s expected use."></textarea>
        <label for="mark-sources">Approved source URLs</label><textarea id="mark-sources" name="sources" maxlength="12000" rows="2" required aria-describedby="mark-source-help" placeholder="https://example.org/public-data"></textarea><p id="mark-source-help" class="muted">One public HTTPS URL per line, up to 20. No credentials, query strings or fragments. Availability and rights need separate operator verification.</p>
        <div class="work-field-pair"><div><label for="mark-data">Input class</label><select id="mark-data" name="dataClass"><option value="public">Approved public material</option><option value="licensed">Licensed material</option><option value="synthetic">Synthetic material</option></select></div><div><label for="mark-runtime">Execution route</label><select id="mark-runtime" name="runtime"><option value="openclaw">Commissioned OpenClaw</option><option value="work">Operator-led ChatGPT Work</option></select></div></div>
        <label for="mark-profile">Worker profile name</label><input id="mark-profile" name="workerProfile" value="research" maxlength="64" required><p class="muted">The operator must commission and admit the actual profile. This name does not connect a worker.</p>
      </fieldset>
      <fieldset><legend>2. Model one day of capacity</legend>
        <div class="work-field-pair"><div><label for="mark-budget">Daily reward budget (USDC)</label><input id="mark-budget" name="dailyBudget" value="15000" inputmode="decimal" maxlength="20" required></div><div><label for="mark-reward">Reward per job (USDC)</label><input id="mark-reward" name="reward" value="1500" inputmode="decimal" maxlength="20" required></div></div>
        <p class="muted">Unfunded reward proposals only. Each amount must be between 0.000001 and 1,000,000 USDC, with up to six decimals; excludes provider charges, review fees, rework and disputes. Verify deployment currency separately.</p>
        <div class="work-field-pair"><div><label for="mark-workers">Workers</label><input id="mark-workers" name="workers" type="number" value="8" min="1" max="10000" required></div><div><label for="mark-jobs">Candidate jobs per worker / day</label><input id="mark-jobs" name="jobsPerWorker" type="number" value="2" min="1" max="1000" required></div></div>
        <div class="work-field-pair"><div><label for="mark-reviewers">Independent reviewers</label><input id="mark-reviewers" name="reviewers" type="number" value="2" min="1" max="10000" required></div><div><label for="mark-review-capacity">Minutes per reviewer / day</label><input id="mark-review-capacity" name="minutesPerReviewer" type="number" value="120" min="1" max="480" required></div></div>
        <div class="work-field-pair"><div><label for="mark-run">Run allowance per job (minutes)</label><input id="mark-run" name="runMinutes" type="number" value="60" min="1" max="1440" required></div><div><label for="mark-review">Review allowance per job (minutes)</label><input id="mark-review" name="reviewerMinutes" type="number" value="30" min="1" max="480" required></div></div>
        <p class="muted">Run allowance is exported for operator planning; it does not calculate worker throughput or enforce runtime limits. Jobs per worker is a separate assumption.</p>
      </fieldset>
      <fieldset class="mark-checklist"><legend>3. Prepare the operator handoff</legend><p>Confirm these preparation commitments before exporting the proposed task. At least one complete job must fit your capacity assumptions.</p>
        <label><input type="checkbox" name="authorityPlanned"> I will verify the buyer’s authority, permitted actions and exclusions.</label>
        <label><input type="checkbox" name="inputsPlanned"> I will verify source rights, approved origins and exclusion of private data.</label>
        <label><input type="checkbox" name="reviewPlanned"> I will assign a reviewer independent of the worker and agree acceptance criteria.</label>
      </fieldset>
      <button type="submit" class="button primary" disabled>Calculate mission draft →</button>
      <noscript><p class="notice">The lab needs JavaScript. The workflow, sources, local commands and preserved diagrams remain available. Prepare a work order using the execution guide below.</p></noscript>
    </form>
    <aside class="mark-result" aria-labelledby="mark-result-title"><p class="eyebrow">CAPACITY IS A CONSTRAINT</p><h3 id="mark-result-title">What can fit?</h3><p id="alpha-mark-status" class="notice" role="status" tabindex="-1">Enable JavaScript to calculate a local draft.</p>
      <div id="alpha-mark-result" hidden><div class="mark-capacity"><strong id="mark-candidate">0</strong><span>candidate job slots / day</span><p>Static upper bound under your assumptions. Not a success, delivery or revenue forecast.</p></div><dl class="mark-slots"><div><dt>Worker capacity</dt><dd id="mark-worker">0</dd></div><div><dt>Review capacity</dt><dd id="mark-reviewer">0</dd></div><div><dt>Reward budget capacity</dt><dd id="mark-rewardBudget">0</dd></div></dl><p id="mark-bottleneck" class="mark-bottleneck"></p><details><summary>How the model works</summary><p>Worker slots = workers × assumed jobs per worker. Review slots = reviewers × floor(minutes per reviewer ÷ minutes per job). Each complete job has one independent reviewer; partial minutes from different reviewers are not pooled. Reward slots = floor(daily reward budget ÷ reward per job). The smallest count bounds candidate slots. Failed attempts, review overhead and buyer demand can reduce useful output further.</p></details><details><summary>Inspect the complete draft JSON</summary><pre tabindex="0" aria-label="Alpha Mark mission draft JSON"><code id="mark-json"></code></pre></details></div>
      <div class="mark-downloads"><button type="button" class="button secondary" data-mark-download="plan" disabled>Download capacity plan ↓</button><button type="button" class="button secondary" data-mark-download="proposal" disabled>Download USDC proposal ↓</button><button type="button" class="text-button" data-mark-download="task" disabled>Download task.json ↓</button></div>
      <h3>What the buyer receives</h3><p id="mark-outcome">${esc(
        selected.outcome
      )}</p><h3>What the reviewer checks</h3><ol id="mark-criteria">${selected.checks
    .map((check) => `<li>${esc(check)}</li>`)
    .join(
      ''
    )}</ol><p class="muted">The existing adapter accepts bounded UTF-8 artifacts. Office files, screenshots, binaries and large applications need a separately commissioned artifact store. The downloaded task is compatible with the existing work planner’s schema; it still requires operator admission.</p><a class="text-link" href="${base}review/">Inspect actual delivery evidence →</a>
    </aside></div></section>
    <section class="section mark-paths" aria-labelledby="mark-paths-title"><p class="eyebrow">CHOOSE THE NEXT CONCRETE STEP</p><h2 id="mark-paths-title">Explore. Reproduce. Commission.</h2><div class="work-roles"><article><span class="work-number">THE MARKET DEMO</span><h3>Inspect the launch gates.</h3><p>Reproduce capital formation, policy checks, launch and refund scenarios on a disposable local chain. Review reports as evidence of those local scenarios.</p><a class="text-link" href="${walkthrough}">Guided tour and original diagrams →</a><pre tabindex="0" aria-label="Local Alpha Mark commands"><code>npm run test:alpha-agi-mark\nnpm run demo:alpha-agi-mark:full</code></pre><p class="muted">Use the pinned Node/npm toolchain and npm ci first. Read the runbook before configuring an external network.</p></article><article><span class="work-number">THE WORKER ROUTE</span><h3>Connect authorized execution.</h3><p>OpenClaw executes through the repository’s admitted Responses adapter and a protected worker profile. ChatGPT Work is an operator-led route with its own tools and permissions; no remote Work dispatch API is exposed here.</p><a class="text-link" href="${guide(
    'docs/computer-work.md'
  )}">Worker integration guide →</a><a class="text-link" href="${base}work/">Open the complete work planner →</a></article><article><span class="work-number">THE EVIDENCE ROUTE</span><h3>Make readiness observable.</h3><p>Verify target-network configuration, trusted release, actual provider calls, independent review, buyer use and authorized settlement. This planning site supplies no production certification.</p><a class="text-link" href="${guide(
    'docs/production/readiness.md'
  )}">Current readiness index →</a><a class="text-link" href="${guide(
    'docs/MACHINE_LABOR.md'
  )}">Complete delivery workflow →</a></article></div></section>
    <section class="section mark-horizon" aria-labelledby="mark-horizon-title"><p class="eyebrow">A LONGER HORIZON, BUILT FROM USEFUL WORK</p><h2 id="mark-horizon-title">From one verified result<br>to extraordinary capacity.</h2><p class="section-description">Coordinate software, science, energy and infrastructure research into larger programs. The ambition is cumulative: better tools enable better experiments, stronger evidence and more capable teams. Physical infrastructure outcomes require engineering and validation beyond a screen.</p><div class="work-market"><strong>$40T / year</strong><p>User-supplied scenario assumption for broad screen-based labor, not a verified market estimate, revenue forecast or claim that all human tasks can be automated. Available tools, permissions, task reliability and independent review determine achievable work.</p></div><a class="text-link" href="${base}experiments/kardashev-ii/">Explore the civilization-scale research model →</a></section>
  </main>`;
}
