import {
  inspectEvidence,
  createAssessment,
  reviewLimits,
} from './review-model.mjs';

export function initEvidenceReview() {
  const form = document.getElementById('evidence-review');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const assessmentForm = $('review-assessment');
  let revision = 0;
  let inspection = null;
  const download = (name, bytes) => {
    const url = URL.createObjectURL(
      new Blob([bytes], { type: 'application/octet-stream' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const invalidate = () => {
    revision++;
    inspection = null;
    $('review-results').hidden = true;
    $('review-artifacts').replaceChildren();
    $('review-criteria').replaceChildren();
    assessmentForm.reset();
    $('review-status').textContent =
      'Inputs changed. Inspect the current files before recording a review.';
    $('review-assessment-status').textContent =
      'No assessment has been exported.';
  };
  form.reset();
  assessmentForm.reset();
  for (const event of ['input', 'change'])
    form.addEventListener(event, invalidate);
  assessmentForm.addEventListener('input', () => {
    $('review-assessment-status').textContent =
      'Review changed. Download a new assessment to capture the current findings.';
  });
  const element = (tag, content, className) => {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  };
  const render = (result) => {
    $('review-mode').textContent = result.simulated
      ? 'Fixture / simulated run. Integrity checked; this is not evidence of live provider work.'
      : 'Receipt declares a live run. Integrity checked; provider provenance remains unverified.';
    $('review-summary').textContent = result.summary;
    $('review-task-preview').textContent = JSON.stringify(result.task, null, 2);
    $('review-fingerprints').replaceChildren(
      ...Object.entries({
        'Job ID': result.jobId,
        'Deployment ID': result.deploymentId,
        'Attempt ID': result.attemptId,
        'Task file SHA-256': result.fingerprints.taskFileSha256,
        'Admitted task digest': result.fingerprints.taskSha256,
        'Receipt file SHA-256': result.fingerprints.receiptFileSha256,
      }).flatMap(([label, value]) => [
        element('dt', label),
        element('dd', value),
      ])
    );
    $('review-artifacts').replaceChildren(
      ...result.artifacts.map((artifact) => {
        const article = element('article', undefined, 'work-result');
        article.append(
          element('h3', artifact.name),
          element(
            'p',
            `${
              artifact.mediaType
            } · ${artifact.bytes.toLocaleString()} UTF-8 bytes`
          )
        );
        article.append(
          element('p', `SHA-256: ${artifact.sha256}`, 'review-hash')
        );
        const details = element('details');
        const pre = element('pre', artifact.content);
        pre.tabIndex = 0;
        pre.setAttribute('aria-label', `${artifact.name} untrusted text`);
        details.append(element('summary', 'Inspect untrusted text'), pre);
        const button = element(
          'button',
          'Download exact bytes as text ↓',
          'button secondary'
        );
        button.type = 'button';
        button.addEventListener('click', () => {
          if (inspection !== result) return;
          download(
            `${artifact.name}.txt`,
            new TextEncoder().encode(artifact.content)
          );
        });
        article.append(details, button);
        return article;
      })
    );
    $('review-criteria').replaceChildren(
      ...result.task.acceptanceCriteria.map((criterion, index) => {
        const fieldset = element('fieldset');
        fieldset.append(
          element('legend', `Criterion ${index + 1}`),
          element('p', criterion, 'review-untrusted')
        );
        const select = element('select');
        select.id = `criterion-${index}`;
        for (const [value, label] of [
          ['not-checked', 'Not checked'],
          ['pass', 'Pass'],
          ['fail', 'Fail'],
        ]) {
          const option = element('option', label);
          option.value = value;
          select.append(option);
        }
        const statusLabel = element('label', 'Finding');
        statusLabel.htmlFor = select.id;
        const evidence = element('textarea');
        evidence.id = `criterion-evidence-${index}`;
        evidence.maxLength = 2000;
        evidence.rows = 2;
        evidence.required = true;
        const evidenceLabel = element(
          'label',
          'Evidence, reproduction result or reason not checked'
        );
        evidenceLabel.htmlFor = evidence.id;
        fieldset.append(statusLabel, select, evidenceLabel, evidence);
        return fieldset;
      })
    );
    $('review-results').hidden = false;
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    invalidate();
    const checking = revision;
    const expected = {
      jobId: $('review-job').value,
      deploymentId: $('review-deployment').value,
    };
    const files = {
      task: $('review-task').files[0],
      receipt: $('review-receipt').files[0],
    };
    try {
      for (const [kind, file] of Object.entries(files)) {
        if (!file) throw new Error(`Choose the ${kind} JSON file.`);
        if (file.size > reviewLimits[kind])
          throw new Error(`The ${kind} file exceeds the displayed size limit.`);
      }
      $('review-status').textContent =
        'Checking local files and artifact fingerprints…';
      const [taskBytes, receiptBytes] = await Promise.all([
        files.task.arrayBuffer(),
        files.receipt.arrayBuffer(),
      ]);
      const result = await inspectEvidence(
        new Uint8Array(taskBytes),
        new Uint8Array(receiptBytes),
        expected
      );
      if (checking !== revision) return;
      inspection = result;
      render(result);
      $('review-status').textContent =
        'Integrity checked. Review the actual content and record a finding for every criterion.';
    } catch (error) {
      if (checking !== revision) return;
      $('review-status').textContent = error.message;
    }
    if (checking === revision) $('review-status').focus();
  });
  assessmentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const assessment = createAssessment(inspection, {
        ...Object.fromEntries(new FormData(assessmentForm)),
        criteria: inspection?.task.acceptanceCriteria.map((_, index) => ({
          status: $(`criterion-${index}`).value,
          evidence: $(`criterion-evidence-${index}`).value,
        })),
      });
      download(
        'review-assessment.json',
        JSON.stringify(assessment, null, 2) + '\n'
      );
      $('review-assessment-status').textContent =
        'Unsigned assessment downloaded. Buyer acceptance, reviewer authentication and settlement remain separate.';
    } catch (error) {
      $('review-assessment-status').textContent = error.message;
    }
    $('review-assessment-status').focus();
  });
  if (globalThis.crypto?.subtle) {
    form.querySelector('button[type="submit"]').disabled = false;
    $('review-status').textContent =
      'Choose the admitted task and completed worker receipt, then enter their expected job and deployment.';
  } else {
    $('review-status').textContent =
      'SHA-256 verification needs a secure browser context. Open the HTTPS site in a current browser.';
  }
}
