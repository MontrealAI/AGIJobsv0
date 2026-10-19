import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { getCreateAddress } from 'ethers';
import {
  ecosystem,
  renderEcosystemHero,
  renderEcosystemIntro,
  renderEcosystemPage,
} from '../../scripts/pages/ecosystem.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const output = path.join(root, 'build/pages');
const contracts = ecosystem.suites.flatMap((suite) => suite.contracts);
const address = /^0x[0-9a-fA-F]{40}$/;
const token = '0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA';

test('ecosystem directory keeps the canonical chain and token separate from 5 Alpha and 25 Jobs instances', () => {
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
  assert.equal(jobs.contracts.length, 25);
  assert.equal(
    jobs.contracts.filter((contract) => contract.kind === 'protocol').length,
    14
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
    30
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

test('the current Alpha directory uses the fresh October 18 suite and keeps operational approval separate', () => {
  const alpha = ecosystem.suites.find((suite) => suite.id === 'alpha');
  assert.equal(alpha.recordDate, '2026-10-18');
  assert.deepEqual(
    Object.fromEntries(
      alpha.contracts.map(({ name, address }) => [name, address])
    ),
    {
      AscensionAccess: '0x9eE41dF6d076Fa4F89b102b76DEf1c503a1e7C3A',
      NovaSeed: '0x31BD0736DcD55DA2f9a2BB586C8a98695F86f19E',
      AscensionRiskOracle: '0x198FC6EBee21c6A0B34E4d055AFD6D811AA6dE58',
      AscensionJobMarket: '0xc1d3d7fb064C23c46C4EB20d24ab6EA650FF0ceE',
      AscensionMark: '0x6D5323b2609E36fDc4dB3B2501B7BcF0E131033c',
    }
  );
  assert.equal(alpha.sourceCommit, 'c0fc5217e364a39a4cd123d17a8317c06b80f820');
  assert.equal(alpha.sourceTree, '6c0ed7b1a5d40662bcd3e124a6d2aedd6447fcf2');
  assert.equal(alpha.authorityBlock.number, 26220072);
  assert.equal(
    alpha.authorityBlock.hash,
    '0x8a3357d17a61a8f37c99dc836ac1176c6ee44b6261a81c41893527046c88a088'
  );
  assert.equal(alpha.governor, '0xd76AD27a1Bcf8652e7e46BE603FA742FD1c10A99');
  assert.equal(alpha.status.explorerExactMatchCount, 5);
  assert.equal(alpha.status.activationAllowed, false);
  assert.equal(alpha.status.readyForPublicFunding, false);
  assert.equal(alpha.status.fullyProductionReady, false);
  assert.equal(alpha.status.globalPauseAvailable, false);
  assert.equal(alpha.status.externalAuthorityCloseoutComplete, true);
  assert.match(
    alpha.recordUrl,
    new RegExp(
      `/blob/${alpha.recordRevision}/deployments/ethereum-mainnet/2026-10-18/manifest\\.json$`
    )
  );
  assert.match(alpha.historicalRecordUrl, /2026-10-11\/manifest\.json$/);
  assert.match(alpha.currentReadinessUrl, /CURRENT_MAINNET_DEPLOYMENT\.md$/);
});

test('the current Jobs directory binds all 25 addresses to the exact October 18 snapshot without assuming main equivalence', () => {
  const jobs = ecosystem.suites.find((suite) => suite.id === 'jobs');
  const bytes = fs.readFileSync(
    path.join(root, 'website/data/jobs-mainnet-2026-10-18.json')
  );
  const snapshot = JSON.parse(bytes);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'b4335f5763f73e8da664c3cd45ac7ca8fa6f0d3beb2780b209e50fd1e3def23f'
  );
  assert.equal(
    jobs.recordSha256,
    createHash('sha256').update(bytes).digest('hex')
  );
  assert.equal(jobs.recordRevision, '284351148d96c5390a655aec1f9db806284f2400');
  assert.equal(jobs.recordDate, '2026-10-18');
  assert.equal(jobs.sourceCommit, snapshot.deployedSource.commit);
  assert.equal(jobs.sourceTree, snapshot.deployedSource.tree);
  assert.equal(snapshot.deployedSource.currentMainEquivalenceNotAssumed, true);
  assert.equal(jobs.authorityBlock.number, 26221285);
  assert.equal(jobs.status.allEightManagedModulesPaused, true);
  assert.equal(jobs.status.creatorOwnsAnyOf25, false);
  assert.equal(jobs.status.stateChecksPassed, 46);
  assert.equal(jobs.status.productionApproved, false);
  assert.equal(jobs.status.activationAllowed, false);
  assert.equal(jobs.status.sourceReadbackBlockPinned, false);
  assert.match(jobs.historicalRecordUrl, /2026-10-12\.json$/);
  assert.deepEqual(
    Object.fromEntries(
      jobs.contracts.map(({ name, address }) => [name, address])
    ),
    Object.fromEntries(
      snapshot.contracts.map(({ name, address }) => [name, address])
    )
  );
});

test('the retained October 18 publication and receipts bind the snapshot source and all 25 creation addresses', () => {
  const read = (file) => fs.readFileSync(path.join(root, file));
  const snapshotBytes = read(
    'docs/production/mainnet-2026-10-18/deployment-snapshot.json'
  );
  assert.deepEqual(
    snapshotBytes,
    read('website/data/jobs-mainnet-2026-10-18.json')
  );
  const snapshot = JSON.parse(snapshotBytes);
  const receiptBytes = read(
    'docs/production/mainnet-2026-10-18/deployment-receipts.json'
  );
  assert.equal(
    createHash('sha256').update(receiptBytes).digest('hex'),
    '69fac1728be59752d4aadc66157f6e533273c5d9bef3b71d86a97530ce7db576'
  );
  assert.equal(
    createHash('sha256')
      .update(read('docs/production/mainnet-2026-10-18/README.md'))
      .digest('hex'),
    '6ca6b642d227c7c9f060cd28e7ca81a57deb3750da5b6b86a97b3140ba04b9af'
  );
  const receipts = JSON.parse(receiptBytes),
    operations = receipts.operations;
  assert.equal(receipts.sourceCommit, snapshot.deployedSource.commit);
  assert.equal(
    receipts.originalReportSha256,
    snapshot.evidenceHashes.completedDeploymentReportSha256
  );
  assert.equal(operations.length, 39);
  assert.equal(new Set(operations.map((item) => item.hash)).size, 39);
  assert.deepEqual(
    operations.map((item) => item.nonce),
    Array.from({ length: 39 }, (_, index) => 308 + index)
  );
  assert.ok(
    operations.every(
      (item) =>
        item.chainId === 1 &&
        item.receipt.status === 1 &&
        item.receipt.hash === item.hash &&
        item.receipt.blockNumber <= snapshot.finalizedStateAnchor.number &&
        item.compilerInputSha256 ===
          snapshot.deployedSource.originalCompilerInputSha256
    )
  );
  const addresses = new Map(
    snapshot.contracts.map((item) => [item.name, item.address])
  );
  const direct = operations.filter((item) => item.role.startsWith('create:'));
  assert.equal(direct.length, 11);
  for (const item of direct) {
    assert.equal(item.receipt.contractAddress, addresses.get(item.name));
    assert.equal(
      getCreateAddress({ from: item.creator, nonce: item.nonce }),
      item.address
    );
  }
  const components = operations.filter((item) =>
    item.role.startsWith('component:')
  );
  assert.equal(components.length, 14);
  for (const [index, item] of components.entries())
    assert.equal(
      getCreateAddress({ from: addresses.get('Deployer'), nonce: index + 1 }),
      addresses.get(item.role.slice(10))
    );
});

test('the separate October 12 ecosystem archive retains the exact original 29-address snapshot', () => {
  const bytes = fs.readFileSync(
    path.join(root, 'website/data/ecosystem-2026-10-12.json')
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '91b98fe3c7aac7e245c5e25bd7e400b13ee22735d442db8a2c30a388b730484f'
  );
  const archive = JSON.parse(bytes);
  assert.equal(archive.suites[0].recordDate, '2026-10-11');
  assert.equal(archive.suites[1].recordDate, '2026-10-12');
  assert.equal(archive.suites.flatMap((suite) => suite.contracts).length, 29);
  assert.equal(ecosystem.suites.flatMap((suite) => suite.contracts).length, 30);
});

test('current ecosystem entry points promote Mission Studio and keep the Computer Use laboratory, source mission and historical workshop accessible', () => {
  const base = '/AGIJobsv0/';
  const hero = new JSDOM(renderEcosystemHero(base)).window.document;
  const intro = new JSDOM(renderEcosystemIntro(base)).window.document;
  const page = new JSDOM(renderEcosystemPage(base, (value) => value)).window
    .document;
  assert.equal(
    hero.querySelector('.ecosystem-pair-link').getAttribute('href'),
    `${base}successor/mission/`
  );
  assert.equal(
    intro.querySelector('a.button.primary').getAttribute('href'),
    `${base}successor/mission/`
  );
  assert.equal(
    page.querySelector('#example a.button.primary').getAttribute('href'),
    `${base}successor/mission/`
  );
  assert.ok(page.querySelector(`a[href="${base}successor/computer/"]`));
  assert.ok(page.querySelector(`a[href="${base}successor/research/"]`));
  assert.match(
    page.querySelector(`a[href="${base}successor/build/"]`).textContent,
    /historical/
  );
  assert.equal(page.querySelectorAll('[data-contract-name]').length, 30);
  assert.match(
    page.querySelector('#jobs-contracts').textContent,
    /recorded 18 October 2026/
  );
  assert.match(
    page.querySelector('#readiness').textContent,
    /46 named state checks/
  );
});

test('a guide absent from the local catalog falls back to the explicit current Jobs guide', () => {
  const document = new JSDOM(
    renderEcosystemPage('/AGIJobsv0/', (file) =>
      file === 'docs/production/CURRENT_MAINNET_DEPLOYMENT.md'
        ? undefined
        : file
    )
  ).window.document;
  const current = ecosystem.suites.find((suite) => suite.id === 'jobs');
  const link = [...document.querySelectorAll('a[href]')].find((item) =>
    item.textContent.includes('Check the current Jobs deployment guidance')
  );
  assert.equal(link.getAttribute('href'), current.currentReadinessUrl);
  assert.equal(document.querySelector('a[href="undefined"]'), null);
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
  for (const link of document.querySelectorAll('a[href]')) {
    assert.ok(link.getAttribute('href').trim(), link.textContent);
    assert.doesNotMatch(
      link.getAttribute('href'),
      /^(undefined|null)$/,
      link.textContent
    );
  }
  assert.equal(document.querySelectorAll('[data-contract-name]').length, 30);
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
  assert.match(
    document.querySelector('#alpha-contracts').textContent,
    /recorded 18 October 2026/
  );
  assert.match(
    document.querySelector('#readiness').textContent,
    /do not approve activation or public funding/
  );
  assert.match(
    document.querySelector('#readiness').textContent,
    /no global pause exists/i
  );
  assert.ok(
    document.querySelector(
      'a[href="' + ecosystem.suites[0].historicalRecordUrl + '"]'
    )
  );
  assert.doesNotMatch(
    document.querySelector('#alpha-contracts').textContent,
    /0x36f8C079|0xFA4737Ba|0x06cb4D68|0x86f84E17|0xa28dA507/
  );
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
