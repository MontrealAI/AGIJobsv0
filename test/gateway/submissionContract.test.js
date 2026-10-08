const { expect } = require('chai');
const { artifacts, ethers } = require('hardhat');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');

// Isolate gateway I/O while running its actual TypeScript entrypoints. The
// deployed contract artifact, rather than a copied ABI, validates each call.
function loadGateway(file, dependencies, runtimeDirectory) {
  const filename = path.resolve(__dirname, '../../agent-gateway', file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('.')) throw new Error(`Unstubbed gateway I/O: ${name}`);
    return require(name);
  };
  new Function(
    'require',
    'module',
    'exports',
    '__dirname',
    compiled.outputText
  )(
    localRequire,
    module,
    module.exports,
    runtimeDirectory ?? path.dirname(filename)
  );
  return module.exports;
}

describe('gateway current registry submissions', function () {
  let abi;
  before(async function () {
    abi = new ethers.Interface(
      (
        await artifacts.readArtifact('contracts/v2/JobRegistry.sol:JobRegistry')
      ).abi
    );
  });

  function actions(store = {}) {
    const calls = {
      tax: 0,
      submit: [],
      publish: 0,
      certificates: [],
      records: [],
      waits: 0,
      legacy: 0,
    };
    const module = loadGateway('agentActions.ts', {
      './utils': {
        jobs: new Map(),
        registry: {
          connect: () => ({
            finalizeJob: async () => {
              calls.legacy++;
              throw new Error('obsolete selector');
            },
            submit: async (...args) => {
              // Throws on an obsolete selector or bytes/string proof shape.
              abi.encodeFunctionData('submit', args);
              calls.submit.push(args);
              return {
                hash: '0xsubmitted',
                wait: async () => {
                  calls.waits++;
                },
              };
            },
          }),
        },
      },
      './stakeCoordinator': {
        acknowledgeTaxPolicy: async () => {
          calls.tax++;
        },
      },
      './certificateMetadata': {
        publishCertificateMetadata: async (input) => {
          calls.publish++;
          calls.certificates.push(input);
        },
      },
      './deliverableStore': {
        DeliverableInputError: class extends Error {},
        assertDeliverableStorageReady: () => {},
        validateDeliverableInput: (input) => input,
        recordDeliverable: (record) => {
          calls.records.push(record);
          return record;
        },
        ...store,
      },
    });
    return { ...module, calls };
  }

  it('submits legacy packed proof words through the current bytes32[] ABI', async function () {
    const { submitDeliverable, calls } = actions();
    const first = ethers.id('first sibling'),
      second = ethers.id('second sibling');
    const result = await submitDeliverable({
      jobId: '42',
      wallet: ethers.Wallet.createRandom(),
      resultUri: 'ipfs://result',
      subdomain: 'agent',
      proofBytes: first + second.slice(2),
      proof: { evidence: 'off-chain metadata' },
      finalize: true,
      preferFinalize: true,
    });
    expect(result.submissionMethod).to.equal('submit');
    expect(calls.submit).to.deep.equal([
      [
        '42',
        ethers.id('ipfs://result'),
        'ipfs://result',
        'agent',
        [first, second],
      ],
    ]);
    expect(calls.records[0].proof).to.deep.equal({
      evidence: 'off-chain metadata',
    });
    expect([calls.tax, calls.waits, calls.publish, calls.legacy]).to.deep.equal(
      [1, 1, 1, 0]
    );
    expect(calls.records[0].signature).to.equal(undefined);
    expect(calls.certificates[0].signature).to.equal(undefined);
  });

  it('publishes only a verified EIP-191 content signature over the exact result digest', async function () {
    const { submitDeliverable, calls } = actions();
    const wallet = ethers.Wallet.createRandom();
    const resultHash = ethers.id('actual result bytes');
    const signature = await wallet.signMessage(ethers.getBytes(resultHash));
    await submitDeliverable({
      jobId: '42',
      wallet,
      resultUri: 'ipfs://result',
      resultHash,
      signature,
      signedPayload: resultHash,
    });
    expect(calls.submit[0][1]).to.equal(resultHash);
    expect(calls.records[0]).to.include({ signature, digest: resultHash });
    expect(calls.certificates[0]).to.include({ signature, resultHash });
    // The existing independent certificate verifier consumes this exact format.
    expect(
      ethers.verifyMessage(
        ethers.getBytes(calls.certificates[0].resultHash),
        calls.certificates[0].signature
      )
    ).to.equal(wallet.address);
  });

  for (const scenario of [
    'signature without payload',
    'payload without signature',
    'null payload',
    'empty signature',
    'malformed signature',
    'unrelated signed payload',
    'object payload',
    'signature over hexadecimal text',
    'wrong signer',
    'wrong signed result',
    'conflicting digest',
  ]) {
    it(`rejects ${scenario} before tax, submit, publication or persistence`, async function () {
      const { submitDeliverable, SubmissionInputError, calls } = actions();
      const wallet = ethers.Wallet.createRandom();
      const resultHash = ethers.id('actual result bytes');
      const signature = await wallet.signMessage(ethers.getBytes(resultHash));
      const options = {
        jobId: '42',
        wallet,
        resultUri: 'ipfs://result',
        resultHash,
        signature,
        signedPayload: resultHash,
      };
      switch (scenario) {
        case 'signature without payload':
          delete options.signedPayload;
          break;
        case 'payload without signature':
          delete options.signature;
          break;
        case 'null payload':
          options.signedPayload = null;
          break;
        case 'empty signature':
          options.signature = '';
          break;
        case 'malformed signature':
          options.signature = '0x1234';
          break;
        case 'unrelated signed payload':
          options.signedPayload = 'arbitrary message';
          options.signature = await wallet.signMessage(options.signedPayload);
          break;
        case 'object payload':
          options.signedPayload = { resultHash };
          break;
        case 'signature over hexadecimal text':
          options.signature = await wallet.signMessage(resultHash);
          break;
        case 'wrong signer':
          options.signature = await ethers.Wallet.createRandom().signMessage(
            ethers.getBytes(resultHash)
          );
          break;
        case 'wrong signed result':
          options.signature = await wallet.signMessage(
            ethers.getBytes(ethers.id('other result'))
          );
          break;
        case 'conflicting digest':
          options.digest = ethers.id('other result');
          break;
      }
      let failure;
      try {
        await submitDeliverable(options);
      } catch (error) {
        failure = error;
      }
      expect(failure).to.be.instanceOf(SubmissionInputError);
      expect([
        calls.tax,
        calls.submit.length,
        calls.publish,
        calls.records.length,
      ]).to.deep.equal([0, 0, 0, 0]);
    });
  }

  it('preflights storage input before transactions and maps validation errors to client input errors', async function () {
    class DeliverableInputError extends Error {}
    const { submitDeliverable, SubmissionInputError, calls } = actions({
      DeliverableInputError,
      validateDeliverableInput: () => {
        throw new DeliverableInputError('evidence too large');
      },
    });
    let failure;
    try {
      await submitDeliverable({
        jobId: '42',
        wallet: ethers.Wallet.createRandom(),
        resultUri: 'ipfs://result',
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).to.be.instanceOf(SubmissionInputError);
    expect(failure.message).to.equal('evidence too large');
    expect([
      calls.tax,
      calls.submit.length,
      calls.publish,
      calls.records.length,
    ]).to.deep.equal([0, 0, 0, 0]);
  });

  it('rejects unavailable storage before transactions without mislabelling an operator failure as bad input', async function () {
    const unavailable = new Error('journal unavailable');
    const { submitDeliverable, SubmissionInputError, calls } = actions({
      assertDeliverableStorageReady: () => {
        throw unavailable;
      },
    });
    let failure;
    try {
      await submitDeliverable({
        jobId: '42',
        wallet: ethers.Wallet.createRandom(),
        resultUri: 'ipfs://result',
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).to.equal(unavailable);
    expect(failure).not.to.be.instanceOf(SubmissionInputError);
    expect([
      calls.tax,
      calls.submit.length,
      calls.publish,
      calls.records.length,
    ]).to.deep.equal([0, 0, 0, 0]);
  });

  for (const unsafe of ['oversized evidence', 'symlinked journal']) {
    it(`composes the real storage preflight to reject ${unsafe} before chain writes`, async function () {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gateway-submit-')
      );
      const runtimeDirectory = path.join(directory, 'agent-gateway');
      fs.mkdirSync(runtimeDirectory);
      try {
        const store = loadGateway('deliverableStore.ts', {}, runtimeDirectory);
        const { submitDeliverable, SubmissionInputError, calls } = actions({
          DeliverableInputError: store.DeliverableInputError,
          validateDeliverableInput: store.validateDeliverableInput,
          assertDeliverableStorageReady: store.assertDeliverableStorageReady,
        });
        const outside = path.join(directory, 'outside.json');
        fs.writeFileSync(outside, 'unchanged', { mode: 0o600 });
        if (unsafe === 'symlinked journal') {
          fs.symlinkSync(
            outside,
            path.join(directory, 'storage/deliverables/deliverables.jsonl')
          );
        }
        let failure;
        try {
          await submitDeliverable({
            jobId: '42',
            wallet: ethers.Wallet.createRandom(),
            resultUri: 'ipfs://result',
            metadata:
              unsafe === 'oversized evidence'
                ? { content: 'x'.repeat(1024 * 1024) }
                : {},
          });
        } catch (error) {
          failure = error;
        }
        expect(failure).to.be.instanceOf(Error);
        if (unsafe === 'oversized evidence')
          expect(failure).to.be.instanceOf(SubmissionInputError);
        else expect(failure).not.to.be.instanceOf(SubmissionInputError);
        expect([
          calls.tax,
          calls.submit.length,
          calls.publish,
          calls.records.length,
        ]).to.deep.equal([0, 0, 0, 0]);
        expect(fs.readFileSync(outside, 'utf8')).to.equal('unchanged');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }

  it('accepts proof arrays and the legacy empty proof without changing evidence metadata', async function () {
    const { normaliseIdentityProof } = actions();
    const words = [ethers.id('sibling')];
    const converted = normaliseIdentityProof(words);
    expect(converted).to.deep.equal(words);
    expect(converted).not.to.equal(words);
    expect(normaliseIdentityProof('0x')).to.deep.equal([]);
    expect(normaliseIdentityProof(undefined)).to.deep.equal([]);
  });

  for (const [name, overrides] of [
    ['partial proof word', { proofBytes: '0x1234' }],
    ['malformed proof array', { proofBytes: [ethers.ZeroHash, '0x12'] }],
    ['invalid proof type', { proofBytes: {} }],
    ['unsupported finalization', { finalizeOnly: true }],
    ['invalid result hash', { resultHash: '0x1234' }],
  ]) {
    it(`rejects ${name} before tax acknowledgement or submission`, async function () {
      const { submitDeliverable, SubmissionInputError, calls } = actions();
      let failure;
      try {
        await submitDeliverable({
          jobId: '42',
          wallet: ethers.Wallet.createRandom(),
          resultUri: 'ipfs://result',
          ...overrides,
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).to.be.instanceOf(SubmissionInputError);
      expect([
        calls.tax,
        calls.submit.length,
        calls.publish,
        calls.records.length,
        calls.legacy,
      ]).to.deep.equal([0, 0, 0, 0, 0]);
    });
  }

  for (const request of [{ proof_bytes: '0x1234' }, { finalize_only: true }]) {
    it(`reports invalid gRPC submission input before chain writes: ${
      Object.keys(request)[0]
    }`, async function () {
      const wallet = ethers.Wallet.createRandom();
      const actionModule = actions();
      const grpc = require('@grpc/grpc-js');
      let handlers;
      const gateway = loadGateway('grpc.ts', {
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
          GATEWAY_API_KEY: 'fixture-key',
          walletManager: { get: () => wallet },
          checkEnsSubdomain: async () => 'worker.agent.agi.eth',
        },
        './agentActions': actionModule,
        './requestBudget': require('../../agent-gateway/requestBudget'),
        './apiHelpers': { resolveAgentAddress: async (value) => value },
        './deliverableStore': {},
        './stakeCoordinator': {},
        './events': {},
        './telemetry': {},
        './jobSerialization': {},
      });
      await gateway.startGrpcServer();
      try {
        const metadata = new grpc.Metadata();
        metadata.set('x-api-key', 'fixture-key');
        const error = await new Promise((resolve) =>
          handlers.SubmitResult(
            {
              metadata,
              request: {
                job_id: '42',
                wallet_address: wallet.address,
                result_uri: 'ipfs://result',
                ...request,
              },
            },
            (failure) => resolve(failure)
          )
        );
        expect(error.code).to.equal(grpc.status.INVALID_ARGUMENT);
        expect([
          actionModule.calls.tax,
          actionModule.calls.submit.length,
        ]).to.deep.equal([0, 0]);
      } finally {
        await gateway.stopGrpcServer();
      }
    });
  }

  it('records the job ID from its own confirmed receipt instead of a global counter', async function () {
    const wallet = ethers.Wallet.createRandom();
    const registryAddress = '0x1111111111111111111111111111111111111111';
    let persisted;
    const { postJob } = loadGateway('employer.ts', {
      fs: {
        existsSync: () => true,
        promises: {
          readFile: async () => '[]',
          writeFile: async (_file, data) => {
            persisted = JSON.parse(data);
          },
        },
      },
      './security': { secureLogAction: async () => {} },
      './utils': {
        TOKEN_DECIMALS: 18,
        registry: {
          interface: abi,
          getAddress: async () => registryAddress,
          nextJobId: async () => {
            throw new Error('global counter must not be read');
          },
          connect: () => ({
            createJob: async (reward, deadline, specHash, uri) => {
              abi.encodeFunctionData('createJob', [
                reward,
                deadline,
                specHash,
                uri,
              ]);
              const log = abi.encodeEventLog(abi.getEvent('JobCreated'), [
                42n,
                wallet.address,
                ethers.ZeroAddress,
                reward,
                0n,
                0n,
                specHash,
                uri,
              ]);
              return {
                hash: '0xcreated',
                wait: async () => ({
                  logs: [
                    {
                      ...log,
                      address: '0x2222222222222222222222222222222222222222',
                    },
                    { ...log, address: registryAddress },
                  ],
                }),
              };
            },
          }),
        },
      },
    });
    const created = await postJob(
      { description: 'Reviewed job', reward: '1' },
      wallet
    );
    expect(created.jobId).to.equal(42);
    expect(persisted[0].jobId).to.equal(42);
  });

  it('posts and records job 1 through the actual current JobRegistry', async function () {
    const [owner, employer] = await ethers.getSigners();
    const Stake = await ethers.getContractFactory(
      'contracts/legacy/MockV2.sol:MockStakeManager'
    );
    const stake = await Stake.deploy();
    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const registry = await Registry.deploy(
      ethers.ZeroAddress,
      await stake.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      7,
      0,
      [],
      owner.address,
      await deployImplementations('JobRegistry', Registry.runner)
    );
    await registry.setJobParameters(ethers.parseEther('10'), 0);
    let persisted;
    const { postJob } = loadGateway('employer.ts', {
      fs: {
        existsSync: () => true,
        promises: {
          readFile: async () => '[]',
          writeFile: async (_file, data) => {
            persisted = JSON.parse(data);
          },
        },
      },
      './security': { secureLogAction: async () => {} },
      './utils': { registry, TOKEN_DECIMALS: 18 },
    });
    const created = await postJob(
      { description: 'Actual receipt', reward: '1' },
      employer
    );
    expect(created.jobId).to.equal(1);
    expect(await registry.nextJobId()).to.equal(1n);
    expect((await registry.jobs(created.jobId)).employer).to.equal(
      employer.address
    );
    expect(persisted[0].jobId).to.equal(1);
  });
});
