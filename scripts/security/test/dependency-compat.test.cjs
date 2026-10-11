'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

test('retains the original installed Hardhat and EAS contract package identities', () => {
  const expected = {
    'node_modules/hardhat': '2.29.1',
    'node_modules/@ethereum-attestation-service/eas-contracts': '1.7.1',
  };
  for (const [name, version] of Object.entries(expected)) assert.equal(lock.packages[name]?.version, version);
  assert.equal(require('hardhat/package.json').version, '2.29.1');
});
test('EAS resolves the same Hardhat 2 instance rather than an obsolete nested toolchain', () => {
  const eas = createRequire(require.resolve('@ethereum-attestation-service/eas-contracts/package.json'));
  assert.equal(eas.resolve('hardhat'), require.resolve('hardhat'));
});
test('actual EAS schema encoder round trips the existing receipt schema without changing wire data', () => {
  const { SchemaEncoder } = require('@ethereum-attestation-service/eas-sdk');
  const { AbiCoder } = require('ethers');
  const types = ['string', 'bytes32', 'string', 'string', 'string'];
  const names = ['stage', 'digest', 'cid', 'uri', 'context'];
  const values = ['PLAN', '0x' + '12'.repeat(32), 'bafy-test', 'ipfs://test', '{"key":1}'];
  const encoder = new SchemaEncoder('string stage,bytes32 digest,string cid,string uri,string context');
  const data = encoder.encodeData(values.map((value, i) => ({ name: names[i], type: types[i], value })));
  assert.equal(data, AbiCoder.defaultAbiCoder().encode(types, values));
  assert.deepEqual(encoder.decodeData(data).map((item) => item.value.value), values);
});
test('all installed Handlebars resolutions use the patched version', () => {
  const entries = Object.entries(lock.packages).filter(([p]) => /(?:^|\/)node_modules\/handlebars$/.test(p));
  assert(entries.length > 0);
  for (const [p, item] of entries) {
    assert.equal(item.version, '4.7.10', p);
    assert.equal(require(path.join(root, p, 'package.json')).version, '4.7.10');
  }
});
test('Handlebars preserves escaping, helpers, partials and precompiled templates', () => {
  const H = require('handlebars').create();
  H.registerHelper('upper', (value) => String(value).toUpperCase());
  H.registerPartial('item', '{{upper name}}:{{value}}');
  assert.equal(H.compile('{{> item}}')({ name: 'test', value: '<tag>' }), 'TEST:&lt;tag&gt;');
  const vm = require('node:vm');
  const template = H.template(vm.runInNewContext('(' + H.precompile('{{value}}') + ')'));
  assert.equal(template({ value: 'safe' }), 'safe');
});
test('Handlebars rejects code-bearing NumberLiteral AST without executing it', () => {
  const H = require('handlebars').create();
  const ast = H.parse('{{foo 1}}');
  ast.body[0].params[0].value = '(globalThis.__agiHandlebarsExecuted = true)';
  globalThis.__agiHandlebarsExecuted = false;
  try {
    try { H.compile(ast)({}, { helpers: { foo: (value) => value } }); } catch { /* rejection is acceptable */ }
    assert.equal(globalThis.__agiHandlebarsExecuted, false);
  } finally { delete globalThis.__agiHandlebarsExecuted; }
});
test('Cypress and SBOM tool upgrades have their expected installed versions', () => {
  assert.equal(require('cypress/package.json').version, '16.1.1');
  assert.equal(require('@cyclonedx/cyclonedx-npm/package.json').version, '6.0.1');
});
test('legacy storage, libp2p-crypto, node-forge and extract-zip are absent from the root lock graph', () => {
  const forbidden = /(?:^|\/)node_modules\/(web3\.storage|libp2p-crypto|node-forge|extract-zip)$/;
  assert.deepEqual(Object.keys(lock.packages).filter((key) => forbidden.test(key)), []);
});
test('Hardhat CLI still loads the unchanged configuration and installed plugins', () => {
  const cli = path.join(root, 'node_modules/hardhat/internal/cli/cli.js');
  const output = execFileSync(process.execPath, [cli, 'help'], { cwd: root, encoding: 'utf8',
    timeout: 60000, env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: '1' } });
  assert.match(output, /Hardhat version 2\.29\.1/);
  assert.match(output, /compile/);
  assert.match(output, /coverage/);
});
