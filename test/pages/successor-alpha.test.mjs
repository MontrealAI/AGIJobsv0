// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { verifySuccessorAlphaAssets, verifySuccessorAlphaMirror, ALPHA_FLAGSHIP_SOURCE, JOBS_SOURCE_MISSION_NAVIGATION }
  from '../../scripts/pages/verify-successor-alpha.mjs';
import { verifyServedSuccessorAlpha } from '../../scripts/pages/successor-alpha-qa.mjs';

const directory = new URL('../../website/successor-alpha/', import.meta.url);
const readAssets = () => ({
  page: fs.readFileSync(new URL('index.html', directory), 'utf8'),
  manifestRaw: fs.readFileSync(new URL('sources.json', directory), 'utf8'),
  provenance: JSON.parse(fs.readFileSync(new URL('provenance.json', directory), 'utf8')),
  compilerSources: Object.fromEntries(['compiler', 'domain', 'integrity', 'templates'].map(name => {
    const relative = `packages/successor-core/src/${name}.mjs`;
    return [relative, fs.readFileSync(new URL('../../' + relative, import.meta.url))];
  })),
});
const digest = value => createHash('sha256').update(value).digest('hex');
const reseal = assets => { assets.provenance.installed.pageSha256 = digest(assets.page); return assets; };

test('Alpha flagship retains exact executable upstream bytes and the installed native Jobs compiler', () => {
  const report = verifySuccessorAlphaMirror();
  assert.equal(report.passed, true);
  assert.equal(report.upstreamCommit, ALPHA_FLAGSHIP_SOURCE.commit);
  assert.equal(report.sources, 20);
  assert.equal(report.nativeCompilerFiles, 4);
  assert.equal(report.navigationLinksAdapted, 8);
  assert.equal(report.jobsCompanionLinks, 3);
  assert.equal(report.scriptStyleArtwork, 'UNCHANGED_FROM_UPSTREAM');
  assert.deepEqual(report.authority, []);
  assert.equal(report.settlement, 'not connected');
});

test('the Jobs companion is one exact bilingual static navigation block and retains all upstream executable bytes', () => {
  const assets = readAssets(), scriptStart = assets.page.indexOf('<script');
  assert.equal(assets.page.slice(0, scriptStart).split(JOBS_SOURCE_MISSION_NAVIGATION).length - 1, 1);
  assert.equal(assets.page.slice(scriptStart).includes(JOBS_SOURCE_MISSION_NAVIGATION), false);
  assert.match(JOBS_SOURCE_MISSION_NAVIGATION, /href="https:\/\/montrealai.github.io\/AGIJobsv0\/successor\/research\/" lang="en" hreflang="en"/);
  assert.match(JOBS_SOURCE_MISSION_NAVIGATION, /href="https:\/\/montrealai.github.io\/AGIJobsv0\/successor\/research\/fr\/" lang="fr" hreflang="fr"/);
  assert.ok(JOBS_SOURCE_MISSION_NAVIGATION.includes('href="https://montrealai.github.io/AGIJobsv0/ecosystem/#contracts"'));
  assert.ok(JOBS_SOURCE_MISSION_NAVIGATION.includes('Historical embedded Jobs profiles; use the current directory for the October 18 deployment record. No automatic wallet migration.'));
  for (const mutate of [
    page => page.replace(JOBS_SOURCE_MISSION_NAVIGATION, ''),
    page => page.replace(JOBS_SOURCE_MISSION_NAVIGATION, JOBS_SOURCE_MISSION_NAVIGATION.repeat(2)),
    page => page.replace('Source-grounded mission · Mission documentaire', 'Production certification'),
    page => page.replace('https://montrealai.github.io/AGIJobsv0/successor/research/', 'https://example.com/research/'),
  ]) {
    const changed = readAssets(); changed.page = mutate(changed.page);
    assert.throws(() => verifySuccessorAlphaAssets(reseal(changed)), /Jobs companion navigation differs/);
  }
  const forged = readAssets(); forged.provenance.staticAdditions[0].content = '<nav>Unreviewed</nav>';
  assert.throws(() => verifySuccessorAlphaAssets(forged), /Only the reviewed Jobs companion navigation/);
});

test('recomputed mirror digests cannot disguise changes to the executable, artwork, UI or contract addresses', () => {
  const mutations = [
    page => page.replace("'use strict';", "'use strict';globalThis.unreviewed=true;"),
    page => page.replace('data:image/webp;base64,', 'data:image/png;base64,'),
    page => page.replace('Find your advantage', 'Certified Specialist ASI'),
    page => page.replaceAll('0x9eE41dF6d076Fa4F89b102b76DEf1c503a1e7C3A', '0x0000000000000000000000000000000000000001'),
    page => page.replace("connect-src 'none'", "connect-src *"),
    page => page.replace('</script>', '</SCRIPT>'),
    page => page.replace('<script>', '<script type="application/javascript">'),
    page => page.replace('<style>', '<STYLE>'),
  ];
  for (const mutate of mutations) {
    const assets = readAssets();
    const changed = mutate(assets.page);
    assert.notEqual(changed, assets.page, 'Mutation must alter the real installed asset');
    assets.page = changed;
    assert.throws(() => verifySuccessorAlphaAssets(reseal(assets)), /beyond its reviewed static navigation/);
  }
});

test('only the reviewed static href adaptations are accepted and none enters the executable bundle', () => {
  const assets = readAssets(), scriptStart = assets.page.indexOf('<script');
  for (const patch of assets.provenance.navigationPatches) {
    assert.equal(assets.page.slice(0, scriptStart).split(patch.after).length - 1, patch.occurrences);
    assert.equal(assets.page.slice(scriptStart).includes(patch.after), false);
  }
  for (const href of ['../discover/', 'https://example.com/successor/', 'javascript:alert(1)']) {
    const changed = readAssets();
    changed.page = changed.page.replace('href="https://montrealai.github.io/AGI-Alpha-Agent-v0/successor/discover/"', `href="${href}"`);
    assert.throws(() => verifySuccessorAlphaAssets(reseal(changed)), /static navigation differs/);
  }
  const forgedPatch = readAssets();
  forgedPatch.provenance.navigationPatches[0].after = 'href="https://example.com/"';
  assert.throws(() => verifySuccessorAlphaAssets(forgedPatch), /Only reviewed static navigation/);
});

test('upstream source provenance, local compiler parity, permissions and license notices fail closed', () => {
  for (const mutate of [
    assets => { assets.provenance.upstream.commit = '0'.repeat(40); },
    assets => { assets.provenance.sourceInventory['examples/successor-alpha/engine.mjs'] = '0'.repeat(64); },
    assets => { assets.provenance.scope.authority = ['production']; },
    assets => { assets.provenance.scope.funding = 'funded'; },
    assets => { assets.provenance.licenseNotices.pop(); },
    assets => { assets.provenance.licenseNotices[0].text = 'Changed license'; },
    assets => { assets.compilerSources['packages/successor-core/src/compiler.mjs'] = Buffer.from('changed compiler'); },
  ]) {
    const assets = readAssets(); mutate(assets);
    assert.throws(() => verifySuccessorAlphaAssets(assets));
  }
  const manifestChanged = readAssets();
  manifestChanged.manifestRaw = manifestChanged.manifestRaw.replace('successor-alpha-source/v1', 'successor-alpha-source/v2');
  manifestChanged.provenance.installed.manifestSha256 = digest(manifestChanged.manifestRaw);
  assert.throws(() => verifySuccessorAlphaAssets(manifestChanged), /Upstream source manifest identity changed/);
});

test('HTTP qualification checks installed provenance while retaining the exact original upstream manifest', async () => {
  const assets = readAssets(), base = 'http://127.0.0.1:12345/AGIJobsv0/';
  const provenanceRaw = fs.readFileSync(new URL('provenance.json', directory), 'utf8');
  const served = { page: assets.page, manifest: assets.manifestRaw, provenance: provenanceRaw };
  const response = (text, url) => ({ status: () => 200, url: () => url, body: async () => Buffer.from(text) });
  const mockPage = {
    goto: async url => response(served.page, url),
    request: { get: async url => response(url.endsWith('sources.json') ? served.manifest : served.provenance, url) },
  };
  const verified = await verifyServedSuccessorAlpha({ page: mockPage, url: base });
  assert.equal(verified.sourceVerified, true);
  assert.equal(verified.servedPageMatchesInstalledProvenance, true);
  assert.equal(verified.originalManifestRetained, true);
  assert.equal(verified.upstreamOriginalReconstructed, true);
  assert.notEqual(verified.installedPageSha256, verified.upstreamPageSha256);
  served.page = assets.page.replace('Find your advantage', 'Stale release');
  await assert.rejects(verifyServedSuccessorAlpha({ page: mockPage, url: base }), /Installed flagship identity changed/);
  served.page = assets.page;
  served.manifest = assets.manifestRaw + ' ';
  await assert.rejects(verifyServedSuccessorAlpha({ page: mockPage, url: base }), /Served source inventory matches/);
  served.manifest = assets.manifestRaw;
  served.provenance = provenanceRaw + ' ';
  await assert.rejects(verifyServedSuccessorAlpha({ page: mockPage, url: base }), /Served Jobs adaptation record matches/);
});
