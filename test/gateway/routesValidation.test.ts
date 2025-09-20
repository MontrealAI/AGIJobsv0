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

    ({ default: app } = await import('../../agent-gateway/routes'));
  });

  beforeEach(function () {
    commitCapture = undefined;
    revealCapture = undefined;
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
});
