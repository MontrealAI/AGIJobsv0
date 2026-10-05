'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const SCALE = 10n ** 18n;
const MAX = (1n << 256n) - 1n;
const SCENARIOS = {
  national: { file: 'project-plan.json', horizonDays: null },
  planetary: { file: 'project-plan.planetary.json', horizonDays: 30 },
};
const TIMING =
  'Illustrative durations after dependencies: deadlineDays is treated as a job duration, with unlimited parallel resources. This assumption requires owner review; it is not an executed schedule.';
function amount(value, label) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,18})?$/.test(value))
    throw new Error(
      `${label}: use a nonnegative decimal string with at most 18 places`
    );
  const [whole, fraction = ''] = value.split('.');
  const raw = BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, '0'));
  if (raw > MAX)
    throw new Error(`${label}: amount exceeds uint256 planning range`);
  return raw;
}
function tokens(raw) {
  const sign = raw < 0n ? '-' : '';
  const n = raw < 0n ? -raw : raw;
  const fraction = (n % SCALE).toString().padStart(18, '0').replace(/0+$/, '');
  return `${sign}${n / SCALE}${fraction ? `.${fraction}` : ''}`;
}
function label(value, field) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 1000 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Error(`Invalid ${field}`);
  return value;
}
function analyze(plan, { sourceSha256 = null, horizonDays = null } = {}) {
  label(plan?.initiative, 'initiative');
  label(plan?.objective, 'objective');
  label(plan?.budget?.currency, 'budget currency');
  const budget = amount(plan.budget.total, 'budget');
  if (!Array.isArray(plan.jobs) || !plan.jobs.length || plan.jobs.length > 100)
    throw new Error('Plan must contain 1–100 jobs');
  if (
    horizonDays !== null &&
    (!Number.isSafeInteger(horizonDays) ||
      horizonDays < 1 ||
      horizonDays > 365000)
  )
    throw new Error('Horizon must be 1–365000 whole days');
  const byId = new Map();
  let allocated = 0n;
  for (const job of plan.jobs) {
    label(job.id, 'job id');
    label(job.title, 'job title');
    if (byId.has(job.id)) throw new Error(`Duplicate job ${job.id}`);
    if (
      !Number.isSafeInteger(job.deadlineDays) ||
      job.deadlineDays < 1 ||
      job.deadlineDays > 365000
    )
      throw new Error(`Invalid deadlineDays for ${job.id}`);
    if (
      !Array.isArray(job.dependencies) ||
      job.dependencies.some((d) => typeof d !== 'string') ||
      new Set(job.dependencies).size !== job.dependencies.length
    )
      throw new Error(`Invalid dependencies for ${job.id}`);
    allocated += amount(job.reward, `Reward ${job.id}`);
    if (allocated > MAX)
      throw new Error('Total rewards exceed uint256 planning range');
    byId.set(job.id, job);
  }
  const visiting = new Set(),
    scheduled = new Map();
  function visit(id) {
    if (scheduled.has(id)) return scheduled.get(id);
    if (!byId.has(id)) throw new Error(`Unknown dependency ${id}`);
    if (visiting.has(id)) throw new Error(`Dependency cycle at ${id}`);
    visiting.add(id);
    const job = byId.get(id);
    const dependencies = job.dependencies.map(visit);
    const startDay = Math.max(0, ...dependencies.map((d) => d.finishDay));
    const row = {
      id,
      title: job.title,
      reward: tokens(amount(job.reward, id)),
      dependencies: [...job.dependencies],
      durationDays: job.deadlineDays,
      startDay,
      finishDay: startDay + job.deadlineDays,
    };
    visiting.delete(id);
    scheduled.set(id, row);
    return row;
  }
  const jobs = plan.jobs.map((job) => visit(job.id));
  const criticalPathDays = Math.max(...jobs.map((j) => j.finishDay));
  const budgetWithinLimit = allocated <= budget;
  const scheduleWithinHorizon =
    horizonDays === null ? null : criticalPathDays <= horizonDays;
  return {
    schemaVersion: 1,
    mode: 'planning-only',
    sourceSha256,
    initiative: plan.initiative,
    objective: plan.objective,
    currency: plan.budget.currency,
    budget: tokens(budget),
    allocatedRewards: tokens(allocated),
    unallocatedBudget: tokens(budget - allocated),
    budgetWithinLimit,
    scheduleAssumption: TIMING,
    horizonDays,
    criticalPathDays,
    scheduleWithinHorizon,
    jobs,
    observations: [
      ...(!budgetWithinLimit
        ? ['Planned rewards exceed the illustrative budget.']
        : []),
      ...(scheduleWithinHorizon === false
        ? [
            `The ${criticalPathDays}-day illustrative critical path exceeds the ${horizonDays}-day planning horizon. Clarify timing or revise the plan.`,
          ]
        : []),
      'Scenario identities, physical projects, energy budgets and incentive targets are illustrative; this analysis neither executes jobs nor verifies deployment authority.',
    ],
    liveProvider: false,
    transactionsSubmitted: false,
    productionApproved: false,
    settlementApproved: false,
    market: {
      annualUsd: '40000000000000',
      basis:
        'Project planning assumption; not a verified TAM, serviceable market or revenue forecast.',
    },
  };
}
function loadScenario(name = 'national') {
  const scenario = Object.hasOwn(SCENARIOS, name) && SCENARIOS[name];
  if (!scenario) throw new Error('Scenario must be national or planetary');
  const bytes = fs.readFileSync(path.join(ROOT, scenario.file));
  if (bytes.length > 1024 * 1024) throw new Error('Plan exceeds 1 MiB');
  return analyze(JSON.parse(bytes), {
    horizonDays: scenario.horizonDays,
    sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  });
}
function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help')) {
    console.log(
      'Usage: node demo/asi-takeoff/scripts/plan.cjs [national|planetary] [--json]\nRead-only budget and dependency analysis; no chain or provider connection.'
    );
    return;
  }
  const args = argv.filter((x) => x !== '--json');
  if (args.length > 1 || argv.filter((x) => x === '--json').length > 1)
    throw new Error('Expected one scenario and optional --json');
  const report = loadScenario(args[0]);
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else
    console.log(
      `${report.initiative}\nPLANNING ONLY\nBudget: ${report.budget} ${
        report.currency
      }\nRewards: ${report.allocatedRewards}; reserve: ${
        report.unallocatedBudget
      }\nIllustrative critical path: ${report.criticalPathDays} days\n${
        report.scheduleAssumption
      }\n${report.observations.join('\n')}\nSource SHA-256: ${
        report.sourceSha256
      }`
    );
}
module.exports = { ROOT, SCENARIOS, analyze, loadScenario, main };
if (require.main === module)
  try {
    main();
  } catch (error) {
    console.error(`Plan failed: ${error.message}`);
    process.exitCode = 1;
  }
