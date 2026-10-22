// SPDX-License-Identifier: Apache-2.0
// Prepare uninstalled source-bound data; this tool cannot write release policy.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = '/workspace/scratch/32717074a7f1';
const jobs = path.join(root, 'jobs-successor');
const evidence = path.join(root, 'jobs-hosted-evidence-852');
const head = '852420e82ae3f5bbf0c397a4c1d550d210d4916f';
const executed = 'afa1d740b68f34a8823f7c331cf8c12fc317dbb2';
const tree = 'cb29f676e1e6d43f0d19ed72b34c248bca9a3af1';
const reviewUrl = 'https://github.com/MontrealAI/AGIJobsv0/pull/4011#issuecomment-6329679226';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => value && typeof value === 'object'
    ? Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
        : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
    : JSON.stringify(value);
const hash = value => digest(canonical(value));
const git = (...args) => execFileSync('git', ['--no-replace-objects', '-C', jobs, ...args], {maxBuffer: 16_000_000});
const textGit = (...args) => git(...args).toString('utf8').trim();
assert.equal(textGit('rev-parse', 'HEAD'), head);
assert.equal(textGit('rev-parse', 'HEAD^{tree}'), tree);
assert.equal(textGit('rev-parse', executed + '^{tree}'), tree);
assert.equal(textGit('diff', '--name-only', 'HEAD'), '');
for (const name of ['scripts/release/source-scanner-review-bindings-rc16.cjs', 'scripts/release/source-profile-rc16.cjs']) {
    assert.ok(fs.readFileSync(path.join(jobs, name)).equals(git('show', head + ':' + name)));
}
const bindings = require(path.join(jobs, 'scripts/release/source-scanner-review-bindings-rc16.cjs'));
const policy = require(path.join(jobs, 'scripts/release/source-profile-rc16.cjs'));
const reportRaw = fs.readFileSync(path.join(evidence, 'independent-19-result-technical-review.json'));
assert.equal(digest(reportRaw), '2eb1f0040a093721f2a067704baec43b4361513e077bc4da2fd14ae69ee9a312');
const report = JSON.parse(reportRaw);
const zip = path.join(evidence, 'codeql-original.zip');
assert.equal(digest(fs.readFileSync(zip)), '85ac690f505c36b8fed8a0030226b41da125c748e378cc00cc97658f6dc661b7');
const sarifRaw = execFileSync('unzip', ['-p', zip, 'javascript.sarif'], {maxBuffer: 4_000_000});
assert.equal(digest(sarifRaw), report.rawSarifSha256);
const document = JSON.parse(sarifRaw);
assert.equal(document.version, '2.1.0'); assert.equal(document.runs.length, 1);
const run = document.runs[0]; assert.equal(run.results.length, 19);
const cases = [];
const results = run.results.map((raw, index) => {
    const assessment = report.records[index];
    assert.equal(assessment.rawResultIndex, index);
    assert.equal(hash(raw), assessment.completeCanonicalResultSha256);
    const reference = raw.rule;
    const component = run.tool.extensions[reference.toolComponent.index];
    const descriptor = component.rules[reference.index];
    assert.equal(descriptor.id, raw.ruleId);
    assert.equal(hash(descriptor), assessment.completeRuleDescriptorSha256);
    const location = raw.locations[0].physicalLocation;
    const sourcePath = location.artifactLocation.uri;
    const sourceBlob = textGit('rev-parse', executed + ':' + sourcePath);
    assert.deepEqual({path: sourcePath, region: location.region}, assessment.location);
    const trueQuality = assessment.technicalDisposition === 'TRUE_NONSECURITY_MAINTAINABILITY_FINDING';
    assert.equal(trueQuality, index >= 11);
    const sourceUrl = 'https://github.com/MontrealAI/AGIJobsv0/blob/' + executed + '/' + sourcePath;
    const item = {ruleId: raw.ruleId, path: sourcePath, region: location.region,
        resultSha256: hash(raw), disposition: trueQuality ? 'Acknowledged nonsecurity quality' : 'Demonstrably false positive',
        justification: ['PROPOSED ONLY; same-session independent AI technical assessment, not human/organizational approval.',
            assessment.conclusion, ...assessment.sourceEvidence, ...assessment.limitsAndOwnerJudgment,
            ...assessment.verification].join(' '), regressionEvidence: [sourceUrl]};
    if (trueQuality) {
        assert.equal(raw.ruleId, 'js/unused-local-variable');
        const previous = policy.profile.scannerReview.results.filter(old => old.disposition === 'Acknowledged nonsecurity quality'
            && old.ruleId === item.ruleId && old.path === item.path && canonical(old.region) === canonical(item.region));
        assert.equal(previous.length, 1, 'An existing behavior assessment must match exact unchanged source/region');
        assert.equal(previous[0].qualityReview.sourceBlob, sourceBlob);
        item.qualityReview = {schema: 'agijobsv0/nonsecurity-quality-review/1', sourceBlob,
            ruleMetadataSha256: hash(descriptor), queryComponentSha256: hash(component),
            codeqlConfigSummarySha256: hash(run.properties.codeqlConfigSummary),
            behaviorAssessment: 'TRUE, UNCLEARED QUALITY WARNING; owner decision pending. Proposed acknowledgement only. '
                + previous[0].qualityReview.behaviorAssessment + ' No source cleanup or initialization/check removal is performed.',
            independentReviewEvidence: [reviewUrl]};
    }
    cases.push({rawResultIndex: index, rawResultSha256: hash(raw), technicalDisposition: assessment.technicalDisposition,
        proposedDisposition: item.disposition, trueQuality, ownerDispositionPending: trueQuality,
        independentReviewReference: reviewUrl, acceptedFindingRecordWritten: false});
    return item;
});
const proposedScannerReview = {sourceCommit: executed, results, reviewEvidence: [reviewUrl]};
// Check metadata against its actual executed source. The synthetic merge is a
// descendant of HEAD, so it cannot be relabelled as HEAD-ancestor evidence.
bindings.validateScannerReviewMetadata('scannerReview', proposedScannerReview, {git, target: executed});
assert.equal(results.filter(item => item.disposition === 'Demonstrably false positive').length, 11);
assert.equal(results.filter(item => item.disposition === 'Acknowledged nonsecurity quality').length, 8);
let installedAdmissionError;
try { policy.verifyPreparedPublicationReview({...policy.profile, scannerReview: proposedScannerReview}, {git, target: head}); }
catch (error) { installedAdmissionError = error.message; }
assert.match(installedAdmissionError || '', /installed review profile differs from immutable Git source/);
const wrongBlob = structuredClone(results[11]); wrongBlob.qualityReview.sourceBlob = '0'.repeat(40);
assert.throws(() => bindings.validateJavascriptQualityMetadata(wrongBlob, executed, git), /source blob or regular mode differs/);
const envelope = {schema: 'local/jobs-codeql-uninstalled-review-proposal/v1', status: 'PROPOSAL_ONLY_NOT_INSTALLED',
    repository: 'MontrealAI/AGIJobsv0', publicHead: head, executedSource: executed, tree,
    producer: {run: 39694681348, attempt: 1, event: 'pull_request', ref: 'refs/pull/4011/merge', artifactId: 12390791531,
        archiveSha256: digest(fs.readFileSync(zip)), rawSarifSha256: digest(sarifRaw)},
    assessment: {role: 'Same-session independent AI technical assessment; not human or organizational approval',
        reportSha256: digest(reportRaw), publicReviewEvidence: reviewUrl, securityImpactProposals: 11,
        trueUnclearedQualityWarnings: 8, acceptedFindingRecordsWritten: false, ownerQualityDispositionPending: true},
    syntaxValidation: {installedValidator: 'scripts/release/source-scanner-review-bindings-rc16.cjs',
        passed: true, target: executed, exactRawResultAndRuleDigestsChecked: true, exactQualitySourceBlobsChecked: true,
        wrongSourceBlobRefused: true, scope: 'Metadata syntax and input custody only; no trusted-baseline or production admission'},
    installedAdmission: {permitted: false, actualRefusal: installedAdmissionError,
        reason: 'The immutable rc.16 profile is not this proposal; non-null installed review slots cannot be replaced. '
            + 'This PR producer is not the frozen approved premerge push producer. A separately reviewed future source/profile must bind its own evidence.'},
    separateHolds: ['rc.16 validation10of166 failures', '#4007/#4008 qualified prerequisite integration',
        'configured review and mandatory CI', 'future reviewed baseline/profile reconciliation',
        'fresh exact-main producer/service/native/compiler qualification', 'public release and asset verification',
        'upstream Alpha configured review; consumer pin publication held'],
    productionApproved: false, releaseQualified: false, publicationApproved: false, executionApproved: false,
    cases, proposedScannerReview};
const output = path.join(evidence, 'current-19-scanner-review-proposal.json');
fs.writeFileSync(output, JSON.stringify(envelope, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output, sha256: digest(fs.readFileSync(output)), syntaxPassed: true,
    securityImpactProposals: 11, trueUnclearedQualityWarnings: 8, installedAdmissionPermitted: false,
    productionApproved: false, authority: 'none'}));
