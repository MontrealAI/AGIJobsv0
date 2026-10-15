'use strict';
const { Interface } = require('ethers');
const events = new Interface([
  'event ValidationQuorumFailed(uint256 indexed jobId,uint256 revealed,uint256 required)',
  'event ValidatorBanApplied(address indexed validator,uint256 untilBlock)',
  'event ValidationTallied(uint256 indexed jobId,bool success,uint256 approvals,uint256 rejections)',
  'event ValidationResult(uint256 indexed jobId,bool success)',
]);
function validateEvidence(result) {
  const object = (x, keys) => {
    if (
      !x ||
      Array.isArray(x) ||
      typeof x !== 'object' ||
      Object.keys(x).some((k) => !keys.includes(k)) ||
      keys.filter((k) => k !== 'review').some((k) => !Object.hasOwn(x, k))
    )
      throw Error('Unexpected or missing evidence fields');
  };
  const integer = (x, max) => {
    if (!Number.isSafeInteger(x) || x < 0 || x > max)
      throw Error('Invalid bounded integer');
  };
  const decimal = (x) => {
    if (typeof x !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(x))
      throw Error('Invalid integer string');
  };
  const hex = (x, n) => {
    if (
      typeof x !== 'string' ||
      !new RegExp('^0x[0-9a-fA-F]{' + n + '}$').test(x)
    )
      throw Error('Invalid hex value');
  };
  object(result, [
    'schema',
    'scope',
    'chainId',
    'instanceId',
    'options',
    'policyBefore',
    'policyAfter',
    'contracts',
    'initialStakePerValidator',
    'first',
    'firstStakes',
    'employerAfterFirst',
    'recovery',
    'liveAssets',
    'productionApproved',
    'settlementApproved',
    'review',
  ]);
  if (typeof result.scope !== 'string' || result.scope.length > 256 || !result.scope.trim())
    throw Error('Scope must be nonempty text of at most 256 characters');
  hex(result.instanceId, 64);
  object(result.options, ['initialReveals', 'replacementApprovals']);
  Object.values(result.options).forEach((x) => integer(x, 3));
  for (const p of [result.policyBefore, result.policyAfter]) {
    object(p, [
      'approvalThresholdPct',
      'nonRevealPenaltyBps',
      'nonRevealBanBlocks',
      'validatorsPerJob',
      'requiredApprovals',
      'revealQuorumPct',
      'minRevealValidators',
    ]);
    Object.values(p).forEach(decimal);
  }
  object(result.contracts, [
    'validation',
    'stakeManager',
    'token',
    'jobRegistry',
    'identity',
  ]);
  for (const c of Object.values(result.contracts)) {
    object(c, ['address', 'runtimeKeccak256', 'mock']);
    hex(c.address, 40);
    hex(c.runtimeKeccak256, 64);
    if (typeof c.mock !== 'boolean') throw Error('Invalid mock marker');
  }
  decimal(result.initialStakePerValidator);
  decimal(result.employerAfterFirst);
  if (!Array.isArray(result.firstStakes) || result.firstStakes.length !== 6)
    throw Error('Expected six stake observations');
  for (const v of result.firstStakes) {
    object(v, ['address', 'stake', 'banUntil']);
    hex(v.address, 40);
    decimal(v.stake);
    decimal(v.banUntil);
  }
  for (const r of [result.first, result.recovery]) {
    object(r, [
      'jobId',
      'committee',
      'requestedRevealCount',
      'requestedApprovalCount',
      'observedSuccess',
      'observedStatus',
      'receipt',
    ]);
    integer(r.jobId, 2);
    integer(r.requestedRevealCount, 3);
    integer(r.requestedApprovalCount, 3);
    integer(r.observedStatus, 255);
    if (
      typeof r.observedSuccess !== 'boolean' ||
      !Array.isArray(r.committee) ||
      r.committee.length !== 3
    )
      throw Error('Invalid committee/outcome');
    r.committee.forEach((a) => hex(a, 40));
    object(r.receipt, [
      'transactionHash',
      'blockHash',
      'blockNumber',
      'status',
      'logs',
    ]);
    hex(r.receipt.transactionHash, 64);
    hex(r.receipt.blockHash, 64);
    integer(r.receipt.blockNumber, 10000);
    integer(r.receipt.status, 1);
    if (!Array.isArray(r.receipt.logs) || r.receipt.logs.length > 64)
      throw Error('Too many receipt events');
    for (const l of r.receipt.logs) {
      object(l, [
        'address',
        'topics',
        'data',
        'transactionHash',
        'blockHash',
        'blockNumber',
        'index',
      ]);
      hex(l.address, 40);
      hex(l.transactionHash, 64);
      hex(l.blockHash, 64);
      integer(l.blockNumber, 10000);
      integer(l.index, 1000);
      if (!Array.isArray(l.topics) || l.topics.length > 4)
        throw Error('Invalid topics');
      l.topics.forEach((t) => hex(t, 64));
      if (
        typeof l.data !== 'string' ||
        l.data.length > 8194 ||
        !/^0x([0-9a-fA-F]{2})*$/.test(l.data)
      )
        throw Error('Invalid log data');
    }
  }
  if (
    result.first.jobId !== 1 ||
    result.recovery.jobId !== 2 ||
    result.first.requestedRevealCount !== result.options.initialReveals ||
    result.first.requestedApprovalCount !== result.options.initialReveals ||
    result.recovery.requestedApprovalCount !==
      result.options.replacementApprovals
  )
    throw Error('Scenario/round bindings disagree');
  return result;
}
/** Offline consistency review of fixture receipts. This does not attest a chain. */
function review(result) {
  const checks = [];
  const check = (name, passed) =>
    checks.push({ name, passed: Boolean(passed) });
  try {
    validateEvidence(result);
    const p = result.policyBefore;
    check(
      'Disposable fixture boundary',
      result.schema === 'agijobs.polaris-quorum-fixture.v1' &&
        result.chainId === 31337 &&
        result.liveAssets === false &&
        result.productionApproved === false &&
        result.settlementApproved === false
    );
    check(
      'Quorum policy retained',
      Object.keys(p).every((k) => p[k] === result.policyAfter[k]) &&
        p.validatorsPerJob === '3' &&
        p.revealQuorumPct === '100' &&
        p.minRevealValidators === '3' &&
        p.nonRevealPenaltyBps === '100' &&
        p.approvalThresholdPct === '66' &&
        p.requiredApprovals === '2' &&
        p.nonRevealBanBlocks === '10'
    );
    check(
      'Mocks clearly identified',
      ['token', 'jobRegistry', 'identity'].every(
        (k) => result.contracts[k].mock === true
      ) &&
        ['validation', 'stakeManager'].every(
          (k) => result.contracts[k].mock === false
        )
    );
    const normalizedCommittee = (key) =>
      result[key].committee.map((a) => a.toLowerCase());
    const allCommittee = [
      ...normalizedCommittee('first'),
      ...normalizedCommittee('recovery'),
    ];
    check(
      'Two disjoint committees cover exactly six funded validators',
      new Set(allCommittee).size === 6 &&
        result.firstStakes.every((v) =>
          allCommittee.includes(v.address.toLowerCase())
        )
    );
    const decoded = {};
    for (const key of ['first', 'recovery']) {
      const round = result[key],
        receipt = round.receipt;
      check(
        `${key}: successful receipt`,
        receipt.status === 1 &&
          Number.isSafeInteger(receipt.blockNumber) &&
          receipt.blockNumber > 0
      );
      const indices = new Set();
      check(
        `${key}: log provenance`,
        receipt.logs.every(
          (l) =>
            l.transactionHash === receipt.transactionHash &&
            l.blockHash === receipt.blockHash &&
            l.blockNumber === receipt.blockNumber &&
            Number.isSafeInteger(l.index) &&
            l.index >= 0 &&
            !indices.has(l.index) &&
            Boolean(indices.add(l.index))
        )
      );
      decoded[key] = receipt.logs
        .filter(
          (l) =>
            l.address.toLowerCase() ===
            result.contracts.validation.address.toLowerCase()
        )
        .flatMap((l) => {
          try {
            const e = events.parseLog(l);
            return e ? [e] : [];
          } catch {
            return [];
          }
        });
      const outcomes = decoded[key].filter(
        (e) => e.name === 'ValidationResult'
      );
      check(
        `${key}: event binds observed outcome`,
        outcomes.length === 1 &&
          outcomes[0].args[0] === BigInt(round.jobId) &&
          outcomes[0].args[1] === round.observedSuccess
      );
      const reveals = round.requestedRevealCount,
        approvals = round.requestedApprovalCount;
      const tally = decoded[key].filter((e) => e.name === 'ValidationTallied');
      check(
        `${key}: receipt tally binds participation and approvals`,
        tally.length === 1 &&
          tally[0].args[0] === BigInt(round.jobId) &&
          tally[0].args[1] === round.observedSuccess &&
          tally[0].args[2] ===
            BigInt(approvals) * BigInt(result.initialStakePerValidator) &&
          tally[0].args[3] ===
            BigInt(reveals - approvals) *
              BigInt(result.initialStakePerValidator)
      );
      const expected =
        reveals === 3 &&
        approvals >= Number(p.requiredApprovals) &&
        approvals * 100 >= reveals * Number(p.approvalThresholdPct);
      check(
        `${key}: unchanged policy decides outcome`,
        round.observedSuccess === expected
      );
    }
    const missing = 3 - result.options.initialReveals;
    const failures = decoded.first.filter(
      (e) => e.name === 'ValidationQuorumFailed'
    );
    check(
      'Quorum failure records reveal deficit',
      missing
        ? failures.length === 1 &&
            failures[0].args[0] === 1n &&
            failures[0].args[1] === BigInt(result.options.initialReveals) &&
            failures[0].args[2] === 3n
        : failures.length === 0
    );
    const bans = decoded.first.filter((e) => e.name === 'ValidatorBanApplied');
    check(
      'Each missing revealer receives one ban',
      bans.length === missing &&
        new Set(bans.map((e) => e.args[0].toLowerCase())).size === missing
    );
    const initial = BigInt(result.initialStakePerValidator),
      penalty = (initial * BigInt(p.nonRevealPenaltyBps)) / 10000n;
    check(
      'Six unique funded fixture validators',
      result.firstStakes.length === 6 &&
        new Set(result.firstStakes.map((v) => v.address.toLowerCase())).size ===
          6
    );
    check(
      'Observed stakes and bans match receipts',
      result.firstStakes.every((v) => {
        const i = result.first.committee.findIndex(
          (a) => a.toLowerCase() === v.address.toLowerCase()
        );
        const missed = i >= result.options.initialReveals && i >= 0;
        const event = bans.find(
          (e) => e.args[0].toLowerCase() === v.address.toLowerCase()
        );
        return (
          BigInt(v.stake) === initial - (missed ? penalty : 0n) &&
          (missed
            ? Boolean(event) &&
              BigInt(v.banUntil) === event.args[1] &&
              event.args[1] ===
                BigInt(result.first.receipt.blockNumber) +
                  BigInt(p.nonRevealBanBlocks)
            : BigInt(v.banUntil) === 0n)
        );
      })
    );
    check(
      'Employer receives exact mock penalties',
      BigInt(result.employerAfterFirst) === penalty * BigInt(missing)
    );
    check(
      'Replacement uses three fresh funded validators',
      result.recovery.committee.length === 3 &&
        new Set(normalizedCommittee('recovery')).size === 3 &&
        result.recovery.committee.every(
          (a) =>
            !normalizedCommittee('first').includes(a.toLowerCase()) &&
            result.firstStakes.some(
              (v) =>
                v.address.toLowerCase() === a.toLowerCase() &&
                BigInt(v.stake) === initial &&
                v.banUntil === '0'
            )
        )
    );
    check(
      'Replacement reveals meet unchanged quorum',
      result.recovery.requestedRevealCount === 3 &&
        !decoded.recovery.some(
          (e) =>
            e.name === 'ValidationQuorumFailed' ||
            e.name === 'ValidatorBanApplied'
        )
    );
  } catch (error) {
    check(`Malformed fixture evidence: ${error.message}`, false);
  }
  return {
    schema: 'agijobs.polaris-review.v1',
    accepted: checks.every((c) => c.passed),
    checks,
    chainAttested: false,
    productionApproved: false,
    settlementApproved: false,
  };
}
module.exports = { review, validateEvidence };
