const { expect } = require('chai');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('dotenv');
const {
  deploymentNetwork,
  runtimeEnvironment,
  verifyRuntimeNetwork,
  composeNetworkEnvironment,
} = require('../../scripts/v2/lib/runtime-network.cjs');

const registry = '0x0000000000000000000000000000000000001234';
const sepolia = deploymentNetwork({ network: 'sepolia', chainId: '11155111' });
const publicTemplate =
  'RPC_URL=https://private.example/rpc/private-api-token\nNEXT_PUBLIC_RPC_URL=https://public.example/rpc\nCHAIN_ID=31337\nNEXT_PUBLIC_CHAIN_ID=31337\nAGJ_NETWORK=localhost\n';

describe('One-click runtime network binding', function () {
  this.timeout(30000);
  it('normalizes deployment identity while keeping browser and server endpoints separate', function () {
    const env = runtimeEnvironment(publicTemplate, sepolia);
    expect(env.CHAIN_ID).to.equal('11155111');
    expect(env.NEXT_PUBLIC_CHAIN_ID).to.equal('11155111');
    expect(env.AGJ_NETWORK).to.equal('sepolia');
    expect(env.RPC_URL).to.equal(
      'https://private.example/rpc/private-api-token'
    );
    expect(env.NEXT_PUBLIC_RPC_URL).to.equal('https://public.example/rpc');
    expect(
      composeNetworkEnvironment({
        ...env,
        PATH: 'untrusted',
        PRIVATE_KEY: 'secret',
      })
    ).not.to.have.property('PATH');
    expect(composeNetworkEnvironment(env).CHAIN_ID).to.equal('11155111');
    expect(
      composeNetworkEnvironment(env, { NEXT_PUBLIC_STALE_ADDRESS: 'stale' })
        .NEXT_PUBLIC_STALE_ADDRESS
    ).to.equal(undefined);
  });
  it('rejects mismatched manifest metadata, missing network and public local-template endpoints', function () {
    expect(() =>
      deploymentNetwork({ network: 'sepolia', chainId: 31337 })
    ).to.throw('do not match');
    expect(() => deploymentNetwork({ network: 'sepolia' }, 'mainnet')).to.throw(
      'conflicts'
    );
    expect(() => deploymentNetwork({})).to.throw('network is required');
    expect(() =>
      runtimeEnvironment(
        'RPC_URL=http://anvil:8545\nNEXT_PUBLIC_RPC_URL=http://localhost:8545',
        sepolia
      )
    ).to.throw('local template URLs');
    expect(() =>
      runtimeEnvironment('RPC_URL=https://private.example/secret', sepolia)
    ).to.throw('NEXT_PUBLIC_RPC_URL');
    expect(() =>
      runtimeEnvironment(
        publicTemplate.replace(
          'https://public.example/rpc',
          'https://user:secret@public.example/rpc'
        ),
        sepolia
      )
    ).to.throw('embedded credentials');
  });
  it('requires matching chain IDs and deployed registry bytecode from both public-network endpoints', async function () {
    const env = runtimeEnvironment(publicTemplate, sepolia);
    const calls = [];
    await verifyRuntimeNetwork(env, sepolia, {
      registry,
      request: async (url, method, params) => {
        calls.push({ url, method, params });
        return method === 'eth_chainId' ? '0xaa36a7' : '0x6000';
      },
    });
    expect(calls).to.have.lengthOf(4);
    expect(
      calls
        .filter((call) => call.method === 'eth_getCode')
        .every((call) => call.params[0] === registry)
    ).to.equal(true);
    await expect(
      verifyRuntimeNetwork(env, sepolia, {
        registry,
        request: async (url, method) =>
          url === env.NEXT_PUBLIC_RPC_URL
            ? '0x7a69'
            : method === 'eth_chainId'
            ? '0xaa36a7'
            : '0x6000',
      })
    ).to.be.rejectedWith('NEXT_PUBLIC_RPC_URL failed deployment verification');
    await expect(
      verifyRuntimeNetwork(env, sepolia, {
        registry,
        request: async (_url, method) =>
          method === 'eth_chainId' ? '0xaa36a7' : '0x',
      })
    ).to.be.rejectedWith('deployed JobRegistry');
  });
  it('does not reveal endpoint credentials or provider messages when RPC verification fails', async function () {
    try {
      await verifyRuntimeNetwork(
        runtimeEnvironment(publicTemplate, sepolia),
        sepolia,
        {
          request: async () => {
            throw new Error('private-api-token');
          },
        }
      );
      throw new Error('Expected verification failure');
    } catch (error) {
      expect(error.message).to.include('RPC_URL failed');
      expect(error.message).not.to.include('private-api-token');
      expect(error.message).not.to.include('private.example');
    }
  });
  it('preserves the local Docker and browser endpoint distinction', async function () {
    const identity = deploymentNetwork({
      network: 'localhost',
      chainId: 31337,
    });
    const env = runtimeEnvironment('', identity);
    expect(env.RPC_URL).to.equal('http://anvil:8545');
    expect(env.NEXT_PUBLIC_RPC_URL).to.equal('http://localhost:8545');
    expect(env.NEXT_PUBLIC_CHAIN_ID).to.equal('31337');
    await verifyRuntimeNetwork(env, identity, {
      request: () => {
        throw new Error('Local Docker DNS must not be requested from the host');
      },
    });
  });
  it('generates correct public network labels and rejects a mismatched RPC without modifying output', function () {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'agi-network-env-')
    );
    try {
      const input = path.join(directory, 'addresses.json');
      const template = path.join(directory, 'template.env');
      const output = path.join(directory, 'result.env');
      const preload = path.join(directory, 'rpc.cjs');
      fs.writeFileSync(
        input,
        JSON.stringify({
          network: 'sepolia',
          chainId: '11155111',
          jobRegistry: registry,
        })
      );
      fs.writeFileSync(
        template,
        publicTemplate +
          ' export CHAIN_ID = 31337\nNEXT_PUBLIC_JOB_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000\n'
      );
      const rpc = (id) =>
        fs.writeFileSync(
          preload,
          `global.fetch = async (_url, options) => { const { method } = JSON.parse(options.body); return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: method === 'eth_chainId' ? '${id}' : '0x6000' }) }; };`
        );
      rpc('0xaa36a7');
      const run = () =>
        spawnSync(
          process.execPath,
          [
            '--require',
            require.resolve('ts-node/register/transpile-only'),
            '--require',
            preload,
            'scripts/v2/generate-oneclick-env.ts',
            '--input',
            input,
            '--template',
            template,
            '--output',
            output,
            '--force',
          ],
          {
            cwd: path.resolve(__dirname, '../..'),
            encoding: 'utf8',
            timeout: 20000,
          }
        );
      let result = run();
      expect(result.status, result.stderr).to.equal(0);
      const text = fs.readFileSync(output, 'utf8');
      const env = parse(text);
      expect(env.CHAIN_ID).to.equal('11155111');
      expect(env.NEXT_PUBLIC_CHAIN_ID).to.equal('11155111');
      expect(env.AGJ_NETWORK).to.equal('sepolia');
      expect(env.NEXT_PUBLIC_JOB_REGISTRY_ADDRESS).to.equal(registry);
      expect(env.NEXT_PUBLIC_RPC_URL).not.to.include('private-api-token');
      expect(result.stdout).not.to.include('private-api-token');
      rpc('0x7a69');
      result = run();
      expect(result.status).to.equal(1);
      expect(result.stderr).to.include('failed deployment verification');
      expect(fs.readFileSync(output, 'utf8')).to.equal(text);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
