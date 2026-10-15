import {
  analyze,
  parseSource,
} from '../zenith-sapience-initiative-supra-sovereign-hypernova-governance/workbench/core.mjs';
import { parseStrictJson } from './strict-json.mjs';
const exact = (x, fields, name) => {
  if (
    !x ||
    Array.isArray(x) ||
    typeof x !== 'object' ||
    Object.keys(x).length !== fields.length ||
    fields.some((k) => !Object.hasOwn(x, k))
  )
    throw Error(`${name}: missing or unknown fields`);
};
const label = (x, max = 100) =>
  typeof x === 'string' &&
  x.trim().length > 0 &&
  x.length <= max &&
  !/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/.test(x);
const money = (x) => typeof x === 'string' && /^(0|[1-9][0-9]{0,23})$/.test(x);
const id = (x) => typeof x === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(x);
export function evaluate(input) {
  exact(
    input,
    ['schema', 'title', 'unit', 'totalUnits', 'regions', 'jobs'],
    'scenario'
  );
  if (
    input.schema !== 'agijobs.zenith-regional-reconciliation.v1' ||
    !label(input.title, 200) ||
    !label(input.unit, 40) ||
    !money(input.totalUnits)
  )
    throw Error('Invalid scenario identity or total');
  if (
    !Array.isArray(input.regions) ||
    input.regions.length < 1 ||
    input.regions.length > 30 ||
    !Array.isArray(input.jobs) ||
    input.jobs.length < 1 ||
    input.jobs.length > 100
  )
    throw Error('Supply 1–30 regions and 1–100 jobs');
  const regionIds = new Set(),
    regionNames = new Set(),
    jobIds = new Set();
  for (const r of input.regions) {
    exact(r, ['id', 'name', 'allocationUnits'], 'region');
    if (
      !id(r.id) ||
      !label(r.name) ||
      !money(r.allocationUnits) ||
      regionIds.has(r.id) ||
      regionNames.has(r.name)
    )
      throw Error('Invalid or duplicate region');
    regionIds.add(r.id);
    regionNames.add(r.name);
  }
  for (const j of input.jobs) {
    exact(
      j,
      ['id', 'label', 'regionId', 'plannedUnits', 'reportedUnits'],
      'job'
    );
    if (
      !id(j.id) ||
      !label(j.label) ||
      !regionIds.has(j.regionId) ||
      !money(j.plannedUnits) ||
      (j.reportedUnits !== null && !money(j.reportedUnits)) ||
      jobIds.has(j.id)
    )
      throw Error('Invalid job or reported amount');
    jobIds.add(j.id);
  }
  const plan = {
    initiative: input.title,
    timingPolicy: 'duration-after-dependencies',
    budget: {
      currency: input.unit,
      total: input.totalUnits,
      allocations: Object.fromEntries(
        input.regions.map((r) => [r.name, r.allocationUnits])
      ),
    },
    regions: input.regions.map((r) => ({ id: r.id, name: r.name })),
    jobs: input.jobs.map((j) => ({
      id: j.id,
      title: j.label,
      region: j.regionId,
      reward: j.plannedUnits,
      deadlineDays: 1,
      dependencies: [],
    })),
  };
  const planned = analyze(parseSource(JSON.stringify(plan)));
  const unknownJobIds = input.jobs
    .filter((j) => j.reportedUnits === null)
    .map((j) => j.id);
  const reportedComplete = unknownJobIds.length === 0;
  const reported = reportedComplete
    ? analyze(
        parseSource(
          JSON.stringify({
            ...plan,
            jobs: plan.jobs.map((j, i) => ({
              ...j,
              reward: input.jobs[i].reportedUnits,
            })),
          })
        )
      )
    : null;
  const regions = input.regions.map((r) => {
    const jobs = input.jobs.filter((j) => j.regionId === r.id),
      known = jobs.filter((j) => j.reportedUnits !== null),
      complete = known.length === jobs.length;
    const sum = (values) => String(values.reduce((a, n) => a + BigInt(n), 0n));
    const plannedUnits = sum(jobs.map((j) => j.plannedUnits)),
      knownReportedUnits = sum(known.map((j) => j.reportedUnits));
    return {
      id: r.id,
      name: r.name,
      allocationUnits: r.allocationUnits,
      plannedUnits,
      knownReportedUnits,
      reportedComplete: complete,
      unknownJobIds: jobs
        .filter((j) => j.reportedUnits === null)
        .map((j) => j.id),
      reportedVarianceUnits: complete
        ? String(BigInt(knownReportedUnits) - BigInt(plannedUnits))
        : null,
      reportedHeadroomUnits: complete
        ? String(BigInt(r.allocationUnits) - BigInt(knownReportedUnits))
        : null,
    };
  });
  const allocationBalanced = planned.budget.allocated === input.totalUnits;
  const proposals = [];
  let uncoveredDeficitUnits = null;
  if (reportedComplete && allocationBalanced) {
    const donors = regions
      .filter((r) => BigInt(r.reportedHeadroomUnits) > 0n)
      .map((r) => ({ id: r.id, remaining: BigInt(r.reportedHeadroomUnits) }));
    let uncovered = 0n;
    for (const r of regions.filter(
      (r) => BigInt(r.reportedHeadroomUnits) < 0n
    )) {
      let deficit = -BigInt(r.reportedHeadroomUnits);
      for (const donor of donors) {
        const amount = donor.remaining < deficit ? donor.remaining : deficit;
        if (amount > 0n) {
          proposals.push({
            fromRegionId: donor.id,
            toRegionId: r.id,
            units: String(amount),
          });
          donor.remaining -= amount;
          deficit -= amount;
        }
      }
      uncovered += deficit;
    }
    uncoveredDeficitUnits = String(uncovered);
  }
  const proposalHoldReasons = [];
  if (!reportedComplete) proposalHoldReasons.push('reported-costs-incomplete');
  if (!allocationBalanced)
    proposalHoldReasons.push('regional-allocations-do-not-match-total');
  const after = regions.map((r) => ({
    id: r.id,
    proposedAllocationUnits: String(
      BigInt(r.allocationUnits) +
        proposals
          .filter((p) => p.toRegionId === r.id)
          .reduce((a, p) => a + BigInt(p.units), 0n) -
        proposals
          .filter((p) => p.fromRegionId === r.id)
          .reduce((a, p) => a + BigInt(p.units), 0n)
    ),
  }));
  if (
    after.reduce((a, r) => a + BigInt(r.proposedAllocationUnits), 0n) !==
    BigInt(planned.budget.allocated)
  )
    throw Error('Proposal conservation failed');
  return {
    schema: 'agijobs.zenith-regional-result.v1',
    title: input.title,
    unit: input.unit,
    planned,
    reported,
    regions,
    reportedComplete,
    unknownJobIds,
    allocationBalanced,
    proposalHoldReasons,
    proposals,
    proposedAllocations: after,
    uncoveredDeficitUnits,
    fullyFundedAfterProposal:
      reportedComplete && allocationBalanced && uncoveredDeficitUnits === '0',
    conserved: true,
    costAttested: false,
    transfersExecuted: false,
    productionApproved: false,
    settlementApproved: false,
    assumptions: [
      'Reported costs are supplied values, not verified invoices.',
      'Transfer proposals follow region input order and conserve the declared unit.',
      'Unknown reported costs remain unknown and hold all transfer proposals.',
      'No exchange rate, token conversion, transfer or execution is performed.',
    ],
  };
}
export function parseScenario(text) {
  const input = parseStrictJson(text);
  evaluate(input);
  return input;
}
