import { readFile } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { formatEther, isAddress } from 'ethers';
import { z } from 'zod';
import { canonicalStringify } from './utils/canonical';

const RECAP_PATH = path.join(
  __dirname,
  '..',
  'reports',
  'alpha-mark-recap.json'
);
const WHOLE_TOKEN = 10n ** 18n;
const uint = z
  .string()
  .max(78)
  .regex(/^(0|[1-9][0-9]*)$/, 'Expected an unsigned decimal integer')
  .refine((value) => BigInt(value) < 2n ** 256n, 'Integer exceeds uint256');
const address = z.string().refine(isAddress, 'Invalid Ethereum address');
const count = z.number().int().nonnegative().safe();
const flag = z.object({ consistent: z.boolean() }).passthrough();
const recapSchema = z
  .object({
    generatedAt: z.string().datetime(),
    evidenceScope: z
      .object({
        execution: z.enum([
          'local-hardhat-rehearsal',
          'operator-authorized-broadcast',
        ]),
        independentReview: z.literal(false),
        buyerAcceptance: z.literal(false),
        productionQualified: z.literal(false),
        note: z.string(),
      })
      .passthrough()
      .optional(),
    network: z
      .object({
        label: z.string(),
        name: z.string(),
        chainId: uint,
        blockNumber: uint,
        dryRun: z.boolean(),
      })
      .passthrough(),
    orchestrator: z
      .object({
        workspaceDirty: z.boolean(),
        mode: z.enum(['dry-run', 'broadcast']),
      })
      .passthrough(),
    actors: z
      .object({
        owner: address,
        investors: z.array(address).min(3),
        validators: z.array(address).min(3),
      })
      .passthrough(),
    bondingCurve: z
      .object({
        supplyWholeTokens: uint,
        reserveWei: uint,
        nextPriceWei: uint,
        basePriceWei: uint,
        slopeWei: uint,
      })
      .passthrough(),
    ownerControls: z
      .object({
        basePriceWei: uint,
        slopeWei: uint,
        fundingCapWei: uint,
        maxSupplyWholeTokens: uint,
        finalized: z.boolean(),
        aborted: z.boolean(),
      })
      .passthrough(),
    launch: z
      .object({
        finalized: z.boolean(),
        aborted: z.boolean(),
        sovereignVault: z
          .object({
            totalReceivedWei: uint,
            totalReceivedNativeWei: uint,
            totalReceivedExternalWei: uint,
            lastAcknowledgedAmountWei: uint,
            vaultBalanceWei: uint,
          })
          .passthrough(),
      })
      .passthrough(),
    participants: z
      .array(
        z
          .object({
            address,
            tokens: z.string(),
            tokensWei: uint,
            contributionWei: uint,
          })
          .passthrough()
      )
      .nonempty(),
    trades: z
      .array(
        z
          .object({
            kind: z.enum(['BUY', 'SELL']),
            actor: address,
            label: z.string(),
            tokensWhole: uint.refine(
              (value) => BigInt(value) > 0n,
              'Trade quantity must be positive'
            ),
            valueWei: uint,
          })
          .passthrough()
      )
      .nonempty(),
    timeline: z
      .array(
        z
          .object({
            order: count,
            phase: z.string(),
            title: z.string(),
            description: z.string(),
          })
          .passthrough()
      )
      .nonempty(),
    validators: z
      .object({
        approvalCount: uint,
        approvalThreshold: uint,
        members: z.array(address).nonempty(),
        matrix: z
          .array(z.object({ address, approved: z.boolean() }).passthrough())
          .nonempty(),
      })
      .passthrough(),
    empowerment: z
      .object({
        automation: z
          .object({
            manualCommands: count.positive(),
            orchestratedActions: count,
            automationMultiplier: z.string(),
          })
          .passthrough(),
        assurance: z
          .object({
            verificationConfidencePercent: z.string(),
            checksPassed: count,
            totalChecks: count,
            validatorApprovals: count,
            validatorThreshold: count,
          })
          .passthrough(),
        capitalFormation: z
          .object({
            participants: count,
            grossContributionsWei: uint,
            reserveWei: uint,
          })
          .passthrough(),
        operatorControls: z.object({ totalControls: count }).passthrough(),
      })
      .passthrough(),
    ownerParameterMatrix: z.array(z.unknown()),
    verification: z
      .object({
        supplyConsensus: flag,
        pricing: flag,
        capitalFlows: flag,
        contributions: flag,
        summary: z
          .object({
            totalChecks: count.positive(),
            passedChecks: count,
            failedChecks: count,
            confidenceIndexBps: count.max(10000),
            confidenceIndexPercent: z.string(),
            verdict: z.enum(['PASS', 'REVIEW']),
            checks: z
              .array(
                z
                  .object({
                    key: z.string(),
                    label: z.string(),
                    consistent: z.boolean(),
                  })
                  .passthrough()
              )
              .nonempty(),
          })
          .passthrough(),
      })
      .passthrough(),
    checksums: z
      .object({
        algorithm: z.literal('sha256'),
        canonicalEncoding: z.literal('json-key-sorted'),
        recapSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .passthrough(),
  })
  .passthrough();

export type CheckResult = {
  label: string;
  ok: boolean;
  expected?: string;
  actual?: string;
};

/** Recomputes bounded demo invariants. A self-hash detects corruption, not authorship or independent review. */
export function verifyRecap(input: unknown): {
  recap: z.infer<typeof recapSchema>;
  checks: CheckResult[];
} {
  const recap = recapSchema.parse(input);
  const checks: CheckResult[] = [];
  const check = (
    label: string,
    ok: boolean,
    expected?: unknown,
    actual?: unknown
  ) =>
    checks.push({
      label,
      ok,
      expected: expected === undefined ? undefined : String(expected),
      actual: actual === undefined ? undefined : String(actual),
    });
  const { checksums: _checksums, ...digestTarget } = input as Record<
    string,
    unknown
  >;
  const digest = createHash('sha256')
    .update(canonicalStringify(digestTarget))
    .digest('hex');
  check(
    'Recap checksum matches canonical digest',
    digest === recap.checksums.recapSha256,
    recap.checksums.recapSha256,
    digest
  );
  const supply = BigInt(recap.bondingCurve.supplyWholeTokens);
  const reserve = BigInt(recap.bondingCurve.reserveWei);
  const base = BigInt(recap.bondingCurve.basePriceWei);
  const slope = BigInt(recap.bondingCurve.slopeWei);
  const cap = BigInt(recap.ownerControls.fundingCapWei);
  const maxSupply = BigInt(recap.ownerControls.maxSupplyWholeTokens);
  const received = BigInt(recap.launch.sovereignVault.totalReceivedWei);
  const accounts = new Map<string, { tokens: bigint; gross: bigint }>();
  let ledgerSupply = 0n,
    ledgerReserve = 0n,
    gross = 0n,
    peakReserve = 0n;
  for (const [index, trade] of recap.trades.entries()) {
    const amount = BigInt(trade.tokensWhole),
      value = BigInt(trade.valueWei);
    const actor = trade.actor.toLowerCase();
    const account = accounts.get(actor) ?? { tokens: 0n, gross: 0n };
    const buying = trade.kind === 'BUY';
    if (!buying && (amount > ledgerSupply || amount > account.tokens)) {
      throw new Error(`Trade ${index} sells more tokens than the actor owns`);
    }
    const first = buying ? ledgerSupply : ledgerSupply - amount;
    const expected =
      base * amount + (slope * amount * (2n * first + amount - 1n)) / 2n;
    check(
      `Trade ${index} matches bonding-curve price`,
      expected === value,
      expected,
      value
    );
    ledgerSupply += buying ? amount : -amount;
    ledgerReserve += buying ? value : -value;
    account.tokens += buying ? amount : -amount;
    if (buying) {
      gross += value;
      account.gross += value;
    }
    accounts.set(actor, account);
    if (ledgerReserve > peakReserve) peakReserve = ledgerReserve;
    check(
      `Trade ${index} respects reserve and supply bounds`,
      ledgerReserve >= 0n &&
        (maxSupply === 0n || ledgerSupply <= maxSupply) &&
        (cap === 0n || ledgerReserve <= cap)
    );
  }
  check(
    'Curve parameters match owner controls',
    base === BigInt(recap.ownerControls.basePriceWei) &&
      slope === BigInt(recap.ownerControls.slopeWei)
  );
  check(
    'Trade ledger supply equals recorded supply',
    ledgerSupply === supply,
    supply,
    ledgerSupply
  );
  check(
    'Next price matches base + slope * supply',
    base + slope * supply === BigInt(recap.bondingCurve.nextPriceWei)
  );
  check(
    'Vault receipts + reserve equal net capital',
    reserve + received === ledgerReserve,
    ledgerReserve,
    reserve + received
  );
  check(
    'Vault intake splits match aggregate',
    BigInt(recap.launch.sovereignVault.totalReceivedNativeWei) +
      BigInt(recap.launch.sovereignVault.totalReceivedExternalWei) ===
      received
  );
  check(
    'Funding cap respects peak reserve',
    cap === 0n || peakReserve <= cap,
    cap,
    peakReserve
  );
  check(
    'Launch state is consistent',
    recap.launch.finalized === recap.ownerControls.finalized &&
      recap.launch.aborted === recap.ownerControls.aborted &&
      !(recap.ownerControls.finalized && recap.ownerControls.aborted) &&
      (!recap.ownerControls.finalized || reserve === 0n)
  );
  check(
    'Recorded launch receipt and vault balance reconcile',
    BigInt(recap.launch.sovereignVault.lastAcknowledgedAmountWei) ===
      received &&
      BigInt(recap.launch.sovereignVault.vaultBalanceWei) === received
  );
  const participantAddresses = recap.participants.map((entry) =>
    entry.address.toLowerCase()
  );
  check(
    'Participant addresses are unique',
    new Set(participantAddresses).size === participantAddresses.length
  );
  check(
    'Participant registry covers trade actors',
    accounts.size === participantAddresses.length &&
      participantAddresses.every((value) => accounts.has(value))
  );
  let tokenSum = 0n,
    contributionSum = 0n;
  for (const participant of recap.participants) {
    const tokens = BigInt(participant.tokensWei),
      contribution = BigInt(participant.contributionWei);
    const account = accounts.get(participant.address.toLowerCase());
    tokenSum += tokens;
    contributionSum += contribution;
    check(
      `Participant ${participant.address} reconciles to own trades`,
      !!account &&
        account.tokens * WHOLE_TOKEN === tokens &&
        account.gross === contribution
    );
    check(
      `Participant ${participant.address} display matches raw balance`,
      participant.tokens === formatEther(tokens)
    );
  }
  check('Participant balances equal supply', tokenSum === supply * WHOLE_TOKEN);
  check(
    'Participant contributions equal gross capital',
    contributionSum === gross
  );
  const actorAddresses = [
    recap.actors.owner,
    ...recap.actors.investors,
    ...recap.actors.validators,
  ].map((value) => value.toLowerCase());
  check(
    'Demo actor addresses are distinct',
    new Set(actorAddresses).size === actorAddresses.length
  );
  check(
    'Investors match participants',
    recap.actors.investors.length === participantAddresses.length &&
      recap.actors.investors.every((value) =>
        participantAddresses.includes(value.toLowerCase())
      )
  );
  const members = recap.validators.members.map((value) => value.toLowerCase());
  const matrixMembers = recap.validators.matrix.map((entry) =>
    entry.address.toLowerCase()
  );
  const threshold = BigInt(recap.validators.approvalThreshold),
    approvals = BigInt(recap.validators.approvalCount);
  check(
    'Validator roster is unique and matches actor registry',
    new Set(members).size === members.length &&
      members.length === recap.actors.validators.length &&
      recap.actors.validators.every((value) =>
        members.includes(value.toLowerCase())
      )
  );
  check(
    'Validator matrix matches roster',
    new Set(matrixMembers).size === matrixMembers.length &&
      matrixMembers.length === members.length &&
      matrixMembers.every((value) => members.includes(value))
  );
  check(
    'Validator approval count reconciles',
    approvals ===
      BigInt(recap.validators.matrix.filter((entry) => entry.approved).length)
  );
  check(
    'Validator threshold is possible',
    threshold > 0n && threshold <= BigInt(members.length)
  );
  check(
    'Finalized demo has validator quorum',
    !recap.ownerControls.finalized || approvals >= threshold
  );
  check(
    'Execution mode matches network metadata',
    recap.network.dryRun === (recap.orchestrator.mode === 'dry-run') &&
      (!recap.network.dryRun || recap.network.chainId === '31337')
  );
  if (recap.evidenceScope)
    check(
      'Evidence scope matches execution metadata',
      recap.evidenceScope.execution ===
        (recap.network.dryRun
          ? 'local-hardhat-rehearsal'
          : 'operator-authorized-broadcast')
    );
  check(
    'Timeline order is contiguous from one',
    recap.timeline.every((entry, index) => entry.order === index + 1)
  );
  const phases = new Set(recap.timeline.map((entry) => entry.phase));
  check(
    'Timeline covers core phases',
    [
      'Orchestration',
      'Market Activation',
      'Governance',
      'Launch',
      'Verification',
    ].every((phase) => phases.has(phase))
  );
  const summary = recap.verification.summary;
  const keys = [
    'supplyConsensus',
    'pricing',
    'capitalFlows',
    'contributions',
  ] as const;
  check(
    'Verification summary has exact invariant keys',
    summary.checks.length === keys.length &&
      keys.every(
        (key) =>
          summary.checks.filter((entry) => entry.key === key).length === 1
      )
  );
  const passed = summary.checks.filter((entry) => entry.consistent).length;
  const bps = Math.round((passed * 10000) / summary.checks.length);
  check(
    'Verification summary counts reconcile',
    summary.totalChecks === summary.checks.length &&
      summary.passedChecks === passed &&
      summary.failedChecks === summary.totalChecks - passed
  );
  check(
    'Verification summary pass rate reconciles',
    summary.confidenceIndexBps === bps &&
      summary.confidenceIndexPercent === (bps / 100).toFixed(2)
  );
  check(
    'Verification summary verdict reconciles',
    summary.verdict === (passed === summary.checks.length ? 'PASS' : 'REVIEW')
  );
  const embedded: Array<
    [string, Record<string, unknown>, Record<string, bigint>]
  > = [
    [
      'supplyConsensus',
      recap.verification.supplyConsensus,
      {
        ledgerWholeTokens: ledgerSupply,
        contractWholeTokens: supply,
        simulationWholeTokens: ledgerSupply,
        participantAggregateWholeTokens: tokenSum / WHOLE_TOKEN,
      },
    ],
    [
      'pricing',
      recap.verification.pricing,
      {
        contractNextPriceWei: base + slope * supply,
        simulatedNextPriceWei: base + slope * ledgerSupply,
      },
    ],
    [
      'capitalFlows',
      recap.verification.capitalFlows,
      {
        ledgerGrossWei: gross,
        ledgerRedemptionsWei: gross - ledgerReserve,
        ledgerNetWei: ledgerReserve,
        simulatedReserveWei: ledgerReserve,
        contractReserveWei: reserve,
        vaultReceivedWei: received,
        combinedReserveWei: reserve + received,
      },
    ],
    [
      'contributions',
      recap.verification.contributions,
      { participantAggregateWei: contributionSum, ledgerGrossWei: gross },
    ],
  ];
  for (const [group, values, expected] of embedded) {
    for (const [field, value] of Object.entries(expected))
      check(
        `Embedded ${group}.${field} reconciles`,
        values[field] === value.toString()
      );
  }
  const empowerment = recap.empowerment;
  check(
    'Empowerment automation counts reconcile',
    empowerment.automation.orchestratedActions === recap.timeline.length &&
      empowerment.automation.automationMultiplier ===
        (recap.timeline.length / empowerment.automation.manualCommands).toFixed(
          2
        )
  );
  check(
    'Empowerment assurance reconciles',
    empowerment.assurance.verificationConfidencePercent ===
      summary.confidenceIndexPercent &&
      empowerment.assurance.checksPassed === passed &&
      empowerment.assurance.totalChecks === summary.totalChecks &&
      BigInt(empowerment.assurance.validatorApprovals) === approvals &&
      BigInt(empowerment.assurance.validatorThreshold) === threshold
  );
  check(
    'Empowerment capital reconciles',
    empowerment.capitalFormation.participants === participantAddresses.length &&
      BigInt(empowerment.capitalFormation.grossContributionsWei) === gross &&
      BigInt(empowerment.capitalFormation.reserveWei) === reserve
  );
  check(
    'Empowerment owner controls reconcile',
    empowerment.operatorControls.totalControls ===
      recap.ownerParameterMatrix.length
  );
  const validateDisplays = (value: unknown, field = 'recap') => {
    if (Array.isArray(value))
      return value.forEach((entry, index) =>
        validateDisplays(entry, `${field}[${index}]`)
      );
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    for (const [key, entry] of Object.entries(record)) {
      if (key.endsWith('Eth') && typeof entry === 'string') {
        const raw = record[`${key.slice(0, -3)}Wei`];
        if (typeof raw === 'string' && /^(0|[1-9][0-9]*)$/.test(raw))
          check(
            `${field}.${key} matches raw amount`,
            entry === formatEther(BigInt(raw))
          );
      }
      if (entry && typeof entry === 'object')
        validateDisplays(entry, `${field}.${key}`);
    }
  };
  validateDisplays(input);
  for (const key of keys)
    check(
      `Embedded verification flag: ${key}`,
      recap.verification[key].consistent &&
        summary.checks.find((entry) => entry.key === key)?.consistent === true
    );
  return { recap, checks };
}

export function assertVerifiedRecap(
  input: unknown
): ReturnType<typeof verifyRecap> {
  const result = verifyRecap(input);
  const failures = result.checks.filter((check) => !check.ok);
  if (failures.length)
    throw new Error(
      `Recap verification failed: ${failures
        .map((check) => check.label)
        .join('; ')}`
    );
  return result;
}

async function main() {
  const { checks } = verifyRecap(
    JSON.parse(await readFile(RECAP_PATH, 'utf8'))
  );
  console.log(
    '\nα-AGI MARK recap verification (local evidence reconciliation)'
  );
  console.table(
    checks.map((check) => ({
      Check: check.label,
      Pass: check.ok ? '✅' : '❌',
      Expected: check.expected ?? '-',
      Actual: check.actual ?? '-',
    }))
  );
  const passed = checks.filter((check) => check.ok).length;
  console.log(
    `\nCheck pass rate: ${((passed * 100) / checks.length).toFixed(
      2
    )}% (${passed}/${
      checks.length
    }). This is not statistical confidence, independent review, or production approval.`
  );
  if (passed !== checks.length)
    throw new Error(
      'Recap verification failed – inspect the table above for discrepancies.'
    );
}

if (require.main === module)
  main().catch((error) => {
    console.error('Verification failed:', error.message ?? error);
    process.exitCode = 1;
  });
