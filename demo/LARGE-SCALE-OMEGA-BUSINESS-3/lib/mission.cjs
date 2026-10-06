'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const s = require('./scenario.cjs');
const { createCandidate } = require('../computer-work/creator.cjs');
const {
  validateInput,
  checkCandidate,
} = require('../computer-work/checker.cjs');
const { runPhase } = require('./processes.cjs');
function parseArgs(argv = [], env = process.env) {
  const options = {
    scenario: path.join(s.DEMO, 'config/omega.simulation.json'),
    scope: s.sanitizeScope(env.OMEGA_REPORT_SCOPE || 'mission'),
    network: env.OMEGA_NETWORK || 'sepolia',
    timeoutMs: 300000,
    full: false,
    injectError: false,
    out: undefined,
    reviewCapacity: undefined,
    help: false,
  };
  const values = {
    '--scenario': 'scenario',
    '--scope': 'scope',
    '--network': 'network',
    '--out': 'out',
    '--timeout-ms': 'timeoutMs',
    '--review-capacity': 'reviewCapacity',
    '--origin': 'origin',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--full') options.full = true;
    else if (arg === '--inject-error') options.injectError = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else {
      const key = values[arg],
        value = argv[++i];
      if (!key || !value || value.startsWith('--'))
        throw new Error(`Unknown or incomplete option ${arg}`);
      options[key] = value;
    }
  }
  options.scope = s.sanitizeScope(options.scope);
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(options.network))
    throw new Error('Invalid planning network label');
  for (const [key, min, max] of [
    ['timeoutMs', 100, 900000],
    ['reviewCapacity', 0, 1000000],
  ])
    if (options[key] !== undefined) {
      if (!/^\d+$/.test(String(options[key])))
        throw new Error(`Invalid ${key}`);
      options[key] = s.integer(Number(options[key]), key, min, max);
    }
  if (
    options.origin &&
    !/^http:\/\/127\.0\.0\.1:(?:[1-9][0-9]{0,4})$/.test(options.origin)
  )
    throw new Error('Origin must be an explicit loopback HTTP port');
  if (options.origin && Number(new URL(options.origin).port) > 65535)
    throw new Error('Invalid origin port');
  options.scenario = path.resolve(options.scenario);
  if (options.out) options.out = path.resolve(options.out);
  return options;
}
function economics(nation, policy) {
  const budget = s.usdc(nation.budgetUsdc),
    worker = s.usdc(nation.modeledWorkerCostUsdc);
  const review =
    (s.usdc(policy.reviewRateUsdcPerHour) *
      BigInt(nation.estimatedReviewMinutes) +
      59n) /
    60n;
  const fee = (budget * BigInt(policy.platformFeeBps) + 9999n) / 10000n;
  return {
    currency: 'USDC planning units; no funding or payout',
    budgetMicros: String(budget),
    workerCostMicros: String(worker),
    reviewCostMicros: String(review),
    feeMicros: String(fee),
    remainingMicros: String(budget - worker - review - fee),
    actualPaidMicros: '0',
    costBasis:
      'Scenario assumptions, not measured provider use; fractional modeled costs round up to a micro-unit',
  };
}
function taskFor(nation, input, origin = 'http://127.0.0.1:4186') {
  return {
    schemaVersion: 1,
    workerProfile: 'omega',
    goal: input.goal,
    inputText: `Use the isolated Omega dashboard at ${origin}/ to review the ${
      nation.name
    } brief. Only the embedded synthetic input below is authoritative for this job. Return candidate.json using schemaVersion 1, kind, sourceSha256, rows, summary, productionApproved false and settlementApproved false. All quantities and micro-USDC amounts must remain exact decimal strings. Energy rows: {id, netKwh}, summary {netKwh, deficits:[id]}. Reserve rows: {id, availableUnits, shortfallUnits}, summary {availableUnits, shortfallUnits}. Supplier rows: {id, totalMicros, eligible}, summary {recommended:id or null}; select the cheapest eligible supplier, breaking cost ties lexically by ID. Source hash: ${s.sha256(
      s.json(input)
    )}. Use this exact provided hash for the approved pretty-printed input file. Also return dossier.md explaining sources, calculation, exceptions and limitations. Do not send messages, transact, deploy, change accounts or modify source files. Input: ${JSON.stringify(
      input
    )}`,
    dataClass: 'synthetic',
    allowedOrigins: [origin],
    acceptanceCriteria: [
      'Include every source row exactly once, with exact integer calculations and source-byte hash.',
      'Energy: generated minus consumed, preserving negative balances and all deficits; no energy creation is inferred.',
      'Reserves: subtract commitments and reserves before available stock; disclose every shortfall.',
      'Supplier selection: quantity times unit price plus shipping; reject late quotes even if cheaper; break equal-cost ties by ID.',
      'Independent arithmetic checker must pass; a separate reviewer must assess dossier quality and actual effects. No settlement authorization is implied.',
    ],
    deliverables: [
      { name: 'candidate.json', mediaType: 'application/json' },
      { name: 'dossier.md', mediaType: 'text/markdown' },
    ],
  };
}
function phasesFor(options, out) {
  return [
    {
      id: 'owner-quickstart',
      label: 'Owner control quickstart',
      script: 'owner:quickstart',
      format: 'markdown',
      file: 'owner-quickstart.md',
    },
    {
      id: 'owner-command-center',
      label: 'Owner command centre atlas',
      script: 'owner:command-center',
      format: 'markdown',
      file: 'owner-command-center.md',
    },
    {
      id: 'owner-parameter-matrix',
      label: 'Owner parameter matrix',
      script: 'owner:parameters',
      format: 'json',
      file: 'parameter-matrix.json',
    },
    {
      id: 'owner-control-surface',
      label: 'Owner control surface snapshot',
      script: 'owner:surface',
      format: 'markdown',
      file: 'owner-control-surface.md',
    },
  ]
    .map((p) => ({
      ...p,
      command: 'npm',
      args: [
        'run',
        p.script,
        '--',
        '--network',
        options.network,
        '--format',
        p.format,
        '--out',
        path.join(out, p.file),
      ],
    }))
    .concat([
      {
        id: 'omega-simulation',
        label: 'Local mock-contract lifecycle tests',
        command: process.execPath,
        args: [
          path.join(s.ROOT, 'node_modules/hardhat/internal/cli/cli.js'),
          '--config',
          path.join(s.DEMO, 'hardhat.config.cjs'),
          'test',
          '--network',
          'hardhat',
          'test/demo/omegaBusinessConfig.test.ts',
          'test/demo/omegaBusinessSimulation.test.ts',
        ],
        file: 'contract-receipts.json',
      },
    ]);
}
async function run(options, dependencies = {}) {
  const loaded = s.loadScenario(options.scenario);
  const scenario = loaded.scenario;
  if (scenario.schemaVersion !== 2)
    throw new Error(
      'The current runner needs schemaVersion 2 business/workload fields; legacy validation remains available'
    );
  const workloadsFile = path.join(s.DEMO, 'computer-work/workloads.json'),
    catalog = JSON.parse(fs.readFileSync(workloadsFile)),
    workloads = {};
  for (const nation of scenario.nations) {
    if (!Object.hasOwn(catalog, nation.wallet))
      throw new Error(`No reviewed workload for ${nation.wallet}`);
    workloads[nation.wallet] = catalog[nation.wallet];
    validateInput(workloads[nation.wallet]);
  }
  const workloadBytes = s.json(workloads);
  const runId =
    new Date().toISOString().replace(/[:.]/g, '-') +
    '-' +
    crypto.randomUUID().slice(0, 8);
  const out =
    options.out ||
    path.join(s.ROOT, 'reports/omega-business-3', options.scope, runId);
  if (fs.existsSync(out))
    throw new Error(
      'Output directory already exists; use a fresh directory to retain prior evidence'
    );
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const artifacts = [];
  function save(name, bytes) {
    const file = path.join(out, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    artifacts.push({
      path: name,
      bytes: Buffer.byteLength(bytes),
      sha256: s.sha256(bytes),
      cid: s.cid(bytes),
      published: false,
    });
  }
  save('scenario.json', loaded.bytes);
  save('workloads.json', workloadBytes);
  const capacity =
    options.reviewCapacity ?? scenario.businessPolicy.reviewCapacityMinutes;
  let reserved = 0;
  const jobs = [];
  for (const [index, nation] of scenario.nations.entries()) {
    const input = workloads[nation.wallet],
      costs = economics(nation, scenario.businessPolicy),
      key = nation.wallet;
    const reason =
      nation.estimatedReviewMinutes >
      scenario.businessPolicy.maxReviewerMinutesPerJob
        ? 'Review effort exceeds per-job admission limit'
        : reserved + nation.estimatedReviewMinutes > capacity
        ? 'Insufficient review capacity'
        : BigInt(costs.remainingMicros) < 0n
        ? 'Modeled costs exceed budget'
        : null;
    const task = taskFor(nation, input, options.origin);
    save(`${key}/input.json`, s.json(input));
    save(`${key}/task.json`, s.json(task));
    const job = {
      key,
      plannedJobId: index + 1,
      onChainJobId: null,
      employer: nation.name,
      mission: nation.mission,
      workGoal: input.goal,
      agentEns: nation.agentEns,
      identityVerified: false,
      deadlineHours: nation.deadlineHours,
      legacyMockRewardTokens: nation.rewardTokens,
      legacyReferences: {
        specCid: nation.specCid,
        resultCid: nation.resultCid,
        verified: false,
      },
      admission: {
        admitted: !reason,
        reason,
        estimatedReviewMinutes: nation.estimatedReviewMinutes,
      },
      economics: costs,
      status: reason ? 'deferred' : 'evidence-ready',
      humanReview: 'required',
      settlementApproved: false,
      files: { input: `${key}/input.json`, task: `${key}/task.json` },
    };
    if (!reason) {
      reserved += nation.estimatedReviewMinutes;
      const candidate = createCandidate(input);
      if (options.injectError && index === 0)
        candidate.summary.netKwh = '999999999';
      const candidateBytes = s.json(candidate),
        inputBytes = s.json(input),
        verdict = checkCandidate(inputBytes, candidateBytes);
      const dossier = `# ${
        nation.name
      }: synthetic candidate dossier\n\nSource SHA-256: ${s.sha256(
        inputBytes
      )}\n\n${
        input.goal
      }\n\nThis deterministic fixture uses exact integer arithmetic and includes every source row. Summary: ${JSON.stringify(
        candidate.summary
      )}. Energy deficits, inventory shortfalls and supplier delivery constraints are explicit. This is not output from a live provider. A separate reviewer must assess source rights, analysis and actual application state; no production or settlement authorization is given.\n`;
      save(`${key}/candidate.json`, candidateBytes);
      save(`${key}/dossier.md`, dossier);
      save(`${key}/checker.json`, s.json(verdict));
      job.files.candidate = `${key}/candidate.json`;
      job.files.dossier = `${key}/dossier.md`;
      job.files.checker = `${key}/checker.json`;
      job.checker = verdict;
      if (!verdict.accepted) job.status = 'rejected';
    }
    jobs.push(job);
  }
  const phases = [];
  if (options.full)
    for (const definition of phasesFor(options, out)) {
      console.log(`Omega: ${definition.label}`);
      const logName = `${definition.id}.log`,
        log = fs.createWriteStream(path.join(out, logName), {
          flags: 'wx',
          mode: 0o600,
        });
      let result;
      try {
        result = await (dependencies.runPhase || runPhase)(definition, {
          cwd: s.ROOT,
          env: {
            ...process.env,
            OMEGA_SCENARIO_FILE: options.scenario,
            OMEGA_CONTRACT_REPORT: path.join(out, 'contract-receipts.json'),
            HARDHAT_NETWORK: 'hardhat',
            AGJ_DEMO_BOOTSTRAP_HARDHAT: '0',
            OWNER_MATRIX_BOOTSTRAP_HARDHAT: '0',
          },
          timeoutMs: options.timeoutMs,
          output: log,
        });
      } catch (error) {
        result = {
          id: definition.id,
          label: definition.label,
          status: 'failed',
          exitCode: -1,
          error: error.message,
        };
      }
      await new Promise((resolve, reject) => {
        log.on('error', reject);
        log.end(resolve);
      });
      const file = path.join(out, definition.file);
      if (result.status === 'success') {
        try {
          if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0)
            throw new Error('Missing or empty phase artifact');
          if (definition.file.endsWith('.json'))
            JSON.parse(fs.readFileSync(file));
        } catch (error) {
          result.status = 'failed';
          result.error = error.message;
        }
      }
      for (const name of [definition.file, logName]) {
        const filePath = path.join(out, name);
        if (fs.existsSync(filePath)) {
          const bytes = fs.readFileSync(filePath);
          artifacts.push({
            path: name,
            bytes: bytes.length,
            sha256: s.sha256(bytes),
            cid: s.cid(bytes),
            published: false,
          });
        }
      }
      phases.push(result);
      if (result.status === 'failed') break;
    }
  const successful =
    !jobs.some((j) => j.status === 'rejected') &&
    !phases.some((p) => p.status === 'failed');
  const report = {
    schemaVersion: 2,
    runId,
    generatedAt: new Date().toISOString(),
    reportLabel: scenario.reportLabel,
    mode: 'synthetic',
    successful,
    liveProvider: false,
    productionApproved: false,
    settlementApproved: false,
    planningNetwork: options.network,
    workerOrigin: options.origin || 'http://127.0.0.1:4186',
    contractExecution: phases.some((p) => p.id === 'omega-simulation')
      ? 'See local mock-contract phase and receipts; not production contracts'
      : 'not run',
    sourceSha256: loaded.sha256,
    workloadSha256: s.sha256(workloadBytes),
    ensRoot: scenario.ensRoot,
    treasury: scenario.treasury,
    validators: scenario.validators,
    marketAnnualUsd: scenario.marketAnnualUsd,
    marketBasis: scenario.marketBasis,
    review: {
      capacityMinutes: capacity,
      reservedMinutes: reserved,
      actualHumanReviewPerformed: false,
    },
    totals: {
      jobs: jobs.length,
      admitted: jobs.filter((j) => j.admission.admitted).length,
      deferred: jobs.filter((j) => j.status === 'deferred').length,
      fixtureAccepted: jobs.filter((j) => j.checker?.accepted).length,
      rejected: jobs.filter((j) => j.status === 'rejected').length,
      proposedBudgetMicros: String(
        jobs.reduce((sum, j) => sum + BigInt(j.economics.budgetMicros), 0n)
      ),
      actualFundingMicros: '0',
      actualPayoutMicros: '0',
    },
    jobs,
    phases,
    artifacts,
  };
  save(
    'simulation-ledger.ndjson',
    jobs
      .map((job) =>
        JSON.stringify({ type: 'nation-mission', mode: 'synthetic', ...job })
      )
      .join('\n') + '\n'
  );
  const summary = `# Large-Scale Omega Business 3 mission\n\nRun: ${runId}\n\nMode: synthetic. Live provider: false. Production approval: false. Settlement approval: false.\n\n${
    report.totals.fixtureAccepted
  }/${
    report.totals.admitted
  } admitted fixture candidates pass the independent arithmetic checker; ${
    report.totals.deferred
  } deferred; human review remains required.\n\nProposed business budgets: ${s.formatUsdc(
    BigInt(report.totals.proposedBudgetMicros)
  )} USDC planning units. Actual funding and payouts: 0. Review capacity reserved: ${reserved}/${capacity} modeled minutes.\n\nPlanning network: ${
    options.network
  }. Contract test execution is always an isolated Hardhat mock, if requested. Historical scenario CIDs are not evidence. See report.json and its artifact manifest for exact source and output hashes.\n\n${phases
    .map((p) => `- ${p.label}: ${p.status}${p.error ? ' — ' + p.error : ''}`)
    .join(
      '\n'
    )}\n\n$40 trillion/year is the project vision assumption, not a verified estimate or platform revenue.\n`;
  save('mission-summary.md', summary);
  fs.writeFileSync(path.join(out, 'report.json'), s.json(report), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    `Omega ${
      successful ? 'rehearsal complete' : 'rehearsal rejected or failed'
    }: ${out}\n${report.totals.fixtureAccepted}/${
      report.totals.admitted
    } fixture checks pass; human review required; no live provider or settlement.`
  );
  return { report, out, exitCode: successful ? 0 : 1 };
}
async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(
      'Offline Omega mission: --scenario <json> --out <new directory> --scope <label> --review-capacity <minutes> --inject-error\nOptional --full runs existing owner reports and local mock-contract tests (root dependencies required); --network selects report context, never the contract-test network. --timeout-ms bounds each external phase.'
    );
    return 0;
  }
  return (await run(options)).exitCode;
}
module.exports = { parseArgs, economics, taskFor, phasesFor, run, main };
if (require.main === module)
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`Omega failed: ${error.message}`);
      process.exitCode = 1;
    });
