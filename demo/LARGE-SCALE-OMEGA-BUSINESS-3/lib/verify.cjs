'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {
  sha256,
  cid,
  validateScenario,
  json,
  integer,
} = require('./scenario.cjs');
const { economics, taskFor, phasesFor } = require('./mission.cjs');
const {
  checkCandidate,
  validateInput,
} = require('../computer-work/checker.cjs');
function verifyReport(directory) {
  const root = fs.realpathSync(directory);
  function read(relative, max = 16 * 1024 * 1024) {
    assert.ok(
      typeof relative === 'string' &&
        /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.[a-z]+$/.test(relative),
      'Unsafe artifact name'
    );
    const file = fs.realpathSync(path.join(root, relative));
    assert.ok(
      file.startsWith(root + path.sep),
      'Artifact escapes report directory'
    );
    assert.ok(fs.statSync(file).size <= max, 'Artifact too large');
    return fs.readFileSync(file);
  }
  const report = JSON.parse(read('report.json', 4 * 1024 * 1024));
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.mode, 'synthetic');
  assert.equal(report.liveProvider, false);
  assert.equal(report.productionApproved, false);
  assert.equal(report.settlementApproved, false);
  assert.ok(Array.isArray(report.artifacts));
  const names = new Set();
  for (const artifact of report.artifacts) {
    assert.ok(!names.has(artifact.path), 'Duplicate artifact');
    names.add(artifact.path);
    const bytes = read(artifact.path);
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(
      sha256(bytes),
      artifact.sha256,
      `Hash mismatch: ${artifact.path}`
    );
    assert.equal(cid(bytes), artifact.cid);
    assert.equal(artifact.published, false);
  }
  for (const name of [
    'scenario.json',
    'workloads.json',
    'simulation-ledger.ndjson',
    'mission-summary.md',
  ])
    assert.ok(names.has(name), `Missing ${name}`);
  const sourceBytes = read('scenario.json');
  const scenario = JSON.parse(sourceBytes);
  validateScenario(scenario);
  assert.equal(sha256(sourceBytes), report.sourceSha256);
  assert.equal(sha256(read('workloads.json')), report.workloadSha256);
  assert.equal(report.jobs.length, scenario.nations.length);
  assert.equal(report.review.actualHumanReviewPerformed, false);
  const workloads = JSON.parse(read('workloads.json'));
  assert.deepEqual(
    Object.keys(workloads).sort(),
    scenario.nations.map((nation) => nation.wallet).sort()
  );
  for (const input of Object.values(workloads)) validateInput(input);
  integer(report.review.capacityMinutes, 'review capacity', 0, 1000000);
  assert.ok(
    /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(report.workerOrigin)
  );
  for (const key of [
    'reportLabel',
    'ensRoot',
    'treasury',
    'validators',
    'marketAnnualUsd',
    'marketBasis',
  ])
    assert.deepEqual(report[key], scenario[key]);
  let reserved = 0,
    admitted = 0,
    rejected = 0,
    accepted = 0,
    budget = 0n;
  const seenJobs = new Set();
  for (const [index, job] of report.jobs.entries()) {
    const nation = scenario.nations[index];
    assert.equal(job.key, nation.wallet);
    assert.ok(!seenJobs.has(job.key));
    seenJobs.add(job.key);
    assert.equal(job.plannedJobId, index + 1);
    assert.equal(job.employer, nation.name);
    assert.equal(job.agentEns, nation.agentEns);
    assert.equal(job.identityVerified, false);
    assert.equal(job.mission, nation.mission);
    assert.equal(job.deadlineHours, nation.deadlineHours);
    assert.equal(job.workGoal, workloads[job.key].goal);
    assert.equal(job.legacyMockRewardTokens, nation.rewardTokens);
    assert.deepEqual(job.legacyReferences, {
      specCid: nation.specCid,
      resultCid: nation.resultCid,
      verified: false,
    });
    assert.equal(
      job.admission.estimatedReviewMinutes,
      nation.estimatedReviewMinutes
    );
    const expectedFiles = {
      input: `${job.key}/input.json`,
      task: `${job.key}/task.json`,
    };
    if (job.admission.admitted)
      Object.assign(expectedFiles, {
        candidate: `${job.key}/candidate.json`,
        dossier: `${job.key}/dossier.md`,
        checker: `${job.key}/checker.json`,
      });
    assert.deepEqual(job.files, expectedFiles);
    assert.equal(read(job.files.input).toString(), json(workloads[job.key]));
    assert.deepEqual(
      JSON.parse(read(job.files.task)),
      taskFor(nation, workloads[job.key], report.workerOrigin)
    );
    assert.equal(job.onChainJobId, null);
    assert.equal(job.humanReview, 'required');
    assert.equal(job.settlementApproved, false);
    assert.deepEqual(job.economics, economics(nation, scenario.businessPolicy));
    budget += BigInt(job.economics.budgetMicros);
    const reason =
      nation.estimatedReviewMinutes >
      scenario.businessPolicy.maxReviewerMinutesPerJob
        ? 'Review effort exceeds per-job admission limit'
        : reserved + nation.estimatedReviewMinutes >
          report.review.capacityMinutes
        ? 'Insufficient review capacity'
        : BigInt(job.economics.remainingMicros) < 0n
        ? 'Modeled costs exceed budget'
        : null;
    assert.equal(job.admission.admitted, !reason);
    assert.equal(job.admission.reason, reason);
    for (const name of Object.values(job.files))
      assert.ok(names.has(name), `Unmanifested job artifact ${name}`);
    if (!reason) {
      admitted++;
      reserved += nation.estimatedReviewMinutes;
      const verdict = checkCandidate(
        read(job.files.input),
        read(job.files.candidate)
      );
      assert.deepEqual(JSON.parse(read(job.files.checker)), job.checker);
      assert.deepEqual(job.checker, verdict);
      assert.equal(
        job.status,
        verdict.accepted ? 'evidence-ready' : 'rejected'
      );
      if (verdict.accepted) accepted++;
      else rejected++;
    } else {
      assert.equal(job.status, 'deferred');
      assert.equal(job.checker, undefined);
    }
  }
  assert.equal(report.review.reservedMinutes, reserved);
  assert.ok(reserved <= report.review.capacityMinutes);
  assert.deepEqual(report.totals, {
    jobs: report.jobs.length,
    admitted,
    deferred: report.jobs.length - admitted,
    fixtureAccepted: accepted,
    rejected,
    proposedBudgetMicros: String(budget),
    actualFundingMicros: '0',
    actualPayoutMicros: '0',
  });
  assert.ok(Array.isArray(report.phases));
  const phaseIds = [
    'owner-quickstart',
    'owner-command-center',
    'owner-parameter-matrix',
    'owner-control-surface',
    'omega-simulation',
  ];
  const definitions = phasesFor({ network: report.planningNetwork }, root);
  report.phases.forEach((p, i) => {
    assert.ok(names.has(`${p.id}.log`), 'Missing phase log');
    if (p.status === 'success')
      assert.ok(
        names.has(definitions[i].file),
        'Missing successful phase artifact'
      );
    assert.equal(p.id, phaseIds[i]);
    assert.ok(['success', 'failed'].includes(p.status));
    if (i < report.phases.length - 1) assert.equal(p.status, 'success');
  });
  if (report.phases.length && !report.phases.some((p) => p.status === 'failed'))
    assert.equal(report.phases.length, 5);
  assert.equal(
    report.contractExecution,
    report.phases.some((p) => p.id === 'omega-simulation')
      ? 'See local mock-contract phase and receipts; not production contracts'
      : 'not run'
  );
  if (
    report.phases.some(
      (p) => p.id === 'omega-simulation' && p.status === 'success'
    )
  ) {
    const contract = JSON.parse(read('contract-receipts.json'));
    assert.equal(contract.mode, 'local-mock-contracts');
    assert.equal(contract.chainId, '31337');
    assert.equal(contract.jobsFinalized, scenario.nations.length);
    assert.equal(contract.productionApproved, false);
    assert.equal(contract.validatorVotingTested, false);
    assert.equal(contract.ensRegistrationTested, false);
    assert.equal(contract.receipts.length, scenario.nations.length * 5);
    const hashes = new Set();
    for (const receipt of contract.receipts) {
      assert.equal(receipt.status, 1);
      assert.match(receipt.hash, /^0x[0-9a-f]{64}$/);
      assert.ok(!hashes.has(receipt.hash));
      hashes.add(receipt.hash);
      integer(receipt.blockNumber, 'receipt block', 1, Number.MAX_SAFE_INTEGER);
    }
  }
  assert.equal(
    report.successful,
    rejected === 0 && !report.phases.some((p) => p.status === 'failed')
  );
  const ledger = read('simulation-ledger.ndjson')
    .toString()
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    ledger,
    report.jobs.map((job) => ({
      type: 'nation-mission',
      mode: 'synthetic',
      ...job,
    }))
  );
  return { report, read };
}
module.exports = { verifyReport };
if (require.main === module) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Usage: node lib/verify.cjs <run directory>');
    const { report } = verifyReport(process.argv[2]);
    console.log(
      `Verified ${report.artifacts.length} artifacts and ${report.jobs.length} job records. Human review and production approval remain required.`
    );
  } catch (error) {
    console.error(`Verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
