// SPDX-License-Identifier: MIT
// Local inspection only. Imported data cannot select runtime code or grant authority.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonical, parseBounded, parseWorkRequest, validateBindings, validateResources,
  BINDING_KEYS, RESOURCE_KEYS, REQUEST_SCHEMA, STAGES } from './discovery-lab-contract.mjs';

export const DISCOVERY_LAB_ADMISSION_SCHEMA = 'agijobsv0/discovery-lab-admission/v1';
const ROUTE = 'jobs-agialpha', CURRENCY = 'AGIALPHA18';
const sha = value => createHash('sha256').update(value).digest('hex');
const source = Object.freeze({ adapterSha256:sha(readFileSync(new URL(import.meta.url))),
  contractSha256:sha(readFileSync(new URL('./discovery-lab-contract.mjs', import.meta.url))) });
const same = (a, b) => canonical(a) === canonical(b);
const need = (condition, code) => { if (!condition) throw Object.assign(Error(code), { code }); };
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);

export function discoveryLabReceiverCapabilities() {
  return { schema:REQUEST_SCHEMA, stages:[...STAGES], route:ROUTE, currency:CURRENCY,
    executionMode:'synthetic-local', admission:'local-inspection-only',
    externalExecution:'unprovisioned', submission:'unsupported', authority:'none', source:{...source} };
}

function currentContext(request, expectedBindings, expectedCommission) {
  validateBindings(expectedBindings);
  need(same(Object.fromEntries(BINDING_KEYS.map(key => [key, request[key]])), expectedBindings),
    'DISCOVERY_LAB_STALE_BINDINGS');
  need(exact(expectedCommission, ['id', 'branch', 'route']) && identifier(expectedCommission.id)
    && identifier(expectedCommission.branch) && expectedCommission.route === ROUTE,
  'DISCOVERY_LAB_EXPECTED_COMMISSION');
  need(request.commission.route === ROUTE && request.commission.currency === CURRENCY,
    'DISCOVERY_LAB_WRONG_ROUTE');
  need(['id', 'branch', 'route'].every(key => request.commission[key] === expectedCommission[key]),
    'DISCOVERY_LAB_COMMISSION_BINDING');
}

function checkReport(value) {
  canonical(value);
  need(exact(value, ['accepted', 'resourceUsed', 'reasons']) && typeof value.accepted === 'boolean'
    && Array.isArray(value.reasons) && value.reasons.length <= 32
    && value.reasons.every(reason => typeof reason === 'string' && reason.length > 0 && reason.length <= 500)
    && (value.accepted || value.reasons.length > 0), 'DISCOVERY_LAB_CHECKER_REPORT');
  validateResources(value.resourceUsed);
  return JSON.parse(canonical(value));
}

/** The caller supplies the installed checker and its independently frozen current context. */
export async function inspectDiscoveryLabWorkRequest(raw, {
  expectedBindings, expectedCommission, inspectCampaign,
} = {}) {
  const request = await parseWorkRequest(raw);
  currentContext(request, expectedBindings, expectedCommission);
  need(typeof inspectCampaign === 'function', 'DISCOVERY_LAB_INSPECTOR_REQUIRED');
  const requestSnapshot = canonical(request);
  const report = checkReport(await inspectCampaign(request.payload,
    { request:JSON.parse(requestSnapshot), limits:{...request.resourceLimits} }));
  need(canonical(request) === requestSnapshot, 'DISCOVERY_LAB_CHECKER_MUTATED_INPUT');
  const withinResourceEnvelope = RESOURCE_KEYS.every(key => report.resourceUsed[key] <= request.resourceLimits[key]);
  const state = !withinResourceEnvelope ? 'inconclusive' : report.accepted ? 'local-checked' : 'local-rejected';
  return { schema:DISCOVERY_LAB_ADMISSION_SCHEMA, state, original:raw, requestSha256:sha(raw),
    bindings:JSON.parse(canonical(expectedBindings)), commission:{...request.commission},
    stage:request.stage, inputArtifacts:[...request.inputArtifacts], payloadDigest:request.payloadDigest,
    source:{...source}, checker:{report, withinResourceEnvelope},
    lifecycle:{commission:'DRAFT_NOT_SUBMITTED', reservedBaseUnits:'0', execution:'unprovisioned',
      review:'separate-review-required', settlement:'not-connected'},
    capabilityAcceptance:'not-granted-by-import', authority:'none' };
}

/** Probe unsupported schema/mode explicitly; malformed or stale supported requests still reject. */
export async function receiveDiscoveryLabWorkRequest(raw, options = {}) {
  const input = parseBounded(raw);
  if (input?.schema !== REQUEST_SCHEMA) return { state:'unsupported', reason:'DISCOVERY_LAB_UNSUPPORTED_SCHEMA',
    requestSha256:sha(raw), authority:'none' };
  if (input.executionMode !== 'synthetic-local') return { state:'unprovisioned', reason:'DISCOVERY_LAB_EXECUTION_UNPROVISIONED',
    requestSha256:sha(raw), authority:'none' };
  return inspectDiscoveryLabWorkRequest(raw, options);
}
