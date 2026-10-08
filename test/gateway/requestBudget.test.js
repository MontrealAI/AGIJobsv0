const { expect } = require('chai');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  GatewayRequestBudget,
  peerAddressKey,
  grpcPeerAddress,
} = require('../../agent-gateway/requestBudget');

describe('gateway bounded request budgets', function () {
  it('normalizes transport addresses without trusting ephemeral ports or IPv6 privacy addresses', function () {
    expect(grpcPeerAddress('ipv4:127.0.0.1:45234')).to.equal('127.0.0.1');
    expect(grpcPeerAddress('ipv6:[2001:db8::1234]:45234')).to.equal(
      '2001:db8::1234'
    );
    expect(grpcPeerAddress('untrusted-header')).to.equal('');
    expect(peerAddressKey('::ffff:192.0.2.1')).to.equal(
      peerAddressKey('192.0.2.1')
    );
    expect(peerAddressKey('2001:db8:1234:5600::1')).to.equal(
      peerAddressKey('2001:db8:1234:56ff::abcd')
    );
    expect(peerAddressKey('2001:db8:1234:5700::1')).not.to.equal(
      peerAddressKey('2001:db8:1234:5600::1')
    );
  });

  it('enforces per-peer and process ceilings, then resets bounded state after the window', function () {
    let now = 1000;
    const budget = new GatewayRequestBudget(2, 4, 1000, () => now);
    expect(budget.consume('192.0.2.1').allowed).to.equal(true);
    expect(budget.consume('::ffff:192.0.2.1').allowed).to.equal(true);
    expect(budget.consume('192.0.2.1').allowed).to.equal(false);
    expect(budget.consume('192.0.2.2').allowed).to.equal(true);
    for (let i = 3; i < 200; i++)
      expect(budget.consume(`192.0.2.${i}`).allowed).to.equal(false);
    expect(budget.peers.size).to.equal(2);
    now += 1000;
    expect(budget.consume('192.0.2.3').allowed).to.equal(true);
    expect(budget.peers.size).to.equal(1);
  });

  it('does not allow invalid limits to disable protection', function () {
    for (const value of [0, -1, Infinity, NaN, 1.5])
      expect(() => new GatewayRequestBudget(value)).to.throw(
        /positive safe integers/
      );
  });

  it('applies real HTTP middleware before auth, JSON parsing and wallet actions', function () {
    this.timeout(30000);
    // Isolate counters and transport fixtures from other gateway suites while
    // exercising the actual Express app and installed rate-limit middleware.
    const script = String.raw`
      const assert = require('node:assert/strict');
      const request = require('supertest');
      const budget = require('./agent-gateway/requestBudget');
      budget.REQUESTS_PER_PEER = 2;
      budget.REQUESTS_PER_PROCESS = 3;
      const utils = require('./agent-gateway/utils');
      let actions = 0;
      utils.walletManager = { get: (address) => ({ address }) };
      utils.commitHelper = async () => { actions++; return { tx: 'fixture' }; };
      const app = require('./agent-gateway/routes').default;
      assert.equal(app.get('trust proxy'), false);
      (async () => {
        const call = (forwarded) => request(app).post('/jobs/42/commit')
          .set('X-Api-Key', 'rate-test').set('X-Forwarded-For', forwarded)
          .send({ address: process.env.JOB_REGISTRY_ADDRESS, approve: true });
        assert.equal((await call('192.0.2.1')).status, 200);
        assert.equal((await call('192.0.2.2')).status, 200);
        const peerLimited = await call('192.0.2.3');
        assert.equal(peerLimited.status, 429);
        assert.ok(Number(peerLimited.headers['retry-after']) > 0);
        assert.match(peerLimited.body.error, /peer request budget/);
        const globallyLimited = await request(app).post('/jobs/42/commit')
          .set('Content-Type', 'application/json').send('{');
        assert.equal(globallyLimited.status, 429);
        assert.match(globallyLimited.body.error, /gateway request budget/);
        assert.equal(actions, 2);
      })().catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    const result = spawnSync(
      process.execPath,
      ['-r', require.resolve('ts-node/register/transpile-only'), '-e', script],
      {
        cwd: path.resolve(__dirname, '../..'),
        encoding: 'utf8',
        timeout: 25000,
        env: {
          ...process.env,
          JOB_REGISTRY_ADDRESS: '0x1111111111111111111111111111111111111111',
          VALIDATION_MODULE_ADDRESS:
            '0x1111111111111111111111111111111111111111',
          STAKE_MANAGER_ADDRESS: '0x1111111111111111111111111111111111111111',
          KEYSTORE_URL: 'http://localhost:9/unused',
          GATEWAY_API_KEY: 'rate-test',
        },
      }
    );
    expect(result.status, result.stdout + result.stderr).to.equal(0);
  });
});
