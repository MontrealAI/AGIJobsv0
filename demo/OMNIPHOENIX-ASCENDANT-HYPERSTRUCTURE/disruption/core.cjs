'use strict';
// Environment-independent, bounded planning core. No I/O or authority-bearing operations.
const LIMITS = Object.freeze({
  planBytes: 262144,
  recoveryBytes: 4194304,
  jobs: 100,
  days: 365000,
});
const encoder = new TextEncoder();
function bytesOf(input, limit) {
  if (typeof input !== 'string' && !(input instanceof Uint8Array))
    throw Error('Input must be UTF-8 bytes or text');
  if (input.length > limit) throw Error(`Input exceeds ${limit} bytes`);
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  if (bytes.length > limit) throw Error(`Input exceeds ${limit} bytes`);
  if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
    throw Error('UTF-8 BOM is not accepted');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw Error('Invalid UTF-8');
  }
  if (typeof input === 'string' && text !== input)
    throw Error('Invalid Unicode text');
  return { bytes, text };
}
// Strict recursive parser rejects duplicate decoded keys and unsafe/nonintegral number tokens
// before JSON conversion. Limits depth/node count before descending or allocating collections.
function parseStrict(text) {
  let i = 0,
    count = 0;
  const ws = () => {
    while (/^[\x20\t\r\n]$/.test(text[i] || '')) i++;
  };
  function string() {
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') {
        const value = JSON.parse(text.slice(start, i));
        if (
          encoder.encode(value).length > LIMITS.planBytes ||
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
            value
          )
        )
          throw Error('Invalid Unicode string');
        return value;
      }
      if (c === '\\') i++;
    }
    throw Error('Unterminated JSON string');
  }
  function value(depth) {
    if (depth > 16 || ++count > 500000)
      throw Error('JSON structure exceeds limits');
    ws();
    const c = text[i];
    if (c === '"') return string();
    if (c === '{') {
      i++;
      ws();
      const out = Object.create(null),
        keys = new Set();
      if (text[i] === '}') {
        i++;
        return out;
      }
      while (true) {
        ws();
        if (text[i] !== '"') throw Error('Expected JSON object key');
        const key = string();
        if (keys.has(key)) throw Error(`Duplicate JSON key: ${key}`);
        keys.add(key);
        ws();
        if (text[i++] !== ':') throw Error('Expected colon');
        out[key] = value(depth + 1);
        ws();
        const end = text[i++];
        if (end === '}') return out;
        if (end !== ',') throw Error('Expected comma');
      }
    }
    if (c === '[') {
      i++;
      ws();
      const out = [];
      if (text[i] === ']') {
        i++;
        return out;
      }
      while (true) {
        out.push(value(depth + 1));
        ws();
        const end = text[i++];
        if (end === ']') return out;
        if (end !== ',') throw Error('Expected comma');
      }
    }
    for (const [token, result] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ])
      if (text.startsWith(token, i)) {
        i += token.length;
        return result;
      }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      text.slice(i)
    );
    if (!match) throw Error('Invalid JSON value');
    const token = match[0];
    if (
      !/^(?:0|[1-9]\d*)$/.test(token) ||
      token.length > 16 ||
      !Number.isSafeInteger(Number(token))
    )
      throw Error('JSON numbers must be exact nonnegative safe integers');
    i += token.length;
    return Number(token);
  }
  const out = value(0);
  ws();
  if (i !== text.length) throw Error('Trailing JSON content');
  return out;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function object(value, allowed, required, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(`${name} must be an object`);
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw Error(`Unknown ${name} key: ${key}`);
  for (const key of required)
    if (!Object.hasOwn(value, key)) throw Error(`Missing ${name}.${key}`);
}
function label(v, name) {
  if (
    typeof v !== 'string' ||
    !v.trim() ||
    v.length > 1000 ||
    /[\x00-\x1f\x7f]/.test(v)
  )
    throw Error(`Invalid ${name}`);
}
function decimal(v, name) {
  if (typeof v !== 'string' || !/^\d{1,78}(?:\.\d{1,18})?$/.test(v))
    throw Error(`Invalid bounded decimal ${name}`);
}
function day(v, name, zero = false) {
  if (!Number.isSafeInteger(v) || v < (zero ? 0 : 1) || v > LIMITS.days)
    throw Error(`${name} must be ${zero ? 0 : 1}–${LIMITS.days} whole days`);
}
function stringArray(v, name) {
  if (!Array.isArray(v) || v.length > 100) throw Error(`Invalid ${name}`);
  v.forEach((x) => label(x, name));
}
function validatePlan(p) {
  object(
    p,
    [
      'initiative',
      'objective',
      'budget',
      'governance',
      'participants',
      'jobs',
      'reporting',
    ],
    ['initiative', 'objective', 'budget', 'jobs'],
    'plan'
  );
  label(p.initiative, 'initiative');
  label(p.objective, 'objective');
  object(p.budget, ['currency', 'total'], ['currency', 'total'], 'budget');
  label(p.budget.currency, 'currency');
  decimal(p.budget.total, 'budget');
  if (!Array.isArray(p.jobs) || !p.jobs.length || p.jobs.length > LIMITS.jobs)
    throw Error('Plan must contain 1–100 jobs');
  for (const j of p.jobs) {
    object(
      j,
      [
        'id',
        'title',
        'reward',
        'deadlineDays',
        'dependencies',
        'energyBudget',
        'thermodynamicProfile',
      ],
      ['id', 'title', 'reward', 'deadlineDays', 'dependencies'],
      'job'
    );
    label(j.id, 'job id');
    label(j.title, 'title');
    decimal(j.reward, 'reward');
    day(j.deadlineDays, 'deadlineDays');
    stringArray(j.dependencies, 'dependencies');
    if (Object.hasOwn(j, 'energyBudget'))
      decimal(j.energyBudget, 'energyBudget');
    if (Object.hasOwn(j, 'thermodynamicProfile')) {
      object(
        j.thermodynamicProfile,
        ['expectedEntropy', 'adjustmentOnDelay'],
        ['expectedEntropy', 'adjustmentOnDelay'],
        'thermodynamicProfile'
      );
      decimal(j.thermodynamicProfile.expectedEntropy, 'expectedEntropy');
      label(j.thermodynamicProfile.adjustmentOnDelay, 'adjustmentOnDelay');
    }
  }
  if (Object.hasOwn(p, 'governance')) {
    object(
      p.governance,
      ['owner', 'pauseAuthority', 'treasury', 'thermostat'],
      ['owner', 'pauseAuthority', 'treasury', 'thermostat'],
      'governance'
    );
    for (const k of ['owner', 'pauseAuthority', 'treasury'])
      label(p.governance[k], k);
    const t = p.governance.thermostat;
    object(
      t,
      ['initialTemperature', 'emergencyTemperature', 'updateScript'],
      ['initialTemperature', 'emergencyTemperature', 'updateScript'],
      'thermostat'
    );
    decimal(t.initialTemperature, 'initialTemperature');
    decimal(t.emergencyTemperature, 'emergencyTemperature');
    label(t.updateScript, 'updateScript');
  }
  if (Object.hasOwn(p, 'participants')) {
    object(
      p.participants,
      ['agents', 'validators'],
      ['agents', 'validators'],
      'participants'
    );
    for (const kind of ['agents', 'validators']) {
      const list = p.participants[kind];
      if (!Array.isArray(list) || list.length > 100)
        throw Error('Invalid participants');
      for (const item of list) {
        const keys =
          kind === 'agents'
            ? ['handle', 'role', 'capabilities']
            : ['handle', 'stake', 'mandate'];
        object(item, keys, keys, kind);
        label(item.handle, 'handle');
        if (kind === 'agents') {
          label(item.role, 'role');
          stringArray(item.capabilities, 'capabilities');
        } else {
          decimal(item.stake, 'stake');
          label(item.mandate, 'mandate');
        }
      }
    }
  }
  if (Object.hasOwn(p, 'reporting')) {
    object(
      p.reporting,
      ['artifacts', 'dashboards'],
      ['artifacts', 'dashboards'],
      'reporting'
    );
    const keys = ['dryRun', 'thermodynamics', 'missionControl', 'summary'];
    object(p.reporting.artifacts, keys, keys, 'artifacts');
    keys.forEach((k) => label(p.reporting.artifacts[k], k));
    stringArray(p.reporting.dashboards, 'dashboards');
  }
}
const ASSUMPTIONS = Object.freeze([
  'Planning before commissioning; no identities created, providers connected, transactions or settlement.',
  'deadlineDays is interpreted as duration after dependencies, with unlimited parallel resources.',
  'Blocked reward exposure is a planning total, never lost, earned or paid money.',
  'Physical capacity and real-world impact are unknown; source metadata is illustrative and not executed.',
  'Causal chains show dependency reachability, not a guarantee that each delay changes finish time.',
  'Hashes establish consistency, not authenticity or authority.',
]);
function createDesk({ analyze, sha256 }) {
  function analyzeBytes(input, controls = {}) {
    const { bytes, text } = bytesOf(input, LIMITS.planBytes),
      plan = parseStrict(text);
    validatePlan(plan);
    object(
      controls,
      ['delays', 'blockedJobIds', 'horizonDays'],
      [],
      'controls'
    );
    const horizonDays = controls.horizonDays ?? null;
    if (horizonDays !== null) day(horizonDays, 'horizonDays');
    const ids = plan.jobs.map((j) => j.id),
      known = new Set(ids),
      delays = Object.hasOwn(controls, 'delays') ? controls.delays : [],
      blocked = Object.hasOwn(controls, 'blockedJobIds')
        ? controls.blockedJobIds
        : [];
    if (
      !Array.isArray(delays) ||
      delays.length > LIMITS.jobs ||
      !Array.isArray(blocked) ||
      blocked.length > LIMITS.jobs
    )
      throw Error('Invalid disruption lists');
    const delta = new Map();
    for (const d of delays) {
      object(d, ['id', 'days'], ['id', 'days'], 'delay');
      if (!known.has(d.id) || delta.has(d.id))
        throw Error('Unknown or duplicate delayed job');
      day(d.days, 'delay days', true);
      delta.set(d.id, d.days);
    }
    const blockedSet = new Set();
    for (const id of blocked) {
      if (!known.has(id) || blockedSet.has(id))
        throw Error('Unknown or duplicate blocked job');
      blockedSet.add(id);
    }
    for (const j of plan.jobs)
      if (j.deadlineDays + (delta.get(j.id) || 0) > LIMITS.days)
        throw Error('Combined duration exceeds day limit');
    // Analyzer supplies the authoritative exact-decimal budget and validated DAG baseline.
    const raw = analyze(plan, { horizonDays });
    const baseline = Object.fromEntries(
      [
        'currency',
        'budget',
        'allocatedRewards',
        'unallocatedBudget',
        'budgetWithinLimit',
        'criticalPathDays',
        'jobs',
      ].map((k) => [k, raw[k]])
    );
    const normalized = {
      delays: ids
        .filter((id) => delta.has(id))
        .map((id) => ({ id, days: delta.get(id) })),
      blockedJobIds: ids.filter((id) => blockedSet.has(id)),
      horizonDays,
    };
    const byId = new Map(plan.jobs.map((j) => [j.id, j])),
      baselineById = new Map(baseline.jobs.map((j) => [j.id, j])),
      children = new Map(ids.map((id) => [id, []]));
    for (const j of plan.jobs)
      for (const dep of j.dependencies) children.get(dep).push(j.id);
    const origins = ids.filter(
        (id) => blockedSet.has(id) || (delta.get(id) || 0) > 0
      ),
      paths = new Map();
    let chainBytes = 0;
    for (const origin of origins) {
      const routes = new Map([[origin, [origin]]]),
        queue = [origin];
      for (let n = 0; n < queue.length; n++)
        for (const child of children.get(queue[n]))
          if (!routes.has(child)) {
            const route = [...routes.get(queue[n]), child];
            chainBytes += route.reduce(
              (n, id) => n + encoder.encode(id).length + 4,
              2
            );
            if (chainBytes > 1048576)
              throw Error(
                'Causal chain output exceeds 1 MiB planning limit; use fewer disruptions or shorter IDs'
              );
            routes.set(child, route);
            queue.push(child);
          }
      paths.set(origin, routes);
    }
    const rows = new Map();
    function schedule(id) {
      if (rows.has(id)) return rows.get(id);
      const j = byId.get(id),
        dependencies = j.dependencies.map(schedule),
        causalChains = origins
          .filter((o) => paths.get(o).has(id))
          .map((o) => paths.get(o).get(id));
      const blockedBy = normalized.blockedJobIds.filter((o) =>
        paths.get(o).has(id)
      );
      const durationDays = j.deadlineDays + (delta.get(id) || 0);
      let startDay = null,
        finishDay = null,
        finishDeltaDays = null,
        criticalPredecessor = null;
      if (!blockedBy.length) {
        startDay = Math.max(0, ...dependencies.map((d) => d.finishDay));
        finishDay = startDay + durationDays;
        finishDeltaDays = finishDay - baselineById.get(id).finishDay;
        criticalPredecessor =
          ids.find(
            (dep) =>
              j.dependencies.includes(dep) &&
              rows.get(dep).finishDay === startDay
          ) || null;
      }
      const row = {
        id,
        title: j.title,
        reward: baselineById.get(id).reward,
        dependencies: [...j.dependencies],
        durationDays,
        status: blockedBy.length ? 'blocked' : 'schedulable',
        startDay,
        finishDay,
        finishDeltaDays,
        blockedBy,
        causalChains,
        criticalPredecessor,
      };
      rows.set(id, row);
      return row;
    }
    const jobs = ids.map(schedule),
      blockedJobs = jobs.filter((j) => j.status === 'blocked'),
      finite = jobs.filter((j) => j.status === 'schedulable');
    const finiteSubgraphCriticalPathDays = Math.max(
      0,
      ...finite.map((j) => j.finishDay)
    );
    let cursor = finite.find(
      (j) => j.finishDay === finiteSubgraphCriticalPathDays
    );
    const criticalPath = [];
    while (cursor) {
      criticalPath.unshift(cursor.id);
      cursor = rows.get(cursor.criticalPredecessor);
    }
    // Exact rewards are already validated by analyze; use fixed-point integers without Number conversion.
    const scale = 10n ** 18n;
    let exposure = 0n;
    for (const j of blockedJobs) {
      const [w, f = ''] = j.reward.split('.');
      exposure += BigInt(w) * scale + BigInt(f.padEnd(18, '0'));
    }
    const fraction = (exposure % scale)
      .toString()
      .padStart(18, '0')
      .replace(/0+$/, '');
    const completionPossible = blockedJobs.length === 0;
    const report = {
      schemaVersion: 1,
      kind: 'omniphoenix-dependency-disruption',
      mode: 'planning-only',
      sourceSha256: sha256(bytes),
      controls: normalized,
      assumptions: [...ASSUMPTIONS],
      liveProvider: false,
      transactionsSubmitted: false,
      baseline,
      scenario: {
        completionPossible,
        criticalPathDays: completionPossible
          ? finiteSubgraphCriticalPathDays
          : null,
        criticalPathDeltaDays: completionPossible
          ? finiteSubgraphCriticalPathDays - baseline.criticalPathDays
          : null,
        finiteSubgraphCriticalPathDays,
        scheduleWithinHorizon:
          completionPossible && horizonDays !== null
            ? finiteSubgraphCriticalPathDays <= horizonDays
            : null,
        blockedJobIds: normalized.blockedJobIds,
        blockedDescendantIds: blockedJobs
          .filter((j) => !blockedSet.has(j.id))
          .map((j) => j.id),
        unaffectedJobIds: jobs
          .filter((j) => !j.causalChains.length)
          .map((j) => j.id),
        blockedRewardExposure: `${exposure / scale}${
          fraction ? '.' + fraction : ''
        }`,
        criticalPath,
        jobs,
      },
    };
    const complete = {
      ...report,
      reportSha256: sha256(encoder.encode(canonical(report))),
    };
    const recovery = {
      schemaVersion: 1,
      kind: 'omniphoenix-disruption-recovery',
      sourceText: text,
      controls: normalized,
      report: complete,
    };
    if (encoder.encode(JSON.stringify(recovery)).length > LIMITS.recoveryBytes)
      throw Error(
        'Recovery output exceeds 4 MiB limit; reduce input complexity'
      );
    return complete;
  }
  function exportRecovery(input, controls = {}) {
    const { text } = bytesOf(input, LIMITS.planBytes);
    const report = analyzeBytes(input, controls);
    return {
      schemaVersion: 1,
      kind: 'omniphoenix-disruption-recovery',
      sourceText: text,
      controls: report.controls,
      report,
    };
  }
  function importRecovery(input) {
    const { text } = bytesOf(input, LIMITS.recoveryBytes),
      e = parseStrict(text);
    object(
      e,
      ['schemaVersion', 'kind', 'sourceText', 'controls', 'report'],
      ['schemaVersion', 'kind', 'sourceText', 'controls', 'report'],
      'recovery'
    );
    if (
      e.schemaVersion !== 1 ||
      e.kind !== 'omniphoenix-disruption-recovery' ||
      typeof e.sourceText !== 'string'
    )
      throw Error('Unsupported recovery format');
    const report = analyzeBytes(e.sourceText, e.controls);
    if (canonical(e.report) !== canonical(report))
      throw Error('Recovery report does not match recomputation');
    return { sourceText: e.sourceText, controls: report.controls, report };
  }
  return { analyzeBytes, exportRecovery, importRecovery };
}
module.exports = { createDesk, LIMITS, parseStrict, canonical, bytesOf };
