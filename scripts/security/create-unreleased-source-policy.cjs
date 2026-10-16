'use strict';
// Local preparation helper. Its output is a proposal, not policy approval.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const p = require('./source-preservation-lib.cjs');
function prepare(options) {
  const record = p.makeRecord(options); const bytes = p.canonical(record); const digest = p.sha256(bytes);
  const index = { schemaVersion: 1, records: [{ repository: options.repository, pullRequest: options.pullRequest, file: 'unreleased-source-policy.json', sha256: digest }] };
  fs.mkdirSync(options.output, { recursive: true });
  for (const [name, data] of [['unreleased-source-policy.json', bytes], ['unreleased-source-policy.index.json', p.canonical(index)]]) {
    const target = path.join(options.output, name); assert(!fs.existsSync(target), 'Refusing to overwrite existing policy: ' + target); fs.writeFileSync(target, data, { flag: 'wx' });
  }
  return { recordSha256: digest, sourceCheckpoint: record.sourceCheckpoint, sourceTree: record.sourceTree, dependencyBaseline: record.dependencyBaseline, transitionCount: record.transitionCount,
    sourceProtectedFiles: record.sourceInventory.length, baselineProtectedFiles: record.baselineInventory.length, generatorClosureFiles: record.generatorClosure.length,
    state: 'UNRELEASED', activation: 'requires explicit review of exact policy bundle; no approval inferred', remoteWritePerformed: false };
}
module.exports = { prepare };
if (require.main === module) {
  try {
    const args = process.argv.slice(2); assert.equal(args.length, 12, 'Use --root --baseline --source --repository --pr --output with explicit values');
    const values = {};
    for (let i = 0; i < args.length; i += 2) { assert(['--root','--baseline','--source','--repository','--pr','--output'].includes(args[i])); assert(!(args[i] in values), 'Duplicate option'); values[args[i]] = args[i+1]; }
    console.log(JSON.stringify(prepare({ root: path.resolve(values['--root']), baseline: values['--baseline'], source: values['--source'], repository: values['--repository'], pullRequest: Number(values['--pr']), output: path.resolve(values['--output']) }), null, 2));
  } catch (error) { console.error('POLICY_PREPARATION_FAILED:', error.message); process.exitCode = 1; }
}
