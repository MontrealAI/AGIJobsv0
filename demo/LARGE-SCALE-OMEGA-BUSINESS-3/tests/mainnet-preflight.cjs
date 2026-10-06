'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mainnet = require('../lib/mainnet.cjs');

test('mainnet governance must be backed by the configured deployment key', () => {
  // Public, unfunded test scalar; never use it for a real account.
  const governance = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
  assert.equal(
    mainnet.assertGovernanceSigner(governance, { MAINNET_PRIVATE_KEY: '1' }),
    governance
  );
  assert.equal(
    mainnet.assertGovernanceSigner(governance.toLowerCase(), {
      MAINNET_PRIVATE_KEY: '0x' + '1'.padStart(64, '0'),
    }),
    governance
  );
  for (const key of ['', '0', 'invalid', 'f'.repeat(65)])
    assert.throws(
      () =>
        mainnet.assertGovernanceSigner(governance, {
          MAINNET_PRIVATE_KEY: key,
        }),
      /signer/
    );
  assert.throws(
    () =>
      mainnet.assertGovernanceSigner('0x' + '2'.repeat(40), {
        MAINNET_PRIVATE_KEY: '1',
      }),
    /Governance must match/
  );
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../lib/scenario.cjs');

for (const mode of [
  'normal',
  'invalid-config',
  'replace-before-env',
  'replace-during-env',
]) {
  test(`wizard consumes the sealed addressbook: ${mode}`, (t) => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'omega-wizard-fixture-')
    );
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const bin = path.join(directory, 'bin');
    fs.mkdirSync(bin);
    fs.mkdirSync(path.join(directory, 'docs'));
    const output = path.join(directory, 'addresses.json');
    const config = path.join(directory, 'config.json');
    const env = path.join(directory, 'operator.env');
    fs.writeFileSync(env, '# original fixture');
    fs.writeFileSync(
      config,
      JSON.stringify({
        network: 'mainnet',
        governance: '0x' + '1'.repeat(40),
        econ: {
          treasury: '0x' + '2'.repeat(40),
          feePct: mode === 'invalid-config' ? 101 : 5,
        },
        secureDefaults: { pauseOnLaunch: true },
        output,
      })
    );
    // Replace npm/npx only in a disposable directory. No chain or Hardhat calls.
    fs.writeFileSync(
      path.join(bin, 'npx'),
      `#!${process.execPath}\n
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = process.cwd(), output = path.join(root, 'addresses.json');
if (process.argv.at(-1).endsWith('/deploy.ts')) {
  assert.equal(process.env.ONECLICK_APPEAL_FEE, '0');
  assert.equal(process.env.ONECLICK_DISPUTE_WINDOW, '0');
  fs.writeFileSync(path.join(root, 'docs/deployment-addresses.json'), '{"deployed":"original"}');
} else {
  const input = process.env.ONECLICK_ADDRESSES;
  assert.equal(process.env.ONECLICK_CONFIG, path.join(root, 'config.json'));
  assert.equal(fs.readFileSync(input, 'utf8'), '{"deployed":"original"}');
  assert.equal(fs.statSync(input).mode & 0o777, 0o400);
  assert.equal(fs.statSync(path.dirname(input)).mode & 0o777, 0o500);
  fs.writeFileSync(path.join(root, 'snapshot-path.txt'), input);
  if (process.env.FIXTURE_MODE === 'replace-before-env') {
    fs.unlinkSync(output);
    fs.writeFileSync(output, '{"deployed":"substituted"}');
  }
}
`,
      { mode: 0o700 }
    );
    fs.writeFileSync(
      path.join(bin, 'npm'),
      `#!${process.execPath}\n
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), root = process.cwd();
if (args[1] !== 'deploy:env') throw new Error('Unexpected fixture command');
if (process.env.FIXTURE_MODE === 'replace-during-env') {
  fs.unlinkSync(path.join(root, 'addresses.json'));
  fs.writeFileSync(path.join(root, 'addresses.json'), '{"deployed":"substituted"}');
}
const input = args[args.indexOf('--input') + 1];
fs.writeFileSync(path.join(root, 'consumed.json'), fs.readFileSync(input));
`,
      { mode: 0o700 }
    );
    const result = spawnSync(
      process.execPath,
      [
        require.resolve('ts-node/dist/bin.js'),
        '--project',
        path.join(ROOT, 'tsconfig.json'),
        path.join(ROOT, 'scripts/v2/oneclick-wizard.ts'),
        '--config',
        config,
        '--env',
        env,
        '--yes',
        '--no-compose',
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          PATH: bin + path.delimiter + process.env.PATH,
          FIXTURE_MODE: mode,
          ONECLICK_APPEAL_FEE: '123',
          ONECLICK_DISPUTE_WINDOW: '999',
        },
      }
    );
    assert.ifError(result.error);
    assert.equal(
      result.status,
      mode === 'normal' ? 0 : 1,
      result.stdout + result.stderr
    );
    if (mode === 'invalid-config') {
      assert.match(result.stderr, /feePct/);
      assert.equal(fs.existsSync(output), false);
      assert.equal(
        fs.existsSync(path.join(directory, 'docs/deployment-addresses.json')),
        false
      );
    } else {
      const snapshot = fs.readFileSync(
        path.join(directory, 'snapshot-path.txt'),
        'utf8'
      );
      assert.equal(fs.existsSync(path.dirname(snapshot)), false);
      assert.equal(
        fs.readFileSync(
          path.join(directory, 'docs/deployment-addresses.json'),
          'utf8'
        ),
        '{"deployed":"original"}'
      );
      if (mode !== 'normal') assert.match(result.stderr, /replaced/);
    }
    const consumed = path.join(directory, 'consumed.json');
    if (mode === 'normal' || mode === 'replace-during-env')
      assert.equal(
        fs.readFileSync(consumed, 'utf8'),
        '{"deployed":"original"}'
      );
    else assert.equal(fs.existsSync(consumed), false);
  });
}
