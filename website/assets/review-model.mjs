export const reviewLimits = { task: 512 * 1024, receipt: 2 * 1024 * 1024 };
const encoder = new TextEncoder();
const mediaTypes = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
];
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be a JSON object.`);
  return value;
}
function exact(value, keys, label) {
  object(value, label);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error(`${label} contains unsupported fields.`);
}
function text(value, label, max = 2000) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    new TextDecoder('utf-8', { ignoreBOM: true }).decode(
      encoder.encode(value)
    ) !== value
  )
    throw new Error(
      `${label} is missing, too long or contains invalid Unicode.`
    );
  return value;
}
function list(value, label, max = 20) {
  if (!Array.isArray(value) || !value.length || value.length > max)
    throw new Error(`${label} has an invalid item count.`);
  return value;
}
export async function digestBytes(bytes) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
function readJson(bytes, label, max) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > max)
    throw new Error(`${label} exceeds its file size limit.`);
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    );
  } catch {
    throw new Error(
      `${label} must be valid UTF-8 JSON without a byte-order mark.`
    );
  }
}
// Same field order and normalization as parseComputerWorkTask; integration tests
// compare both implementations and the real adapter's digest and receipt bytes.
export function normalizeReviewTask(value) {
  const task = object(value, 'Task');
  exact(
    task,
    [
      'schemaVersion',
      'workerProfile',
      'goal',
      'inputText',
      'dataClass',
      'allowedOrigins',
      'acceptanceCriteria',
      'deliverables',
    ],
    'Task'
  );
  if (
    task.schemaVersion !== 1 ||
    !['public', 'licensed', 'synthetic'].includes(task.dataClass)
  )
    throw new Error('Unsupported task schema or input class.');
  const workerProfile = text(task.workerProfile, 'Worker profile', 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(workerProfile))
    throw new Error('Invalid worker profile.');
  const allowedOrigins = list(task.allowedOrigins, 'Origins').map((value) => {
    const url = new URL(text(value, 'Origin', 2048));
    if (
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['127.0.0.1', '[::1]'].includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error(
        'Task origins must be exact HTTPS origins or literal loopback HTTP origins.'
      );
    return url.origin;
  });
  const deliverables = list(task.deliverables, 'Deliverables', 10).map(
    (item) => {
      exact(item, ['name', 'mediaType'], 'Deliverable');
      const name = text(item.name, 'Artifact name', 100);
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || name.includes('..'))
        throw new Error('Unsafe artifact name.');
      if (!mediaTypes.includes(item.mediaType))
        throw new Error('Unsupported artifact media type.');
      return { name, mediaType: item.mediaType };
    }
  );
  if (
    new Set(deliverables.map((item) => item.name)).size !== deliverables.length
  )
    throw new Error('Duplicate deliverable name.');
  return {
    schemaVersion: 1,
    workerProfile,
    goal: text(task.goal, 'Goal'),
    inputText: text(task.inputText, 'Input text', 32_000),
    dataClass: task.dataClass,
    allowedOrigins,
    acceptanceCriteria: list(
      task.acceptanceCriteria,
      'Acceptance criteria'
    ).map((value) => text(value, 'Acceptance criterion')),
    deliverables,
  };
}
export async function inspectEvidence(taskBytes, receiptBytes, expected) {
  const jobId = text(expected.jobId, 'Expected job ID', 80);
  if (!/^[1-9][0-9]*$/.test(jobId))
    throw new Error('Expected job ID must be a positive whole number.');
  const deploymentId = text(
    expected.deploymentId,
    'Expected deployment ID',
    200
  );
  const task = normalizeReviewTask(
    readJson(taskBytes, 'Task file', reviewLimits.task)
  );
  const receipt = object(
    readJson(receiptBytes, 'Receipt file', reviewLimits.receipt),
    'Receipt'
  );
  exact(
    receipt,
    [
      'schemaVersion',
      'attemptId',
      'jobId',
      'taskSha256',
      'deploymentId',
      'workerProfile',
      'simulated',
      'startedAt',
      'completedAt',
      'provider',
      'responseId',
      'status',
      'productionApproved',
      'settlementApproved',
      'review',
      'task',
      'summary',
      'artifacts',
    ],
    'Receipt'
  );
  if (
    receipt.schemaVersion !== 1 ||
    receipt.status !== 'evidence-ready' ||
    receipt.provider !== 'openclaw-responses' ||
    typeof receipt.simulated !== 'boolean' ||
    receipt.productionApproved !== false ||
    receipt.settlementApproved !== false ||
    receipt.review?.status !== 'required'
  )
    throw new Error(
      'Choose an unapproved evidence-ready receipt from the computer-work adapter.'
    );
  if (
    receipt.jobId !== jobId ||
    receipt.deploymentId !== deploymentId ||
    receipt.workerProfile !== task.workerProfile
  )
    throw new Error(
      'Receipt does not match the expected job, deployment or worker profile.'
    );
  if (
    typeof receipt.attemptId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      receipt.attemptId
    )
  )
    throw new Error('Invalid receipt attempt ID.');
  text(receipt.responseId, 'Response ID', 200);
  text(receipt.summary, 'Receipt summary', 4000);
  for (const key of ['startedAt', 'completedAt']) {
    if (
      typeof receipt[key] !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt[key]) ||
      !Number.isFinite(Date.parse(receipt[key])) ||
      new Date(receipt[key]).toISOString() !== receipt[key]
    )
      throw new Error('Invalid receipt timestamps.');
  }
  if (receipt.completedAt < receipt.startedAt)
    throw new Error('Receipt finishes before it starts.');
  const canonical = JSON.stringify(task);
  const taskSha256 = await digestBytes(encoder.encode(canonical));
  if (
    receipt.taskSha256 !== taskSha256 ||
    JSON.stringify(normalizeReviewTask(receipt.task)) !== canonical
  )
    throw new Error(
      'Receipt task digest or embedded task does not match the supplied task.'
    );
  const artifacts = list(receipt.artifacts, 'Artifacts', 10);
  if (
    artifacts.length !== task.deliverables.length ||
    new Set(artifacts.map((item) => item?.name)).size !== artifacts.length
  )
    throw new Error('Missing or duplicate artifacts.');
  const verified = [];
  for (const artifact of artifacts) {
    exact(
      artifact,
      ['name', 'mediaType', 'content', 'bytes', 'sha256'],
      'Artifact'
    );
    const required = task.deliverables.find(
      (item) =>
        item.name === artifact.name && item.mediaType === artifact.mediaType
    );
    if (!required)
      throw new Error('Artifact does not match a required deliverable.');
    const content = text(artifact.content, 'Artifact content', 128_000);
    const bytes = encoder.encode(content);
    if (
      bytes.length > 128_000 ||
      artifact.bytes !== bytes.length ||
      artifact.sha256 !== (await digestBytes(bytes))
    )
      throw new Error(
        'Artifact byte count or SHA-256 does not match its content.'
      );
    if (artifact.mediaType === 'application/json') {
      try {
        JSON.parse(content);
      } catch {
        throw new Error('A JSON artifact is malformed.');
      }
    }
    verified.push({
      ...required,
      content,
      bytes: bytes.length,
      sha256: artifact.sha256,
    });
  }
  return {
    schema: 'agi-jobs-evidence-inspection/v1',
    task,
    artifacts: verified,
    jobId,
    deploymentId,
    attemptId: receipt.attemptId,
    responseId: receipt.responseId,
    simulated: receipt.simulated,
    summary: receipt.summary,
    fingerprints: {
      taskFileSha256: await digestBytes(taskBytes),
      taskSha256,
      receiptFileSha256: await digestBytes(receiptBytes),
    },
    integrityVerified: true,
    providerAuthenticated: false,
    contentAccepted: false,
    settlementApproved: false,
    productionApproved: false,
  };
}
export function createAssessment(inspection, input) {
  if (
    inspection?.schema !== 'agi-jobs-evidence-inspection/v1' ||
    inspection.integrityVerified !== true
  )
    throw new Error(
      'Inspect the current files before preparing an assessment.'
    );
  const reviewer = text(input.reviewer, 'Reviewer identifier', 200);
  const conflicts = text(input.conflicts, 'Conflict disclosure', 2000);
  const notes = text(input.notes, 'Reproduction and review notes', 4000);
  if (!['accept', 'revise', 'reject'].includes(input.recommendation))
    throw new Error('Choose a review recommendation.');
  if (
    !Array.isArray(input.criteria) ||
    input.criteria.length !== inspection.task.acceptanceCriteria.length
  )
    throw new Error('Record a finding for every acceptance criterion.');
  const criteria = input.criteria.map((finding, index) => {
    if (!['pass', 'fail', 'not-checked'].includes(finding?.status))
      throw new Error('Invalid criterion finding.');
    return {
      criterion: inspection.task.acceptanceCriteria[index],
      status: finding.status,
      evidence: text(finding.evidence, 'Criterion evidence or reason', 2000),
    };
  });
  if (
    input.recommendation === 'accept' &&
    criteria.some((finding) => finding.status !== 'pass')
  )
    throw new Error(
      'An acceptance recommendation requires every criterion to pass.'
    );
  return {
    schema: 'agi-jobs-review-assessment/v1',
    status: 'unsigned-reviewer-assessment',
    jobId: inspection.jobId,
    deploymentId: inspection.deploymentId,
    attemptId: inspection.attemptId,
    fingerprints: { ...inspection.fingerprints },
    simulated: inspection.simulated,
    reviewer: {
      identifier: reviewer,
      conflicts,
      identityVerified: false,
      independenceVerified: false,
    },
    recommendation: input.recommendation,
    criteria,
    notes,
    integrityVerified: true,
    providerAuthenticated: false,
    buyerAccepted: false,
    settlementApproved: false,
    productionApproved: false,
  };
}
