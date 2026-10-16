// SPDX-License-Identifier: MIT
const keys = (o, expected, name) => {
  if (
    !o ||
    typeof o !== 'object' ||
    Array.isArray(o) ||
    Object.keys(o).sort().join('|') !== expected.sort().join('|')
  )
    throw new Error(`${name}: unexpected or missing fields`);
};
const integer = (v, min, max, name) => {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    throw new Error(`${name}: expected an integer in [${min}, ${max}]`);
  return v;
};
const identifier = (v) =>
  typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v);
export function evaluate(s) {
  keys(
    s,
    ['schema', 'title', 'proposal', 'policy', 'controls', 'votes'],
    'scenario'
  );
  if (s.schema !== 'agijobs.governance-rehearsal.v1')
    throw new Error('Unsupported governance scenario');
  keys(s.proposal, ['id', 'requestedCents', 'availableCents'], 'proposal');
  keys(
    s.policy,
    ['eligibleWeight', 'quorumPercent', 'approvalPercent', 'requiredControls'],
    'policy'
  );
  if (!identifier(s.proposal.id)) throw new Error('Invalid proposal ID');
  if (
    typeof s.title !== 'string' ||
    [...s.title].length < 1 ||
    [...s.title].length > 200
  )
    throw new Error('Title must contain 1–200 characters');
  const requested = integer(
      s.proposal.requestedCents,
      1,
      1e12,
      'Requested cents'
    ),
    available = integer(s.proposal.availableCents, 0, 1e12, 'Available cents'),
    eligible = integer(s.policy.eligibleWeight, 1, 1e9, 'Eligible weight'),
    quorum = integer(s.policy.quorumPercent, 1, 100, 'Quorum'),
    threshold = integer(s.policy.approvalPercent, 1, 100, 'Approval');
  if (!Array.isArray(s.votes) || s.votes.length > 1000)
    throw new Error('Expected at most 1000 votes');
  let cast = 0,
    approved = 0;
  const seen = new Set();
  for (const vote of s.votes) {
    keys(vote, ['voter', 'weight', 'choice'], 'vote');
    if (
      typeof vote.voter !== 'string' ||
      !vote.voter.trim() ||
      [...vote.voter].length > 100 ||
      seen.has(vote.voter)
    )
      throw new Error('Voters must have unique nonempty identifiers');
    seen.add(vote.voter);
    const weight = integer(vote.weight, 1, eligible, 'Vote weight');
    if (!['approve', 'reject', 'abstain'].includes(vote.choice))
      throw new Error('Unknown vote choice');
    cast += weight;
    if (vote.choice === 'approve') approved += weight;
  }
  if (cast > eligible) throw new Error('Cast weight exceeds eligible weight');
  for (const list of [s.controls, s.policy.requiredControls])
    if (
      !Array.isArray(list) ||
      !list.length ||
      list.length > 30 ||
      list.some((x) => !identifier(x)) ||
      new Set(list).size !== list.length
    )
      throw new Error('Control categories must be unique nonempty lists');
  const missing = s.policy.requiredControls
    .filter((x) => !s.controls.includes(x))
    .sort();
  const checks = {
    quorum: cast * 100 >= eligible * quorum,
    approval: cast > 0 && approved * 100 >= cast * threshold,
    budget: requested <= available,
    ownerControls: !missing.length,
  };
  const accepted = Object.values(checks).every(Boolean);
  return {
    schema: 'agijobs.governance-rehearsal-result.v1',
    mode: 'offline-simulation',
    proposalId: s.proposal.id,
    accepted,
    checks,
    reasons: Object.keys(checks).filter((k) => !checks[k]),
    castWeight: cast,
    approvedWeight: approved,
    requestedCents: requested,
    remainingCentsIfApproved: accepted ? available - requested : available,
    missingControls: missing,
    enacted: false,
    settlementApproved: false,
  };
}
// Strict bounded imports: duplicate keys and non-integer numeric tokens reject.
export function parseScenario(text) {
  if (new TextEncoder().encode(text).length > 1000000)
    throw new Error('Scenario exceeds 1 MB');
  let at = 0;
  const ws = () => {
    while (/[\t\n\r ]/.test(text[at] || '\0')) at++;
  };
  const fail = () => {
    throw new Error('Invalid JSON or noninteger numeric token');
  };
  function string() {
    const start = at++;
    while (at < text.length) {
      if (text[at] === '\\') {
        at += 2;
        continue;
      }
      if (text[at++] === '"') return JSON.parse(text.slice(start, at));
    }
    fail();
  }
  function value(depth = 0) {
    if (depth > 32) throw new Error('Input nesting is too deep');
    ws();
    const c = text[at];
    if (c === '"') return string();
    if (c === '{') {
      at++;
      ws();
      const obj = Object.create(null),
        seen = new Set();
      if (text[at] === '}') {
        at++;
        return obj;
      }
      while (true) {
        ws();
        if (text[at] !== '"') fail();
        const key = string();
        if (seen.has(key)) throw new Error('Duplicate JSON key');
        seen.add(key);
        ws();
        if (text[at++] !== ':') fail();
        obj[key] = value(depth + 1);
        ws();
        const sep = text[at++];
        if (sep === '}') return obj;
        if (sep !== ',') fail();
      }
    }
    if (c === '[') {
      at++;
      ws();
      const arr = [];
      if (text[at] === ']') {
        at++;
        return arr;
      }
      while (true) {
        arr.push(value(depth + 1));
        ws();
        const sep = text[at++];
        if (sep === ']') return arr;
        if (sep !== ',') fail();
      }
    }
    for (const [token, result] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ])
      if (text.startsWith(token, at)) {
        at += token.length;
        return result;
      }
    const token = text.slice(at).match(/^-?(?:0|[1-9][0-9]*)/);
    if (!token) fail();
    at += token[0].length;
    if (/[.eE0-9]/.test(text[at] || '\0')) fail();
    return Number(token[0]);
  }
  const parsed = value();
  ws();
  if (at !== text.length) fail();
  let scenario = parsed;
  if (parsed?.schema === 'agijobs.governance-browser-evidence.v1') {
    keys(
      parsed,
      ['schema', 'scenario', 'result', 'downloadedScenarioSha256', 'hashScope'],
      'evidence'
    );
    scenario = parsed.scenario;
  }
  evaluate(scenario);
  return scenario;
}
