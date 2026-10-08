import { expect } from 'chai';
import type { Express } from 'express';
import { ethers } from 'ethers';
import request from 'supertest';

type CommitCapture = {
  jobId: string;
  wallet: string;
  approve: boolean;
  salt?: string;
};

type RevealCapture = {
  jobId: string;
  wallet: string;
  approve?: boolean;
  salt?: string;
};

describe('agent gateway request validation', function () {
  const API_KEY = 'test-key';
  const WALLET = '0x00000000000000000000000000000000000000A1';
  const SECOND_WALLET = '0x00000000000000000000000000000000000000B2';
  let app: Express;
  let utils: typeof import('../../agent-gateway/utils');
  let originalWalletManager: typeof import('../../agent-gateway/utils')['walletManager'];
  let originalCommitHelper: typeof import('../../agent-gateway/utils')['commitHelper'];
  let originalRevealHelper: typeof import('../../agent-gateway/utils')['revealHelper'];
  let commitCapture: CommitCapture | undefined;
  let revealCapture: RevealCapture | undefined;
  let originalRegistry: typeof utils.registry;
  let originalCheckEnsSubdomain: typeof utils.checkEnsSubdomain;
  let originalApiKey: string;
  let registryCalls: unknown[][];
  const envBackup: Record<string, string | undefined> = {};

  before(async function () {
    envBackup.JOB_REGISTRY_ADDRESS = process.env.JOB_REGISTRY_ADDRESS;
    envBackup.VALIDATION_MODULE_ADDRESS = process.env.VALIDATION_MODULE_ADDRESS;
    envBackup.STAKE_MANAGER_ADDRESS = process.env.STAKE_MANAGER_ADDRESS;
    envBackup.KEYSTORE_URL = process.env.KEYSTORE_URL;
    envBackup.GATEWAY_API_KEY = process.env.GATEWAY_API_KEY;

    process.env.JOB_REGISTRY_ADDRESS = WALLET;
    process.env.VALIDATION_MODULE_ADDRESS = WALLET;
    process.env.STAKE_MANAGER_ADDRESS = SECOND_WALLET;
    process.env.KEYSTORE_URL = 'https://keystore.local/keys';
    process.env.GATEWAY_API_KEY = API_KEY;

    utils = await import('../../agent-gateway/utils');
    originalWalletManager = utils.walletManager;
    originalCommitHelper = utils.commitHelper;
    originalRevealHelper = utils.revealHelper;
    originalRegistry = utils.registry;
    originalCheckEnsSubdomain = utils.checkEnsSubdomain;
    originalApiKey = utils.GATEWAY_API_KEY;

    ({ default: app } = await import('../../agent-gateway/routes'));
  });

  beforeEach(function () {
    commitCapture = undefined;
    revealCapture = undefined;
    registryCalls = [];
    (utils as any).GATEWAY_API_KEY = API_KEY;
    (utils as any).checkEnsSubdomain = async () => 'worker.agent.agi.eth';
    (utils as any).registry = {
      connect: () => ({
        applyForJob: async (...args: unknown[]) => {
          originalRegistry.interface.encodeFunctionData('applyForJob', args);
          registryCalls.push(args);
          return { hash: '0xapplied', wait: async () => {} };
        },
        acknowledgeTaxPolicy: async () => {
          registryCalls.push(['unexpected tax acknowledgement']);
          throw new Error('must not acknowledge invalid submissions');
        },
      }),
    };
    (utils as any).walletManager = {
      get: (address: string) => {
        if (!address) {
          return undefined;
        }
        return { address: ethers.getAddress(address) };
      },
    };
    (utils as any).commitHelper = async (
      jobId: string,
      wallet: { address: string },
      approve: boolean,
      salt?: string
    ) => {
      commitCapture = {
        jobId,
        wallet: wallet.address,
        approve,
        salt,
      };
      return { tx: '0x1', salt: salt ?? '0x0', commitHash: '0x2' };
    };
    (utils as any).revealHelper = async (
      jobId: string,
      wallet: { address: string },
      approve?: boolean,
      salt?: string
    ) => {
      revealCapture = {
        jobId,
        wallet: wallet.address,
        approve,
        salt,
      };
      return { tx: '0x3' };
    };
  });

  afterEach(function () {
    (utils as any).walletManager = originalWalletManager;
    (utils as any).commitHelper = originalCommitHelper;
    (utils as any).revealHelper = originalRevealHelper;
    (utils as any).registry = originalRegistry;
    (utils as any).checkEnsSubdomain = originalCheckEnsSubdomain;
    (utils as any).GATEWAY_API_KEY = originalApiKey;
  });

  after(function () {
    process.env.JOB_REGISTRY_ADDRESS = envBackup.JOB_REGISTRY_ADDRESS;
    process.env.VALIDATION_MODULE_ADDRESS = envBackup.VALIDATION_MODULE_ADDRESS;
    process.env.STAKE_MANAGER_ADDRESS = envBackup.STAKE_MANAGER_ADDRESS;
    process.env.KEYSTORE_URL = envBackup.KEYSTORE_URL;
    process.env.GATEWAY_API_KEY = envBackup.GATEWAY_API_KEY;
  });

  it('coerces string boolean values for commit requests', async function () {
    const response = await request(app)
      .post('/jobs/42/commit')
      .set('X-Api-Key', API_KEY)
      .send({ address: WALLET, approve: 'false', salt: ' 0x1234 ' });

    expect(response.status).to.equal(200);
    expect(commitCapture).to.not.equal(undefined);
    expect(commitCapture?.approve).to.equal(false);
    expect(commitCapture?.wallet).to.equal(WALLET);
    expect(commitCapture?.salt).to.equal('0x1234');
  });

  it('rejects invalid boolean payloads', async function () {
    const response = await request(app)
      .post('/jobs/42/commit')
      .set('X-Api-Key', API_KEY)
      .send({ address: WALLET, approve: 'definitely' });

    expect(response.status).to.equal(400);
    expect(response.body.error).to.match(/boolean/i);
    expect(commitCapture).to.equal(undefined);
  });

  it('returns 503 when wallet manager is not initialised', async function () {
    (utils as any).walletManager = undefined;

    const response = await request(app)
      .post('/jobs/42/commit')
      .set('X-Api-Key', API_KEY)
      .send({ address: WALLET, approve: true });

    expect(response.status).to.equal(503);
    expect(commitCapture).to.equal(undefined);
  });

  it('returns 400 when wallet is unknown', async function () {
    (utils as any).walletManager = {
      get: () => undefined,
    };

    const response = await request(app)
      .post('/jobs/42/commit')
      .set('X-Api-Key', API_KEY)
      .send({ address: WALLET, approve: true });

    expect(response.status).to.equal(400);
    expect(commitCapture).to.equal(undefined);
  });

  it('parses optional approve flag for reveal route', async function () {
    const response = await request(app)
      .post('/jobs/42/reveal')
      .set('X-Api-Key', API_KEY)
      .send({ address: WALLET.toLowerCase(), approve: 'true' });

    expect(response.status).to.equal(200);
    expect(revealCapture?.approve).to.equal(true);
    expect(revealCapture?.wallet).to.equal(WALLET);
  });

  it('allows reveal without approve override', async function () {
    const response = await request(app)
      .post('/jobs/42/reveal')
      .set('X-Api-Key', API_KEY)
      .send({ address: WALLET, salt: '0x99' });

    expect(response.status).to.equal(200);
    expect(revealCapture?.approve).to.equal(undefined);
    expect(revealCapture?.salt).to.equal('0x99');
  });

  it('applies with the verified ENS label and current proof array', async function () {
    const response = await request(app)
      .post('/jobs/42/apply')
      .set('X-Api-Key', API_KEY)
      .send({ address: WALLET, proofBytes: [ethers.ZeroHash] });
    expect(response.status).to.equal(200);
    expect(registryCalls).to.deep.equal([['42', 'worker', [ethers.ZeroHash]]]);
  });

  for (const endpoint of ['apply', 'submit', 'deliverables']) {
    it(`rejects malformed ${endpoint} identity proofs before chain writes`, async function () {
      const response = await request(app)
        .post(`/jobs/42/${endpoint}`)
        .set('X-Api-Key', API_KEY)
        .send({
          address: WALLET,
          proofBytes: '0x1234',
          resultUri: 'ipfs://result',
        });
      expect(response.status).to.equal(400);
      expect(response.body.error).to.match(/bytes32/);
      expect(registryCalls).to.deep.equal([]);
    });
  }

  it('rejects finalizeOnly as a client error before chain writes', async function () {
    const response = await request(app)
      .post('/jobs/42/deliverables')
      .set('X-Api-Key', API_KEY)
      .send({
        address: WALLET,
        finalizeOnly: true,
        resultUri: 'ipfs://result',
      });
    expect(response.status).to.equal(400);
    expect(response.body.error).to.match(/finalizeOnly/);
    expect(registryCalls).to.deep.equal([]);
  });

  for (const attestation of [
    { signature: '' },
    { signature: null },
    { signature: 7 },
    { signature: {} },
    { signedPayload: '' },
    { signedPayload: null },
  ]) {
    it(`rejects explicitly malformed attestation ${JSON.stringify(
      attestation
    )} before chain writes`, async function () {
      const response = await request(app)
        .post('/jobs/42/deliverables')
        .set('X-Api-Key', API_KEY)
        .send({ address: WALLET, resultUri: 'ipfs://result', ...attestation });
      expect(response.status).to.equal(400);
      expect(response.body.error).to.match(/attestation|signedPayload/);
      expect(registryCalls).to.deep.equal([]);
    });
  }

  it('routes legacy submit through the shared validated submission pipeline', async function () {
    const actions = await import('../../agent-gateway/agentActions');
    const originalSubmit = actions.submitDeliverable;
    let captured: Parameters<typeof actions.submitDeliverable>[0];
    (actions as any).submitDeliverable = async (options: typeof captured) => {
      captured = options;
      return { txHash: '0xsubmitted', deliverable: { id: 'fixture' } };
    };
    try {
      const response = await request(app)
        .post('/jobs/42/submit')
        .set('X-Api-Key', API_KEY)
        .send({ address: WALLET, result: 'ipfs://result', proofBytes: '0x' });
      expect(response.status).to.equal(200);
      expect(response.body).to.deep.equal({
        tx: '0xsubmitted',
        deliverable: { id: 'fixture' },
      });
      expect(captured!.jobId).to.equal('42');
      expect(captured!.wallet.address).to.equal(WALLET);
      expect(captured!.resultHash).to.equal(ethers.id('ipfs://result'));
      expect(captured!.resultUri).to.equal('ipfs://result');
      expect(captured!.proofBytes).to.deep.equal([]);
      expect(captured!.metadata).to.deep.equal({
        source: 'legacy-submit-endpoint',
      });
      expect(registryCalls).to.deep.equal([]);
    } finally {
      (actions as any).submitDeliverable = originalSubmit;
    }
  });

  async function signedRequest(
    path: string,
    signer: ethers.HDNodeWallet,
    body: unknown
  ) {
    const { body: challenge } = await request(app).get('/auth/challenge');
    return request(app)
      .post(path)
      .set('X-Address', signer.address)
      .set('X-Signature', await signer.signMessage(challenge.challenge))
      .send(body);
  }

  function managedWallets(...wallets: ethers.HDNodeWallet[]) {
    (utils as any).walletManager = {
      get: (address: string) =>
        wallets.find(
          (wallet) => wallet.address.toLowerCase() === address.toLowerCase()
        ),
    };
  }

  it('rejects an unmanaged nonce signer before a managed-wallet action', async function () {
    const managed = ethers.Wallet.createRandom();
    const outsider = ethers.Wallet.createRandom();
    managedWallets(managed);
    const response = await signedRequest('/jobs/42/commit', outsider, {
      address: managed.address,
      approve: true,
    });
    expect(response.status).to.equal(401);
    expect(commitCapture).to.equal(undefined);
    expect(registryCalls).to.deep.equal([]);
  });

  for (const endpoint of [
    'apply',
    'submit',
    'deliverables',
    'heartbeat',
    'telemetry',
    'commit',
    'reveal',
  ]) {
    it(`rejects a managed signer impersonating another wallet for ${endpoint}`, async function () {
      const signer = ethers.Wallet.createRandom();
      const other = ethers.Wallet.createRandom();
      managedWallets(signer, other);
      const response = await signedRequest(`/jobs/42/${endpoint}`, signer, {
        address: other.address,
        approve: true,
        result: 'ipfs://result',
      });
      expect(response.status).to.equal(403);
      expect(commitCapture).to.equal(undefined);
      expect(revealCapture).to.equal(undefined);
      expect(registryCalls).to.deep.equal([]);
    });
  }

  for (const action of [
    'stake/ensure',
    'stake/request-withdraw',
    'stake/finalize-withdraw',
    'stake/withdraw',
    'rewards/claim',
  ]) {
    it(`rejects a managed signer spending another wallet through ${action}`, async function () {
      const signer = ethers.Wallet.createRandom();
      const other = ethers.Wallet.createRandom();
      managedWallets(signer, other);
      const response = await signedRequest(
        `/agents/${other.address}/${action}`,
        signer,
        { amount: '1' }
      );
      expect(response.status).to.equal(403);
      expect(registryCalls).to.deep.equal([]);
    });
  }

  for (const endpoint of [
    '/agents',
    '/audit/anchors',
    '/spawn/blueprints',
    '/employer/plans',
    '/employer/plans/plan/launch',
    '/employer/jobs',
    '/security/quarantine/release',
  ]) {
    it(`requires operator authority for ${endpoint}`, async function () {
      const signer = ethers.Wallet.createRandom();
      managedWallets(signer);
      const response = await signedRequest(endpoint, signer, {
        address: signer.address,
      });
      expect(response.status).to.equal(403);
      expect(response.body.error).to.match(/operator API key/);
      expect(registryCalls).to.deep.equal([]);
    });
  }

  it('requires an operator API key before overwriting registered dispatch routes', async function () {
    const id = 'authorization-regression';
    const previous = utils.agents.get(id);
    const queued = utils.pendingJobs.get(id);
    try {
      const unauthenticated = await request(app).post('/agents').send({
        id,
        wallet: WALLET,
        url: 'https://worker.example.invalid',
      });
      expect(unauthenticated.status).to.equal(401);
      expect(utils.agents.get(id)).to.equal(previous);
      const registered = await request(app)
        .post('/agents')
        .set('X-Api-Key', API_KEY)
        .send({
          id,
          wallet: WALLET,
          url: 'https://worker.example.invalid',
        });
      expect(registered.status).to.equal(200);
      expect(utils.agents.get(id)?.wallet).to.equal(WALLET);
    } finally {
      if (previous) utils.agents.set(id, previous);
      else utils.agents.delete(id);
      if (queued) utils.pendingJobs.set(id, queued);
      else utils.pendingJobs.delete(id);
    }
  });

  for (const invalid of [
    { id: {} },
    { id: ' ' },
    { id: 'x'.repeat(257) },
    { id: 'worker\nname' },
    { wallet: {} },
    { wallet: 'not-an-address' },
    { url: 7 },
    { url: '' },
    { url: '/relative' },
    { url: 'file:///etc/passwd' },
    { url: 'https://user:password@worker.invalid' },
    { url: 'http://:password@localhost:8080' },
    { url: `https://worker.invalid/${'x'.repeat(2048)}` },
  ]) {
    it(`rejects invalid dispatch registration ${JSON.stringify(invalid).slice(
      0,
      75
    )} before mutation`, async function () {
      const before = Array.from(utils.agents.entries());
      const queues = Array.from(utils.pendingJobs.entries());
      const response = await request(app)
        .post('/agents')
        .set('X-Api-Key', API_KEY)
        .send({ id: 'input-regression', wallet: WALLET, ...invalid });
      expect(response.status).to.equal(400);
      expect(Array.from(utils.agents.entries())).to.deep.equal(before);
      expect(Array.from(utils.pendingJobs.entries())).to.deep.equal(queues);
    });
  }

  it('allows an operator to register a commissioned localhost HTTP worker', async function () {
    const id = 'local-input-regression';
    try {
      const response = await request(app)
        .post('/agents')
        .set('X-Api-Key', API_KEY)
        .send({ id, wallet: WALLET, url: 'http://localhost:8080/jobs' });
      expect(response.status).to.equal(200);
      expect(utils.agents.get(id)?.url).to.equal('http://localhost:8080/jobs');
    } finally {
      utils.agents.delete(id);
      utils.pendingJobs.delete(id);
    }
  });

  it('expires old HTTP challenges and refreshes the legacy nonce endpoint', async function () {
    const signer = ethers.Wallet.createRandom();
    managedWallets(signer);
    const { body: challenge } = await request(app).get('/auth/challenge');
    const signature = await signer.signMessage(challenge.challenge);
    const realNow = Date.now;
    try {
      Date.now = () => Date.parse(challenge.expiresAt);
      const { body: legacy } = await request(app).get('/nonce');
      expect(legacy.nonce).not.to.equal(challenge.nonce);
      const repeatedRead = await request(app).get('/auth/challenge');
      expect(repeatedRead.body.nonce).to.equal(legacy.nonce);
      const expired = await request(app)
        .post('/jobs/42/commit')
        .set('X-Address', signer.address)
        .set('X-Signature', signature)
        .send({ address: signer.address, approve: true });
      expect(expired.status).to.equal(401);
      expect(commitCapture).to.equal(undefined);
    } finally {
      Date.now = realNow;
    }
  });

  it('allows the managed signer to act only as itself and rejects challenge replay', async function () {
    const signer = ethers.Wallet.createRandom();
    managedWallets(signer);
    const { body: challenge } = await request(app).get('/auth/challenge');
    const signature = await signer.signMessage(challenge.challenge);
    const send = () =>
      request(app)
        .post('/jobs/42/commit')
        .set('X-Address', signer.address)
        .set('X-Signature', signature)
        .send({ address: signer.address.toLowerCase(), approve: true });
    expect((await send()).status).to.equal(200);
    expect(commitCapture?.wallet).to.equal(signer.address);
    commitCapture = undefined;
    expect((await send()).status).to.equal(401);
    expect(commitCapture).to.equal(undefined);
  });
});
