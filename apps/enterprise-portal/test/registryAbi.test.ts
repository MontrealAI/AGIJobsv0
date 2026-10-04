import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Interface, ZeroAddress, ZeroHash } from 'ethers';
import { jobRegistryAbi } from '../src/lib/abis/jobRegistry';

const compiled = new Interface(
  JSON.parse(
    readFileSync(
      'artifacts/contracts/v2/JobRegistry.sol/JobRegistry.json',
      'utf8'
    )
  ).abi
);
const portal = new Interface(jobRegistryAbi);

test('every portal registry function and event matches the compiled contract', () => {
  for (const fragment of portal.fragments) {
    if (fragment.type !== 'function' && fragment.type !== 'event') continue;
    const named = fragment as { name: string } & typeof fragment;
    const expected =
      fragment.type === 'event'
        ? compiled.getEvent(named.name)
        : compiled.getFunction(named.name);
    assert.ok(expected, named.name);
    assert.equal(fragment.format('full'), expected.format('full'), named.name);
  }
  assert.ok(
    portal.getEvent('JobCompleted'),
    'Live job subscriptions require JobCompleted'
  );
});

test('creation receipts expose their actual specification URI and job ID', () => {
  const event = compiled.getEvent('JobCreated');
  assert.ok(event);
  const log = compiled.encodeEventLog(event, [
    7n,
    ZeroAddress,
    ZeroAddress,
    100n,
    0n,
    2n,
    ZeroHash,
    'ipfs://bafyfixture/spec.json',
  ]);
  const parsed = portal.parseLog(log);
  assert.equal(parsed?.args.jobId, 7n);
  assert.equal(parsed?.args.uri, 'ipfs://bafyfixture/spec.json');
});

test('decoded metadata preserves the contract state field used by governance', () => {
  const encoded = compiled.encodeFunctionResult('decodeJobMetadata', [
    [6, true, false, 3, 2, 90, 1000, 500],
  ]);
  const decoded = portal.decodeFunctionResult('decodeJobMetadata', encoded)[0];
  assert.equal(decoded.state, 6n);
  assert.equal(decoded.success, true);
});
