import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseContractCoverage, readSummaryPct } from '../coverage-utils.mjs';

const registry = 'contracts/CultureRegistry.sol';
const arena = 'contracts/SelfPlayArena.sol';
const record = (file, details = 'DA:10,1\nDA:11,0') =>
  `SF:${file}\n${details}\nend_of_record\n`;

test('reads relative, absolute, and Windows contract paths without counting mocks or dependencies', () => {
  for (const prefix of ['', '/workspace/demo/CULTURE-v0/', 'C:\\workspace\\']) {
    const report =
      record(prefix + registry) +
      record(prefix + arena, 'DA:1,1\nDA:2,1') +
      record('node_modules/@other/contracts/CultureRegistry.sol') +
      record('contracts/test/MockJobRegistry.sol');
    assert.deepEqual(
      parseContractCoverage(report).map((entry) => entry.pct),
      [50, 100]
    );
  }
});

test('supports LCOV totals and retains each contract as an independent gate', () => {
  const result = parseContractCoverage(
    record(registry, 'LF:10\nLH:9') + record(arena, 'LF:100\nLH:80')
  );
  assert.deepEqual(
    result.map((entry) => entry.pct),
    [90, 80]
  );
});

test('rejects missing, empty, malformed, duplicate, and dependency-only evidence', () => {
  assert.throws(
    () => parseContractCoverage(record(registry)),
    /missing production contract/
  );
  assert.throws(
    () =>
      parseContractCoverage(record('node_modules/' + registry) + record(arena)),
    /missing/
  );
  for (const details of [
    'LF:0\nLH:0',
    'LF:2\nLH:3',
    'DA:1,NaN',
    'DA:0,1',
    'DA:1,-1',
    'DA:1,1\nDA:1,1',
  ]) {
    assert.throws(
      () => parseContractCoverage(record(registry, details) + record(arena)),
      /Invalid|Duplicate/
    );
  }
  assert.throws(
    () =>
      parseContractCoverage(
        record(registry) + record(registry) + record(arena)
      ),
    /Duplicate/
  );
});

test('rejects missing and non-finite service coverage instead of treating it as success', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'culture-coverage-'));
  const file = path.join(directory, 'summary.json');
  try {
    await assert.rejects(readSummaryPct(file), /ENOENT/);
    for (const value of [null, '90', -1, 101]) {
      await writeFile(
        file,
        JSON.stringify({ total: { lines: { pct: value } } })
      );
      await assert.rejects(readSummaryPct(file), /Invalid coverage/);
    }
    await writeFile(file, '{"total":{"lines":{"pct":1e309}}}');
    await assert.rejects(readSummaryPct(file), /Invalid coverage/);
    await writeFile(file, '{"total":{"lines":{"pct":93.4}}}');
    assert.equal(await readSummaryPct(file), 93.4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
