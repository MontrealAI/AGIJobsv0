// SPDX-License-Identifier: MIT
// Local extractive methods only. Source strings are data, never executable instructions.
import { canonicalize, cloneJson, digestBytes, digestObject } from './integrity.mjs';
import { compileJobs } from './compiler.mjs';
import { SCHEMA_VERSION, SuccessorError, requireCondition } from './domain.mjs';

const MAX_EXPORT_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 40;
const DECISION = 'KEEP_INCUMBENT_PENDING_INDEPENDENT_REVIEW';
const NO_PROOF = 'Exact quotation and word coverage do not establish relevance, truth, completeness, scientific validity, or an advantage. A distinct source and reviewer annotations are not protected independent proof.';
const STOP_WORDS = new Set(('a an the and or for of to in on by with from is are be as at it its this that these those my our your we us can could should would must want need find make better improve improved how what which who why into using use about than then des les une un le la du de et en pour par dans sur au aux avec est sont être ce ces ses mon ma mes notre vos votre nous vous améliorer trouver faire plus que qui quoi comment').split(' '));
export const SOURCE_MISSION_STRATEGIES = Object.freeze([
  ['sequential', 'Read from the beginning', 'Current method: take the first passages in source order.'],
  ['goal_terms', 'Follow the goal', 'Rank passages by declared goal-word matches; this does not determine meaning.'],
  ['coverage_diversity', 'Combine coverage and range', 'Greedily combine new goal words and different source sections.'],
  ['omission_reframe', 'Search for what was missed', 'Prefer goal words absent from the opening brief, then examine later sections.'],
  ['seeded_random', 'Random comparison', 'A seeded random sample tests whether elaborate selection helps this mechanical measure.'],
  ['sham', 'Unchanged-method control', 'Copy the current method unchanged; a new label must not create an improvement.'],
].map(([id, name, description]) => Object.freeze({ id, name, description })));

function check(condition, code, message) {
  requireCondition(condition, code, message);
}
function record(value, keys, name) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'SOURCE_SCHEMA_INVALID', `${name} must be an object.`);
  check(Object.keys(value).every((key) => keys.includes(key)), 'SOURCE_SCHEMA_INVALID', `${name} contains an unsupported field.`);
}
function text(value, name, maximum, optional = false) {
  check(typeof value === 'string' && value.length <= maximum && (optional || value.trim().length > 0), 'SOURCE_TEXT_INVALID', `${name} must be ${optional ? 'a' : 'nonempty'} text of at most ${maximum} characters.`);
  check(value === value.normalize('NFC') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value), 'SOURCE_TEXT_UNICODE', `${name} contains separated accent characters or invalid Unicode. Save the text with composed characters (NFC), then paste it again; exact quotations and offsets must preserve the text you supply.`);
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function terms(value) {
  return [...new Set((value.toLocaleLowerCase('en').match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []).filter((word) => word.length >= 3 && !STOP_WORDS.has(word)))];
}
function sourceUrl(value = '') {
  text(value, 'Source URL', 2048, true);
  if (!value) return '';
  let parsed;
  try { parsed = new URL(value); } catch { throw new SuccessorError('SOURCE_URL_INVALID', 'Source URL must be an absolute HTTPS URL.'); }
  check(parsed.protocol === 'https:' && !parsed.username && !parsed.password, 'SOURCE_URL_INVALID', 'Source URL must use HTTPS without credentials.');
  return parsed.href;
}
async function sourceFrom(input, confirmation = false) {
  record(input, ['title', 'text', 'url', 'publicNonPersonal', ...(confirmation ? ['notUsedForDevelopment'] : [])], 'Source');
  check(input.publicNonPersonal === true, 'SOURCE_ATTESTATION_REQUIRED', 'Confirm you have the right to use and export this public, nonpersonal source.');
  if (confirmation) check(input.notUsedForDevelopment === true, 'SOURCE_FRESH_ATTESTATION_REQUIRED', 'Confirm this source was not used to choose or tune the method.');
  const raw = text(input.text, 'Source text', 40000);
  const source = {
    title: text(input.title, 'Source title', 180), text: raw,
    url: sourceUrl(input.url), digest: await digestBytes(raw),
    contentFingerprint: await digestBytes(raw.toLocaleLowerCase('en').replace(/\s+/gu, ' ').trim()),
    publicNonPersonal: true, rightsStatus: 'USER_ATTESTED_NOT_VERIFIED',
    ...(confirmation ? { freshness: 'USER_ATTESTED_DISTINCT_NOT_PROTECTED' } : {}),
  };
  return source;
}

// Sentence-like passages retain UTF-16 [start,end) offsets into the exact stored source.
// Paragraph boundaries are observable source structure, not inferred semantic sections.
function passagesFor(source) {
  const result = [];
  const paragraphs = /[^\r\n]+/gu;
  let paragraph;
  let section = 0;
  while ((paragraph = paragraphs.exec(source.text))) {
    section++;
    const sentences = /[^.!?。！？]+(?:[.!?。！？]+[”’"']*|$)/gu;
    let sentence;
    while ((sentence = sentences.exec(paragraph[0]))) {
      const leading = sentence[0].length - sentence[0].trimStart().length;
      const fragment = sentence[0].trim();
      if (!fragment) continue;
      const start = paragraph.index + sentence.index + leading;
      result.push({ id: `p${result.length + 1}`, start, end: start + fragment.length, text: fragment, section, sourceDigest: source.digest });
    }
  }
  check(result.length >= 3, 'SOURCE_TOO_SHORT', 'Provide at least three sentence-like passages separated by punctuation or line breaks.');
  check(result.length <= 2000, 'SOURCE_TOO_FRAGMENTED', 'Provide at most 2,000 sentence-like passages.');
  return result;
}
function shuffle(items, seed) {
  const shuffled = [...items];
  let state = seed || 0x9e3779b9;
  for (let index = shuffled.length - 1; index > 0; index--) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const other = Math.floor(((state >>> 0) / 4294967296) * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}
function selection(passages, goalTerms, count, id, seed) {
  const hitMap = new Map(passages.map((passage) => {
    const words = new Set(terms(passage.text));
    return [passage.id, goalTerms.filter((word) => words.has(word))];
  }));
  const hits = (passage) => hitMap.get(passage.id);
  if (id === 'sequential' || id === 'sham') return passages.slice(0, count);
  if (id === 'seeded_random') return shuffle(passages, seed).slice(0, count).sort((a, b) => a.start - b.start);
  if (id === 'goal_terms') return [...passages].sort((a, b) => hits(b).length - hits(a).length || a.start - b.start).slice(0, count).sort((a, b) => a.start - b.start);
  const selected = [];
  const used = new Set();
  const covered = new Set();
  const sections = new Set();
  const baselineWords = new Set(passages.slice(0, count).flatMap(hits));
  while (selected.length < count) {
    const score = (passage) => {
      const matched = hits(passage);
      const novel = matched.filter((word) => !covered.has(word)).length;
      if (id === 'omission_reframe') return matched.filter((word) => !baselineWords.has(word) && !covered.has(word)).length * 10 + novel * 2 + (sections.has(passage.section) ? 0 : 1) + passage.start / 100000;
      return novel * 4 + matched.length + (sections.has(passage.section) ? 0 : 2);
    };
    const next = passages.filter((passage) => !used.has(passage.id)).sort((a, b) => score(b) - score(a) || a.start - b.start)[0];
    selected.push(next); used.add(next.id); sections.add(next.section); hits(next).forEach((word) => covered.add(word));
  }
  return selected.sort((a, b) => a.start - b.start);
}
function reportFor(source, goal, quoteBudget, seed) {
  const passages = passagesFor(source);
  const goalTerms = terms(goal);
  const count = Math.min(quoteBudget, passages.length);
  const totalSections = new Set(passages.map((passage) => passage.section)).size;
  const results = SOURCE_MISSION_STRATEGIES.map((strategy) => {
    const selected = selection(passages, goalTerms, count, strategy.id, seed);
    const selectedWords = new Set(selected.flatMap((passage) => terms(passage.text)));
    const coveredGoalTerms = goalTerms.filter((word) => selectedWords.has(word));
    const missingGoalTerms = goalTerms.filter((word) => !selectedWords.has(word));
    return {
      strategyId: strategy.id, name: strategy.name, description: strategy.description,
      passages: selected,
      metrics: {
        goalTermCoverage: goalTerms.length ? coveredGoalTerms.length / goalTerms.length : 0,
        coveredGoalTerms, missingGoalTerms,
        sectionCoverage: new Set(selected.map((passage) => passage.section)).size / totalSections,
        quoteCount: selected.length, quoteCharacters: selected.reduce((total, passage) => total + passage.text.length, 0),
      },
      reviewQuestions: [
        'Do the quotations actually help the declared goal when read in their original context?',
        missingGoalTerms.length ? `Which needed ideas are absent or use different language? Unmatched goal words: ${missingGoalTerms.join(', ')}.` : 'Matching every goal word can still omit a decisive qualification. What has been missed?',
        ...(strategy.id === 'omission_reframe' ? ['Could a different question, an existing method, or no action better serve the same goal without weakening its real constraints?'] : []),
        'What credible alternative would a knowledgeable person use, and what would a fair fresh comparison measure?',
      ],
      independentProof: false, semanticValidation: 'REQUIRES_REVIEW',
    };
  });
  return {
    sourceDigest: source.digest, goalTerms, quoteBudget, effectiveQuoteBudget: count,
    metricProtocol: 'Exact lowercase goal-word coverage and observed paragraph-section coverage; all methods receive the same sentence-count quote budget. Quote lengths and total characters are reported separately. No semantic score is computed.',
    passageCount: passages.length, sectionCount: totalSections, offsetConvention: 'UTF16_START_INCLUSIVE_END_EXCLUSIVE',
    results, independentProof: false, disclosure: NO_PROOF,
  };
}
function resultIn(dossier, phase, strategyId) {
  check(['development', 'confirmation'].includes(phase), 'SOURCE_PHASE_INVALID', 'Choose development or confirmation.');
  const result = dossier[phase]?.results.find((entry) => entry.strategyId === strategyId);
  check(result, 'SOURCE_RESULT_UNKNOWN', 'The selected source and method result do not exist.');
  return result;
}
async function append(events, type, payload) {
  check(events.length < MAX_EVENTS, 'SOURCE_HISTORY_LIMIT', `A dossier supports at most ${MAX_EVENTS} events. Export this dossier and begin a new mission.`);
  const event = { sequence: events.length + 1, previousDigest: events.at(-1)?.digest || null, type, payload };
  event.digest = await digestObject('successor.source-event.v1', event);
  return [...events, event];
}
async function replay(events) {
  check(Array.isArray(events) && events.length >= 1 && events.length <= MAX_EVENTS, 'SOURCE_HISTORY_INVALID', 'The bounded attempt history is missing or too large.');
  let state;
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    record(event, ['sequence', 'previousDigest', 'type', 'payload', 'digest'], 'History event');
    check(event.sequence === index + 1 && event.previousDigest === (index ? events[index - 1].digest : null), 'SOURCE_HISTORY_INVALID', 'The append-only event sequence or previous digest does not match.');
    const { digest, ...bound } = event;
    check(digest === await digestObject('successor.source-event.v1', bound), 'SOURCE_HISTORY_TAMPERED', 'A history event does not match its digest.');
    if (event.type === 'CREATED') {
      check(index === 0, 'SOURCE_HISTORY_INVALID', 'A mission must be created exactly once at the start.');
      record(event.payload, ['title', 'goal', 'quoteBudget', 'seed', 'source'], 'Mission creation');
      const { title, goal, quoteBudget, seed } = event.payload;
      text(title, 'Mission title', 180); text(goal, 'Mission goal', 2000);
      check(terms(goal).length >= 1 && terms(goal).length <= 64, 'SOURCE_GOAL_INVALID', 'The goal needs between one and 64 distinct meaningful words.');
      check(Number.isSafeInteger(quoteBudget) && quoteBudget >= 3 && quoteBudget <= 8, 'SOURCE_QUOTE_BUDGET_INVALID', 'Choose a quote budget of three to eight sentences.');
      check(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'SOURCE_SEED_INVALID', 'Seed must be an unsigned 32-bit integer.');
      const source = await sourceFrom(event.payload.source);
      state = {
        schemaVersion: SCHEMA_VERSION, kind: 'SourceMissionDossier', title, goal, quoteBudget, seed,
        source, goalTerms: terms(goal), development: reportFor(source, goal, quoteBudget, seed),
        frozen: null, confirmation: null, annotations: [], criticisms: [],
        decision: DECISION, independentProof: false, authorityCreated: 'NONE',
        disclosure: NO_PROOF,
        provenanceDisclosure: 'Source publication, rights, freshness and reviewer identity are user-supplied and unverified. Hashes and replay check local consistency; they do not authenticate an author, publication, reviewer, or independent evidence.',
      };
    } else {
      check(state, 'SOURCE_HISTORY_INVALID', 'Mission creation must precede other events.');
      if (event.type === 'STRATEGY_FROZEN') {
        record(event.payload, ['strategyId', 'developmentDigest'], 'Frozen method');
        check(!state.frozen, 'SOURCE_ALREADY_FROZEN', 'This exact method is already frozen. Create a new mission to change it.');
        resultIn(state, 'development', event.payload.strategyId);
        check(event.payload.developmentDigest === await digestObject('successor.source-report.v1', state.development), 'SOURCE_FREEZE_MISMATCH', 'The frozen strategy must bind the complete development comparison.');
        state.frozen = { ...event.payload, digest: event.digest, sequence: event.sequence };
      } else if (event.type === 'FRESH_SOURCE_TESTED') {
        check(state.frozen && !state.confirmation, 'SOURCE_FREEZE_REQUIRED', 'Freeze one method before a single confirmation source; a new attempt requires a new mission.');
        const source = await sourceFrom(event.payload, true);
        check(source.digest !== state.source.digest && source.contentFingerprint !== state.source.contentFingerprint, 'SOURCE_DUPLICATE', 'The confirmation source duplicates the development source. Supply a distinct source not used for method selection.');
        const report = reportFor(source, state.goal, state.quoteBudget, state.seed);
        const candidate = report.results.find((result) => result.strategyId === state.frozen.strategyId);
        const incumbent = report.results.find((result) => result.strategyId === 'sequential');
        const strongestMechanical = [...report.results].filter((result) => result.strategyId !== 'sham' && result.strategyId !== candidate.strategyId).sort((a, b) => b.metrics.goalTermCoverage - a.metrics.goalTermCoverage || b.metrics.sectionCoverage - a.metrics.sectionCoverage || a.strategyId.localeCompare(b.strategyId))[0];
        state.confirmation = {
          ...report, source, frozenDigest: state.frozen.digest,
          comparison: {
            candidateId: candidate.strategyId, incumbentId: incumbent.strategyId,
            strongestMechanicalComparatorId: strongestMechanical.strategyId,
            goalTermCoverageDelta: candidate.metrics.goalTermCoverage - incumbent.metrics.goalTermCoverage,
            sectionCoverageDelta: candidate.metrics.sectionCoverage - incumbent.metrics.sectionCoverage,
            decision: DECISION, independentProof: false,
            disclosure: 'The method was frozen before this source was supplied. Distinct content and a user freshness attestation do not establish unseen protected work, representative sampling, independent review, or superiority. All comparator results remain visible; a selected goal-word score cannot authorize adoption.',
          },
        };
      } else if (event.type === 'ANNOTATED') {
        record(event.payload, ['phase', 'strategyId', 'brief', 'notes'], 'User annotation');
        const { phase, strategyId, brief, notes } = event.payload;
        const result = resultIn(state, phase, strategyId);
        text(brief, 'User-written synthesis', 4000, true);
        check(Array.isArray(notes) && notes.length <= 8, 'SOURCE_ANNOTATION_INVALID', 'Provide at most eight relevance notes.');
        const ids = new Set();
        for (const note of notes) {
          record(note, ['passageId', 'relevance'], 'Relevance note');
          check(result.passages.some((passage) => passage.id === note.passageId) && !ids.has(note.passageId), 'SOURCE_PASSAGE_UNKNOWN', 'Relevance notes must refer to distinct exact selected passages.');
          ids.add(note.passageId); text(note.relevance, 'Relevance note', 1000);
        }
        state.annotations.push({ ...event.payload, eventDigest: event.digest, provenance: 'USER_ANNOTATION_NOT_VERIFIED' });
      } else if (event.type === 'CRITICISM_PROPOSED') {
        record(event.payload, ['phase', 'strategyId', 'passageId', 'claim', 'issue', 'proposedCorrection', 'author'], 'Criticism');
        const payload = event.payload;
        const result = resultIn(state, payload.phase, payload.strategyId);
        const passage = result.passages.find((entry) => entry.id === payload.passageId);
        check(passage, 'SOURCE_PASSAGE_UNKNOWN', 'Criticism must identify one exact selected source passage.');
        for (const key of ['claim', 'issue', 'proposedCorrection']) text(payload[key], key, 1500);
        text(payload.author, 'Criticism author label', 100);
        state.criticisms.push({ ...payload, criticismId: event.digest, passage: cloneJson(passage), review: null, credit: 'NONE' });
      } else if (event.type === 'CRITICISM_REVIEWED') {
        record(event.payload, ['criticismId', 'reviewer', 'exactQuotePass', 'relevancePass', 'decision', 'note'], 'Criticism review');
        const payload = event.payload;
        const criticism = state.criticisms.find((entry) => entry.criticismId === payload.criticismId);
        check(criticism && !criticism.review, 'SOURCE_CRITICISM_UNKNOWN', 'Review an existing criticism once; corrections require a new recorded criticism.');
        text(payload.reviewer, 'Reviewer label', 100); text(payload.note, 'Reviewer explanation', 1500);
        check(payload.reviewer !== criticism.author, 'SOURCE_REVIEW_SELF', 'Use a different reviewer label. Labels are self-attested and do not prove independence.');
        check(typeof payload.exactQuotePass === 'boolean' && typeof payload.relevancePass === 'boolean' && ['PASS', 'FAIL'].includes(payload.decision), 'SOURCE_REVIEW_INVALID', 'The reviewer must explicitly record quote and relevance checks plus a pass/fail decision.');
        check(payload.decision !== 'PASS' || (payload.exactQuotePass && payload.relevancePass), 'SOURCE_REVIEW_INVALID', 'Credit requires an explicit reviewer pass on both the exact quotation and its relevance.');
        criticism.review = { ...payload, provenance: 'SELF_ATTESTED_REVIEWER_ANNOTATION', independentProof: false, eventDigest: event.digest };
        criticism.credit = payload.decision === 'PASS' ? 'REVIEWER_ANNOTATED_PASS' : 'NONE';
      } else throw new SuccessorError('SOURCE_EVENT_UNSUPPORTED', 'A source dossier cannot import authority, payment, proof, admission, or unsupported events.');
    }
  }
  return { ...state, history: cloneJson(events), historyDigest: events.at(-1).digest };
}
async function sealed(events) {
  const state = await replay(events);
  state.digest = await digestObject('successor.source-dossier.v1', state);
  return freeze(state);
}
async function validated(dossier) {
  check(dossier && typeof dossier === 'object', 'SOURCE_DOSSIER_INVALID', 'A source dossier is required.');
  const rebuilt = await sealed(dossier.history);
  check(canonicalize(dossier) === canonicalize(rebuilt), 'SOURCE_DOSSIER_TAMPERED', 'Dossier contents differ from their replayed history. Imported annotations cannot create proof or authority.');
  return rebuilt;
}
function sourceInput({ title, text, url = '', publicNonPersonal, notUsedForDevelopment }) {
  return { title, text, url, publicNonPersonal, ...(notUsedForDevelopment === undefined ? {} : { notUsedForDevelopment }) };
}
export async function createSourceMission(input) {
  record(input, ['title', 'sourceTitle', 'goal', 'text', 'url', 'quoteBudget', 'publicNonPersonal', 'seed'], 'New mission');
  const { title, goal, quoteBudget = 4, seed = 42 } = input;
  text(title, 'Mission title', 180); text(goal, 'Mission goal', 2000);
  const inputSource = sourceInput({ ...input, title: input.sourceTitle || input.title });
  await sourceFrom(inputSource);
  return sealed(await append([], 'CREATED', { title, goal, quoteBudget, seed, source: inputSource }));
}
export async function freezeSourceStrategy(dossier, input) {
  const state = await validated(dossier);
  record(input, ['strategyId'], 'Method selection');
  return sealed(await append(state.history, 'STRATEGY_FROZEN', { strategyId: input.strategyId, developmentDigest: await digestObject('successor.source-report.v1', state.development) }));
}
export async function confirmSourceStrategy(dossier, input) {
  const state = await validated(dossier);
  // Validate the complete input rather than dropping unknown authority/proof flags.
  await sourceFrom(input, true);
  return sealed(await append(state.history, 'FRESH_SOURCE_TESTED', sourceInput(input)));
}
export async function annotateSourceMission(dossier, input) {
  const state = await validated(dossier);
  return sealed(await append(state.history, 'ANNOTATED', cloneJson(input)));
}
export async function proposeSourceCriticism(dossier, input) {
  const state = await validated(dossier);
  return sealed(await append(state.history, 'CRITICISM_PROPOSED', cloneJson(input)));
}
export async function reviewSourceCriticism(dossier, input) {
  const state = await validated(dossier);
  return sealed(await append(state.history, 'CRITICISM_REVIEWED', cloneJson(input)));
}
export async function exportSourceMission(dossier) {
  const state = await validated(dossier);
  const serialized = JSON.stringify(state, null, 2);
  check(new TextEncoder().encode(serialized).byteLength <= MAX_EXPORT_BYTES, 'SOURCE_DOSSIER_LIMIT', 'The dossier exceeds the two-megabyte export limit.');
  return serialized;
}
export async function restoreSourceMission(serialized) {
  check(typeof serialized === 'string' && new TextEncoder().encode(serialized).byteLength <= MAX_EXPORT_BYTES, 'SOURCE_DOSSIER_LIMIT', 'Import a JSON dossier of at most two megabytes.');
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new SuccessorError('SOURCE_DOSSIER_INVALID', 'The dossier is not valid JSON.'); }
  // Canonicalization rejects dangerous object keys, unsafe numbers, and non-JSON values.
  try { canonicalize(parsed); } catch { throw new SuccessorError('SOURCE_DOSSIER_INVALID', 'The dossier contains unsupported JSON data.'); }
  return validated(parsed);
}

/** Native Jobs compiler output. All four orders remain unsigned, unfunded DRAFT requests. */
export async function compileSourceMissionJobs(dossier, { now = new Date().toISOString(), expiresAt } = {}) {
  const state = await validated(dossier);
  const instant = Date.parse(now);
  check(Number.isFinite(instant), 'SOURCE_CLOCK_INVALID', 'Provide a valid compiler time.');
  const expiry = expiresAt || new Date(instant + 7 * 86400000).toISOString();
  const sourceList = [state.source, ...(state.confirmation ? [state.confirmation.source] : [])];
  const sourceIds = sourceList.map((source) => `source-${source.digest.slice(7)}`);
  const missionId = `source-mission-${state.digest.slice(7, 23)}`;
  const definitions = [
    ['source-rights', 'constitution', 'Verify public nonpersonal provenance, permissions, export and reuse rights; refuse unclear sources before execution.'],
    ['evidence-brief', 'formation', `Prepare an exact-quotation evidence brief for: ${state.goal} Freeze one complete method; preserve all attempted methods, costs and limitations.`],
    ['fresh-comparison', 'verification', 'Arrange separately attributed custody of fresh representative sources; compare the frozen candidate with the incumbent and strongest credible alternative under equal declared resources. Record quality, material errors, complete cost, time and reviewer burden. Word coverage is not semantic proof.'],
    ['human-decision', 'admission', 'Present the evidence and rejected attempts to the accountable owner. Keep the incumbent until mission-specific proof and explicit separate authorization support a bounded change. This order grants no operational authority.'],
  ];
  const prohibited = ['send-transaction', 'release-payment', 'publish', 'download-private-data', 'execute-source-instructions', 'expand-authority'];
  const mission = {
    schemaVersion: SCHEMA_VERSION, kind: 'MissionConstitution', missionId, institutionId: 'owner-to-be-assigned', version: '1',
    title: state.title, principal: 'accountable-owner-to-be-assigned', beneficiary: 'Source mission owner', objective: state.goal,
    incumbent: { id: 'sequential', version: '1', description: 'Opening passages under the declared equal sentence-count budget; incumbent retained pending separate review.' },
    alternatives: [{ id: 'goal_terms', version: '1', description: 'Declared word-match baseline; knowledgeable reviewers must establish the strongest credible real-world alternative.' }],
    rights: sourceIds.map((sourceId) => ({ sourceId, license: 'User-attested public use and export rights; independent rights verification is an unfulfilled work-order obligation.', dataClass: 'public-licensed-nonpersonal', permittedUses: ['mission-evaluation'], expiresAt: expiry })),
    hardGates: [
      { id: 'exact-source', description: 'Every quoted passage must exactly equal its stored source slice; semantic relevance remains a separate review.', maxViolations: 0 },
      { id: 'no-automatic-promotion', description: 'No mechanical score, self-review or imported annotation grants independent proof, funding, payment, or authority.', maxViolations: 0 },
    ],
    criticalFunctions: definitions.map(([id]) => id),
    roles: { producer: 'producer-to-be-assigned', verifier: 'verifier-to-be-assigned', acceptor: 'accountable-owner-to-be-assigned', admitter: 'authority-owner-to-be-assigned' },
    budget: { unit: 'AGIALPHA', limitBaseUnits: '0', maxDurationMs: 3600000, maxRetries: 0, maxJobs: 4 },
    expiresAt: expiry,
    authorityCeiling: { level: 'A0', permittedActions: ['read-public', 'analyze', 'recommend'], prohibitedActions: prohibited, externalEffects: false },
    allowedTools: ['local-source-reader', 'exact-quote-checker'], allowedActions: ['read-public', 'analyze', 'recommend'],
    rollback: { target: 'unchanged-incumbent', available: true, reason: 'Discard proposals and retain the current method; these requests have no external effects.' },
    proofProtocol: { id: 'source-mission-independent-request', version: '1', mode: 'INDEPENDENT_REQUEST', formationOwner: 'producer-to-be-assigned', custodian: 'verifier-to-be-assigned', requiredIndependence: 'I3', minimumMargin: 0, criticalErrorCeiling: 0, scope: 'Request only: independent custody, representative sources, semantic criteria, complete costs and attributable acceptance must be arranged externally. Local results and reviewer labels do not satisfy this request.' },
  };
  const jobs = definitions.map(([id, family, objective]) => ({
    schemaVersion: SCHEMA_VERSION, kind: 'SealedWorkOrder', jobId: `${missionId}:${id}`, missionId, version: '1', family, objective,
    principal: mission.principal, actor: mission.roles.producer, authorizedInputs: sourceIds,
    evidenceObligation: ['exact-source-offsets', 'rights-verification', 'all-attempts', 'complete-cost', 'limitations'],
    permittedTools: mission.allowedTools, permittedActions: mission.allowedActions, prohibitedActions: prohibited,
    budget: { unit: 'AGIALPHA', limitBaseUnits: '0', maxDurationMs: 3600000, maxRetries: 0 }, expiresAt: expiry,
    outputSchema: { type: 'object', required: ['findings', 'sourceIds', 'limitations', 'completeCost'] },
    verifier: { identity: mission.roles.verifier, method: 'Separate independent examination is requested and has not been executed.', independence: 'I0' },
    acceptance: { owner: mission.roles.acceptor, predicate: 'An attributable human review verifies exact source grounding, relevance, rights, costs and applicable hard gates; no result auto-authorizes adoption.', evidenceSources: sourceIds },
    rollback: mission.rollback,
    chronicle: { eligible: false, rights: 'Requires a separate verified rights and knowledge-admission decision.', scope: state.goal, expiresAt: expiry },
    covers: [id], state: 'DRAFT',
  }));
  const edges = definitions.slice(1).map(([id], index) => ({ from: `${missionId}:${definitions[index][0]}`, to: `${missionId}:${id}`, kind: 'control' }));
  const compilation = await compileJobs(mission, { jobs, edges, now });
  return freeze({
    ...compilation,
    sourceDossier: {
      digest: state.digest, historyDigest: state.historyDigest,
      sourceDigests: sourceList.map((source) => source.digest), selectedStrategyId: state.frozen?.strategyId || null,
      sourceManifest: sourceList.map((source, index) => ({ sourceId: sourceIds[index], title: source.title, url: source.url, digest: source.digest, text: source.text, offsetConvention: 'UTF16_START_INCLUSIVE_END_EXCLUSIVE', rightsStatus: source.rightsStatus })),
      requiredCompanion: { purpose: 'Restore all method attempts, frozen comparison, quotations and user annotations.', dossierDigest: state.digest, filenameHint: 'successor-source-mission.json', restoreWith: 'restoreSourceMission' },
    },
    fundingStatus: 'UNFUNDED', identityStatus: 'PLACEHOLDERS_REQUIRE_OWNER_ASSIGNMENT', independentProof: false,
  });
}
