// SPDX-License-Identifier: MIT
const keys = (o, expected, name) => {
  if (
    !o ||
    typeof o !== 'object' ||
    Array.isArray(o) ||
    Object.keys(o).sort().join('|') !== [...expected].sort().join('|')
  )
    throw Error(`${name}: unexpected or missing fields`);
};
const integer = (v, min, max, name) => {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    throw Error(`${name}: expected integer ${min}–${max}`);
  return v;
};
const identifier = (v) =>
  typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(v);
const label = (v, max) =>
  typeof v === 'string' && [...v].length >= 1 && [...v].length <= max;
export function evaluate(s) {
  keys(
    s,
    ['schema', 'title', 'budgetCents', 'jobs', 'recoveredIds'],
    'scenario'
  );
  if (s.schema !== 'agijobs.atlas-recovery.v1')
    throw Error('Unsupported scenario schema');
  if (!label(s.title, 200)) throw Error('Title must contain 1–200 characters');
  const budget = integer(s.budgetCents, 0, 1e12, 'Budget cents');
  if (!Array.isArray(s.jobs) || s.jobs.length < 1 || s.jobs.length > 100)
    throw Error('Expected 1–100 jobs');
  const byId = new Map();
  for (const j of s.jobs) {
    keys(
      j,
      ['id', 'label', 'costCents', 'durationMinutes', 'dependsOn', 'outcome'],
      'job'
    );
    if (!identifier(j.id) || byId.has(j.id))
      throw Error('Invalid or duplicate job ID');
    byId.set(j.id, j);
    if (!label(j.label, 120))
      throw Error('Job label must contain 1–120 characters');
    integer(j.costCents, 1, 1e10, 'Cost cents');
    integer(j.durationMinutes, 1, 10080, 'Duration minutes');
    if (!['success', 'fail'].includes(j.outcome))
      throw Error('Invalid outcome');
    if (
      !Array.isArray(j.dependsOn) ||
      j.dependsOn.length > 100 ||
      j.dependsOn.some((x) => !identifier(x)) ||
      new Set(j.dependsOn).size !== j.dependsOn.length
    )
      throw Error('Invalid or duplicate dependency');
  }
  if (s.jobs.some((j) => j.dependsOn.some((x) => !byId.has(x))))
    throw Error('Unknown dependency');
  const recovered = s.recoveredIds;
  if (
    !Array.isArray(recovered) ||
    recovered.length > s.jobs.length ||
    new Set(recovered).size !== recovered.length ||
    recovered.some((x) => !identifier(x) || byId.get(x)?.outcome !== 'fail')
  )
    throw Error('Recovery IDs must uniquely name declared failed jobs');
  const order = [],
    resolved = new Set();
  let pending = s.jobs.map((j) => j.id);
  while (pending.length) {
    const next = [];
    for (const id of pending) {
      if (byId.get(id).dependsOn.every((x) => resolved.has(x))) {
        order.push(id);
        resolved.add(id);
      } else next.push(id);
    }
    if (next.length === pending.length) throw Error('Cyclic dependency graph');
    pending = next;
  }
  const states = new Map(
    order.map((id) => [id, { id, status: 'pending', finishMinute: null }])
  );
  const attempts = [];
  let spent = 0;
  function phase(number, earliest) {
    for (const id of order) {
      const j = byId.get(id),
        state = states.get(id);
      if (
        state.status === 'completed' ||
        (number === 2 && state.status === 'failed' && !recovered.includes(id))
      )
        continue;
      const blocked = j.dependsOn.filter(
        (x) => states.get(x).status !== 'completed'
      );
      if (blocked.length) {
        states.set(id, {
          id,
          status: 'blocked-dependency',
          finishMinute: null,
          blockedBy: blocked,
        });
        continue;
      }
      if (spent + j.costCents > budget) {
        states.set(id, {
          id,
          status: 'blocked-budget',
          finishMinute: null,
          shortfallCents: spent + j.costCents - budget,
        });
        continue;
      }
      const start = Math.max(
        earliest,
        ...j.dependsOn.map((x) => states.get(x).finishMinute)
      );
      const status =
        j.outcome === 'success' || (number === 2 && recovered.includes(id))
          ? 'completed'
          : 'failed';
      const finish = start + j.durationMinutes;
      spent += j.costCents;
      attempts.push({
        id,
        phase: number,
        status,
        costCents: j.costCents,
        startMinute: start,
        finishMinute: finish,
      });
      states.set(id, { id, status, finishMinute: finish });
    }
  }
  phase(1, 0);
  const firstPass = {
    jobs: structuredClone([...states.values()]),
    spentCents: spent,
    remainingCents: budget - spent,
  };
  if (recovered.length)
    phase(2, Math.max(0, ...attempts.map((a) => a.finishMinute)));
  const accepted = [...states.values()].every((s) => s.status === 'completed');
  return {
    schema: 'agijobs.atlas-recovery-result.v1',
    mode: 'offline-simulation',
    accepted,
    order,
    firstPass,
    jobs: [...states.values()],
    attempts,
    spentCents: spent,
    remainingCents: budget - spent,
    completionMinute:
      attempts.length && accepted
        ? Math.max(...attempts.map((a) => a.finishMinute))
        : null,
    recoveryAssumptions: [...recovered],
    executedExternalWork: false,
    settlementApproved: false,
  };
}
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
  if (parsed?.schema === 'agijobs.atlas-browser-evidence.v1') {
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
