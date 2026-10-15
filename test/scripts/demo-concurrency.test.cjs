'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { createHash } = require('node:crypto');
const baseline = require('../fixtures/demo-concurrency-baseline.json');
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
      .join(',') +
    '}'
  );
}
const selected = [
  'demo-asi-takeoff.yml',
  'demo-asi-global.yml',
  'demo-zenith-hypernova.yml',
  'demo-planetary-orchestrator-fabric.yml',
];
for (const filename of selected) {
  test(`${filename}: cancel only superseded runs of the same workflow and PR`, () => {
    const workflow = yaml.load(
      fs.readFileSync(
        path.join(__dirname, '../../.github/workflows', filename),
        'utf8'
      )
    );
    assert.equal(
      workflow.concurrency.group,
      'demo-pr-${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}'
    );
    assert.equal(
      workflow.concurrency['cancel-in-progress'],
      "${{ github.event_name == 'pull_request' }}"
    );
    assert.ok(workflow.on.pull_request);
    assert.ok('workflow_dispatch' in workflow.on);
    assert.ok(Object.keys(workflow.jobs).length > 0);
  });
}
test('selected workflows have distinct names, preserving independent queues', () => {
  const names = selected.map(
    (filename) =>
      yaml.load(
        fs.readFileSync(
          path.join(__dirname, '../../.github/workflows', filename),
          'utf8'
        )
      ).name
  );
  assert.equal(new Set(names).size, selected.length);
});

for (const filename of selected) {
  test(`${filename}: preserve every pre-existing workflow behavior`, () => {
    const workflow = yaml.load(
      fs.readFileSync(
        path.join(__dirname, '../../.github/workflows', filename),
        'utf8'
      )
    );
    delete workflow.concurrency;
    assert.equal(
      createHash('sha256').update(canonical(workflow)).digest('hex'),
      baseline.workflows[filename],
      'Triggers, permissions, jobs, steps or another existing workflow value changed; review any intended change explicitly'
    );
  });
}
