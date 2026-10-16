const dimensions = ['energyUnits', 'computeUnits'];
function exact(v, keys, name) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).sort().join('|') !== [...keys].sort().join('|')
  )
    throw Error(`${name}: missing or unknown fields`);
}
function integer(v, name, max = 1000000) {
  if (!Number.isSafeInteger(v) || v < 0 || v > max)
    throw Error(`${name}: integer 0–${max} required`);
}
export function evaluate(s) {
  exact(
    s,
    [
      'schema',
      'title',
      'normalCapacity',
      'outageCapacity',
      'protectedReserve',
      'jobs',
    ],
    'scenario'
  );
  if (s.schema !== 'agijobs.celestial-resource-contingency.v1')
    throw Error('Unsupported schema');
  if (
    typeof s.title !== 'string' ||
    !s.title.trim() ||
    [...s.title].length > 200
  )
    throw Error('Title: 1–200 characters required');
  for (const f of ['normalCapacity', 'outageCapacity', 'protectedReserve']) {
    exact(s[f], dimensions, f);
    for (const d of dimensions) integer(s[f][d], `${f}.${d}`);
  }
  for (const d of dimensions) {
    if (s.outageCapacity[d] > s.normalCapacity[d])
      throw Error('Outage capacity cannot exceed normal capacity');
    if (s.protectedReserve[d] > s.normalCapacity[d])
      throw Error('Protected reserve cannot exceed normal capacity');
  }
  if (!Array.isArray(s.jobs) || s.jobs.length < 1 || s.jobs.length > 50)
    throw Error('Supply 1–50 jobs');
  const seen = new Set();
  for (const j of s.jobs) {
    exact(j, ['id', 'label', 'priority', ...dimensions], 'job');
    if (
      typeof j.id !== 'string' ||
      !/^[a-z][a-z0-9-]{0,39}$/.test(j.id) ||
      seen.has(j.id)
    )
      throw Error('Unique lowercase job IDs required');
    seen.add(j.id);
    if (
      typeof j.label !== 'string' ||
      !j.label.trim() ||
      [...j.label].length > 100
    )
      throw Error('Label: 1–100 characters required');
    integer(j.priority, 'priority', 100);
    for (const d of dimensions) integer(j[d], d);
    if (j.energyUnits + j.computeUnits === 0)
      throw Error('Each job must request a resource');
  }
  const ordered = s.jobs
    .map((j, i) => ({ j, i }))
    .sort((a, b) => b.j.priority - a.j.priority || a.i - b.i)
    .map((x) => x.j);
  function allocate(capacity) {
    const held = {},
      shortfall = {},
      remaining = { ...capacity },
      allocated = { energyUnits: 0, computeUnits: 0 };
    for (const d of dimensions) {
      held[d] = Math.min(capacity[d], s.protectedReserve[d]);
      shortfall[d] = s.protectedReserve[d] - held[d];
      remaining[d] -= held[d];
    }
    const paused = Object.values(shortfall).some(Boolean);
    const jobs = ordered.map((j) => {
      const reasons = [];
      if (paused) reasons.push('protected-reserve-shortfall');
      else {
        if (j.energyUnits > remaining.energyUnits)
          reasons.push('energy-capacity');
        if (j.computeUnits > remaining.computeUnits)
          reasons.push('compute-capacity');
      }
      if (!reasons.length)
        for (const d of dimensions) {
          remaining[d] -= j[d];
          allocated[d] += j[d];
        }
      return {
        id: j.id,
        label: j.label,
        priority: j.priority,
        status: reasons.length ? 'deferred' : 'reserved',
        reasons,
        energyUnits: j.energyUnits,
        computeUnits: j.computeUnits,
      };
    });
    return {
      capacity: { ...capacity },
      reserveHeld: held,
      reserveShortfall: shortfall,
      dispatchPaused: paused,
      jobs,
      allocated,
      remaining,
      conserved: dimensions.every(
        (d) => capacity[d] === held[d] + allocated[d] + remaining[d]
      ),
    };
  }
  const normal = allocate(s.normalCapacity),
    outage = allocate(s.outageCapacity),
    selected = (p) =>
      p.jobs.filter((j) => j.status === 'reserved').map((j) => j.id),
    before = selected(normal),
    after = selected(outage);
  return {
    schema: 'agijobs.celestial-resource-result.v1',
    title: s.title,
    normal,
    outage,
    displacedIds: before.filter((i) => !after.includes(i)),
    newlySelectedIds: after.filter((i) => !before.includes(i)),
    allocationOrder: ordered.map((j) => j.id),
    assumptions: [
      'Higher priority first; ties preserve input order.',
      'Jobs are indivisible; greedy selection is not a global optimizer.',
      'Plans are independent snapshots; displaced means a changed plan, not an actual cancellation.',
      'Resource units are declared planning units, not measured physical capacity.',
    ],
    executionAttested: false,
    productionApproved: false,
    settlementApproved: false,
  };
}
