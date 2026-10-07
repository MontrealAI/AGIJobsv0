import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);

test('proxy trust rejects an unrelated IPv4 client for malformed IPv4-mapped IPv6 subnets', () => {
  const proxy = require('proxy-addr');
  for (const subnet of ['::ffff:10.0.0.0/8', '::/1'])
    assert.equal(proxy.compile([subnet])('203.0.113.1'), false);
  assert.equal(proxy.compile(['10.0.0.0/8'])('10.1.2.3'), true);
  assert.equal(proxy.compile(['::ffff:10.0.0.0/104'])('10.1.2.3'), true);
});

test('indexed source maps reject excessive section offsets promptly', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict');
    const {SourceMapConsumer} = require('source-map-js');
    const base = {version:3, sources:['input.js'], names:[], mappings:'AAAA'};
    for (const line of [1000000000000, -1, 0.5, Infinity, NaN])
      assert.throws(() => new SourceMapConsumer({version:3,sections:[{offset:{line,column:0},map:base}]}), /offset/i);
    const valid = new SourceMapConsumer({version:3,sections:[{offset:{line:0,column:0},map:base}]});
    assert.deepEqual(valid.sources, ['input.js']);
  `,
    ],
    { timeout: 5000, encoding: 'utf8' }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});
