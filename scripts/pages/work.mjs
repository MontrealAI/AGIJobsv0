import { workTypes } from '../../website/assets/work-model.mjs';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );

export function renderWorkIntro(base, guide) {
  return `<section id="machine-labor" class="section-wrap section" aria-labelledby="labor-title">
    <div class="section-heading"><div><p class="eyebrow">THE MACHINE LABOR LAYER</p><h2 id="labor-title">A clear outcome.<br>A reviewable result.</h2></div><p>Authorized, lawful work through software, browsers and desktops.<br>Specialized agents. Independent verification. Accountable settlement.</p></div>
    <div class="work-roles">
      <article><span class="work-number">01 / BUYERS</span><h3>Define useful work.</h3><p>Choose a concrete deliverable, approved inputs and measurable acceptance criteria. Make review effort part of the job from the start.</p><a class="text-link" href="${base}work/">Design a job →</a></article>
      <article><span class="work-number">02 / WORKERS</span><h3>Execute within scope.</h3><p>Use a commissioned OpenClaw worker or an operator-led ChatGPT Work session. Capture artifacts, source evidence and actual results.</p><a class="text-link" href="${guide(
        'docs/computer-work.md'
      )}">Connect a worker →</a></article>
      <article><span class="work-number">03 / REVIEWERS</span><h3>Verify the outcome.</h3><p>Match delivered files to the admitted task, verify their fingerprints and record findings against each acceptance criterion. Buyer acceptance and authorized settlement follow the evidence.</p><a class="text-link" href="${base}review/">Inspect delivered work →</a></article>
    </div>
    <p class="work-footnote">This public site is an exploration and planning workspace. Downloads create local drafts; execution and settlement require a separately configured deployment.</p>
  </section>`;
}

export function renderVision(base, guide) {
  return `<section id="vision" class="section-wrap section work-vision" aria-labelledby="vision-title">
    <p class="eyebrow">THE LONG HORIZON</p><h2 id="vision-title">Useful work today.<br>Extraordinary capacity tomorrow.</h2>
    <p class="section-description">The ambition is to compound verified digital work into greater scientific, productive and infrastructure capacity. Scale grows through reliable execution, reproducible evidence and the ability to coordinate many specialized teams.</p>
    <div class="work-roles">
      <article><span class="work-number">USEFUL OUTPUT</span><h3>Build and improve.</h3><p>Software, analysis, tests, research tools and editable reports that a real buyer can use.</p><a class="text-link" href="${base}work/">Explore ten work categories →</a></article>
      <article><span class="work-number">COORDINATED CAPACITY</span><h3>Connect the work.</h3><p>Dependency-aware missions, independent review and explicit resource budgets across workers and teams.</p><a class="text-link" href="${base}demos/planetary-orchestrator-fabric-v0/">Explore orchestration →</a></article>
      <article><span class="work-number">CIVILIZATION-SCALE RESEARCH</span><h3>Expand the frontier.</h3><p>Model energy, science and stellar infrastructure programs. Their physical outcomes remain research ambitions requiring external engineering and validation.</p><a class="text-link" href="${base}experiments/kardashev-ii/">Open the scale model →</a></article>
    </div>
    <div class="work-market"><strong>$40T / year</strong><p>User-supplied planning assumption for the broad screen-based labor opportunity. It is not a verified TAM estimate, serviceable market, revenue forecast or claim that all human work is currently automatable. Actual capacity is bounded by task success, demand, economics and independent review.</p></div>
    <a class="text-link" href="${guide(
      'docs/production/readiness.md'
    )}">Inspect the current deployment requirements →</a>
  </section>`;
}

export function renderWorkPage(base, guide) {
  return `<main id="main" class="section-wrap work-page">
    <a class="text-link" href="${base}">← AGI Jobs home</a><p class="eyebrow">FROM INTENT TO ACCEPTANCE</p><h1>Design the work.<br><em>Define the proof.</em></h1>
    <p class="section-description">Turn a useful outcome into a scoped work proposal. Download the exact task for operator review, then hand it to an authorized worker with clear acceptance criteria.</p>
    <div class="work-page-links"><a href="#planner">Build a work order ↓</a><a href="#work-catalog">Browse ten categories ↓</a><a href="${guide(
      'docs/computer-work.md'
    )}">Execution guide ↗</a></div>
    <p class="notice">Local planning only. No account, wallet or provider connection is needed. This page does not fetch your sources or dispatch work. Do not enter secrets or private data.</p>
    <section id="planner" class="section" aria-labelledby="planner-title"><div class="section-heading"><div><p class="eyebrow">YOUR NEXT USEFUL JOB</p><h2 id="planner-title">Make success inspectable.</h2></div><p>Save an editable draft to continue later.<br>Changing a field requires a new work order.</p></div>
    <div class="work-draft-tools" role="group" aria-labelledby="draft-tools-title"><h3 id="draft-tools-title">Pick up where you left off.</h3><p id="draft-tools-help" class="muted">Save even an unfinished draft, then open it here to continue. Files contain your entered text and stay on your device. Reloading clears the form. Drafts carry no execution approval.</p><button id="work-save" type="button" class="button secondary" disabled>Save editable draft ↓</button><label for="work-open">Open saved editable draft</label><input id="work-open" type="file" accept=".json,application/json" aria-describedby="draft-tools-help" disabled></div>
    <div class="work-planner-grid"><form id="work-planner" class="work-form" novalidate>
      <label for="work-type">Work category</label><select id="work-type" name="type">${workTypes
        .map(
          (type) => `<option value="${type.id}">${escape(type.title)}</option>`
        )
        .join('')}</select>
      <label for="work-goal">Objective</label><textarea id="work-goal" name="goal" maxlength="2000" rows="3" required aria-describedby="goal-help"></textarea><p id="goal-help" class="muted">State the outcome the buyer will use. Your custom objective is kept when you change category.</p><button id="work-use-objective" type="button" class="text-button" disabled>Use category's suggested objective</button>
      <label for="work-scope">Scope and measurable acceptance detail</label><textarea id="work-scope" name="scope" maxlength="2000" rows="4" required placeholder="Name the exact project, dataset, requested change, success measure and exclusions."></textarea>
      <label for="work-sources">Approved source URLs</label><textarea id="work-sources" name="sources" maxlength="12000" rows="3" required aria-describedby="sources-help" placeholder="https://example.org/public-source"></textarea><p id="sources-help" class="muted">One HTTPS URL per line. Up to 20. No credentials, query strings or fragments. The operator must verify rights, availability and the derived origin allowlist.</p>
      <div class="work-field-pair"><div><label for="work-data">Input class</label><select id="work-data" name="dataClass"><option value="public">Approved public material</option><option value="licensed">Licensed material</option><option value="synthetic">Synthetic material</option></select></div><div><label for="work-runtime">Execution route</label><select id="work-runtime" name="runtime"><option value="openclaw">Commissioned OpenClaw worker</option><option value="work">Operator-led ChatGPT Work</option></select></div></div>
      <label for="work-profile">Worker profile name</label><input id="work-profile" name="workerProfile" value="research" maxlength="64" required aria-describedby="profile-help"><p id="profile-help" class="muted">For OpenClaw, this must match a protected operator profile. A profile name does not create or authorize a worker.</p>
      <label for="work-reward">Proposed reward ceiling (USDC)</label><input id="work-reward" name="reward" type="text" inputmode="decimal" value="1500" maxlength="20" required aria-describedby="reward-help"><p id="reward-help" class="muted">An unfunded commercial proposal, separate from provider charges. Existing v2 contracts here use 18-decimal AGIALPHA; verify the real deployment currency before settlement.</p>
      <div class="work-field-pair"><div><label for="work-run">Run allowance (minutes)</label><input id="work-run" name="runMinutes" type="number" min="1" max="1440" value="60" required></div><div><label for="work-review">Review allowance (minutes)</label><input id="work-review" name="reviewerMinutes" type="number" min="1" max="480" value="15" required></div></div>
      <p class="muted">These are planning allowances. Configure and verify actual runtime time, spending and stop controls separately.</p>
      <button type="submit" class="button primary" disabled>Build work order →</button>
      <noscript><p class="notice">The builder requires JavaScript. All categories and workflow guidance remain readable below. Use the linked task schema in the execution guide to prepare a draft manually.</p></noscript>
    </form><aside class="work-result" aria-labelledby="work-output-title"><p class="eyebrow">THE ACCEPTANCE CONTRACT</p><h3 id="work-output-title">What the worker delivers</h3><p id="work-outcome">Choose a category to see its expected outcome.</p><p class="muted" id="work-files">Text artifacts plus a separate evidence record.</p><h3>What the reviewer checks</h3><ol id="work-criteria"><li>Compare the result with the admitted task and its original sources.</li><li>Reproduce the checks independently.</li></ol><p class="muted">The current adapter returns bounded UTF-8 JSON, CSV, Markdown or plain text. Office files, screenshots, archives and larger applications require an explicitly commissioned artifact store and integrity verification.</p>
      <p id="work-status" class="notice" role="status" tabindex="-1">Enable JavaScript to build a local draft.</p>
      <div class="work-downloads"><button class="button secondary" data-work-download="proposal" type="button" disabled>Download proposal JSON ↓</button><button class="button secondary" data-work-download="task" type="button" disabled>Download task.json ↓</button><button class="text-button" data-work-download="handoff" type="button" disabled>Download operator handoff ↓</button></div>
      <div id="work-preview" tabindex="-1" hidden><h3>Exact proposal preview</h3><details><summary>Inspect the complete JSON</summary><pre tabindex="0" aria-label="Work proposal JSON"><code id="work-json"></code></pre></details></div>
    </aside></div></section>
    <section id="work-catalog" class="section" aria-labelledby="work-catalog-title"><div class="section-heading"><div><p class="eyebrow">TEN PRACTICAL STARTING POINTS</p><h2 id="work-catalog-title">Work a buyer can use.</h2></div><p>Templates describe proposed work.<br>They are not claims of completed customer engagements.</p></div><div class="work-type-grid">${workTypes
      .map(
        (type, i) =>
          `<article><span class="work-number">${String(i + 1).padStart(
            2,
            '0'
          )}</span><h3>${escape(type.title)}</h3><p>${escape(
            type.outcome
          )}</p><details><summary>Acceptance criteria</summary><ul>${type.checks
            .map((c) => `<li>${escape(c)}</li>`)
            .join('')}</ul></details></article>`
      )
      .join('')}</div></section>
    <section class="section work-faq" aria-labelledby="work-faq-title"><p class="eyebrow">BEFORE EXECUTION</p><h2 id="work-faq-title">From a draft to delivered value.</h2>
      <details open><summary>Why use AGI Jobs when a chatbot can help?</summary><p>The intended value is a complete work lifecycle: a scoped outcome, assigned execution, reviewable artifacts, independent acceptance and accountable settlement. Use a chatbot directly when a conversation is enough. Use the job workflow when the deliverable and its verification need to stand on their own.</p></details>
      <details><summary>Can an agent do every task done with a keyboard and mouse?</summary><p>Browser, desktop, code and file tools broaden the possible work substantially. Success still depends on available capabilities, permissions, inputs and measurable task performance. Qualify each work category with representative tasks, failure cases and independent review before committing to delivery.</p></details>
      <details><summary>How do OpenClaw and ChatGPT Work fit?</summary><p>The repository has an admitted OpenClaw Responses adapter. Its worker owns the configured browser, desktop and native Codex capabilities. ChatGPT Work is an operator-led execution route with its own tool access and permissions. The repository does not expose a remote Work execution API. <a class="text-link" href="${guide(
        'docs/computer-work.md'
      )}">Read the supported integration paths →</a></p></details>
      <details><summary>What happens after I download?</summary><p>Verify sources and rights, assign independent review, commission the runtime, then inspect and admit the exact task digest. The worker produces candidate evidence. Review the actual content, obtain buyer acceptance, and follow the configured settlement process only when authorized. A download grants none of these approvals.</p></details>
      <details><summary>What is ready for production?</summary><p>The static website, local demonstrations and integration code can be built and checked. A live deployment still needs authentic provider commissioning, release trust, independent security review, current dependency assessment and target-network evidence. <a class="text-link" href="${guide(
        'docs/production/readiness.md'
      )}">Inspect the current readiness index →</a></p></details>
    </section><div class="work-page-links"><a href="${base}review/">Inspect delivered work →</a><a href="${base}#explore">Explore the preserved demo collection →</a><a href="${guide(
    'docs/MACHINE_LABOR.md'
  )}">Complete delivery workflow →</a></div>
  </main>`;
}
