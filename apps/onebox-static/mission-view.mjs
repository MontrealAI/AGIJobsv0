import {
  MISSION_PROMPT,
  MISSION_SOURCES,
  sampleMissionReport,
  missionMarkdown,
} from './mission-fixture.mjs';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
const stages = ['created', 'assigned', 'submitted', 'validated', 'finalized'];
const names = ['Create', 'Assign', 'Submit', 'Review', 'Finalize'];
const guidance = {
  ready: [
    'Start with a useful question',
    'Can this fictional release ship? Turn three source records into a cited brief. One source deliberately remains unresolved. Your goal is an accurate report, including a justified hold recommendation.',
    'Review mission plan',
  ],
  created: [
    'Choose who does the work',
    'The job records its reward and deadline. Assign a simulated worker before submitting the sample brief.',
    'Review assignment',
  ],
  assigned: [
    'Inspect the work before submitting',
    'Open Mission evidence below. Compare the sample brief with its three synthetic sources. Edit it if you like; submission binds that exact text to your confirmation.',
    'Review submission',
  ],
  submitted: [
    'Make the evidence earn its approval',
    'Run eleven local checks for citations, matching results and a hold recommendation. These are mechanical checks over teaching data, not an independent audit.',
    'Review validation',
  ],
  rejected: [
    'A failed check is a useful result',
    'Inspect the failed checks below. Correct the report, then submit it again. You can also explore a dispute from the command box.',
    'Review resubmission',
  ],
  validated: [
    'A good report can recommend HOLD',
    'The brief meets its evidence requirements. Finalize the teaching job to acknowledge delivery. The fictional release remains on hold; no money moves.',
    'Review finalization',
  ],
  finalized: [
    'Mission complete. Evidence intact.',
    'You have a cited report, a validation checklist and an ordered action history. Download the brief or export the full session. Neither file certifies a real release.',
    'Review another mission',
  ],
  disputed: [
    'Dispute recorded for exploration',
    'This teaching model stops at the dispute. A real dispute needs the deployed protocol and human governance process. Export your evidence or begin another mission.',
    'Review another mission',
  ],
};

export function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createMissionView({ element, session, onPrompt }) {
  const drafts = new Map();
  let activeId = null;
  let latestId = null;
  let evidenceOpen = false;
  let busy = false;
  const current = () => session.jobs().find((job) => job.jobId === activeId);
  function captureDraft() {
    const editor = element.querySelector('#mission-report');
    if (editor && activeId) drafts.set(activeId, editor.value);
    const disclosure = element.querySelector('#mission-evidence');
    if (disclosure) evidenceOpen = disclosure.open;
  }
  function render({ offline, working = false, capture = true } = {}) {
    if (capture) captureDraft();
    busy = working;
    element.hidden = !offline;
    if (!offline) return;
    const missions = session
      .jobs()
      .filter((job) => job.scenario === 'release-readiness');
    if (missions[0]?.jobId !== latestId) {
      latestId = missions[0]?.jobId ?? null;
      activeId = latestId;
    }
    const job = current();
    const state = job?.status || 'ready';
    const [title, description, action] = guidance[state];
    const index = stages.indexOf(state);
    const achieved =
      state === 'rejected' || state === 'disputed' ? 3 : index + 1;
    const disabled = busy ? ' disabled' : '';
    const editable = ['assigned', 'rejected'].includes(state);
    const draft =
      drafts.get(activeId) ?? job?.artifact ?? sampleMissionReport();
    element.innerHTML = `
      <div class="mission-heading"><div><p class="onebox-eyebrow">GUIDED MISSION · ABOUT 3 MINUTES</p><h2 id="mission-title">A release decision, backed by evidence.</h2></div><span class="mission-badge">Synthetic scenario</span></div>
      <ol class="mission-progress" aria-label="Mission progress">${names
        .map(
          (name, i) =>
            `<li class="${i < achieved ? 'done' : ''}"${
              i === achieved && achieved < 5 ? ' aria-current="step"' : ''
            }><span aria-hidden="true">${
              i < achieved ? '✓' : `0${i + 1}`
            }</span>${name}<span class="sr-only">${
              i < achieved
                ? ' completed'
                : i === achieved
                ? ' next'
                : ' upcoming'
            }</span></li>`
        )
        .join('')}</ol>
      <div class="mission-body"><div><h3>${escape(title)}</h3><p>${escape(
      description
    )}</p><p class="mission-meta">${
      job
        ? `Job #${job.jobId} · ${escape(job.status)} · ${escape(
            job.reward
          )} simulated AGIALPHA · ${job.deadlineDays} days`
        : 'No wallet · No sign-up · No external requests'
    }</p></div><button type="button" class="mission-primary" data-mission="next"${disabled}>${action} <span aria-hidden="true">→</span></button></div>
      ${
        missions.length > 1
          ? `<label class="mission-select">Inspect a mission <select id="mission-selection"${disabled}>${missions
              .map(
                (m) =>
                  `<option value="${m.jobId}"${
                    m.jobId === activeId ? ' selected' : ''
                  }>Job #${m.jobId} · ${escape(m.status)}</option>`
              )
              .join('')}</select></label>`
          : ''
      }
      <details id="mission-evidence"${
        evidenceOpen ? ' open' : ''
      }><summary>Mission evidence <span>Sources, editable brief &amp; validation checks</span></summary><div class="mission-evidence-grid"><section aria-labelledby="mission-sources-title"><h3 id="mission-sources-title">01 · Read the sources</h3><p>Fixed, fictional records bundled with this demo. No live repository or service was assessed.</p><ul class="mission-sources">${MISSION_SOURCES.map(
      (s) =>
        `<li><strong>${s.label}</strong><span class="source-result">${s.result}</span><p>${s.detail}</p><code>${s.id}</code></li>`
    ).join(
      ''
    )}</ul></section><section aria-labelledby="mission-report-title"><h3 id="mission-report-title">02 · Inspect the brief</h3><label for="mission-report">${
      editable ? 'Editable sample report (JSON)' : 'Report (JSON)'
    }</label><p id="mission-report-hint">${
      editable
        ? 'Try removing a citation: validation will reject the incomplete report. Restore the sample and resubmit to recover.'
        : 'The report is editable after assignment or a rejected review. Submitted evidence stays fixed during review.'
    }</p><textarea id="mission-report" spellcheck="false" maxlength="20000" aria-describedby="mission-report-hint"${
      !editable || busy ? ' readonly' : ''
    }>${escape(
      draft
    )}</textarea><div class="mission-evidence-actions"><button type="button" data-mission="restore"${
      !editable || busy ? ' disabled' : ''
    }>Restore sample</button><button type="button" data-mission="break"${
      !editable || busy ? ' disabled' : ''
    }>Remove a citation</button><button type="button" data-mission="download"${
      !job?.artifact || busy ? ' disabled' : ''
    }>Download submitted brief</button></div></section></div><section class="mission-review" aria-labelledby="mission-checks-title"><h3 id="mission-checks-title">03 · Follow the checks</h3>${
      job?.review
        ? `<p role="status">${
            job.review.checks.filter((c) => c.passed).length
          }/${job.review.checks.length} checks passed · ${
            job.review.approved
              ? 'Report accepted; release remains on hold'
              : 'Report needs correction'
          }</p><ul>${job.review.checks
            .map(
              (c) =>
                `<li class="${c.passed ? 'check-pass' : 'check-fail'}"><b>${
                  c.passed ? 'PASS' : 'FAIL'
                }</b> ${escape(c.label)}</li>`
            )
            .join('')}</ul>`
        : '<p>After submission, review checks the cited results and report structure locally. Explanation text is checked for presence, not independently verified for truth.</p>'
    }</section></details>
      <p class="mission-footnote">Every action opens a plan for your confirmation. Cancel leaves the job unchanged. Session data resets on reload.</p>`;
  }
  element.addEventListener('input', (event) => {
    if (event.target.id === 'mission-report')
      drafts.set(activeId, event.target.value);
  });
  element.addEventListener('change', (event) => {
    if (event.target.id === 'mission-selection') {
      captureDraft();
      activeId = Number(event.target.value);
      render({ offline: true, working: busy, capture: false });
    }
  });
  element.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mission]');
    if (!button || button.disabled || busy) return;
    captureDraft();
    const job = current();
    switch (button.dataset.mission) {
      case 'next': {
        const commands = {
          created: 'Apply',
          assigned: 'Submit',
          rejected: 'Submit',
          submitted: 'Validate',
          validated: 'Finalize',
        };
        onPrompt(
          job && commands[job.status]
            ? `${commands[job.status]} job ${job.jobId}`
            : MISSION_PROMPT
        );
        break;
      }
      case 'restore':
        drafts.set(activeId, sampleMissionReport());
        render({ offline: true, capture: false });
        element.querySelector('#mission-report').focus();
        break;
      case 'break': {
        const sample = JSON.parse(sampleMissionReport());
        sample.findings[0].source = '';
        drafts.set(activeId, JSON.stringify(sample, null, 2));
        render({ offline: true, capture: false });
        element.querySelector('#mission-report').focus();
        break;
      }
      case 'download':
        if (job?.artifact)
          downloadText(
            `onebox-mission-${job.jobId}.md`,
            missionMarkdown(job),
            'text/markdown'
          );
        break;
    }
  });
  return {
    render,
    artifact(jobId) {
      captureDraft();
      return drafts.get(jobId);
    },
  };
}
