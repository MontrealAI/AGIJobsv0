// SPDX-License-Identifier: MIT
// Retain native campaigns as inert evidence; payment authorization stays separate.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  canonical,
  digest,
  parseBounded,
} from './vendor/alpha/docs/assets/successor/engine.mjs';

export const TRANSFORMATION_WORK_DRAFT_SCHEMA =
  'agijobsv0/transformational-work-draft/v1';
const MAX_BYTES = 2_000_000;
const MAX_AMOUNT = (1n << 96n) - 1n;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const byteDigest = (value) => 'sha256:' + sha(value);
const source = Object.freeze({
  adapterSha256: byteDigest(readFileSync(new URL(import.meta.url))),
  nativeDataPolicySha256: byteDigest(
    readFileSync(
      new URL(
        './vendor/alpha/docs/assets/successor/engine.mjs',
        import.meta.url
      )
    )
  ),
});
const route = Object.freeze({
  backend: 'agijobsv0-jobregistry-v2',
  asset: 'AGIALPHA',
  decimals: 18,
  chainId: 1,
  token: '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA',
  deployment: null,
});
const need = (condition, code) => {
  if (!condition) throw Object.assign(Error(code), { code });
};
const same = (a, b) => canonical(a) === canonical(b);
const hash = (value) =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const credentialKeys = new Set([
  'password',
  'passwd',
  'apikey',
  'privatekey',
  'seedphrase',
  'accesstoken',
  'refreshtoken',
  'bearertoken',
  'authtoken',
  'clientsecret',
  'signingkey',
  'secret',
  'credentials',
  'token',
  'authorization',
  'idtoken',
  'sessiontoken',
  'apisecret',
  'secretkey',
  'credential',
]);
const credentialKey = (key) =>
  credentialKeys.has(key) ||
  /password|passwd|apikey|privatekey|seedphrase|authorization|clientsecret|signingkey|secret|credential/.test(
    key
  ) ||
  key.endsWith('token');
function publicURL(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    need(false, 'TRANSFORMATION_PUBLIC_URL');
  }
  const host = url.hostname.toLowerCase();
  need(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === '443') &&
      host.includes('.') &&
      !/^[\d.]+$/.test(host) &&
      !host.includes(':') &&
      !host.startsWith('[') &&
      !host.endsWith('.') &&
      host.length <= 253 &&
      host
        .split('.')
        .every((label) =>
          /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
        ) &&
      !/(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(
        host
      ),
    'TRANSFORMATION_PUBLIC_URL'
  );
  for (const name of url.searchParams.keys()) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    need(
      !credentialKey(key) &&
        !['key', 'sig', 'signature'].includes(key) &&
        !/^x(?:amz|goog)/.test(key),
      'TRANSFORMATION_PRIVATE_INPUT'
    );
  }
}
function inertNativeAuthorization(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('|') ===
      'authority_expansion|binding|scope' &&
    value.scope === 'local-bounded' &&
    value.authority_expansion === false &&
    (value.binding === null || hash(value.binding))
  );
}
function read(raw) {
  need(
    typeof raw === 'string' && Buffer.byteLength(raw, 'utf8') <= MAX_BYTES,
    'TRANSFORMATION_INPUT_SIZE'
  );
  const value = parseBounded(raw),
    decoded = canonical(value);
  const pending = [{ item: value, path: [] }];
  while (pending.length) {
    const { item, path } = pending.pop();
    if (item && typeof item === 'object') {
      for (const [name, child] of Object.entries(item)) {
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nativeAuthorization =
          key === 'authorization' &&
          path.length === 0 &&
          value.schema === 'transformational-intelligence/v1' &&
          inertNativeAuthorization(child);
        const publicRouteToken =
          key === 'token' &&
          path.length === 1 &&
          path[0] === 'route' &&
          value.schema === TRANSFORMATION_WORK_DRAFT_SCHEMA &&
          child === route.token;
        const publicAuthorizationBinding =
          name === 'authorizationBinding' &&
          path.length === 1 &&
          path[0] === 'bindings' &&
          value.schema === TRANSFORMATION_WORK_DRAFT_SCHEMA &&
          (child === null || hash(child));
        need(
          !credentialKey(key) ||
            nativeAuthorization ||
            publicRouteToken ||
            publicAuthorizationBinding ||
            child === null ||
            child === '',
          'TRANSFORMATION_PRIVATE_INPUT'
        );
        pending.push({ item: child, path: [...path, name] });
      }
    } else if (typeof item === 'string') {
      for (const match of item.matchAll(/https?:\/\/[^\s"'<>]+/gi))
        publicURL(match[0]);
    }
  }
  need(
    !/(?:-----BEGIN [A-Z ]*PRIVATE KEY|\b(?:sk-(?:proj-)?|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{16,}|\b(?:password|passwd|api[_-]?key|private[_-]?key|seed[_ -]?phrase|access[_-]?token)\s*[=:]\s*\S{6,}|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/i.test(
      decoded
    ),
    'TRANSFORMATION_PRIVATE_INPUT'
  );
  return value;
}
function units(value, code, positive = false) {
  need(
    typeof value === 'string' && /^(?:0|[1-9][0-9]{0,28})$/.test(value),
    code
  );
  const amount = BigInt(value);
  need(amount <= MAX_AMOUNT && (!positive || amount > 0n), code);
  return amount;
}

/** The inspector is installed application code, never selected by imported data. */
export async function inspectTransformationWorkRequest(
  requestRaw,
  { expectedBindingsDigest, inspectWorkRequest } = {}
) {
  const request = read(requestRaw);
  need(
    typeof inspectWorkRequest === 'function',
    'TRANSFORMATION_INSPECTOR_REQUIRED'
  );
  need(hash(expectedBindingsDigest), 'TRANSFORMATION_EXPECTED_BINDINGS');
  const inspected = read(canonical(await inspectWorkRequest(requestRaw)));
  need(same(inspected, request), 'TRANSFORMATION_NATIVE_BINDING');
  need(
    request.schema === 'transformational-intelligence/v1' &&
      typeof request.campaign_id === 'string' &&
      request.campaign_id.trim().length > 0 &&
      Number.isSafeInteger(request.revision) &&
      request.revision >= 0,
    'TRANSFORMATION_IDENTITY'
  );
  need(
    request.charter?.schema === 'intent-charter/v1' &&
      request.charter.publicOnly === true,
    'TRANSFORMATION_PUBLIC_CHARTER'
  );
  need(
    ['none', 'USDC', 'AGIALPHA'].includes(request.charter.payment_route) &&
      request.settlement?.route === request.charter.payment_route &&
      request.settlement.status === 'unfunded' &&
      request.settlement.transaction_prepared === false,
    'TRANSFORMATION_SETTLEMENT_SCOPE'
  );
  for (const field of ['charter', 'formulation', 'transformation', 'bindings'])
    need(
      request[field] &&
        hash(request[field + '_digest']) &&
        request[field + '_digest'] ===
          (await digest('ti-' + field, request[field])),
      'TRANSFORMATION_OBJECT_BINDING'
    );
  need(
    request.bindings_digest === expectedBindingsDigest,
    'TRANSFORMATION_STALE_BINDINGS'
  );
  need(
    request.evaluation?.instrument &&
      hash(request.evaluation.instrument_digest) &&
      request.evaluation.instrument_digest ===
        (await digest('ti-instrument', request.evaluation.instrument)) &&
      Number.isSafeInteger(request.evaluation.epoch) &&
      request.evaluation.epoch >= 1,
    'TRANSFORMATION_EVALUATION'
  );
  need(
    request.authorization?.scope === 'local-bounded' &&
      request.authorization.authority_expansion === false &&
      (request.authorization.binding === null ||
        hash(request.authorization.binding)),
    'TRANSFORMATION_AUTHORIZATION_SCOPE'
  );
  need(request.review?.independent === false, 'TRANSFORMATION_REVIEW_SCOPE');
  units(
    request.charter.budgets?.AGIALPHABaseUnits,
    'TRANSFORMATION_AGIALPHA_CAP'
  );
  return request;
}

/** A nonzero proposal requires a separately supported native charter allowance. */
export async function createTransformationWorkDraft(
  requestRaw,
  {
    amountBaseUnits,
    createdAt,
    expectedBindingsDigest,
    inspectWorkRequest,
  } = {}
) {
  const request = await inspectTransformationWorkRequest(requestRaw, {
    expectedBindingsDigest,
    inspectWorkRequest,
  });
  need(
    request.charter.payment_route === 'AGIALPHA',
    'TRANSFORMATION_AGIALPHA_ROUTE'
  );
  need(
    typeof createdAt === 'string' &&
      Number.isFinite(Date.parse(createdAt)) &&
      new Date(createdAt).toISOString() === createdAt,
    'TRANSFORMATION_CLOCK'
  );
  const proposed = units(
    amountBaseUnits,
    'TRANSFORMATION_AGIALPHA_AMOUNT',
    true
  );
  const cap = units(
    request.charter.budgets.AGIALPHABaseUnits,
    'TRANSFORMATION_AGIALPHA_CAP'
  );
  need(cap > 0n && proposed <= cap, 'TRANSFORMATION_AGIALPHA_CAP');
  const bindings = {
    campaignId: request.campaign_id,
    revision: request.revision,
    requestRawSha256: byteDigest(requestRaw),
    charterDigest: request.charter_digest,
    formulationDigest: request.formulation_digest,
    transformationDigest: request.transformation_digest,
    instrumentDigest: request.evaluation.instrument_digest,
    measurementEpoch: request.evaluation.epoch,
    runtimeBindingsDigest: request.bindings_digest,
    authorizationBinding: request.authorization.binding,
    ...source,
  };
  const specification = {
    schema: 'agijobsv0/transformational-work-specification/v1',
    bindings,
    inputPolicy: 'public-nonpersonal-only',
    requiredReview: 'independent-review-required',
    authority: 'none',
  };
  const specRaw = canonical(specification);
  const body = {
    schema: TRANSFORMATION_WORK_DRAFT_SCHEMA,
    createdAt,
    route,
    original: requestRaw,
    bindings,
    planning: {
      amountBaseUnits: proposed.toString(),
      decimals: 18,
      reservedBaseUnits: '0',
      status: 'unfunded-proposal',
    },
    authorizedCapBaseUnits: cap.toString(),
    jobSpecification: { raw: specRaw, sha256: byteDigest(specRaw), uri: null },
    commissioning: {
      method: 'createJob(uint256,uint64,bytes32,string)',
      rewardBaseUnits: proposed.toString(),
      specHash: '0x' + sha(specRaw),
      deadline: null,
      specURI: null,
      transaction: null,
      state: 'requires-deployment-and-terms-selection',
    },
    provenance: 'untrusted-campaign-revalidated',
    authority: 'none',
    review: 'independent-review-required',
    independentProof: false,
    trustedComputerExecution: false,
    executionApproved: false,
    settlementApproved: false,
    productionApproved: false,
    settlement: 'not-connected',
  };
  const raw = canonical({ ...body, sha256: byteDigest(canonical(body)) });
  need(
    Buffer.byteLength(raw, 'utf8') <= MAX_BYTES,
    'TRANSFORMATION_INPUT_SIZE'
  );
  return raw;
}

export async function inspectTransformationWorkDraft(raw, options = {}) {
  const draft = read(raw);
  const rebuilt = await createTransformationWorkDraft(draft.original, {
    ...options,
    amountBaseUnits: draft.planning?.amountBaseUnits,
    createdAt: draft.createdAt,
  });
  need(raw === rebuilt, 'TRANSFORMATION_DRAFT_INTEGRITY');
  return draft;
}
