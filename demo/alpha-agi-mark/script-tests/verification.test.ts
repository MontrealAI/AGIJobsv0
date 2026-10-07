import { expectRevert } from '../scripts/utils/expectRevert';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalStringify } from '../scripts/utils/canonical';
import { assertVerifiedRecap } from '../scripts/verifyRecap';
import { buildStochasticProof } from '../scripts/monteCarloVerifier';
import { renderDashboard } from '../scripts/renderDashboard';

const demoDir = path.resolve(__dirname, '..');
const source = readFileSync(
  path.join(demoDir, 'reports/alpha-mark-recap.json'),
  'utf8'
);
const fixture = () => JSON.parse(source);
const sign = (recap: any) => {
  const { checksums: _checksums, ...content } = recap;
  recap.checksums = {
    algorithm: 'sha256',
    canonicalEncoding: 'json-key-sorted',
    recapSha256: createHash('sha256')
      .update(canonicalStringify(content))
      .digest('hex'),
  };
  return recap;
};

test('completed local launch reconciles reserve plus transferred vault receipts', () => {
  const { checks } = assertVerifiedRecap(fixture());
  assert.ok(checks.length > 40);
  assert.ok(checks.every((entry) => entry.ok));
  const { stochasticProof } = buildStochasticProof(fixture());
  assert.equal(stochasticProof.verdict, 'PASS');
  assert.equal(
    stochasticProof.ledgerReplay.finalReserveWei,
    fixture().launch.sovereignVault.totalReceivedWei
  );
  assert.equal(
    stochasticProof.ledgerReplay.finalSupplyWholeTokens,
    fixture().bondingCurve.supplyWholeTokens
  );
});

test('synthetic proof is byte-reproducible for the same recap', () => {
  assert.deepEqual(
    buildStochasticProof(fixture()),
    buildStochasticProof(fixture())
  );
  assert.equal(
    buildStochasticProof(fixture()).stochasticProof.monteCarlo.generator,
    'sha256-seeded-xorshift32-v1'
  );
});

test('missing and corrupt digests fail closed', () => {
  const missing = fixture();
  delete missing.checksums;
  assert.throws(() => assertVerifiedRecap(missing));
  const tampered = fixture();
  tampered.generatedAt = '2026-10-01T00:00:00.000Z';
  assert.throws(() => assertVerifiedRecap(tampered), /checksum/);
});

for (const value of [
  '-1',
  '0x01',
  ' 1',
  '1.5',
  '01',
  '',
  (2n ** 256n).toString(),
]) {
  test(`rejects noncanonical or overflowing on-chain quantity ${JSON.stringify(
    value
  )}`, () => {
    const recap = fixture();
    recap.trades[0].tokensWhole = value;
    assert.throws(() => assertVerifiedRecap(sign(recap)));
  });
}

test('zero-quantity trades fail before stochastic replay', () => {
  const recap = fixture();
  recap.trades[0].tokensWhole = '0';
  assert.throws(() => buildStochasticProof(sign(recap)), /positive/);
});

test('curve price mismatches cannot pass with a recomputed digest', () => {
  const recap = fixture();
  recap.bondingCurve.nextPriceWei = '1';
  assert.throws(() => buildStochasticProof(sign(recap)), /Next price/);
});

test('per-actor accounting catches forged balances with unchanged aggregate', () => {
  const recap = fixture();
  [recap.participants[0].tokensWei, recap.participants[1].tokensWei] = [
    recap.participants[1].tokensWei,
    recap.participants[0].tokensWei,
  ];
  [recap.participants[0].tokens, recap.participants[1].tokens] = [
    recap.participants[1].tokens,
    recap.participants[0].tokens,
  ];
  assert.throws(() => assertVerifiedRecap(sign(recap)), /own trades/);
});

test("selling another actor's inventory fails even when global supply is sufficient", () => {
  const recap = fixture();
  recap.trades.at(-1).actor = recap.actors.owner;
  assert.throws(() => assertVerifiedRecap(sign(recap)), /actor owns/);
});

test('duplicate participant identities cannot hide in totals', () => {
  const recap = fixture();
  recap.participants[1].address = recap.participants[0].address;
  assert.throws(() => assertVerifiedRecap(sign(recap)), /unique/);
});

test('validator votes and roster must reconcile', () => {
  const recap = fixture();
  recap.validators.matrix[0].approved = false;
  assert.throws(() => assertVerifiedRecap(sign(recap)), /approval count/);
});

test('embedded summary cannot fake check count, pass rate, or duplicate keys', () => {
  for (const mutate of [
    (r: any) => {
      r.verification.summary.passedChecks = 999;
    },
    (r: any) => {
      r.verification.summary.confidenceIndexPercent = '99.99';
    },
    (r: any) => {
      r.verification.summary.checks[0].key = 'pricing';
    },
  ]) {
    const recap = fixture();
    mutate(recap);
    assert.throws(() => assertVerifiedRecap(sign(recap)), /summary/);
  }
});

test('displayed monetary amounts cannot contradict raw quantities', () => {
  const recap = fixture();
  recap.bondingCurve.reserveEth = '1000000000.0';
  assert.throws(() => assertVerifiedRecap(sign(recap)), /matches raw amount/);
});

test('illustrative empowerment counts cannot inflate verified results', () => {
  const recap = fixture();
  recap.empowerment.assurance.checksPassed = 999;
  assert.throws(
    () => assertVerifiedRecap(sign(recap)),
    /Empowerment assurance/
  );
});

test('zero max supply means unlimited, matching the contract', () => {
  const recap = fixture();
  recap.ownerControls.maxSupplyWholeTokens = '0';
  assert.equal(
    buildStochasticProof(sign(recap)).stochasticProof.verdict,
    'PASS'
  );
});

test('funding cap uses peak outstanding reserve, not gross recycled deposits', () => {
  const recap = fixture();
  const actor = recap.trades[0].actor;
  const buy = {
    kind: 'BUY',
    actor,
    label: 'Round trip buy',
    tokensWhole: '1',
    valueWei: '100000000000000000',
    valueEth: '0.1',
  };
  recap.trades.unshift(buy, { ...buy, kind: 'SELL', label: 'Round trip sell' });
  recap.participants[0].contributionWei = (
    BigInt(recap.participants[0].contributionWei) + 100000000000000000n
  ).toString();
  recap.participants[0].contributionEth = '1.1';
  recap.ownerControls.fundingCapWei = '4500000000000000000';
  recap.ownerControls.fundingCapEth = '4.5';
  recap.verification.capitalFlows.ledgerGrossWei = '4600000000000000000';
  recap.verification.capitalFlows.ledgerGrossEth = '4.6';
  recap.verification.capitalFlows.ledgerRedemptionsWei = '750000000000000000';
  recap.verification.capitalFlows.ledgerRedemptionsEth = '0.75';
  recap.verification.contributions.participantAggregateWei =
    '4600000000000000000';
  recap.verification.contributions.participantAggregateEth = '4.6';
  recap.verification.contributions.ledgerGrossWei = '4600000000000000000';
  recap.verification.contributions.ledgerGrossEth = '4.6';
  recap.empowerment.capitalFormation.grossContributionsWei =
    '4600000000000000000';
  recap.empowerment.capitalFormation.grossContributionsEth = '4.6';
  assert.ok(assertVerifiedRecap(sign(recap)).checks.every((entry) => entry.ok));
});

test('canonical digest preserves prototype-named JSON keys', () => {
  const value = JSON.parse('{"__proto__":{"tampered":true},"b":2,"a":1}');
  assert.equal(
    canonicalStringify(value),
    '{"__proto__":{"tampered":true},"a":1,"b":2}'
  );
  assert.equal(({} as any).tampered, undefined);
});

test('dashboard escapes untrusted labels and exposes limited evidence scope', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'alpha-mark-html-'));
  try {
    const recap = fixture();
    recap.trades[0].label = '<img src=x onerror="alert(1)">';
    const file = path.join(directory, 'report.html');
    await renderDashboard(sign(recap), file);
    const html = readFileSync(file, 'utf8');
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x'));
    assert.ok(html.includes("securityLevel: 'strict'"));
    assert.ok(html.includes('mermaid@11.17.2'));
    assert.ok(html.includes('Evidence scope:'));
    assert.ok(html.includes('class="mermaid"'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verification and report CLIs reject corrupt evidence with nonzero status and no fresh report', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'alpha-mark-cli-'));
  try {
    cpSync(path.join(demoDir, 'scripts'), path.join(directory, 'scripts'), {
      recursive: true,
    });
    mkdirSync(path.join(directory, 'reports'));
    const recap = fixture();
    recap.bondingCurve.nextPriceWei = '1';
    writeFileSync(
      path.join(directory, 'reports/alpha-mark-recap.json'),
      JSON.stringify(sign(recap))
    );
    for (const script of [
      'verifyRecap.ts',
      'monteCarloVerifier.ts',
      'generateIntegrityReport.ts',
      'generateDashboard.ts',
      'operatorConsole.ts',
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          '--require',
          require.resolve('ts-node/register'),
          path.join(directory, 'scripts', script),
        ],
        {
          encoding: 'utf8',
          timeout: 20000,
          env: {
            ...process.env,
            NODE_PATH: path.resolve(demoDir, '../../node_modules'),
            TS_NODE_COMPILER_OPTIONS: '{"module":"commonjs"}',
            TS_NODE_TRANSPILE_ONLY: 'true',
          },
        }
      );
      assert.equal(result.status, 1, `${script}: ${result.stderr}`);
      assert.match(
        result.stdout + result.stderr,
        /Recap verification failed|Next price/
      );
    }
    assert.equal(
      existsSync(
        path.join(directory, 'reports/alpha-mark-stochastic-proof.json')
      ),
      false
    );
    assert.equal(
      existsSync(path.join(directory, 'reports/alpha-mark-integrity.md')),
      false
    );
    assert.equal(
      existsSync(path.join(directory, 'reports/alpha-mark-dashboard.html')),
      false
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [label, mutate] of [
  [
    'embedded supply',
    (r: any) => {
      r.verification.supplyConsensus.simulationWholeTokens = '999999';
    },
  ],
  [
    'launch state',
    (r: any) => {
      r.launch.finalized = !r.ownerControls.finalized;
    },
  ],
  [
    'acknowledged receipt',
    (r: any) => {
      r.launch.sovereignVault.lastAcknowledgedAmountWei = '999999';
      delete r.launch.sovereignVault.lastAcknowledgedAmountEth;
    },
  ],
  [
    'fabricated production scope',
    (r: any) => {
      r.evidenceScope = {
        execution: 'live',
        productionQualified: true,
        independentReview: true,
        buyerAcceptance: true,
      };
    },
  ],
] as Array<[string, (r: any) => void]>) {
  test(`rejects contradictory ${label} even after digest is recomputed`, () => {
    const recap = fixture();
    mutate(recap);
    assert.throws(() => assertVerifiedRecap(sign(recap)));
  });
}

test('guard probes accept exact Hardhat revert bytes without ethers error codes', async () => {
  await expectRevert('pause', '0xd93c0665', async () => {
    throw Object.assign(new Error('reverted'), { data: '0xd93c0665' });
  });
});

test('guard probes reject successful calls, unrelated RPC failures, and different revert bytes', async () => {
  await assert.rejects(
    expectRevert('pause', '0xd93c0665', async () => undefined),
    /unexpectedly succeeded/
  );
  await assert.rejects(
    expectRevert('pause', '0xd93c0665', async () => {
      throw new Error('network down');
    }),
    /unexpected reason/
  );
  await assert.rejects(
    expectRevert('pause', '0xd93c0665', async () => {
      throw Object.assign(new Error('reverted'), { data: '0x12345678' });
    }),
    /unexpected reason/
  );
});
