import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CarReader } from '@ipld/car';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const publishers = ['apps/onebox/scripts/publish.mjs', 'apps/onebox-static/scripts/publish.mjs'];
const sentinel = 'dependency-repair-public-fixture';

function fixture(entry) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-publisher-compat-'));
  const app = entry.startsWith('apps/') ? path.dirname(path.dirname(entry)) : 'apps/onebox-static';
  for (const name of [entry, 'scripts/lib/w3up-upload.mjs']) {
    const dest = path.join(root, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, name), dest);
  }
  const dist = path.join(root, app, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), `<p>${sentinel}</p>`);
  fs.writeFileSync(path.join(dist, 'manifest.json'), '{"fixture":true}\n');
  fs.writeFileSync(path.join(root, app, 'config.mjs'), 'export const IPFS_GATEWAYS = [];\n');
  fs.mkdirSync(path.join(root, 'deployment-config'), { recursive: true });
  const config = path.join(root, 'deployment-config/onebox-static.json');
  fs.writeFileSync(config, '{"latest":null,"history":[]}\n');
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(root, 'deny-network.cjs'), `
    const fs = require('node:fs');
    const deny = () => {
      fs.appendFileSync(process.env.NETWORK_ATTEMPTS, 'blocked\\n');
      throw new Error('NETWORK_FORBIDDEN_IN_PUBLISHER_TEST');
    };
    for (const name of ['http','https']) {
      const mod = require('node:' + name); mod.request = deny; mod.get = deny;
    }
    require('node:net').Socket.prototype.connect = deny;
    require('node:tls').connect = deny;
    globalThis.fetch = deny;
    require('node:module').syncBuiltinESMExports();
  `);
  return { root, dist, config, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function run(f, entry, args) {
  return spawnSync(process.execPath, ['--require', path.join(f.root, 'deny-network.cjs'), entry, ...args], {
    cwd: f.root, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: f.root, CI: '1',
      NETWORK_ATTEMPTS: path.join(f.root, 'network-attempts.txt'),
      ONEBOX_RELEASE_LABEL: 'dependency-compatibility-fixture' },
  });
}
function noNetwork(f) { assert.equal(fs.existsSync(path.join(f.root, 'network-attempts.txt')), false); }

for (const entry of publishers) {
  test(`${entry}: actual dry-run creates a single-root CAR and preserves deployment config without credentials or networking`, async () => {
    const f = fixture(entry);
    try {
      const before = fs.readFileSync(f.config);
      const child = run(f, entry, ['--dry-run']);
      assert.equal(child.status, 0, child.stdout + child.stderr);
      noNetwork(f);
      assert.deepEqual(fs.readFileSync(f.config), before);
      const report = JSON.parse(fs.readFileSync(path.join(f.dist, 'release.json'), 'utf8'));
      assert.equal(report.web3Storage, null);
      assert.equal(report.ens, null);
      assert.equal(report.pinata, null);
      assert.equal(report.skipped.web3, true);
      assert.equal(report.skipped.ens, true);
      assert.equal(report.skipped.health, true);
      const car = await CarReader.fromBytes(fs.readFileSync(path.join(f.dist, 'onebox.car')));
      const roots = await car.getRoots();
      assert.equal(roots.length, 1);
      assert.equal(roots[0].toString(), report.cid);
      const parts = [];
      for await (const block of car.blocks()) parts.push(Buffer.from(block.bytes));
      assert.equal(Buffer.concat(parts).includes(Buffer.from(sentinel)), true);
    } finally { f.close(); }
  });
  test(`${entry}: missing delegated credentials fail before upload, ENS and release metadata`, () => {
    const f = fixture(entry);
    try {
      const before = fs.readFileSync(f.config);
      const child = run(f, entry, ['--skip-build', '--skip-pinata', '--skip-ens', '--skip-health']);
      assert.equal(child.status, 1, child.stdout + child.stderr);
      assert.match(child.stderr, /W3UP_CONFIGURATION_REQUIRED/);
      assert.equal(fs.existsSync(path.join(f.dist, 'release.json')), false);
      assert.deepEqual(fs.readFileSync(f.config), before);
      noNetwork(f);
    } finally { f.close(); }
  });
}

test('legacy direct release command refuses missing w3up credentials before provider or Ethereum work', () => {
  const entry = 'scripts/onebox-static/release.mjs';
  const f = fixture(entry);
  try {
    const before = fs.readFileSync(f.config);
    const child = run(f, entry, []);
    assert.equal(child.status, 1, child.stdout + child.stderr);
    assert.match(child.stderr, /W3UP_CONFIGURATION_REQUIRED/);
    assert.deepEqual(fs.readFileSync(f.config), before);
    noNetwork(f);
  } finally { f.close(); }
});
