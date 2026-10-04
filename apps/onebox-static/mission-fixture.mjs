// Synthetic source records, deliberately including an unresolved release gate.
// These are teaching data, never observations about this repository or a deployment.
export const MISSION_TITLE = 'Release readiness brief';
export const MISSION_PROMPT =
  'Post a release readiness brief for 5 AGIALPHA over 7 days';
export const MISSION_SOURCES = Object.freeze([
  Object.freeze({
    id: 'fixture/tests',
    label: 'Regression suite',
    result: 'pass',
    detail: '24 of 24 synthetic regression cases passed.',
  }),
  Object.freeze({
    id: 'fixture/recovery',
    label: 'Recovery rehearsal',
    result: 'pass',
    detail: 'The synthetic rollback rehearsal restored the previous version.',
  }),
  Object.freeze({
    id: 'fixture/security',
    label: 'Independent review',
    result: 'pending',
    detail: 'No independent reviewer has signed this synthetic release.',
  }),
]);

export function sampleMissionReport() {
  return JSON.stringify(
    {
      title: MISSION_TITLE,
      simulated: true,
      recommendation: 'hold',
      findings: MISSION_SOURCES.map((source) => ({
        source: source.id,
        result: source.result,
        explanation: source.detail,
      })),
      nextAction:
        'Obtain an independent review and resolve its findings before considering release.',
    },
    null,
    2
  );
}

// Mechanical evidence checks only: no LLM, remote provider or security attestation.
export function reviewMissionReport(text) {
  const checks = [];
  const check = (label, passed) =>
    checks.push({ label, passed: Boolean(passed) });
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    /* reported below */
  }
  check(
    'Report is a JSON object',
    report && typeof report === 'object' && !Array.isArray(report)
  );
  if (!checks[0].passed) return { approved: false, checks };
  check('Report is explicitly simulated', report.simulated === true);
  check(
    'Recommendation holds the release while review is pending',
    report.recommendation === 'hold'
  );
  const findings = Array.isArray(report.findings) ? report.findings : [];
  check(
    'Exactly three findings cite the three fixture sources',
    findings.length === 3 &&
      new Set(findings.map((f) => f?.source)).size === 3 &&
      findings.every((f) => MISSION_SOURCES.some((s) => s.id === f?.source))
  );
  for (const source of MISSION_SOURCES) {
    const finding = findings.find((f) => f?.source === source.id);
    check(
      `${source.label}: cited result matches the source`,
      finding?.result === source.result
    );
    check(
      `${source.label}: explanation is present`,
      typeof finding?.explanation === 'string' &&
        finding.explanation.trim().length >= 12
    );
  }
  check(
    'A concrete next action is recorded',
    typeof report.nextAction === 'string' &&
      report.nextAction.trim().length >= 20
  );
  return { approved: checks.every((c) => c.passed), checks };
}

export function missionMarkdown(job) {
  const lines = [
    '# One-Box · Release readiness brief',
    '',
    '> SIMULATED TEACHING ARTIFACT — no production approval, independent audit or chain transaction.',
    '',
    `Job: ${job.jobId} · Lifecycle: ${job.status}`,
    '',
    '## Synthetic source records',
    '',
  ];
  for (const source of MISSION_SOURCES)
    lines.push(
      `- **${source.label}** (${source.id}): ${source.result}. ${source.detail}`
    );
  lines.push(
    '',
    '## Submitted report',
    '',
    '```json',
    job.artifact || '(No report submitted)',
    '```',
    '',
    '## Mechanical validation',
    ''
  );
  for (const check of job.review?.checks || [])
    lines.push(`- ${check.passed ? 'PASS' : 'FAIL'}: ${check.label}`);
  lines.push(
    '',
    'A validated report can correctly recommend HOLD. Finalizing this teaching job means the brief is complete; it does not approve a software release.',
    ''
  );
  return lines.join('\n');
}
