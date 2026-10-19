import {
  canonicalize,
  digestBytes,
} from '../../packages/successor-core/src/integrity.mjs';
import {
  restoreComputerMissionReport,
  reviewObservedAllocation,
  compileComputerMissionJobs,
} from '../../packages/successor-core/src/computer-mission.mjs';
import { renderComputerDeskTaskHTML } from '../../scripts/pages/computer-mission.mjs';

export const COMPUTER_RECEIPT_DRAFT_SCHEMA =
  'agijobsv0/four-repo-computer-draft/v1';
const MAX_RAW_BYTES = 4_000_000;
const MAX_DRAFT_BYTES = 8_388_608;
const route = Object.freeze({
  backend: 'agijobsv0-jobregistry-v2',
  asset: 'AGIALPHA',
  decimals: 18,
  token: '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA',
});
const reject = (condition, code) => {
  if (!condition) throw Object.assign(Error(code), { code });
};
function fields(value, expected, code) {
  reject(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join('|') === [...expected].sort().join('|'),
    code
  );
}
function read(raw, max = MAX_RAW_BYTES) {
  reject(
    typeof raw === 'string' && new TextEncoder().encode(raw).length <= max,
    'COMPUTER_DRAFT_SIZE'
  );
  const value = JSON.parse(raw);
  canonicalize(value);
  return value;
}
const same = (a, b) => canonicalize(a) === canonicalize(b);
function clock(value) {
  reject(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'COMPUTER_DRAFT_CLOCK'
  );
  return value;
}
function amount(value) {
  reject(
    typeof value === 'string' && /^[1-9][0-9]{0,28}$/.test(value),
    'COMPUTER_DRAFT_AMOUNT'
  );
  reject(BigInt(value) <= (1n << 96n) - 1n, 'COMPUTER_DRAFT_AMOUNT');
  return value;
}
function observedResult(text) {
  reject(typeof text === 'string', 'COMPUTER_DRAFT_OBSERVATION');
  const marker = 'SUCCESSOR_COMPUTER_RESULT';
  const parts = text.split(marker);
  reject(parts.length === 2, 'COMPUTER_DRAFT_OBSERVATION');
  const tail = parts[1].trimStart();
  reject(tail.startsWith('{'), 'COMPUTER_DRAFT_OBSERVATION');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < tail.length; index += 1) {
    const char = tail[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return read(tail.slice(0, index + 1));
    }
  }
  throw Object.assign(Error('COMPUTER_DRAFT_OBSERVATION'), {
    code: 'COMPUTER_DRAFT_OBSERVATION',
  });
}

/** Revalidate inert evidence without selecting a market, token, budget or permission. */
export async function inspectComputerReceiptEvidence(
  supplied,
  { inspectAlphaReturn } = {}
) {
  fields(
    supplied,
    ['handoffRaw', 'returnRaw', 'reportRaw'],
    'COMPUTER_DRAFT_INPUT_FIELDS'
  );
  const original = JSON.parse(canonicalize(supplied));
  reject(typeof inspectAlphaReturn === 'function', 'ALPHA_INSPECTOR_REQUIRED');
  const handoff = read(original.handoffRaw);
  const returned = read(original.returnRaw);
  const report = await restoreComputerMissionReport(original.reportRaw);
  const inspected = JSON.parse(
    canonicalize(
      await inspectAlphaReturn(original.handoffRaw, original.returnRaw)
    )
  );
  reject(
    inspected &&
      same(inspected.handoff, handoff) &&
      same(inspected.returned, returned) &&
      same(inspected.project, read(handoff.projectRaw)),
    'ALPHA_INSPECTION_BINDING'
  );
  reject(
    handoff.authority === 'none' &&
      handoff.settlement === 'not_connected' &&
      returned.authority === 'none' &&
      returned.settlement === 'not_connected' &&
      returned.verified === false &&
      returned.receipt?.verified === false &&
      returned.receipt?.state === 'review' &&
      returned.receipt?.cleanup === 'VERIFIED' &&
      same(returned.receipt?.authority, []) &&
      returned.receipt?.actions_reserved > 0 &&
      returned.receipt?.screenshots?.length > 1,
    'COMPUTER_DRAFT_UNREVIEWABLE'
  );
  reject(
    ['synthetic', 'public'].includes(handoff.task?.input_rights) &&
      handoff.task.input_rights === report.mission.inputRights.classification &&
      handoff.task.license === report.mission.inputRights.license &&
      same(handoff.task.allowed_urls, []) &&
      ['en', 'fr'].some(
        (language) =>
          handoff.task.html === renderComputerDeskTaskHTML(report, language)
      ),
    'COMPUTER_DRAFT_WORK_SURFACE'
  );
  const observed = observedResult(returned.observedText);
  reject(
    observed.missionDigest === report.mission.digest &&
      observed.reportDigest === report.digest &&
      observed.frozenProgramDigest === report.frozen.programDigest,
    'COMPUTER_DRAFT_REPORT_BINDING'
  );
  const review = await reviewObservedAllocation(report, observed);
  reject(review.accepted === true, 'COMPUTER_DRAFT_ALLOCATION_REJECTED');
  const project = inspected.project;
  return {
    original,
    project: {
      id: project.id,
      revision: project.revision,
      cycleId: project.cycles.at(-1)?.id ?? null,
      projectSha256: handoff.projectSha256,
    },
    bindings: {
      handoffRawSha256: await digestBytes(original.handoffRaw),
      returnRawSha256: await digestBytes(original.returnRaw),
      reportRawSha256: await digestBytes(original.reportRaw),
      alphaSourceHash: handoff.sourceHash,
      taskCommitment: returned.taskCommitment,
      executionContext: returned.executionContext,
      missionDigest: report.mission.digest,
      reportDigest: report.digest,
      frozenProgramDigest: report.frozen.programDigest,
      observedResultSha256: await digestBytes(canonicalize(observed)),
    },
    observationReview: review,
    report,
  };
}

/** Retain validated historical observations in an unfunded proposal; dispatch and settlement stay separate. */
export async function createComputerReceiptDraft(
  supplied,
  { amountBaseUnits, createdAt, inspectAlphaReturn } = {}
) {
  const planning = {
    amountBaseUnits: amount(amountBaseUnits),
    decimals: 18,
    status: 'unfunded-proposal',
    reservedBaseUnits: '0',
  };
  const created = clock(createdAt);
  const { original, project, bindings, observationReview, report } =
    await inspectComputerReceiptEvidence(supplied, { inspectAlphaReturn });
  const compiled = await compileComputerMissionJobs(report, { now: created });
  const body = {
    schema: COMPUTER_RECEIPT_DRAFT_SCHEMA,
    createdAt: created,
    route,
    original,
    project,
    bindings,
    planning,
    compiled,
    observationReview,
    review: 'independent-review-required',
    provenance: 'untrusted-historical-observation-revalidated',
    trustedComputerExecution: false,
    independentProof: false,
    protectedQualification: false,
    authority: 'none',
    settlement: 'not-connected',
    settlementApproved: false,
    productionApproved: false,
  };
  const raw = canonicalize({
    ...body,
    sha256: await digestBytes(canonicalize(body)),
  });
  reject(
    new TextEncoder().encode(raw).length <= MAX_DRAFT_BYTES,
    'COMPUTER_DRAFT_SIZE'
  );
  return raw;
}

export async function inspectComputerReceiptDraft(raw, options = {}) {
  const draft = read(raw, MAX_DRAFT_BYTES);
  const rebuilt = await createComputerReceiptDraft(draft.original, {
    amountBaseUnits: draft.planning?.amountBaseUnits,
    createdAt: draft.createdAt,
    inspectAlphaReturn: options.inspectAlphaReturn,
  });
  reject(raw === rebuilt, 'COMPUTER_DRAFT_INTEGRITY');
  return draft;
}
