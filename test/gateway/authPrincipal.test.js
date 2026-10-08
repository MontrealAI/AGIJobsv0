const { expect } = require('chai');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { ethers } = require('ethers');
const grpc = require('@grpc/grpc-js');

// Execute the real RPC handlers with external I/O isolated. Signatures are real
// EIP-191 wallet signatures; no verifier or authorization decision is mocked.
async function gateway(wallets) {
  const filename = path.resolve(__dirname, '../../agent-gateway/grpc.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  let handlers;
  let now = Date.now();
  const writes = [];
  const dependencies = {
    '@grpc/grpc-js': {
      ...grpc,
      loadPackageDefinition: () => ({
        agentgateway: { v1: { AgentGateway: { service: {} } } },
      }),
      Server: class {
        addService(_definition, implementation) {
          handlers = implementation;
        }
        bindAsync(_address, _credentials, callback) {
          callback(null);
        }
        start() {}
        tryShutdown(callback) {
          callback();
        }
      },
    },
    '@grpc/proto-loader': { loadSync: () => ({}) },
    './utils': {
      GRPC_PORT: 50051,
      GATEWAY_API_KEY: 'operator-key',
      AUTH_MESSAGE: 'Agent Gateway Auth',
      walletManager: {
        get: (address) =>
          wallets.find(
            (wallet) => wallet.address.toLowerCase() === address.toLowerCase()
          ),
      },
      checkEnsSubdomain: async () => 'worker.agent.agi.eth',
    },
    './apiHelpers': { resolveAgentAddress: async (address) => address },
    './requestBudget': require('../../agent-gateway/requestBudget'),
    './agentActions': {},
    './deliverableStore': {
      recordHeartbeat: (record) => {
        writes.push(record);
        return {
          ...record,
          id: 'heartbeat',
          recordedAt: new Date(now).toISOString(),
        };
      },
    },
    './stakeCoordinator': {},
    './events': {},
    './telemetry': {},
    './jobSerialization': {},
  };
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('.')) throw new Error(`Unstubbed I/O: ${name}`);
    return require(name);
  };
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  new Function(
    'require',
    'module',
    'exports',
    '__dirname',
    'Date',
    compiled.outputText
  )(localRequire, module, module.exports, path.dirname(filename), Clock);
  await module.exports.startGrpcServer();
  const invoke = (method, metadata = new grpc.Metadata(), request = {}) =>
    new Promise((resolve) =>
      handlers[method]({ metadata, request }, (error, value) =>
        resolve({ error, value })
      )
    );
  return {
    invoke,
    writes,
    advance: (milliseconds) => {
      now += milliseconds;
    },
    close: () => module.exports.stopGrpcServer(),
    async signedMetadata(wallet) {
      const { value } = await invoke('GetAuthChallenge');
      expect(value.message).to.equal('Agent Gateway Auth');
      expect(Date.parse(value.expires_at) - now).to.equal(5 * 60 * 1000);
      const metadata = new grpc.Metadata();
      metadata.set('x-address', wallet.address);
      metadata.set('x-signature', await wallet.signMessage(value.challenge));
      return metadata;
    },
  };
}

describe('gateway gRPC authenticated principals', function () {
  let app;
  let signer;
  let other;
  beforeEach(async function () {
    signer = ethers.Wallet.createRandom();
    other = ethers.Wallet.createRandom();
    app = await gateway([signer, other]);
  });
  afterEach(async function () {
    await app.close();
  });

  it('rejects a valid nonce signature from an unmanaged wallet', async function () {
    const metadata = await app.signedMetadata(ethers.Wallet.createRandom());
    const { error } = await app.invoke('RecordHeartbeat', metadata, {
      job_id: '42',
      wallet_address: signer.address,
      status: 'working',
    });
    expect(error.code).to.equal(grpc.status.UNAUTHENTICATED);
    expect(app.writes).to.deep.equal([]);
  });

  for (const method of [
    'SubmitResult',
    'RecordHeartbeat',
    'RecordTelemetry',
    'EnsureStake',
    'AutoClaimRewards',
  ]) {
    it(`rejects a managed signer targeting another managed wallet through ${method}`, async function () {
      const { error } = await app.invoke(
        method,
        await app.signedMetadata(signer),
        {
          job_id: '42',
          wallet_address: other.address,
          status: 'working',
        }
      );
      expect(error.code).to.equal(grpc.status.PERMISSION_DENIED);
      expect(app.writes).to.deep.equal([]);
    });
  }

  it('accepts a managed signer for its own wallet and rejects replay', async function () {
    const metadata = await app.signedMetadata(signer);
    const body = {
      job_id: '42',
      wallet_address: signer.address.toLowerCase(),
      status: 'working',
    };
    const first = await app.invoke('RecordHeartbeat', metadata, body);
    expect(first.error).to.equal(null);
    expect(app.writes).to.have.length(1);
    expect(app.writes[0].agent).to.equal(signer.address);
    const replay = await app.invoke('RecordHeartbeat', metadata, body);
    expect(replay.error.code).to.equal(grpc.status.UNAUTHENTICATED);
    expect(app.writes).to.have.length(1);
  });

  it('rejects expired challenges and returns a fresh usable challenge', async function () {
    const metadata = await app.signedMetadata(signer);
    app.advance(5 * 60 * 1000);
    const body = {
      job_id: '42',
      wallet_address: signer.address,
      status: 'working',
    };
    expect(
      (await app.invoke('RecordHeartbeat', metadata, body)).error.code
    ).to.equal(grpc.status.UNAUTHENTICATED);
    expect(app.writes).to.deep.equal([]);
    expect(
      (
        await app.invoke(
          'RecordHeartbeat',
          await app.signedMetadata(signer),
          body
        )
      ).error
    ).to.equal(null);
    expect(app.writes).to.have.length(1);
  });

  it('preserves API-key operator authority over any managed wallet', async function () {
    const metadata = new grpc.Metadata();
    metadata.set('x-api-key', 'operator-key');
    const { error } = await app.invoke('RecordHeartbeat', metadata, {
      job_id: '42',
      agent_address: other.address,
      status: 'working',
    });
    expect(error).to.equal(null);
    expect(app.writes[0].agent).to.equal(other.address);
  });

  it('limits challenge floods before authentication or wallet actions', async function () {
    for (let i = 0; i < 240; i++) {
      expect((await app.invoke('GetAuthChallenge')).error).to.equal(null);
    }
    const metadata = new grpc.Metadata();
    metadata.set('x-api-key', 'operator-key');
    const { error } = await app.invoke('RecordHeartbeat', metadata, {
      job_id: '42',
      wallet_address: signer.address,
      status: 'working',
    });
    expect(error.code).to.equal(grpc.status.RESOURCE_EXHAUSTED);
    expect(Number(error.metadata.get('retry-after')[0])).to.be.within(1, 60);
    expect(app.writes).to.deep.equal([]);
  });
});
