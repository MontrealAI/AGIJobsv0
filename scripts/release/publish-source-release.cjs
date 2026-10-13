'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function assertTag(ref, sha) {
  if (ref?.object?.type !== 'commit' || ref.object.sha !== sha)
    throw Error('Release tag belongs to a different commit or object type');
}

async function publish({ sha, tag, notes, api, upload, verify }) {
  const marker = `<!-- agijobs-source-release:${sha} -->`;
  const refPath = `git/ref/tags/${tag}`;
  let ref = await api('GET', refPath, undefined, true);
  if (!ref) {
    const main = await api('GET', 'git/ref/heads/main');
    if (main?.object?.sha !== sha)
      throw Error('Main moved before tag reservation');
    ref = await api('POST', 'git/refs', { ref: `refs/tags/${tag}`, sha });
  }
  assertTag(ref, sha);
  let release = await api('GET', `releases/tags/${tag}`, undefined, true);
  if (!release) {
    release = await api('POST', 'releases', {
      tag_name: tag,
      target_commitish: sha,
      draft: true,
      prerelease: true,
      name: `${tag} — mainnet evidence and SUCCESSOR Ω workshop`,
      body: `${notes.trim()}\n\n${marker}\n`,
    });
  }
  if (
    release.tag_name !== tag ||
    release.prerelease !== true ||
    !release.body?.includes(marker)
  )
    throw Error('Existing release is not the owned source snapshot');
  if (!release.draft) {
    await verify(false);
    assertTag(await api('GET', refPath), sha);
    return release;
  }
  await upload();
  await verify(true);
  assertTag(await api('GET', refPath), sha);
  // Once reserved, the tag defines the qualified snapshot. Same-SHA retries
  // remain valid if main advances; an existing tag is never moved or deleted.
  await api('PATCH', `releases/${release.id}`, {
    draft: false,
    prerelease: true,
    make_latest: 'false',
  });
  release = await api('GET', `releases/tags/${tag}`);
  if (
    release.draft ||
    release.tag_name !== tag ||
    !release.prerelease ||
    !release.body?.includes(marker)
  )
    throw Error(
      'Publication readback does not match the qualified source release'
    );
  assertTag(await api('GET', refPath), sha);
  return release;
}

async function main() {
  const {
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: repository,
    GH_TOKEN: token,
    TAG: tag,
  } = process.env;
  if (
    repository !== 'MontrealAI/AGIJobsv0' ||
    !/^[a-f0-9]{40}$/.test(sha || '') ||
    tag !== 'source-v2.1.0-rc.5' ||
    !token
  )
    throw Error('Invalid source publication identity or authorization');
  const cli = (...args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (git('rev-parse', 'HEAD') !== sha)
    throw Error('Checkout identity mismatch');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const directory = path.resolve('reports/source-release');
  const files = fs.readdirSync(directory).sort();
  const expected = [
    'SHA256SUMS.txt',
    'provenance.json',
    `${tag}-source.zip`,
    'ethereum-mainnet-2026-10-12.json',
    'configuration-readback-2026-10-13.json',
    'mainnet-deployment-2026-10-12.md',
    'RELEASE_NOTES_SOURCE_RC5.md',
  ].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected))
    throw Error('Unexpected or missing source assets');
  const digest = (file) =>
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const api = async (method, resource, body, optional = false) => {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/${resource}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      }
    );
    if (optional && response.status === 404) return null;
    if (!response.ok)
      throw Error(`GitHub ${method} ${resource}: HTTP ${response.status}`);
    return response.json();
  };
  const verify = async (draft) => {
    const downloaded = fs.mkdtempSync(
      path.join(
        process.env.RUNNER_TEMP || os.tmpdir(),
        'source-release-readback-'
      )
    );
    try {
      cli('release', 'download', tag, '--dir', downloaded);
      if (
        JSON.stringify(fs.readdirSync(downloaded).sort()) !==
        JSON.stringify(expected)
      )
        throw Error('Remote asset inventory mismatch');
      const sums = fs
        .readFileSync(path.join(downloaded, 'SHA256SUMS.txt'), 'utf8')
        .trim()
        .split('\n');
      const seen = new Set();
      for (const line of sums) {
        const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
        if (
          !match ||
          match[2] === 'SHA256SUMS.txt' ||
          !expected.includes(match[2]) ||
          seen.has(match[2])
        )
          throw Error('Malformed remote checksum inventory');
        seen.add(match[2]);
        if (digest(path.join(downloaded, match[2])) !== match[1])
          throw Error(`Remote checksum mismatch: ${match[2]}`);
      }
      if (seen.size !== expected.length - 1)
        throw Error('Incomplete remote checksums');
      for (const name of expected) {
        if (!draft && ['provenance.json', 'SHA256SUMS.txt'].includes(name))
          continue;
        if (
          digest(path.join(downloaded, name)) !==
          digest(path.join(directory, name))
        )
          throw Error(`Producer/readback mismatch: ${name}`);
      }
      const provenance = JSON.parse(
        fs.readFileSync(path.join(downloaded, 'provenance.json'), 'utf8')
      );
      if (
        provenance.sha !== sha ||
        provenance.tree !== tree ||
        provenance.tag !== tag ||
        provenance.repository !== repository ||
        provenance.productionApproved !== false ||
        provenance.producer?.workflow !== '.github/workflows/source-release.yml'
      )
        throw Error('Remote provenance identity mismatch');
    } finally {
      fs.rmSync(downloaded, { recursive: true, force: true });
    }
  };
  const release = await publish({
    sha,
    tag,
    api,
    verify,
    notes: fs.readFileSync(
      'docs/production/RELEASE_NOTES_SOURCE_RC5.md',
      'utf8'
    ),
    upload: async () =>
      cli(
        'release',
        'upload',
        tag,
        ...files.map((name) => path.join(directory, name)),
        '--clobber'
      ),
  });
  console.log(
    JSON.stringify({
      url: release.html_url,
      tag,
      sha,
      draft: release.draft,
      prerelease: release.prerelease,
      assetsVerified: true,
    })
  );
}

module.exports = { publish, assertTag };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
