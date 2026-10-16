const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs' },
});

const commandCenter = require('../../scripts/v2/ownerCommandCenter.ts');
const atlas = require('../../scripts/v2/ownerControlAtlas.ts');
const surface = require('../../scripts/v2/ownerControlSurface.ts');
const repo = path.resolve(__dirname, '../..');
const sentinel = 'NEXT_CELL_PRESERVED';
const samples = [
  'plain|pipe',
  'one\\|pipe',
  'two\\\\|pipe',
  'path\\segment|pipe',
];

async function renderedTable(markdown) {
  const { marked } = await import('marked');
  return new JSDOM(marked.parse(markdown)).window.document.querySelector(
    'table'
  );
}

function cells(table, expectedColumns) {
  assert.ok(table, 'actual report must render a table');
  assert.equal(table.querySelectorAll('thead th').length, expectedColumns);
  const rows = table.querySelectorAll('tbody tr');
  assert.equal(rows.length, 1);
  const result = rows[0].querySelectorAll('td');
  assert.equal(result.length, expectedColumns);
  return Array.from(result, (cell) => cell.textContent);
}

function commandReport(message, recommendation = sentinel) {
  return commandCenter.renderMarkdown(
    {
      networkLabel: 'local',
      networkPlaceholder: 'local',
      tokenSymbol: 'AGIALPHA',
      tokenAddress: '0x0000000000000000000000000000000000000001',
      tokenDecimals: 18,
      ownerConfigPath: 'config/owner-control.json',
    },
    [
      {
        key: 'fixture',
        label: 'Fixture',
        configPath: 'config/fixture.json',
        controls: [],
        riskLevel: 'warning',
        issues: [{ severity: 'warning', message, recommendation }],
      },
    ],
    false
  );
}

function atlasReport(summary) {
  return atlas.renderMarkdown(
    {
      generatedAt: '2026-10-16T00:00:00.000Z',
      network: 'local',
      tokenSymbol: 'AGIALPHA',
      tokenDecimals: 18,
      owner: {
        configPath: 'config/owner-control.json',
        modules: [],
        issues: [],
      },
      subsystems: [
        {
          id: 'fixture',
          label: 'Fixture',
          contract: 'Fixture',
          configPath: 'config/fixture.json',
          updateCommand: 'npm run fixture:update',
          verifyCommand: sentinel,
          docs: [],
          summary,
          issues: [],
        },
      ],
    },
    false
  );
}

function surfaceReport(value, warnings = [sentinel]) {
  return surface.renderMarkdownReport([
    {
      key: 'fixture',
      label: value,
      status: 'ok',
      owner: value,
      governance: value,
      address: value,
      configPath: path.join(repo, 'config', `${value}.json`),
      parameters: [{ label: 'Input', value }],
      warnings,
      notes: [],
    },
  ]);
}

for (const value of samples) {
  test(`command center preserves literal ${JSON.stringify(
    value
  )} and the next cell`, async () => {
    const row = cells(await renderedTable(commandReport(value)), 4);
    assert.equal(row[0], 'Fixture');
    assert.equal(row[2], `Warning ${value}`);
    assert.equal(row[3], sentinel);
  });

  test(`control atlas preserves literal ${JSON.stringify(
    value
  )} and its preceding cell`, async () => {
    const row = cells(await renderedTable(atlasReport([value])), 6);
    assert.equal(row[4], sentinel);
    assert.equal(row[5], value);
  });

  test(`control surface preserves literal ${JSON.stringify(
    value
  )} across columns`, async () => {
    const row = cells(await renderedTable(surfaceReport(value)), 8);
    assert.deepEqual(row, [
      value,
      '✅ OK',
      value,
      value,
      value,
      `config/${value}.json`,
      `Input: ${value}`,
      sentinel,
    ]);
  });
}

test('command center preserves its newline-to-break policy in issues and actions', async () => {
  const table = await renderedTable(
    commandReport('first\nsecond', 'fix\nagain')
  );
  const row = cells(table, 4);
  assert.equal(row[2], 'Warning firstsecond');
  assert.equal(row[3], 'fixagain');
  assert.equal(
    table.querySelectorAll('tbody td')[2].querySelectorAll('br').length,
    1
  );
  assert.equal(
    table.querySelectorAll('tbody td')[3].querySelectorAll('br').length,
    1
  );
});

test('control atlas preserves summary line breaks without consuming another row', async () => {
  const table = await renderedTable(atlasReport(samples));
  const row = cells(table, 6);
  assert.equal(row[4], sentinel);
  assert.equal(row[5], samples.join(''));
  assert.equal(
    table.querySelectorAll('tbody td')[5].querySelectorAll('br').length,
    3
  );
});

test('control surface preserves warning line breaks and literal backslashes', async () => {
  const table = await renderedTable(surfaceReport('fixture', samples));
  const row = cells(table, 8);
  assert.equal(row[6], 'Input: fixture');
  assert.equal(row[7], samples.join(''));
  assert.equal(
    table.querySelectorAll('tbody td')[7].querySelectorAll('br').length,
    3
  );
});

function runCli(file, arg) {
  return spawnSync(
    process.execPath,
    [
      '-r',
      require.resolve('ts-node/register/transpile-only'),
      path.join(repo, 'scripts/v2', `${file}.ts`),
      arg,
    ],
    {
      cwd: repo,
      env: {
        ...process.env,
        TS_NODE_PROJECT: path.join(repo, 'tsconfig.json'),
        TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs' }),
      },
      encoding: 'utf8',
      timeout: 15000,
    }
  );
}

for (const file of [
  'ownerCommandCenter',
  'ownerControlAtlas',
  'ownerControlSurface',
]) {
  test(`${file} retains its direct ts-node CLI help entrypoint`, () => {
    const result = runCli(file, '--help');
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /--format/);
    assert.match(result.stdout, /--network/);
    assert.doesNotMatch(result.stderr, /failed|Unexpected error|Fatal error/);
  });

  test(`${file} retains its invalid-argument refusal`, () => {
    const result = runCli(file, '--invalid-owner-report-option');
    assert.equal(result.status, 1, result.error?.message);
    assert.match(result.stderr, /Unknown (?:flag|argument)/);
    assert.match(result.stderr, /--invalid-owner-report-option/);
  });
}

test('importing owner report renderers does not run CLI work', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-r',
      require.resolve('ts-node/register/transpile-only'),
      '-e',
      ['ownerCommandCenter', 'ownerControlAtlas', 'ownerControlSurface']
        .map((file) => `require('./scripts/v2/${file}.ts')`)
        .join(';'),
    ],
    {
      cwd: repo,
      env: {
        ...process.env,
        TS_NODE_PROJECT: path.join(repo, 'tsconfig.json'),
        TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs' }),
      },
      encoding: 'utf8',
      timeout: 15000,
    }
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, /failed|Unexpected error|Fatal error/);
});
