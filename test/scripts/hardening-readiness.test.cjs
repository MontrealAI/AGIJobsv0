const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const workflow = yaml.load(
  fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/demo-asi-takeoff.yml'),
    'utf8'
  )
);
const steps = workflow.jobs['asi-takeoff-local'].steps;
const startup = steps.find(
  (step) => step.name === 'Verify runner hardening is active'
).run;
const final = steps.find(
  (step) => step.name === 'Verify runner hardening remained active'
).run;

function run(script, readyAfter, serviceActive) {
  return spawnSync(
    'bash',
    [
      '-e',
      '-c',
      `
    polls=0
    test() {
      [[ "$1" == '-s' && "$2" == '/home/agent/agent.status' ]] || exit 90
      (( polls >= READY_AFTER ))
    }
    systemctl() {
      [[ "$*" == 'is-active --quiet agent.service' ]] || exit 91
      [[ "$SERVICE_ACTIVE" == 'yes' ]]
    }
    sleep() {
      [[ "$1" == '2' ]] || exit 92
      polls=$((polls + 1))
      echo "wait $polls"
    }
    ${script}
  `,
    ],
    {
      encoding: 'utf8',
      timeout: 2000,
      env: {
        ...process.env,
        READY_AFTER: String(readyAfter),
        SERVICE_ACTIVE: serviceActive ? 'yes' : 'no',
      },
    }
  );
}

test('waits for asynchronous hardening readiness before allowing checkout', () => {
  const result = run(startup, 2, true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'wait 1\nwait 2');
  assert.ok(
    steps.findIndex(
      (step) => step.name === 'Verify runner hardening is active'
    ) < steps.findIndex((step) => step.uses?.startsWith('actions/checkout@'))
  );
});

test('fails after a bounded wait when the status file never appears', () => {
  const result = run(startup, 100, true);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout.trim().split('\n').length, 30);
  assert.match(result.stderr, /did not become ready/);
});

test('requires an active service at startup and after the workload', () => {
  assert.equal(run(startup, 0, false).status, 1);
  assert.equal(run(final, 0, false).status, 1);
  assert.equal(run(final, 0, true).status, 0);
});
