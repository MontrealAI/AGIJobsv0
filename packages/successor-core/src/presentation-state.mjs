/** Pure rehearsal state: never a proof issuer, principal or effect authorizer. */
import { digestObject } from './integrity.mjs';

const missions = ['invoice', 'world', 'resources'];
export function createRehearsalState(
  mission = 'invoice',
  revision = 'uncommitted'
) {
  if (!missions.includes(mission))
    throw Object.assign(new Error('Choose a supported synthetic mission.'), {
      code: 'UI_MISSION_UNKNOWN',
    });
  return {
    version: 1,
    mission,
    revision,
    generation: 0,
    stage: 'DRAFT',
    report: null,
    frozen: null,
    review: null,
    authority: [],
    proofCurrency: 'absent',
    advantage: 'NOT_EVALUATED',
    events: [],
  };
}
export function invalidateRehearsal(state, reason = 'INPUT_CHANGED') {
  return {
    ...createRehearsalState(state.mission, state.revision),
    generation: state.generation + 1,
    events: [
      ...state.events,
      {
        type: 'PREVIEW_INVALIDATED',
        reason,
        previousDigest: state.frozen?.digest ?? null,
      },
    ],
  };
}
export function recordRehearsalRun(state, report, generation) {
  if (generation !== state.generation) return state; // A late asynchronous run cannot resurrect stale downloads.
  if (
    !report ||
    !['SYNTHETIC_REHEARSAL', 'synthetic', 'synthetic-rehearsal'].includes(
      report.mode
    )
  )
    throw Object.assign(
      new Error(
        'Only a synthetic rehearsal can be displayed in this public workbench.'
      ),
      { code: 'UI_SCOPE_MISMATCH' }
    );
  return {
    ...state,
    stage: 'EVALUATED',
    report: structuredClone(report),
    frozen: null,
    review: null,
    authority: [],
    proofCurrency: 'absent',
    advantage:
      (report.workbench?.alpha || report.alpha)?.status ?? 'NOT_ESTABLISHED',
    events: [
      ...state.events,
      { type: 'REHEARSAL_EXECUTED', mission: state.mission },
    ],
  };
}
export async function freezeRehearsal(state) {
  if (!state.report || state.stage === 'IMPAIRED')
    throw Object.assign(
      new Error('Run the bounded comparison before freezing a candidate.'),
      { code: 'UI_RUN_REQUIRED' }
    );
  const manifest = {
    schemaVersion: 1,
    purpose: 'candidate-preview-only',
    mode: 'SYNTHETIC_REHEARSAL',
    mission: state.mission,
    revision: state.revision,
    report: structuredClone(state.report),
  };
  const digest = await digestObject('successor.candidate.preview.v1', manifest);
  return {
    ...state,
    stage: 'FROZEN',
    frozen: { manifest, digest },
    review: null,
    authority: [],
    proofCurrency: 'absent',
    events: [...state.events, { type: 'PREVIEW_FROZEN', digest }],
  };
}
export function reviewRehearsal(state) {
  if (!state.frozen)
    throw Object.assign(
      new Error('Freeze the complete local candidate first.'),
      { code: 'UI_FREEZE_REQUIRED' }
    );
  return {
    ...state,
    stage: 'ADMISSION_DENIED',
    review: {
      candidateDigest: state.frozen.digest,
      mode: 'SIMULATED_ADMISSION',
      independentEvidence: 'UNAVAILABLE',
      decision: 'DENIED',
      reason: 'INDEPENDENT_PROOF_REQUIRED',
      nextDecision:
        'A separately accountable principal must commission protected evaluation; this public fixture cannot qualify.',
    },
    authority: [],
    proofCurrency: 'absent',
    events: [
      ...state.events,
      {
        type: 'SIMULATED_ADMISSION_DENIED',
        reason: 'INDEPENDENT_PROOF_REQUIRED',
      },
    ],
  };
}
export function impairRehearsal(state) {
  if (!state.frozen)
    throw Object.assign(
      new Error('Freeze a candidate before rehearsing evidence impairment.'),
      { code: 'UI_FREEZE_REQUIRED' }
    );
  return {
    ...state,
    generation: state.generation + 1,
    stage: 'IMPAIRED',
    frozen: null,
    review: null,
    authority: [],
    proofCurrency: 'absent',
    advantage: 'INVALIDATED',
    events: [
      ...state.events,
      {
        type: 'EVIDENCE_IMPAIRED',
        reason: 'SIMULATED_RIGHTS_LOSS',
        invalidatedDigest: state.frozen.digest,
      },
    ],
  };
}
