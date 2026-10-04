const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

test('runner allowlists decode to individual host:port entries instead of one multiline DNS name', () => {
  const directory = path.resolve(__dirname, '../../.github/workflows');
  let checked = 0;
  for (const file of fs
    .readdirSync(directory)
    .filter((name) => /\.ya?ml$/.test(name))) {
    const workflow = yaml.load(
      fs.readFileSync(path.join(directory, file), 'utf8')
    );
    for (const job of Object.values(workflow.jobs || {})) {
      for (const step of job.steps || []) {
        if (!step.uses?.startsWith('step-security/harden-runner@')) continue;
        const config = step.with || {};
        if (config['egress-policy'] !== 'block') continue;
        const endpoints = config['allowed-endpoints'];
        assert.equal(
          typeof endpoints,
          'string',
          `${file}: explicit block allowlist required`
        );
        for (const endpoint of endpoints.trim().split(' ')) {
          assert.match(
            endpoint,
            /^(?:\*\.)?[a-z0-9.-]+:[1-9][0-9]{0,4}$/,
            `${file}: malformed endpoint ${JSON.stringify(endpoint)}`
          );
          assert.ok(
            Number(endpoint.split(':')[1]) <= 65535,
            `${file}: invalid port`
          );
        }
        checked++;
      }
    }
  }
  assert.ok(
    checked > 0,
    'The regression must inspect configured blocking policies'
  );
});
