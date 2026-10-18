// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const ALPHA_FLAGSHIP_SOURCE = Object.freeze({
  repository: 'MontrealAI/AGI-Alpha-Agent-v0',
  commit: '70dac8e5ce739978f5cd96d0fc190b6ebfcdf8d7',
  pageSha256: '5889816aa7d8c2e541d0ab693111bee9228466ab6ae5b7ab5d247588ccabef75',
  manifestSha256: '5ff71a6fbc4e722a819d5ce36dde57c00304552a0932e44d7e3394c58f52eb64',
  engineSourceHash: 'bb81b11216b6b9f9f2b8d16c53c66b60bcf920f7bdd3c78beec00006965ad351',
});
const sha256 = value => createHash('sha256').update(value).digest('hex');
const count = (source, value) => source.split(value).length - 1;
const equal = (actual, expected, message) => {
  if (!isDeepStrictEqual(actual, expected)) throw Error(message);
};
const requireThat = (condition, message) => { if (!condition) throw Error(message); };
const alphaBase = 'https://montrealai.github.io/AGI-Alpha-Agent-v0/';
const navigation = [
  ['../../', alphaBase, 2],
  ['../../deployments/2026-10-18/', alphaBase + 'deployments/2026-10-18/', 1],
  ['../../agent/CURRENT_MAINNET_DEPLOYMENT/', alphaBase + 'agent/CURRENT_MAINNET_DEPLOYMENT/', 1],
  ['../discover/', alphaBase + 'successor/discover/', 1],
  ['https://github.com/MontrealAI/AGI-Alpha-Agent-v0/tree/main/examples/successor-alpha',
    `https://github.com/MontrealAI/AGI-Alpha-Agent-v0/tree/${ALPHA_FLAGSHIP_SOURCE.commit}/examples/successor-alpha`, 1],
  ['../../agent/SUCCESSOR/', alphaBase + 'agent/SUCCESSOR/', 1],
  ['../../DISCLAIMER_SNIPPET/', alphaBase + 'DISCLAIMER_SNIPPET/', 1],
].map(([before, after, occurrences]) => ({ before: `href="${before}"`, after: `href="${after}"`, occurrences }));
export const JOBS_SOURCE_MISSION_NAVIGATION = '<nav id="jobs-source-mission" class="own-mission wrap" aria-labelledby="jobs-source-mission-title"><div><p class="micro-label">CONTINUE IN AGI JOBS · POURSUIVRE AVEC AGI JOBS</p><h3 id="jobs-source-mission-title">Source-grounded mission · Mission documentaire</h3><p>Turn a public source into bounded, checkable work. / Transformez une source publique en travail délimité et vérifiable.</p><p>Historical embedded Jobs profiles; use the current directory for the October 18 deployment record. No automatic wallet migration.<br>Profils Jobs historiques intégrés; consultez le répertoire actuel pour le déploiement du 18 octobre. Aucune migration automatique de portefeuille.</p></div><div class="pane-actions"><a class="button secondary small" href="https://montrealai.github.io/AGIJobsv0/successor/research/" lang="en" hreflang="en">Continue in English →</a><a class="button secondary small" href="https://montrealai.github.io/AGIJobsv0/successor/research/fr/" lang="fr" hreflang="fr">Continuer en français →</a><a class="button secondary small" href="https://montrealai.github.io/AGIJobsv0/ecosystem/#contracts">Current contract directory · Contrats actuels →</a></div></nav>\n';
const staticAdditions = [{ before: '<footer class="site-footer wrap">', content: JOBS_SOURCE_MISSION_NAVIGATION, occurrences: 1 }];
const compilerNames = ['compiler', 'domain', 'integrity', 'templates'];
const escapeHtml = value => value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[character]));

/** Validate the installed page against its immutable upstream page, allowing only reviewed static navigation changes. */
export function verifySuccessorAlphaAssets({ page, manifestRaw, provenance, compilerSources }) {
  requireThat(typeof page === 'string' && typeof manifestRaw === 'string', 'Flagship assets must be UTF-8 text');
  requireThat(sha256(manifestRaw) === ALPHA_FLAGSHIP_SOURCE.manifestSha256, 'Upstream source manifest identity changed');
  const manifest = JSON.parse(manifestRaw);
  equal(manifest.schema, 'successor-alpha-source/v1', 'Unsupported upstream source manifest');
  equal(manifest.pageSha256, ALPHA_FLAGSHIP_SOURCE.pageSha256, 'Upstream page identity changed');
  equal(manifest.engineSourceHash, ALPHA_FLAGSHIP_SOURCE.engineSourceHash, 'Upstream engine identity changed');
  equal(provenance.schema, 'agijobs/successor-alpha-mirror/v1', 'Unsupported flagship mirror');
  equal(provenance.upstream, {
    repository: ALPHA_FLAGSHIP_SOURCE.repository,
    commit: ALPHA_FLAGSHIP_SOURCE.commit,
    pagePath: 'docs/successor/alpha/index.html',
    pageSha256: ALPHA_FLAGSHIP_SOURCE.pageSha256,
    manifestPath: 'docs/successor/alpha/sources.json',
    manifestSha256: ALPHA_FLAGSHIP_SOURCE.manifestSha256,
    engineSourceHash: ALPHA_FLAGSHIP_SOURCE.engineSourceHash,
  }, 'Upstream provenance must retain its exact reviewed source');
  equal(provenance.sourceInventory, manifest.sources, 'Mirror source inventory differs from upstream');
  equal(provenance.installed, {
    pagePath: 'website/successor-alpha/index.html', pageSha256: sha256(page),
    manifestPath: 'website/successor-alpha/sources.json', manifestSha256: sha256(manifestRaw),
  }, 'Installed flagship identity changed');
  equal(provenance.scope, {
    execution: 'browser-local installed deterministic code', qualification: 'not independently qualified',
    authority: [], settlement: 'not connected', funding: 'unfunded drafts only',
  }, 'A flagship mirror cannot grant qualification, authority, settlement or funding');
  equal(provenance.navigationPatches, navigation, 'Only reviewed static navigation adaptations are supported');
  equal(provenance.staticAdditions, staticAdditions, 'Only the reviewed Jobs companion navigation may be added');
  const scriptStart = page.indexOf('<script');
  requireThat(scriptStart > 0, 'Flagship script boundary is missing');
  let staticMarkup = page.slice(0, scriptStart);
  for (const addition of staticAdditions) {
    requireThat(count(staticMarkup, addition.content) === addition.occurrences
      && count(staticMarkup, addition.content + addition.before) === addition.occurrences,
    'Flagship Jobs companion navigation differs from its reviewed placement or content');
    staticMarkup = staticMarkup.replace(addition.content, '');
  }
  for (const patch of navigation) {
    requireThat(count(staticMarkup, patch.after) === patch.occurrences && !staticMarkup.includes(patch.before),
      'Flagship static navigation differs from the recorded adaptation');
    staticMarkup = staticMarkup.split(patch.after).join(patch.before);
  }
  const reconstructed = staticMarkup + page.slice(scriptStart);
  requireThat(sha256(reconstructed) === ALPHA_FLAGSHIP_SOURCE.pageSha256,
    'Flagship differs from upstream beyond its reviewed static navigation');
  const installedMarkup = page.slice(0, scriptStart);
  const ids = new Set([...installedMarkup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const [, href] of installedMarkup.matchAll(/\bhref="([^"]+)"/g)) {
    if (href.startsWith('#')) requireThat(ids.has(href.slice(1)), 'Flagship navigation has a missing anchor');
    else {
      const destination = new URL(href);
      requireThat(destination.protocol === 'https:' && !destination.username && !destination.password,
        'Flagship navigation must use explicit public HTTPS destinations');
    }
  }
  const executable = page.match(/<script>([\s\S]*?)<\/script>/);
  const style = installedMarkup.match(/<style>([\s\S]*?)<\/style>/);
  requireThat(executable && style, 'Flagship executable or style content is missing');
  for (const content of [executable[1], style[1]]) {
    const cspHash = createHash('sha256').update(content).digest('base64');
    requireThat(installedMarkup.includes(`'sha256-${cspHash}'`), 'Flagship CSP hash differs from installed bytes');
  }
  for (const directive of ["default-src 'none'", "connect-src 'none'", 'worker-src blob:', "form-action 'none'"])
    requireThat(installedMarkup.includes(directive), 'Flagship local execution policy changed');
  const compilerFiles = compilerNames.map(name => ({
    upstreamPath: `examples/build-successor/vendor/agijobs/${name}.mjs`,
    localPath: `packages/successor-core/src/${name}.mjs`,
    sha256: manifest.sources[`examples/build-successor/vendor/agijobs/${name}.mjs`],
  }));
  equal(provenance.nativeJobsCompiler, { repository: 'MontrealAI/AGIJobsv0', files: compilerFiles },
    'Flagship native Jobs compiler identity changed');
  for (const file of compilerFiles)
    requireThat(sha256(compilerSources[file.localPath]) === file.sha256,
      `Flagship native compiler differs from the installed Jobs source: ${file.localPath}`);
  equal(provenance.licenseNotices?.map(notice => notice.path), ['LICENSE', 'examples/build-successor/vendor/agijobs/LICENSE'],
    'Flagship must retain both upstream and native Jobs licenses');
  for (const notice of provenance.licenseNotices) {
    requireThat(sha256(notice.text) === notice.sha256 && notice.sha256 === manifest.sources[notice.path]
      && installedMarkup.includes(escapeHtml(notice.text)), 'Flagship license notice changed or is missing');
  }
  return {
    passed: true, upstreamCommit: ALPHA_FLAGSHIP_SOURCE.commit, pageSha256: sha256(page),
    engineSourceHash: manifest.engineSourceHash, sources: Object.keys(manifest.sources).length,
    nativeCompilerFiles: compilerFiles.length, navigationLinksAdapted: navigation.reduce((sum, item) => sum + item.occurrences, 0),
    jobsCompanionLinks: 3,
    scriptStyleArtwork: 'UNCHANGED_FROM_UPSTREAM', qualification: 'not independently qualified',
    authority: [], settlement: 'not connected',
  };
}

export function verifySuccessorAlphaMirror(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')) {
  const directory = path.join(root, 'website/successor-alpha');
  return verifySuccessorAlphaAssets({
    page: fs.readFileSync(path.join(directory, 'index.html'), 'utf8'),
    manifestRaw: fs.readFileSync(path.join(directory, 'sources.json'), 'utf8'),
    provenance: JSON.parse(fs.readFileSync(path.join(directory, 'provenance.json'), 'utf8')),
    compilerSources: Object.fromEntries(compilerNames.map(name => {
      const relative = `packages/successor-core/src/${name}.mjs`;
      return [relative, fs.readFileSync(path.join(root, relative))];
    })),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(verifySuccessorAlphaMirror(), null, 2));
