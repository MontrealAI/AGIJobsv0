const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repo = path.resolve(__dirname, '../..');
const renderer = path.join(repo, 'demo/aurora/bin/aurora-report.ts');
const tsNode = require.resolve('ts-node/register/transpile-only');
const tx = (n) => '0x' + n.toString(16).padStart(64, '0');
const validationLabel =
  '- Validation finalization tx (ValidationModule.finalize): ';
const settlementLabel = '- Settlement tx (JobRegistry.finalize): ';
const payouts = { worker: { before: '980.0', after: '984.6', delta: '4.6' } };

function fixture(t, layout, scope = 'aurora') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const receipts = path.join(root, 'reports', 'localhost', scope, 'receipts');
  const files =
    layout === 'legacy'
      ? {
          post: 'postJob.json',
          validate: 'validate.json',
          finalize: 'finalize.json',
        }
      : {
          post: 'jobs/example/post.json',
          validate: 'jobs/example/validate.json',
          finalize: 'jobs/example/finalize.json',
        };
  const write = (name, value) => {
    const target = path.join(receipts, files[name] || name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  write('deploy.json', { network: 'localhost', chainId: 31337 });
  if (layout === 'mission') {
    write('mission.json', {
      scope,
      jobs: [{ name: 'Example job', slug: 'example', jobId: '1' }],
    });
  }
  write('post', { jobId: '1', txHash: tx(1), reward: '5.0' });
  write('validate', { jobId: '1', validators: [], finalizeTx: tx(2) });
  const final = {
    jobId: '1',
    chainId: '31337',
    status: 'Finalized',
    success: true,
    txHash: tx(3),
    blockNumber: 77,
  };
  write('finalize', final);
  const output = path.join(
    root,
    'reports',
    'localhost',
    scope,
    `${scope}-report.md`
  );
  const run = () =>
    spawnSync(process.execPath, ['-r', tsNode, renderer], {
      cwd: root,
      env: {
        ...process.env,
        NETWORK: 'localhost',
        CHAIN_ID: '31337',
        AURORA_REPORT_SCOPE: scope,
        AURORA_REPORT_TITLE: '',
        TS_NODE_PROJECT: path.join(repo, 'tsconfig.json'),
      },
      encoding: 'utf8',
      timeout: 15000,
    });
  return {
    final,
    write,
    remove: (name) => fs.unlinkSync(path.join(receipts, files[name] || name)),
    render: () => {
      const result = run();
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      return fs.readFileSync(output, 'utf8');
    },
  };
}

for (const layout of ['legacy', 'mission']) {
  test(`${layout}: actual renderer distinguishes validation and settlement receipts`, (t) => {
    const data = fixture(t, layout);
    data.write('finalize', {
      ...data.final,
      // An unrelated field must never override JobRegistry's txHash.
      finalizeTx: tx(4),
      payouts,
    });
    const report = data.render();
    assert.ok(report.includes(validationLabel + '`' + tx(2) + '`'));
    assert.ok(report.includes(settlementLabel + '`' + tx(3) + '`'));
    assert.ok(!report.includes(settlementLabel + '`' + tx(2) + '`'));
    assert.ok(!report.includes(tx(4)));
    assert.ok(!report.includes('- Finalize tx:'));
    assert.match(report, /worker: 980\.0 → 984\.6 \(Δ 4\.6\)/);
    assert.match(report, /disposable-chain transactions, mock tokens/);
    assert.match(
      report,
      /does not independently verify transaction execution, settlement, or payouts/
    );
    assert.match(
      report,
      /hashes the result URI string, including placeholder URIs/
    );
    assert.match(
      report,
      /does not fetch or verify the referenced artifact content/
    );
    assert.doesNotMatch(
      report,
      /https?:\/\/[^\s)]*(?:etherscan|blockscout)|\]\([^)]*\/tx\//
    );
  });

  test(`${layout}: missing settlement receipt cannot reuse the validation transaction or invent payouts`, (t) => {
    const data = fixture(t, layout);
    data.remove('finalize');
    const report = data.render();
    assert.ok(report.includes(validationLabel + '`' + tx(2) + '`'));
    assert.ok(
      report.includes(
        settlementLabel +
          'unavailable (missing or invalid finalize.json.txHash).'
      )
    );
    assert.doesNotMatch(report, /Payouts|Δ|undefined|\[object Object\]/);
  });

  test(`${layout}: malformed optional transaction fields are reported as unavailable`, (t) => {
    const data = fixture(t, layout);
    for (const value of [
      undefined,
      null,
      '',
      tx(0),
      '0x1234',
      42,
      { hash: tx(5) },
    ]) {
      data.write('validate', { jobId: '1', finalizeTx: value });
      data.write('finalize', {
        ...data.final,
        txHash: value,
        finalizeTx: tx(6),
        payouts,
      });
      const report = data.render();
      assert.ok(report.includes(validationLabel + 'unavailable'));
      assert.ok(report.includes(settlementLabel + 'unavailable'));
      assert.doesNotMatch(report, /Payouts|Δ|undefined|\[object Object\]/);
      assert.ok(!report.includes(tx(6)));
    }
  });

  test(`${layout}: settlement cannot alias the validation finalization transaction`, (t) => {
    const data = fixture(t, layout);
    data.write('validate', { jobId: '1', finalizeTx: tx(171) });
    data.write('finalize', {
      ...data.final,
      txHash: tx(171).toUpperCase().replace('0X', '0x'),
      payouts,
    });
    const report = data.render();
    assert.ok(
      report.includes(
        settlementLabel +
          'unavailable (conflicts with validation finalization tx).'
      )
    );
    assert.doesNotMatch(report, /Payouts|Δ/);
  });

  test(`${layout}: a settlement summary from another job is not attributed to this job`, (t) => {
    const data = fixture(t, layout);
    data.write('finalize', { ...data.final, jobId: '2', payouts });
    const report = data.render();
    assert.ok(
      report.includes(
        settlementLabel +
          'unavailable (finalize.json.jobId does not match this job).'
      )
    );
    assert.ok(!report.includes(tx(3)));
    assert.doesNotMatch(report, /Payouts|Δ/);
  });

  test(`${layout}: malformed IDs cannot bind settlement or payouts through coercion`, (t) => {
    const data = fixture(t, layout);
    const invalidIds = [
      '',
      {},
      { different: true },
      [],
      ['1'],
      true,
      false,
      0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      null,
      '0',
      '-1',
      '01',
      '+1',
      '1.0',
      '1e0',
      ' 1 ',
      (1n << 256n).toString(),
    ];
    for (const jobId of invalidIds) {
      // Even identical malformed values in every source are not a binding.
      data.write('post', { jobId });
      data.write('validate', { jobId, finalizeTx: tx(2) });
      data.write('finalize', { ...data.final, jobId, payouts });
      if (layout === 'mission') {
        data.write('mission.json', { jobs: [{ slug: 'example', jobId }] });
      }
      const report = data.render();
      assert.ok(
        report.includes(
          settlementLabel +
            'unavailable (missing or invalid finalize.json.jobId).'
        ),
        JSON.stringify(jobId)
      );
      assert.ok(!report.includes(tx(3)));
      assert.doesNotMatch(report, /Payouts|Δ/);
    }
  });

  test(`${layout}: every available binding source must contain a valid ID`, (t) => {
    const data = fixture(t, layout);
    for (const source of [
      'post',
      'validate',
      ...(layout === 'mission' ? ['mission'] : []),
    ]) {
      data.write('post', { jobId: '1' });
      data.write('validate', { jobId: '1', finalizeTx: tx(2) });
      data.write('finalize', { ...data.final, payouts });
      if (layout === 'mission') {
        data.write('mission.json', { jobs: [{ slug: 'example', jobId: '1' }] });
      }
      if (source === 'mission') {
        data.write('mission.json', {
          jobs: [{ slug: 'example', jobId: { id: 1 } }],
        });
      } else {
        data.write(source, { jobId: { id: 1 }, finalizeTx: tx(2) });
      }
      const report = data.render();
      assert.ok(
        report.includes(
          settlementLabel +
            'unavailable (invalid job ID in mission, creation, or validation summary).'
        )
      );
      assert.ok(!report.includes(tx(3)));
      assert.doesNotMatch(report, /Payouts|Δ/);
    }
  });

  test(`${layout}: valid numeric and decimal-string IDs bind without precision loss`, (t) => {
    const data = fixture(t, layout);
    for (const [expectedId, finalId] of [
      ['1', 1],
      [1, '1'],
      [Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)],
      ['9007199254740993', '9007199254740993'],
      [((1n << 256n) - 1n).toString(), ((1n << 256n) - 1n).toString()],
    ]) {
      data.write('post', { jobId: expectedId });
      data.write('validate', { jobId: expectedId, finalizeTx: tx(2) });
      data.write('finalize', { ...data.final, jobId: finalId, payouts });
      if (layout === 'mission') {
        data.write('mission.json', {
          jobs: [{ slug: 'example', jobId: expectedId }],
        });
      }
      const report = data.render();
      assert.ok(report.includes(settlementLabel + '`' + tx(3) + '`'));
      assert.match(report, /worker: 980\.0 → 984\.6 \(Δ 4\.6\)/);
    }
    data.write('finalize', {
      ...data.final,
      jobId: '9007199254740992',
      payouts,
    });
    data.write('post', { jobId: '9007199254740993' });
    data.write('validate', { jobId: '9007199254740993', finalizeTx: tx(2) });
    if (layout === 'mission') {
      data.write('mission.json', {
        jobs: [{ slug: 'example', jobId: '9007199254740993' }],
      });
    }
    const report = data.render();
    assert.ok(
      report.includes(
        settlementLabel +
          'unavailable (finalize.json.jobId does not match this job).'
      )
    );
    assert.doesNotMatch(report, /Payouts|Δ/);
  });

  test(`${layout}: missing job identity cannot establish settlement attribution`, (t) => {
    const data = fixture(t, layout);
    data.write('finalize', { ...data.final, jobId: undefined, payouts });
    let report = data.render();
    assert.ok(
      report.includes(
        settlementLabel +
          'unavailable (missing or invalid finalize.json.jobId).'
      )
    );
    assert.doesNotMatch(report, /Payouts|Δ/);
    data.write('finalize', { ...data.final, payouts });
    data.write('post', {});
    data.write('validate', { finalizeTx: tx(2) });
    if (layout === 'mission') {
      data.write('mission.json', { jobs: [{ slug: 'example' }] });
    }
    report = data.render();
    assert.ok(
      report.includes(settlementLabel + 'unavailable (no job ID to compare).')
    );
    assert.doesNotMatch(report, /Payouts|Δ/);
  });

  test(`${layout}: a missing validation hash never hides the independent settlement hash`, (t) => {
    const data = fixture(t, layout);
    data.write('validate', { jobId: '1' });
    const report = data.render();
    assert.ok(report.includes(validationLabel + 'unavailable'));
    assert.ok(report.includes(settlementLabel + '`' + tx(3) + '`'));
    assert.doesNotMatch(report, /Payouts|Δ/);
  });

  test(`${layout}: malformed balance changes are not filled with invented values`, (t) => {
    const data = fixture(t, layout);
    for (const value of [
      '5.0',
      [],
      { worker: null },
      { worker: {} },
      { worker: { delta: '4.6' } },
    ]) {
      data.write('finalize', { ...data.final, payouts: value });
      const report = data.render();
      assert.ok(report.includes(settlementLabel + '`' + tx(3) + '`'));
      assert.match(
        report,
        /Payout data: unavailable for malformed balance-change entries/
      );
      assert.doesNotMatch(report, /Payouts|Δ|undefined|\[object Object\]/);
    }
  });

  test(`${layout}: placeholder summaries never claim an executed settlement`, (t) => {
    const data = fixture(t, layout);
    data.write('deploy.json', { evidenceClass: 'placeholder' });
    data.write('finalize', { ...data.final, payouts });
    const report = data.render();
    assert.match(
      report,
      /PLACEHOLDER FIXTURE — no on-chain work or settlement was executed/
    );
    assert.ok(
      report.includes(
        settlementLabel +
          'unavailable (placeholder fixture; no settlement executed).'
      )
    );
    assert.ok(!report.includes(tx(3)));
    assert.doesNotMatch(report, /Payouts|Δ/);
  });
}

test('mission receipt overrides use the exact settlement summary for that job and preserve shared-report scopes', (t) => {
  const data = fixture(t, 'mission', 'asi-takeoff');
  data.write('mission.json', {
    scope: 'asi-takeoff',
    jobs: [
      {
        name: 'Example job',
        slug: 'example',
        jobId: '1',
        receipts: { finalize: 'custom-finalize.json' },
      },
    ],
  });
  data.write('custom-finalize.json', { ...data.final, txHash: tx(7) });
  const report = data.render();
  assert.match(report, /Mission Report — Asi Takeoff/);
  assert.ok(report.includes(settlementLabel + '`' + tx(7) + '`'));
  assert.ok(!report.includes(tx(3)));
});

test('mandatory CI selects actual Aurora renderer regression tests', () => {
  const workflow = fs.readFileSync(
    path.join(repo, '.github/workflows/ci.yml'),
    'utf8'
  );
  assert.match(
    workflow,
    /run: node --test[^\n]*test\/scripts\/aurora-report\.test\.cjs/
  );
});
