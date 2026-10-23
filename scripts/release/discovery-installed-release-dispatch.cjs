// SPDX-License-Identifier: MIT
'use strict';
// Version applicability is explicit; the rc17 suite and publisher are preserved verbatim.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const inheritedCommand="node --test test/scripts/source-codeql-service-rc16.test.cjs test/scripts/source-profile-rc16.test.cjs test/scripts/source-release-rc16.test.cjs test/scripts/source-release-security-rc16-gate.test.cjs test/scripts/source-release-security-rc16-publish.test.cjs test/scripts/source-release-integrated-rc16.test.cjs test/scripts/source-python-scanner-rc16.test.cjs test/scripts/source-python-evidence-rc16.test.cjs test/scripts/source-review-binding-rc16.test.cjs integrations/alpha-agent/tests/transformational-compatibility.test.mjs";
function editionForVersion(version) {
  assert.ok(['2.1.0-rc.17','2.1.0-rc.18'].includes(version),'Only explicit rc17 or Discovery rc18 source editions are supported');
  return version==='2.1.0-rc.17'?{edition:'rc17',selected:'true'}:{edition:'rc18',selected:'false'};
}
function assertRoutingSource(source) {
  const validation=source.slice(source.indexOf('  validate:'),source.indexOf('\n  publish:'));
  const beforeSteps=validation.slice(0,validation.indexOf('    steps:'));
  assert.ok(!/^\s+(?:if|continue-on-error):/m.test(beforeSteps),'The required version dispatcher job cannot be disabled');
  const selector=validation.slice(validation.indexOf('      - name: Select exact'),validation.indexOf('      - name: Verify inherited'));
  assert.ok(selector.includes('id: release-version')&&selector.includes('run: node scripts/release/discovery-installed-release-dispatch.cjs'));
  assert.ok(!/^\s+(?:if|continue-on-error):/m.test(selector),'The version selector must actually execute');
  const old=validation.slice(validation.indexOf('      - name: Verify inherited'),validation.indexOf('      - name: Verify installed'));
  assert.equal((old.match(/^\s+if:/gm)||[]).length,1);assert.ok(old.includes("if: steps.release-version.outputs.edition == 'rc17'"));
  assert.ok(old.includes('run: '+inheritedCommand),'The complete original rc17 fixed-source command is mandatory');
  assert.ok(!old.includes('continue-on-error:'));
  const current=validation.slice(validation.indexOf('      - name: Verify installed'));
  assert.equal((current.match(/^\s+if:/gm)||[]).length,1);assert.ok(current.includes("if: steps.release-version.outputs.edition == 'rc18'"));
  for(const command of ['set -euo pipefail','node --test scripts/release/discovery-installed-release.test.cjs integrations/alpha-agent/discovery-installed-module-graph.test.mjs integrations/alpha-agent/discovery-installed-native.test.mjs integrations/alpha-agent/discovery-installed-runtime.test.mjs scripts/release/capture-discovery-browser-input.test.cjs tools/security/discovery-installed-protected-scope.test.mjs',
    'python3 -B scripts/release/test-discovery-installed-profile.py','python3 -B scripts/release/test-discovery-installed-archive.py',
    "require('./scripts/release/discovery-installed-qualification.cjs').sourceProof"]) assert.ok(current.includes(command),'New finite/installed edition gate is absent: '+command);
  assert.ok(!current.includes('continue-on-error:'));
  const publisher=source.slice(source.indexOf('\n  publish:'));
  assert.ok(publisher.includes("needs.validate.outputs.selected == 'true'"),'The original rc17 publisher must retain its selected-version gate');
  return true;
}
module.exports={editionForVersion,assertRoutingSource,inheritedCommand};
if(require.main===module) {
  const root=path.resolve(__dirname,'../..');
  const value=editionForVersion(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
  assertRoutingSource(fs.readFileSync(path.join(root,'.github/workflows/source-release-rc16.yml'),'utf8'));
  assert.ok(process.env.GITHUB_OUTPUT,'Version outputs require the current workflow output file');
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'edition='+value.edition+'\nselected='+value.selected+'\n');
}
