const { expect } = require('chai');
const { EventEmitter } = require('events');
const { ethers } = require('ethers');

process.env.TS_NODE_PROJECT = 'apps/orchestrator/tsconfig.json';
require('ts-node/register/transpile-only');

const {
  setupJobListener,
  resolveAddress,
} = require('../../apps/orchestrator/gateway');

describe('orchestrator gateway', function () {
  it('filters assigned jobs and stake balance', async function () {
    const jobRegistry = new EventEmitter();
    const stakeManager = { stakeOf: async () => 100n };
    const detected = [];
    setupJobListener(
      jobRegistry,
      stakeManager,
      '0x0000000000000000000000000000000000000001',
      (jobId, details) => {
        detected.push({ jobId, details });
      }
    );
    jobRegistry.emit(
      'JobCreated',
      1n,
      '0x0000000000000000000000000000000000000002',
      ethers.ZeroAddress,
      10n,
      50n,
      0n
    );
    jobRegistry.emit(
      'JobCreated',
      2n,
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000003',
      10n,
      50n,
      0n
    );
    stakeManager.stakeOf = async () => 10n;
    jobRegistry.emit(
      'JobCreated',
      3n,
      '0x0000000000000000000000000000000000000002',
      ethers.ZeroAddress,
      10n,
      50n,
      0n
    );
    await new Promise((r) => setImmediate(r));
    expect(detected).to.have.length(1);
    expect(detected[0].jobId).to.equal('1');
  });

  it('resolves ENS names', async function () {
    const provider = {
      resolveName: async (name) =>
        name === 'example.eth'
          ? '0x0000000000000000000000000000000000000001'
          : null,
    };
    const addr = await resolveAddress(provider, 'example.eth');
    expect(addr).to.equal('0x0000000000000000000000000000000000000001');
    try {
      await resolveAddress(provider, 'bad.eth');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.message).to.include('Could not resolve ENS name');
    }
  });
});
