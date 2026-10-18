// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { compileJobs, verifyWorkOrderSeal } from '../../packages/successor-core/src/compiler.mjs';
import { ALPHA_FLAGSHIP_SOURCE, verifySuccessorAlphaAssets, verifySuccessorAlphaMirror }
  from './verify-successor-alpha.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const nativeCompilerSources = () => Object.fromEntries(['compiler', 'domain', 'integrity', 'templates'].map(name => {
  const relative = `packages/successor-core/src/${name}.mjs`;
  return [relative, fs.readFileSync(path.join(root, relative))];
}));
async function download(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const result = await pending;
  return fs.readFileSync(await result.path(), 'utf8');
}
const csv = rows => rows.map(row => row.join(',')).join('\r\n') + '\r\n';

/** Verify actual HTTP response bytes through the Jobs adaptation record, preserving the original Alpha manifest. */
export async function verifyServedSuccessorAlpha({ page, url }) {
  const expected = verifySuccessorAlphaMirror();
  const entry = new URL('successor/alpha/', url).href;
  const response = await page.goto(entry, { waitUntil: 'networkidle' });
  assert.ok(response, 'Alpha flagship must be served over HTTP');
  assert.equal(response.status(), 200, 'Alpha flagship HTTP status');
  assert.equal(response.url(), entry, 'Alpha flagship must not redirect to another release');
  const [manifestResponse, provenanceResponse] = await Promise.all([
    page.request.get(new URL('sources.json', entry).href),
    page.request.get(new URL('provenance.json', entry).href),
  ]);
  assert.equal(manifestResponse.status(), 200, 'Alpha source manifest is published');
  assert.equal(provenanceResponse.status(), 200, 'Jobs adaptation provenance is published');
  const receivedPage = (await response.body()).toString('utf8');
  const manifestRaw = (await manifestResponse.body()).toString('utf8');
  const provenanceRaw = (await provenanceResponse.body()).toString('utf8');
  assert.equal(manifestRaw, fs.readFileSync(path.join(root, 'website/successor-alpha/sources.json'), 'utf8'),
    'Served source inventory matches the exact original upstream manifest');
  assert.equal(provenanceRaw, fs.readFileSync(path.join(root, 'website/successor-alpha/provenance.json'), 'utf8'),
    'Served Jobs adaptation record matches the reviewed checkout');
  const verified = verifySuccessorAlphaAssets({
    page: receivedPage, manifestRaw, provenance: JSON.parse(provenanceRaw), compilerSources: nativeCompilerSources(),
  });
  assert.equal(verified.pageSha256, expected.pageSha256, 'Served page matches installed release bytes');
  return {
    entry, servedPageMatchesInstalledProvenance: true, originalManifestRetained: true,
    upstreamOriginalReconstructed: true, upstreamPageSha256: ALPHA_FLAGSHIP_SOURCE.pageSha256,
    installedPageSha256: verified.pageSha256, sourceVerified: true,
  };
}

export async function verifySuccessorAlpha({ page, url, artifacts, a11y, checks }) {
  fs.mkdirSync(artifacts, { recursive: true });
  const failures = [], external = [];
  const origin = new URL(url).origin;
  const onError = error => failures.push(error.message);
  const onConsole = message => { if (message.type() === 'error') failures.push(message.text()); };
  const onRequest = request => {
    const target = request.url();
    if (!target.startsWith(origin + '/') && !target.startsWith('data:') && !target.startsWith('blob:')) external.push(target);
  };
  page.on('pageerror', onError);
  page.on('console', onConsole);
  page.on('request', onRequest);
  try {
    const provenance = await verifyServedSuccessorAlpha({ page, url });
    checks.push('SUCCESSOR Alpha: actual HTTP bytes match installed provenance and reconstruct the immutable upstream original');
    const companion = page.locator('#jobs-source-mission');
    assert.equal(await companion.locator('a').count(), 3);
    const destinations = [
      ['https://montrealai.github.io/AGIJobsv0/successor/research/', 'successor/research/'],
      ['https://montrealai.github.io/AGIJobsv0/successor/research/fr/', 'successor/research/fr/'],
      ['https://montrealai.github.io/AGIJobsv0/ecosystem/#contracts', 'ecosystem/'],
    ];
    for (const [index, [published, local]] of destinations.entries()) {
      assert.equal(await companion.locator('a').nth(index).getAttribute('href'), published);
      const destination = await page.request.get(new URL(local, url).href);
      assert.equal(destination.status(), 200, `Jobs companion route is published: ${local}`);
      if (local === 'ecosystem/') assert.match(await destination.text(), /id="contracts"/);
    }
    assert.match(await companion.innerText(), /Historical embedded Jobs profiles/);
    assert.match(await companion.innerText(), /No automatic wallet migration/);
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 1050 });
      for (const language of ['en', 'fr']) {
        await page.locator(`#lang-${language}`).click();
        assert.equal(await page.locator('html').getAttribute('lang'), language);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
          `Alpha ${language} at ${width}px must not overflow`);
        for (const link of await companion.locator('a').all()) {
          const box = await link.boundingBox();
          assert.ok(box && box.x >= 0 && box.x + box.width <= width, 'Companion links remain within the viewport');
        }
        await a11y(`successor-alpha-${language}-${width}`);
        if (width === 320) await companion.screenshot({ path: path.join(artifacts, `successor-alpha-companion-${language}-320.png`) });
      }
    }
    checks.push('SUCCESSOR Alpha: English/French at 320/1440px, accessibility and current Jobs companion links');
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.locator('#lang-en').click();
    await page.locator('#hero-custom').click();
    await page.locator('#left-csv').fill('sku,name,price\nA,Alpha,10\nA,Second,11\nZ,Missing,0\n');
    await page.locator('#right-csv').fill('id,name,price\nA,Alpha,10\nA,Other,12\nY,New,3\n');
    await page.locator('#check-columns').click();
    await page.locator('#left-key').selectOption('sku');
    await page.locator('#right-key').selectOption('id');
    await page.locator('#custom-start').click();
    await page.locator('#pane-evidence').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#matched-count').innerText(), '4');
    const expectedJoined = csv([
      ['left.sku', 'left.name', 'left.price', 'right.id', 'right.name', 'right.price'],
      ['A', 'Alpha', '10', 'A', 'Alpha', '10'], ['A', 'Alpha', '10', 'A', 'Other', '12'],
      ['A', 'Second', '11', 'A', 'Alpha', '10'], ['A', 'Second', '11', 'A', 'Other', '12'],
    ]);
    const joined = await download(page, '#download-joined');
    assert.equal(joined, expectedJoined, 'Duplicate catalog rows preserve every exact matching pair');
    assert.equal(await download(page, '#download-unmatched-left'), csv([['sku', 'name', 'price'], ['Z', 'Missing', '0']]));
    assert.equal(await download(page, '#download-unmatched-right'), csv([['id', 'name', 'price'], ['Y', 'New', '3']]));
    await page.locator('.comparison-detail > summary').click();
    assert.equal(await page.locator('#comparison-table > tr').count(), 4);
    assert.equal(await page.locator('#comparison-bars > div').count(), 4);
    for (const row of await page.locator('#comparison-table > tr').all())
      assert.equal(await row.locator('td').nth(5).innerText(), 'Exact match');
    await page.locator('#research-panel > summary').click();
    await page.locator('#research-run').click();
    await page.locator('#research-result').waitFor({ state: 'visible' });
    const research = JSON.parse(await download(page, '#download-research'));
    assert.equal(research.candidates.length, 20);
    assert.ok(research.candidates.every(candidate => candidate.correct));
    assert.equal(research.qualification, 'local_engineering_only');
    for (const key of ['independentlyQualified', 'protectedHoldout', 'externalAuthority', 'modelUsed', 'algorithmNoveltyClaim'])
      assert.equal(research[key], false);
    assert.equal(research.confirmation.publicSynthetic, true);
    assert.equal(research.confirmation.protected, false);
    assert.ok(['held', 'local_improvement'].includes(research.decision.state));
    checks.push('SUCCESSOR Alpha: exact duplicate-preserving catalog outputs, four verified methods and twenty bounded research candidates');
    await page.locator('#keep-capability').click();
    const project = JSON.parse(await download(page, '#download-project'));
    assert.equal(project.authority, 'none');
    assert.equal(project.qualification, 'not_independently_qualified');
    assert.equal(project.cycles.length, 1);
    assert.equal(project.cycles[0].result.strategies.length, 4);
    assert.equal(project.cycles[0].result.assessment.superiorityClaim, false);
    assert.equal(project.cycles[0].result.assessment.externalAuthority, false);
    await page.locator('.deployment-detail > summary').click();
    const ecosystem = JSON.parse(fs.readFileSync(path.join(root, 'website/data/ecosystem.json'), 'utf8'));
    const currentAlpha = ecosystem.suites.find(suite => suite.id === 'alpha').contracts;
    assert.equal(await page.locator('#contract-list > a').count(), currentAlpha.length);
    for (const contract of currentAlpha) {
      const link = page.locator('#contract-list > a').filter({ hasText: contract.name });
      assert.equal((await link.getAttribute('href')).toLowerCase(), contract.explorerUrl.toLowerCase());
    }
    await page.locator('#native-panel > summary').click();
    await page.locator('#native-rights').selectOption('synthetic');
    for (const [selector, value] of Object.entries({
      '#native-source': 'Synthetic Jobs browser acceptance catalogs', '#native-license': 'Apache-2.0',
      '#native-owner': 'local-owner', '#native-name': 'Jobs catalog continuity', '#native-review-minutes': '10',
    })) await page.locator(selector).fill(value);
    await page.locator('#native-prepare').click();
    await page.locator('#native-prepared').waitFor({ state: 'visible' });
    const handoffRaw = await download(page, '#download-native-handoff');
    const handoff = JSON.parse(handoffRaw), compilation = JSON.parse(handoff.compilationRaw);
    assert.equal(handoff.schema, 'successor-alpha-native-handoff/v1');
    assert.equal(handoff.project.id, project.id);
    assert.equal(handoff.project.sha256, sha256(handoff.project.raw));
    assert.equal(compilation.graph.nodes.length, 7);
    assert.equal(compilation.authorityCreated, 'NONE');
    assert.equal(compilation.signatureStatus, 'UNSIGNED_COMMITMENT');
    assert.equal(compilation.budgetReservations.reservedBaseUnits, '0');
    assert.ok(compilation.capabilityRequests.every(request => request.status === 'REQUESTED_NOT_GRANTED'));
    for (const job of compilation.graph.nodes) assert.equal(await verifyWorkOrderSeal(job), true);
    assert.deepEqual(await compileJobs(compilation.constitution, {
      jobs: compilation.graph.nodes, edges: compilation.graph.edges, now: handoff.compiledAt,
    }), compilation, 'Native browser plan reproduces with the installed Jobs compiler');
    await page.locator('#native-run').click();
    await page.locator('#native-result').waitFor({ state: 'visible' });
    const returned = JSON.parse(await download(page, '#download-native-return'));
    assert.equal(returned.handoffSha256, sha256(handoffRaw));
    assert.equal(returned.authority, 'none');
    assert.equal(returned.settlement, 'not-connected');
    const nativePack = JSON.parse(returned.nativePackRaw);
    assert.deepEqual(nativePack.evaluation, {
      scope: 'PUBLIC_LOCAL_EXECUTION', independentProof: false, admission: 'HOLD', authority: [], settlement: 'NOT_CONNECTED',
    });
    assert.equal(nativePack.result.artifacts.find(artifact => artifact.name === 'joined.csv').content, expectedJoined);
    await a11y('successor-alpha-native-result');
    await page.screenshot({ path: path.join(artifacts, 'successor-alpha-native-result.png'), fullPage: true });
    checks.push('SUCCESSOR Alpha: seven unsigned unfunded native Jobs orders reproduce, local execution returns exact artifacts without authority');
    assert.deepEqual(failures, [], 'Alpha flagship has no browser or CSP errors');
    assert.deepEqual(external, [], 'Alpha flagship has no external execution dependencies');
    const report = {
      passed: true, provenance, localMethods: 4, researchCandidates: research.candidates.length,
      nativeJobs: compilation.graph.nodes.length, qualification: 'not independently qualified',
      authority: [], settlement: 'not connected', languages: ['en', 'fr'], viewports: [320, 1440], failures, external,
    };
    fs.writeFileSync(path.join(artifacts, 'successor-alpha-http-browser-qa.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    page.off('pageerror', onError);
    page.off('console', onConsole);
    page.off('request', onRequest);
  }
}
