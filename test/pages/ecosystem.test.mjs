import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { ecosystem } from '../../scripts/pages/ecosystem.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const output = path.join(root, 'build/pages');
const contracts = ecosystem.suites.flatMap((suite) => suite.contracts);
const address = /^0x[0-9a-fA-F]{40}$/;
const token = '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA';

test('ecosystem directory keeps the canonical chain and token separate from 5 Alpha and 24 Jobs instances', () => {
  assert.equal(ecosystem.chainId, 1);
  assert.equal(ecosystem.network, 'Ethereum mainnet');
  assert.equal(ecosystem.token.symbol, 'AGIALPHA');
  assert.equal(ecosystem.token.address, token);
  assert.equal(ecosystem.token.decimals, 18);
  assert.equal(
    ecosystem.token.explorerUrl,
    `https://etherscan.io/token/${token}`
  );
  const alpha = ecosystem.suites.find((suite) => suite.id === 'alpha');
  const jobs = ecosystem.suites.find((suite) => suite.id === 'jobs');
  assert.equal(alpha.contracts.length, 5);
  assert.equal(jobs.contracts.length, 24);
  assert.equal(
    jobs.contracts.filter((contract) => contract.kind === 'protocol').length,
    13
  );
  assert.equal(
    jobs.contracts.filter((contract) => contract.kind === 'coordination')
      .length,
    1
  );
  assert.equal(
    jobs.contracts.filter((contract) => contract.kind === 'implementation')
      .length,
    10
  );
  assert.equal(
    new Set(contracts.map((contract) => contract.address.toLowerCase())).size,
    29
  );
  for (const contract of contracts) {
    assert.match(contract.address, address, contract.name);
    assert.notEqual(contract.address.toLowerCase(), token.toLowerCase());
    assert.equal(
      contract.explorerUrl,
      `https://etherscan.io/address/${contract.address}#code`
    );
    assert.ok(contract.name && contract.role);
  }
  for (const suite of ecosystem.suites) {
    for (const url of [suite.recordUrl, suite.deploymentGuideUrl]) {
      assert.match(
        url,
        /^https:\/\/github\.com\/MontrealAI\/[A-Za-z0-9-]+\/blob\/[a-f0-9]{40}\//
      );
    }
  }
});

test('the built no-JavaScript guide publishes every full address and the same downloadable directory', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(output, 'catalog.json'))
  );
  assert.equal(manifest.ecosystemRoute, 'ecosystem/');
  const document = new JSDOM(
    fs.readFileSync(path.join(output, 'ecosystem/index.html'), 'utf8')
  ).window.document;
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.querySelectorAll('main').length, 1);
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelectorAll('[data-contract-name]').length, 29);
  for (const contract of contracts) {
    const entry = document.querySelector(
      `[data-contract-name="${contract.name}"]`
    );
    assert.ok(entry, contract.name);
    assert.equal(entry.querySelector('code').textContent, contract.address);
    assert.equal(entry.querySelector('a').href, contract.explorerUrl);
    assert.equal(entry.closest('[hidden],details'), null);
  }
  assert.equal(
    document.getElementById('ecosystem-token-address').textContent,
    token
  );
  assert.ok(document.querySelector('#copy-status[role="status"]'));
  assert.ok(document.querySelector('.ecosystem-copy[hidden]'));
  for (const id of ['together', 'example', 'token', 'contracts', 'readiness']) {
    assert.ok(document.getElementById(id)?.textContent.trim());
  }
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(output, 'ecosystem/contracts.json'))),
    ecosystem
  );
  assert.ok(
    fs
      .readFileSync(path.join(output, 'sitemap.xml'), 'utf8')
      .includes(`${manifest.basePath}ecosystem/</loc>`)
  );
  const home = new JSDOM(
    fs.readFileSync(path.join(output, 'index.html'), 'utf8')
  ).window.document;
  assert.equal(home.getElementById('hero-token-address').textContent, token);
  assert.ok(
    home.querySelector(`.hero a[href="${manifest.basePath}ecosystem/"]`)
  );
});

test('the repository guide and JSON retain identical full contract-to-explorer mappings', () => {
  const guide = fs.readFileSync(path.join(root, 'docs/ECOSYSTEM.md'), 'utf8');
  for (const contract of contracts) {
    assert.ok(
      guide.includes(`[${contract.address}](${contract.explorerUrl})`),
      contract.name
    );
  }
  assert.ok(guide.includes(`[${token}](${ecosystem.token.explorerUrl})`));
});
