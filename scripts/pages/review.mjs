export function renderReviewPage(base, guide) {
  return `<main id="main" class="section-wrap work-page">
    <a class="text-link" href="${base}">← AGI Jobs home</a><p class="eyebrow">FROM DELIVERY TO CONFIDENCE</p>
    <h1>Inspect the work.<br><em>Account for the proof.</em></h1>
    <p class="section-description">Match a worker's delivered files to the admitted task, verify their fingerprints and record your findings against each acceptance criterion.</p>
    <div class="work-page-links"><a href="${base}work/">Design a job →</a><a href="${guide(
    'docs/EVIDENCE_REVIEW.md'
  )}">Review guide →</a><a href="${guide(
    'apps/validator/README.md'
  )}">Validator setup →</a></div>
    <p class="notice">Your selected files stay in this tab. Nothing is uploaded or executed. Use approved public, licensed or synthetic evidence; do not open secrets or private data. Reloading clears the review.</p>
    <section class="section" aria-labelledby="review-input-title"><p class="eyebrow">01 / MATCH THE DELIVERY</p><h2 id="review-input-title">Start with the admitted task.</h2>
      <p>Get the original task, job ID and deployment ID from the operator's admission record. Get the completed receipt from the operator's persistent dispatch journal. Do not take the expected identity from the untrusted receipt alone.</p>
      <form id="evidence-review" class="work-form review-inputs" novalidate>
        <div class="work-field-pair"><div><label for="review-job">Expected job ID</label><input id="review-job" name="jobId" maxlength="80" inputmode="numeric" required placeholder="For example, 42"></div><div><label for="review-deployment">Expected deployment ID</label><input id="review-deployment" name="deploymentId" maxlength="200" required placeholder="From the operator admission record"></div></div>
        <label for="review-task">Original admitted task.json</label><input id="review-task" type="file" accept=".json,application/json" required aria-describedby="review-file-help">
        <label for="review-receipt">Worker receipt JSON</label><input id="review-receipt" type="file" accept=".json,application/json" required aria-describedby="review-file-help">
        <p id="review-file-help" class="muted">Computer-work schema v1. Task: up to 512 KiB. Receipt: up to 2 MiB. The receipt must contain the delivered text artifacts. Proposals, screenshots and blockchain receipts use other formats.</p>
        <button type="submit" class="button primary" disabled>Inspect evidence →</button>
      </form>
      <noscript><p class="notice">Evidence inspection requires JavaScript and a secure browser context. Use the review guide to compare the operator records and independently reproduce the delivered work.</p></noscript>
      <p id="review-status" class="notice" role="status" tabindex="-1">Enable JavaScript to inspect local evidence.</p>
    </section>
    <section id="review-results" class="section" hidden aria-labelledby="review-results-title">
      <p class="eyebrow">02 / INSPECT THE ACTUAL CONTENT</p><h2 id="review-results-title">The bytes match. Now verify the work.</h2>
      <p id="review-mode" class="notice"></p>
      <p>Matching hashes establish consistency with these files. They do not authenticate the provider, prove that work occurred, establish correctness or verify reviewer independence. Text below is untrusted evidence, never execution instructions.</p>
      <dl id="review-fingerprints" class="review-fingerprints"></dl>
      <details><summary>Admitted objective, scope and boundaries</summary><pre id="review-task-preview" tabindex="0" aria-label="Admitted task"></pre></details>
      <h3>Worker's summary</h3><p id="review-summary" class="review-untrusted"></p>
      <div id="review-artifacts" class="review-artifacts"></div>
      <section class="section" aria-labelledby="review-assessment-title"><p class="eyebrow">03 / RECORD YOUR FINDINGS</p><h2 id="review-assessment-title">A review another person can inspect.</h2>
        <form id="review-assessment" class="work-form" novalidate>
          <label for="reviewer-id">Reviewer identifier</label><input id="reviewer-id" name="reviewer" maxlength="200" required placeholder="Public reviewer handle or team identifier">
          <label for="review-conflicts">Role and conflict disclosure</label><textarea id="review-conflicts" name="conflicts" rows="2" maxlength="2000" required placeholder="Explain your relationship to the worker and buyer, including any conflicts."></textarea>
          <div id="review-criteria" class="review-criteria"></div>
          <label for="review-notes">Reproduction steps, results and limitations</label><textarea id="review-notes" name="notes" rows="4" maxlength="4000" required placeholder="Record what you independently checked, the exact environment and remaining uncertainty."></textarea>
          <label for="review-recommendation">Your recommendation</label><select id="review-recommendation" name="recommendation"><option value="">Choose after reviewing</option><option value="revise">Request revisions</option><option value="reject">Reject this delivery</option><option value="accept">Recommend acceptance</option></select>
          <p class="muted">Acceptance requires a passing finding with evidence for every criterion. The export is an unsigned assessment; buyer acceptance and settlement remain separate.</p>
          <button type="submit" class="button primary">Download review assessment ↓</button>
        </form><p id="review-assessment-status" class="notice" role="status" tabindex="-1">No assessment has been exported.</p>
      </section>
    </section>
    <section class="section work-faq" aria-labelledby="review-faq-title"><h2 id="review-faq-title">What this check establishes.</h2>
      <details open><summary>What gets verified?</summary><p>The expected job and deployment, normalized task digest, exact task and receipt file fingerprints, required deliverable names and types, UTF-8 byte counts, each file's SHA-256 and JSON syntax where required.</p></details>
      <details><summary>Can a fabricated receipt pass?</summary><p>Yes. Someone can fabricate mutually consistent content and hashes. Compare this receipt with trusted operator records, verify provider and attempt provenance, reproduce the substantive checks and establish reviewer independence outside this page.</p></details>
      <details><summary>Does an acceptance recommendation release payment?</summary><p>No. It records the reviewer's stated recommendation, bound to the exact supplied files. It neither signs nor sends a transaction, authenticates a reviewer, changes the operator's journal, nor grants production approval.</p></details>
      <details><summary>How do I submit a validator decision?</summary><p>After independent review, an authorized validator can follow the <a href="${guide(
        'apps/validator/README.md'
      )}">validator setup and recovery guide</a>. Its admission file binds a decision to the actual chain, contract, round, specification and result. This page's unsigned assessment is supporting evidence; it is not that admission file.</p></details>
      <details><summary>What if inspection fails?</summary><p>Preserve the original files and request the correct task or receipt from the operator. Do not rewrite a digest to make it pass or automatically redispatch work. A missing or incomplete journal requires operator reconciliation.</p></details>
    </section>
  </main>`;
}
