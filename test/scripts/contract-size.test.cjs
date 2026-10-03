const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const {
  inspectContract,
  checkArtifacts,
  byteLength,
  RUNTIME_LIMIT,
  INITCODE_LIMIT,
} = require('../../scripts/release/check-contract-size.js');
const artifact = (runtime, initcode) => ({
  contractName: 'Example',
  sourceName: 'Example.sol',
  deployedBytecode: `0x${'00'.repeat(runtime)}`,
  bytecode: `0x${'00'.repeat(initcode)}`,
});

test('accepts the exact EVM size boundaries', () => {
  assert.equal(
    inspectContract(artifact(RUNTIME_LIMIT, INITCODE_LIMIT)).deployableSize,
    true
  );
});
test('rejects oversized runtime and initcode independently', () => {
  assert.equal(
    inspectContract(artifact(RUNTIME_LIMIT + 1, 1)).deployableSize,
    false
  );
  assert.equal(
    inspectContract(artifact(1, INITCODE_LIMIT + 1)).deployableSize,
    false
  );
});
test('fails closed on missing or malformed bytecode', () => {
  for (const code of [undefined, '', '0x0', '0xgg', '00'])
    assert.throws(() => byteLength(code, 'test'));
});
test('counts linked-library placeholders as their encoded 20-byte address', () => {
  assert.equal(byteLength(`0x__$${'a'.repeat(34)}$__`, 'linked'), 20);
});
test('rejects incomplete builds rather than reporting success', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agi-size-test-'));
  try {
    assert.throws(() => checkArtifacts(dir), /Missing JobRegistry artifact/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects empty required production bytecode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agi-empty-artifact-'));
  try {
    const target = join(dir, 'contracts/v2/JobRegistry.sol');
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(target, 'JobRegistry.json'),
      JSON.stringify({ ...artifact(0, 0), contractName: 'JobRegistry' })
    );
    assert.throws(
      () => checkArtifacts(dir),
      /Invalid or empty JobRegistry artifact/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
