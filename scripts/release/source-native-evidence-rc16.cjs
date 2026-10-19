'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  profile,
  verifyPublicationReview,
} = require('./source-profile-rc16.cjs');
const {
  validateProducer,
  sha256,
  canonical,
} = require('./source-native-gates-rc16.cjs');
const producerId = (value) => {
  assert(
    Number.isSafeInteger(value) && value > 0,
    'Invalid evidence producer identity'
  );
  return value;
};
const additional = Object.freeze({
  codeql: {
    workflow: '.github/workflows/static-analysis.yml',
    artifact: (sha, run) =>
      `codeql-security-report-${sha}-${run.id}-${run.run_attempt}`,
    file: 'codeql-evidence.zip',
  },
  native: {
    workflow: '.github/workflows/transformational-compatibility.yml',
    artifact: (sha, run) =>
      `native-ti-compatibility-${sha}-${run.id}-${run.run_attempt}`,
    file: 'native-compatibility.zip',
  },
});
const gitSource = (...args) =>
  execFileSync(
    'git',
    ['--no-replace-objects', '-c', 'core.fsmonitor=false', ...args],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => !name.startsWith('GIT_')
          )
        ),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_OPTIONAL_LOCKS: '0',
      },
    }
  );
const zipFiles = (zip) =>
  execFileSync('unzip', ['-Z1', zip], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
    .trim()
    .split('\n')
    .filter((name) => !name.endsWith('/'))
    .sort();
const zipRead = (zip, name) =>
  execFileSync('unzip', ['-p', zip, name], { maxBuffer: 32 * 1024 * 1024 });
function verifyRetainedProducer(
  directory,
  kind,
  artifact,
  run,
  sha,
  provenance
) {
  const policy = additional[kind],
    record = JSON.parse(
      fs.readFileSync(path.join(directory, kind + '-provenance.json'))
    );
  assert(
    record.schema === 'agijobsv0/retained-producer/1' &&
      record.kind === kind &&
      record.repository === 'MontrealAI/AGIJobsv0' &&
      record.sha === sha,
    'Retained producer schema/source mismatch'
  );
  validateProducer({
    artifact,
    run,
    sha,
    workflow: policy.workflow,
    name: policy.artifact(sha, run),
  });
  const qualified = provenance?.workflows?.filter(
    (item) => item.path === policy.workflow
  );
  assert(
    qualified?.length === 1 &&
      qualified[0].id === run.id &&
      qualified[0].run_attempt === run.run_attempt &&
      qualified[0].head_sha === sha &&
      qualified[0].conclusion === 'success',
    'Retained producer differs from the qualified run/attempt'
  );
  const digest = sha256(fs.readFileSync(path.join(directory, policy.file)));
  assert(
    record.runId === run.id &&
      record.runAttempt === run.run_attempt &&
      record.workflow === run.path &&
      record.artifactId === artifact.id &&
      record.artifactName === artifact.name &&
      record.githubDigest === artifact.digest &&
      record.downloadedSha256 === digest &&
      artifact.digest === 'sha256:' + digest,
    'Retained producer provenance mismatch'
  );
  return record;
}

async function collectAdditionalEvidence() {
  verifyPublicationReview(profile);
  const { GITHUB_SHA: sha, GITHUB_REPOSITORY: repository } = process.env;
  const directory = path.resolve('reports/source-release-rc16');
  const provenance = JSON.parse(
    fs.readFileSync(path.join(directory, 'provenance.json'))
  );
  assert(
    repository === 'MontrealAI/AGIJobsv0' &&
      provenance.sha === sha &&
      provenance.repository === repository &&
      provenance.tag === profile.tag,
    'Invalid retained evidence identity'
  );
  const cli = (...args) =>
    execFileSync('gh', args, { maxBuffer: 128 * 1024 * 1024 });
  for (const [kind, policy] of Object.entries(additional).filter(
    ([kind]) => kind === 'native'
  )) {
    const selected = provenance.workflows.filter(
      (run) => run.path === policy.workflow
    );
    assert.equal(
      selected.length,
      1,
      'Missing or ambiguous qualified evidence workflow'
    );
    const chosen = selected[0];
    const run = JSON.parse(
      cli(
        'api',
        `repos/${repository}/actions/runs/${producerId(
          chosen.id
        )}/attempts/${producerId(chosen.run_attempt)}`
      )
    );
    const inventory = JSON.parse(
      cli(
        'api',
        `repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`
      )
    );
    assert(
      inventory.total_count <= 100 && Array.isArray(inventory.artifacts),
      'Refusing truncated retained artifact inventory'
    );
    const artifacts = inventory.artifacts.filter(
      (item) => item.name === policy.artifact(sha, run)
    );
    assert.equal(artifacts.length, 1, 'Missing or ambiguous retained artifact');
    const artifact = artifacts[0];
    validateProducer({
      artifact,
      run,
      sha,
      workflow: policy.workflow,
      name: policy.artifact(sha, run),
    });
    const bytes = cli(
        'api',
        `repos/${repository}/actions/artifacts/${artifact.id}/zip`
      ),
      downloadedSha256 = sha256(bytes);
    assert.equal(
      artifact.digest,
      'sha256:' + downloadedSha256,
      'Downloaded retained artifact digest mismatch'
    );
    const zip = path.join(directory, policy.file);
    fs.writeFileSync(zip, bytes, { flag: 'wx' });
    let summary;
    {
      assert.deepEqual(
        zipFiles(zip),
        ['native-compatibility.json'],
        'Native archive inventory mismatch'
      );
      const { validateNativeReport } = await import(
        './verify-transformational-compatibility.mjs'
      );
      summary = validateNativeReport(
        JSON.parse(zipRead(zip, 'native-compatibility.json')),
        { jobsCommit: sha, jobsTree: provenance.tree }
      );
    }
    fs.writeFileSync(
      path.join(directory, kind + '-provenance.json'),
      JSON.stringify(
        {
          schema: 'agijobsv0/retained-producer/1',
          kind,
          repository,
          sha,
          workflow: run.path,
          runId: run.id,
          runAttempt: run.run_attempt,
          artifactId: artifact.id,
          artifactName: artifact.name,
          githubDigest: artifact.digest,
          downloadedSha256,
          summary,
        },
        null,
        2
      ) + '\n',
      { flag: 'wx' }
    );
  }
  fs.copyFileSync(
    'scripts/release/source-profile-rc16.json',
    path.join(directory, 'source-profile-rc16.json'),
    fs.constants.COPYFILE_EXCL
  );
}

function validateNativeReport(
  report,
  { jobsCommit, jobsTree, native = profile.nativeCompatibility } = {}
) {
  assert(
    /^[a-f0-9]{40}$/.test(jobsCommit || '') &&
      /^[a-f0-9]{40}$/.test(jobsTree || ''),
    'Native report requires exact expected Jobs source identities'
  );
  assert(
    report?.schema === 'agijobsv0/native-ti-compatibility/1',
    'Invalid native compatibility schema'
  );
  assert(
    report.jobsCommit === jobsCommit && report.jobsTree === jobsTree,
    'Native report uses different Jobs source'
  );
  assert(
    report.alphaCommit === native.commit && report.alphaTree === native.tree,
    'Native report uses different Alpha source'
  );
  assert.deepEqual(
    report.sources,
    native.files,
    'Native source inventory mismatch'
  );
  for (const field of [
    'nativeFreeInspection',
    'positiveAGIALPHARefused',
    'staleBindingsRefused',
    'authorityExpansionRefused',
    'credentialFieldsRefused',
    'privateURLsRefused',
    'sourceCheckedBeforeAndAfter',
  ])
    assert.equal(report[field], true, 'Missing actual native check: ' + field);
  assert.equal(report.currencySpend, '0');
  assert.equal(report.chainOperations, 0);
  assert.equal(report.independentProof, false);
  assert.equal(report.executionAuthority, false);
  assert.deepEqual(report.currencyCaps, {
    AGIALPHABaseUnits: '0',
    USDCBaseUnits: '0',
  });
  return report;
}

function verifyNativeEvidence({
  directory,
  artifact,
  run,
  sha,
  tree,
  provenance,
}) {
  const record = verifyRetainedProducer(
    directory,
    'native',
    artifact,
    run,
    sha,
    provenance
  );
  const zip = path.join(directory, 'native-compatibility.zip');
  assert.deepEqual(
    zipFiles(zip),
    ['native-compatibility.json'],
    'Native archive inventory mismatch'
  );
  const summary = validateNativeReport(
    JSON.parse(zipRead(zip, 'native-compatibility.json')),
    { jobsCommit: sha, jobsTree: tree }
  );
  assert.equal(
    canonical(record.summary),
    canonical(summary),
    'Remote native summary mismatch'
  );
  return summary;
}
module.exports = {
  collectAdditionalEvidence,
  verifyRetainedProducer,
  validateNativeReport,
  verifyNativeEvidence,
};
