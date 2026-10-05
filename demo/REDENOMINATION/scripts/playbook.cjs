'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const DEMO = path.resolve(__dirname, '..');
const UINT256_MAX = (1n << 256n) - 1n;
const UINT96_MAX = (1n << 96n) - 1n;
const SOURCE_FILES = [
  'agialpha.json',
  'owner-control.json',
  'stake-manager.json',
  'job-registry.json',
  'fee-pool.json',
];
const pausePreview =
  'HARDHAT_NETWORK=localhost npx ts-node --compiler-options \'{"module":"commonjs"}\' scripts/v2/systemPauseAction.ts --action pause --dry-run';
const unpausePreview = pausePreview.replace(
  '--action pause',
  '--action unpause'
);

function integer(value, label, max = UINT256_MAX) {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error(`${label}: use an exact decimal string`);
  if (
    !['string', 'number', 'bigint'].includes(typeof value) ||
    !/^\d+$/.test(String(value))
  )
    throw new Error(`${label}: expected an unsigned decimal integer`);
  const result = BigInt(value);
  if (result > max) throw new Error(`${label}: exceeds supported range`);
  return result;
}
function decimals(value, label = 'decimals') {
  const result = integer(value, label, 77n);
  return Number(result);
}
function parseUnits(value, precision, label = 'amount') {
  decimals(precision);
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error(`${label}: fractional values require decimal strings`);
  if (
    !['string', 'number'].includes(typeof value) ||
    !/^\d+(\.\d+)?$/.test(String(value))
  )
    throw new Error(`${label}: expected non-negative decimal tokens`);
  const [whole, fraction = ''] = String(value).split('.');
  if (fraction.length > precision)
    throw new Error(`${label}: more than ${precision} decimal places`);
  return integer(
    BigInt(whole) * 10n ** BigInt(precision) +
      BigInt(fraction.padEnd(precision, '0') || '0'),
    label
  );
}
function formatUnits(raw, precision) {
  raw = integer(raw, 'raw amount');
  decimals(precision);
  if (precision === 0) return raw.toString();
  const padded = raw.toString().padStart(precision + 1, '0');
  return `${padded.slice(0, -precision)}.${
    padded.slice(-precision).replace(/0+$/, '') || '0'
  }`;
}
function convert(
  raw,
  ratio,
  currentDecimals,
  targetDecimals,
  rounding = 'reject'
) {
  raw = integer(raw, 'raw amount');
  ratio = integer(ratio, 'ratio');
  if (!ratio) throw new Error('Ratio must be positive');
  decimals(currentDecimals);
  decimals(targetDecimals);
  if (!['reject', 'floor'].includes(rounding))
    throw new Error('Rounding must be reject or floor');
  const numerator = raw * 10n ** BigInt(targetDecimals);
  const denominator = ratio * 10n ** BigInt(currentDecimals);
  const result = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder && rounding === 'reject')
    throw new Error(
      'Non-exact conversion: increase target decimals or explicitly review --rounding floor'
    );
  integer(result, 'converted amount');
  return {
    raw: result,
    remainderNumerator: remainder.toString(),
    remainderDenominator: denominator.toString(),
  };
}
function snapshot(raw, precision, symbol) {
  const tokens = formatUnits(raw, precision);
  return { raw: raw.toString(), tokens, formatted: `${tokens} ${symbol}` };
}
function defaults() {
  return {
    outputPath: path.join(DEMO, 'ui/export/latest.json'),
    configOutputDir: path.join(DEMO, 'config'),
    ratio: 1000n,
    newDecimals: undefined,
    newSymbol: 'AGIΩ',
    newName: 'AGI Omega',
    scenario: 'AGI Jobs redenomination planning rehearsal',
    rounding: 'reject',
    pretty: true,
  };
}
function parseArgs(argv) {
  const opts = defaults();
  const fields = {
    '--output': 'outputPath',
    '--out': 'outputPath',
    '--config-dir': 'configOutputDir',
    '--ratio': 'ratio',
    '--new-decimals': 'newDecimals',
    '--symbol': 'newSymbol',
    '--name': 'newName',
    '--scenario': 'scenario',
    '--current-supply': 'currentSupplyTokens',
    '--rounding': 'rounding',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg === '--compact') {
      opts.pretty = false;
      continue;
    }
    const key = fields[arg];
    if (!key) throw new Error(`Unknown argument ${arg}`);
    const value = argv[++i];
    if (!value || value.startsWith('--'))
      throw new Error(`${arg} requires a value`);
    opts[key] = value;
  }
  opts.ratio = integer(opts.ratio, 'ratio');
  if (!opts.ratio) throw new Error('Ratio must be positive');
  if (opts.newDecimals !== undefined)
    opts.newDecimals = decimals(opts.newDecimals);
  if (!['reject', 'floor'].includes(opts.rounding))
    throw new Error('Rounding must be reject or floor');
  for (const [key, max] of [
    ['newSymbol', 32],
    ['newName', 128],
    ['scenario', 500],
  ]) {
    if (
      typeof opts[key] !== 'string' ||
      !opts[key].trim() ||
      opts[key].length > max ||
      /[\x00-\x1f\x7f]/.test(opts[key])
    )
      throw new Error(`Invalid ${key}`);
  }
  opts.outputPath = path.resolve(opts.outputPath);
  opts.configOutputDir = path.resolve(opts.configOutputDir);
  return opts;
}
function validateConfig(config, label) {
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error(`${label} must be an object`);
  for (const [key, value] of Object.entries(config)) {
    if (key.endsWith('Pct'))
      integer(
        value,
        `${label}.${key}`,
        key === 'maxTotalPayoutPct' ? 200n : 100n
      );
    if (key === 'maxTotalPayoutPct' && BigInt(value) < 100n)
      throw new Error(`${label}.${key}: must be between 100 and 200`);
    if (value && typeof value === 'object' && !Array.isArray(value))
      validateConfig(value, `${label}.${key}`);
    if (key.endsWith('Seconds') || key === 'maxActiveJobsPerAgent')
      integer(value, `${label}.${key}`, BigInt(Number.MAX_SAFE_INTEGER));
  }
}
function percentageTotal(config, keys, label) {
  // Omitted fields are unresolved chain state, not asserted zero values.
  const configured = keys.filter((key) => config[key] !== undefined);
  const total = configured.reduce(
    (sum, key) => sum + integer(config[key], `${label}.${key}`, 100n),
    0n
  );
  if (total > 100n)
    throw new Error(`${label}: ${keys.join(' + ')} cannot exceed 100`);
}
function buildPlaybook(inputs, supplied = {}) {
  const options = { ...defaults(), ...supplied };
  const [token, owner, stake, job, fee] = inputs.configs;
  inputs.configs.forEach((config, index) =>
    validateConfig(config, SOURCE_FILES[index])
  );
  const currentDecimals = decimals(token.decimals);
  const targetDecimals = decimals(options.newDecimals ?? currentDecimals);
  const currentSymbol = token.symbol;
  if (typeof currentSymbol !== 'string' || !currentSymbol)
    throw new Error('Source token symbol is missing');
  const ratio = integer(options.ratio, 'ratio');
  if (!ratio) throw new Error('Ratio must be positive');
  // Match the existing owner planner's whole-percent configuration policy.
  percentageTotal(
    stake,
    ['employerSlashPct', 'treasurySlashPct', 'validatorSlashRewardPct'],
    'Owner slashing policy'
  );
  // The contract also bounds the distribution to employer/treasury/operator/burn.
  // Validator rewards are handled separately there; do not sum all five fields.
  percentageTotal(
    stake,
    [
      'employerSlashPct',
      'treasurySlashPct',
      'operatorSlashPct',
      'burnSlashPct',
    ],
    'Contract slash distribution'
  );
  percentageTotal(
    stake,
    ['feePct', 'burnPct', 'validatorRewardPct'],
    'Stake fees'
  );
  percentageTotal(job, ['feePct', 'validatorRewardPct'], 'Job fees');
  if (
    stake.unbondingPeriodSeconds !== undefined &&
    integer(stake.unbondingPeriodSeconds, 'unbondingPeriodSeconds') === 0n
  )
    throw new Error('unbondingPeriodSeconds must be positive');
  if (
    stake.maxAGITypes !== undefined &&
    integer(stake.maxAGITypes, 'maxAGITypes', 50n) === 0n
  )
    throw new Error('maxAGITypes must be between 1 and 50');
  const dust = [];
  const beforeStake = {},
    afterStake = {},
    beforeJob = {},
    afterJob = {};
  const stakeDraft = JSON.parse(JSON.stringify(stake)),
    jobDraft = JSON.parse(JSON.stringify(job));
  function amount(
    source,
    draft,
    tokenKey,
    rawKey,
    field,
    before,
    after,
    required = false
  ) {
    let raw;
    if (source[tokenKey] !== undefined)
      raw = parseUnits(source[tokenKey], currentDecimals, field);
    if (source[rawKey] !== undefined) {
      const exactRaw = integer(source[rawKey], field);
      if (raw !== undefined && raw !== exactRaw)
        throw new Error(`${field}: raw and token amounts disagree`);
      raw = exactRaw;
    }
    if (raw === undefined) {
      if (required) throw new Error(`Missing ${field}`);
      return;
    }
    const converted = convert(
      raw,
      ratio,
      currentDecimals,
      targetDecimals,
      options.rounding
    );
    if (raw > 0n && converted.raw === 0n)
      throw new Error(`${field}: positive threshold would become zero`);
    before[field] = snapshot(raw, currentDecimals, currentSymbol);
    after[field] = snapshot(converted.raw, targetDecimals, options.newSymbol);
    draft[tokenKey] = after[field].tokens;
    if (source[rawKey] !== undefined) draft[rawKey] = converted.raw.toString();
    if (converted.remainderNumerator !== '0')
      dust.push({
        field,
        ...converted,
        raw: converted.raw.toString(),
        unit: 'fraction of one target base unit',
      });
  }
  amount(
    stake,
    stakeDraft,
    'minStakeTokens',
    'minStake',
    'minStake',
    beforeStake,
    afterStake,
    true
  );
  amount(
    stake,
    stakeDraft,
    'maxStakePerAddressTokens',
    'maxStakePerAddress',
    'maxStakePerAddress',
    beforeStake,
    afterStake
  );
  for (const [block, fields] of Object.entries({
    roleMinimums: ['agent', 'validator', 'platform'],
    stakeRecommendations: ['min', 'max'],
    autoStake: ['floor', 'ceiling'],
  })) {
    if (!stake[block]) continue;
    for (const key of fields)
      amount(
        stake[block],
        stakeDraft[block],
        `${key}Tokens`,
        key,
        `${block}.${key}`,
        beforeStake,
        afterStake
      );
  }
  for (const key of ['jobStake', 'minAgentStake', 'maxJobReward'])
    amount(job, jobDraft, `${key}Tokens`, key, key, beforeJob, afterJob, true);
  for (const [src, before, after] of [
    [stake, beforeStake, afterStake],
    [job, beforeJob, afterJob],
  ]) {
    for (const [key, value] of Object.entries(src)) {
      if (
        key.endsWith('Pct') ||
        key.endsWith('Seconds') ||
        key === 'maxActiveJobsPerAgent'
      )
        before[key] = after[key] = value;
    }
  }
  const rawOf = (values, key) => (values[key] ? BigInt(values[key].raw) : 0n);
  const policyObservations = [];
  for (const [s, j] of [
    [beforeStake, beforeJob],
    [afterStake, afterJob],
  ]) {
    for (const key of ['minStake', 'stakeRecommendations.min']) {
      if (s[key] && rawOf(s, key) === 0n)
        throw new Error(`${key} must be positive`);
    }
    for (const key of ['jobStake', 'minAgentStake'])
      integer(rawOf(j, key), `${key}: contract uint96`, UINT96_MAX);
    for (const [maximum, minimum] of [
      ['maxStakePerAddress', 'minStake'],
      ['stakeRecommendations.max', 'stakeRecommendations.min'],
      ['autoStake.ceiling', 'autoStake.floor'],
    ]) {
      if (rawOf(s, maximum) && rawOf(s, maximum) < rawOf(s, minimum))
        throw new Error(`${maximum} is below ${minimum}`);
    }
  }
  // These relationships are operator choices, not contract validity constraints.
  if (
    rawOf(afterJob, 'maxJobReward') &&
    rawOf(afterJob, 'maxJobReward') < rawOf(afterJob, 'jobStake')
  )
    policyObservations.push(
      'Reward cap is below the job bond; review job economics.'
    );
  if (rawOf(afterJob, 'minAgentStake') < rawOf(afterJob, 'jobStake'))
    policyObservations.push(
      'Agent minimum is below the job bond; review admission and available stake.'
    );
  if (
    rawOf(afterStake, 'roleMinimums.agent') &&
    rawOf(afterStake, 'roleMinimums.agent') < rawOf(afterJob, 'jobStake')
  )
    policyObservations.push(
      'Agent role override is below the job bond; review role policy.'
    );
  if (
    rawOf(afterStake, 'roleMinimums.validator') &&
    rawOf(afterStake, 'roleMinimums.validator') <
      rawOf(afterStake, 'roleMinimums.agent')
  )
    policyObservations.push(
      'Validator role override is below the agent override; review the independent role policies.'
    );
  let supplyBefore, supplyAfter;
  if (options.currentSupplyTokens !== undefined) {
    const raw = parseUnits(
      options.currentSupplyTokens,
      currentDecimals,
      'supply'
    );
    const converted = convert(
      raw,
      ratio,
      currentDecimals,
      targetDecimals,
      options.rounding
    );
    supplyBefore = snapshot(raw, currentDecimals, currentSymbol);
    supplyAfter = snapshot(converted.raw, targetDecimals, options.newSymbol);
    if (converted.remainderNumerator !== '0')
      dust.push({
        field: 'supply',
        ...converted,
        raw: converted.raw.toString(),
        unit: 'fraction of one target base unit',
      });
  }
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      generator: 'demo/REDENOMINATION/scripts/playbook.cjs',
      scenario: options.scenario,
      version: '2.0.0',
      mode: 'planning-only',
      source: 'local configuration; no on-chain state queried',
      liveProvider: false,
      transactionsSubmitted: false,
      productionApproved: false,
      inputs: inputs.hashes ?? [],
    },
    token: {
      currentSymbol,
      targetSymbol: options.newSymbol,
      targetName: options.newName,
      currentDecimals,
      targetDecimals,
      redenominationFactor: ratio.toString(),
      conversion: `${ratio} old tokens = 1 new token`,
      formula:
        'targetRaw = sourceRaw × 10^targetDecimals ÷ (factor × 10^currentDecimals)',
      rounding: options.rounding,
      dust,
      supplyBefore,
      supplyAfter,
      rationale: [
        'Change the nominal unit while explicitly reconciling every base unit.',
        'Preserve percentage policies and review all token-denominated thresholds.',
        'This report proposes values; it does not replace token contracts, migrate balances or guarantee purchasing power.',
      ],
    },
    governance: [
      {
        label: 'Protocol owner',
        address: owner.owner,
        role: 'Configured authority; verify against the actual chain',
      },
      {
        label: 'Governance multisig',
        address: owner.governance,
        role: 'Review and authorize separately',
      },
      ...Object.entries(owner.modules ?? {}).map(([key, value]) => ({
        label: `${key} owner`,
        address: value.owner,
        role: 'Configuration only; not a verified deployment',
      })),
    ],
    modules: {
      stakeManager: {
        before: beforeStake,
        after: afterStake,
        summary:
          'Token amounts converted with exact integer arithmetic; policy, addresses and time limits retained in the draft.',
      },
      jobRegistry: {
        before: beforeJob,
        after: afterJob,
        summary:
          'Proposed nominal thresholds. Existing escrow and obligations are not changed by this generator.',
      },
      feePool: {
        before: { burnPct: fee.burnPct, rewardRole: fee.rewardRole },
        after: { burnPct: fee.burnPct, rewardRole: fee.rewardRole },
        summary:
          'Configured percentages stay unchanged. No balances or purchasing power are inferred.',
      },
    },
    configSnapshots: { stakeManager: stakeDraft, jobRegistry: jobDraft },
    policyObservations,
    timeline: [
      {
        id: 'snapshot',
        title: 'Capture and reconcile the source',
        description:
          'Record chain ID, token address/decimals, snapshot block, balances, escrow, stakes and pending claims. This file only reads local configuration.',
        commands: ['npm run demo:redenomination:verify'],
        checkpoints: [
          'Compare source configuration with independently captured chain state.',
          'Reject conflicting units and account for all liabilities.',
        ],
      },
      {
        id: 'pause',
        title: 'Preview the authorized pause',
        description:
          'Use the actual governance authority after rehearsal. This command simulates against an already prepared local deployment.',
        commands: [pausePreview],
        checkpoints: [
          'Verify every module and in-flight worker before a real pause.',
          'The report is not permission to sign.',
        ],
      },
      {
        id: 'migrate-ledgers',
        title: 'Prepare a separately audited migration',
        description:
          'No ledger migration implementation ships in this demo. Supply a reviewed migration, rollback/recovery plan, dust allocation and independent reconciliation before changing real balances.',
        commands: ['npm run demo:redenomination:export'],
        checkpoints: [
          'Old token amount = new token amount × factor for exact conversions.',
          'Sum of per-account floors can differ from floor of total supply; assign and reconcile dust explicitly.',
        ],
      },
      {
        id: 'update-parameters',
        title: 'Review draft guardrails',
        description:
          'Compare the embedded configSnapshots and source hashes. Existing contracts use their configured token and scale; editing decimals or a symbol here does not migrate them.',
        commands: ['npm run demo:redenomination:owner-console'],
        checkpoints: [
          'Do not apply a new-token draft to old-token contracts.',
          'Preserve addresses, slashing splits, max stake and auto-stake bounds.',
        ],
      },
      {
        id: 'resume',
        title: 'Verify before authorized resumption',
        description:
          'Reconcile actual balances, pending jobs, disputes and worker outcomes. Resume through the configured authority only after deployment-specific approval.',
        commands: [unpausePreview],
        checkpoints: [
          'Verify transaction receipts and final chain state after real execution.',
          'No approval, certificate, payout or live readiness is inferred from this plan.',
        ],
      },
    ],
    invariants: [
      'For exact conversion: targetRaw × factor × 10^currentDecimals = sourceRaw × 10^targetDecimals.',
      'For floor conversion, retain the exact remainder fraction for every affected value; do not discard liabilities.',
      'Fees, slashing splits, duration limits and unrelated configuration remain unchanged.',
      'Reject precision loss by default and prevent positive thresholds from silently becoming zero.',
      'Independent validation, authorization and chain finality remain separate from agent execution.',
    ],
    verification: [
      'npm run demo:redenomination:verify',
      'node --test demo/REDENOMINATION/tests/*.test.cjs',
      'npm run demo:redenomination:guardian-drill',
    ],
    references: [
      'demo/REDENOMINATION/README.md',
      'docs/computer-work.md',
      'docs/system-pause.md',
      'scripts/v2/updateStakeManager.ts',
      'scripts/v2/updateJobRegistry.ts',
    ],
    computerWork: {
      scope: 'Lawful work performed with a keyboard, mouse and screen',
      surfaces: [
        'OpenClaw with approved browser, files, code and native Codex tools',
        'Operator-led ChatGPT Work with enabled Computer Use',
        'Separately implemented OpenAI API computer-use runtime',
      ],
      task: 'Produce a candidate conversion dossier, spreadsheet and reconciliation tests from public, licensed non-personal or synthetic inputs.',
      acceptance: [
        'Independent checker recomputes every conversion from source base units.',
        'Reviewer reconciles source totals, liabilities and dust; tests rounding, precision and interruption.',
        'Separate governance signer authorizes any deployment or settlement.',
      ],
      marketAnnualUsd: '40000000000000',
      marketBasis:
        'Project planning assumption; unverified, not platform revenue',
      settlement:
        'USDC job-budget planning is separate from the AGIALPHA token-conversion example; no settlement token change is performed.',
    },
  };
}
function loadInputs() {
  const hashes = [];
  const configs = SOURCE_FILES.map((name) => {
    const file = path.join(ROOT, 'config', name),
      bytes = fs.readFileSync(file);
    hashes.push({
      path: `config/${name}`,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
    return JSON.parse(bytes);
  });
  return { configs, hashes };
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, content, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function canonicalOutput(file) {
  let ancestor = file;
  const missing = [];
  while (!fs.existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('Output has no existing parent');
    ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}
function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(
        'Offline redenomination planner. No RPC, wallet or provider access.\nOptions: --ratio <positive integer> --new-decimals <0..77> --symbol <text> --name <text>\n --current-supply <decimal tokens> --rounding reject|floor --out <json> --config-dir <directory> --scenario <text> --compact'
      );
      return 0;
    }
    const report = buildPlaybook(loadInputs(), options);
    const files = [
      path.join(options.configOutputDir, 'stake-manager-redenominated.json'),
      path.join(options.configOutputDir, 'job-registry-redenominated.json'),
      options.outputPath,
    ];
    const canonical = files.map(canonicalOutput);
    if (
      new Set(canonical).size !== files.length ||
      canonical.some((file) =>
        file.startsWith(fs.realpathSync(path.join(ROOT, 'config')) + path.sep)
      )
    )
      throw new Error(
        'Output paths must be distinct and outside source config/'
      );
    atomicWrite(
      files[0],
      JSON.stringify(report.configSnapshots.stakeManager, null, 2) + '\n'
    );
    atomicWrite(
      files[1],
      JSON.stringify(report.configSnapshots.jobRegistry, null, 2) + '\n'
    );
    atomicWrite(
      files[2],
      JSON.stringify(report, null, options.pretty ? 2 : 0) + '\n'
    );
    console.log(
      `Planning-only playbook: ${options.outputPath}\n${report.token.conversion}; decimals ${report.token.currentDecimals} → ${report.token.targetDecimals}; rounding ${options.rounding}.\nNo transactions, live provider or production approval.`
    );
    return 0;
  } catch (error) {
    console.error(`Redenomination planning failed: ${error.message}`);
    return 1;
  }
}
module.exports = {
  ROOT,
  DEMO,
  SOURCE_FILES,
  UINT256_MAX,
  integer,
  parseUnits,
  formatUnits,
  convert,
  parseArgs,
  buildPlaybook,
  loadInputs,
  main,
  pausePreview,
  unpausePreview,
};
if (require.main === module) process.exitCode = main();
