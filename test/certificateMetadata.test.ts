import { expect } from 'chai';
import { ethers } from 'ethers';
import { setIpfsClientFactory, resetIpfsClient } from '../agent-gateway/ipfsClient';

interface MockStat {
  cid: { toString: () => string } | string;
}

describe('certificateMetadata', () => {
  const originalFetch = global.fetch;
  const originalIpnsKey = process.env.CERTIFICATE_IPNS_KEY;
  const originalEnv = {
    JOB_REGISTRY_ADDRESS: process.env.JOB_REGISTRY_ADDRESS,
    VALIDATION_MODULE_ADDRESS: process.env.VALIDATION_MODULE_ADDRESS,
    KEYSTORE_URL: process.env.KEYSTORE_URL,
    KEYSTORE_TOKEN: process.env.KEYSTORE_TOKEN,
    AGIALPHA_NETWORK: process.env.AGIALPHA_NETWORK,
  };
  let publishCertificateMetadata: typeof import('../agent-gateway/certificateMetadata')['publishCertificateMetadata'];

  before(async () => {
    process.env.JOB_REGISTRY_ADDRESS =
      process.env.JOB_REGISTRY_ADDRESS ||
      '0x0000000000000000000000000000000000000001';
    process.env.VALIDATION_MODULE_ADDRESS =
      process.env.VALIDATION_MODULE_ADDRESS ||
      '0x0000000000000000000000000000000000000002';
    process.env.KEYSTORE_URL =
      process.env.KEYSTORE_URL || 'https://keystore.example';
    process.env.KEYSTORE_TOKEN = process.env.KEYSTORE_TOKEN || 'test-token';
    process.env.AGIALPHA_NETWORK = process.env.AGIALPHA_NETWORK || 'sepolia';
    process.env.CERTIFICATE_IPNS_KEY =
      process.env.CERTIFICATE_IPNS_KEY || 'k51qzi5uqu5dlxexample';

    ({ publishCertificateMetadata } = await import(
      '../agent-gateway/certificateMetadata'
    ));
  });

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
    process.env.CERTIFICATE_IPNS_KEY = originalIpnsKey;
    setIpfsClientFactory(null);
    resetIpfsClient();
  });

  after(() => {
    process.env.JOB_REGISTRY_ADDRESS = originalEnv.JOB_REGISTRY_ADDRESS;
    process.env.VALIDATION_MODULE_ADDRESS =
      originalEnv.VALIDATION_MODULE_ADDRESS;
    process.env.KEYSTORE_URL = originalEnv.KEYSTORE_URL;
    process.env.KEYSTORE_TOKEN = originalEnv.KEYSTORE_TOKEN;
    process.env.AGIALPHA_NETWORK = originalEnv.AGIALPHA_NETWORK;
  });

  it('publishes normalized metadata with SLA details and IPNS URI', async () => {
    const slaSpec = {
      sla: {
        uri: 'https://example.com/sla',
        requiresSignature: true,
        title: 'Standard SLA',
        version: '1.2.3',
        summary: 'Uptime and response guarantees',
        hash: '0xabcdef',
      },
    };

    global.fetch = (async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => slaSpec,
    })) as any;

    const writes: Array<{ path: string; payload: string }> = [];
    const stats: Record<string, MockStat> = {
      '/certificates/42': {
        cid: {
          toString: () => 'bafy-file-cid',
        },
      },
      '/certificates': {
        cid: 'bafy-directory-cid',
      },
    };

    const publishArgs: Array<{ path: string; key: string }> = [];

    const mockClient = {
      files: {
        mkdir: async () => {},
        write: async (path: string, data: Buffer) => {
          writes.push({ path, payload: data.toString('utf8') });
        },
        stat: async (path: string) => stats[path],
      },
      name: {
        publish: async (path: string, options: { key: string }) => {
          publishArgs.push({ path, key: options.key });
          return { name: 'k51qzi5uqu5dlxtarget' };
        },
      },
    } as any;

    setIpfsClientFactory(() => mockClient);

    const rawHash = 'A'.repeat(64);

    const result = await publishCertificateMetadata({
      jobId: '42',
      agent: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      resultHash: rawHash,
      resultUri: 'ipfs://bafy-result',
      resultCid: 'bafy-result',
      signature: '0x'.padEnd(132, '1'),
      success: true,
      submittedAt: '2024-01-01T00:00:00.000Z',
      submissionMethod: 'finalizeJob',
      txHash: '0x1234',
      job: {
        employer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        agent: '0xcccccccccccccccccccccccccccccccccccccccc',
        specUri: 'ipfs://bafy-spec',
        specHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        uriHash: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      },
    });

    expect(result).to.not.be.null;
    expect(result?.uri).to.equal('ipfs://k51qzi5uqu5dlxtarget/42');
    expect(result?.cid).to.equal('bafy-file-cid');
    expect(result?.ipnsName).to.equal('k51qzi5uqu5dlxtarget');

    expect(publishArgs).to.deep.equal([
      {
        path: '/ipfs/bafy-directory-cid',
        key: 'k51qzi5uqu5dlxexample',
      },
    ]);

    expect(writes).to.have.lengthOf(1);
    expect(writes[0].path).to.equal('/certificates/42');

    const parsed = JSON.parse(writes[0].payload);
    expect(parsed.resultHash).to.equal('0x' + rawHash.toLowerCase());
    expect(parsed.deliverable.hash).to.equal('0x' + rawHash.toLowerCase());
    expect(parsed.deliverable.uri).to.equal('ipfs://bafy-result');
    expect(parsed.deliverable.cid).to.equal('bafy-result');
    expect(parsed.deliverable.signature).to.equal('0x'.padEnd(132, '1'));
    expect(parsed.deliverable.method).to.equal('finalizeJob');
    expect(parsed.deliverable.submittedAt).to.equal('2024-01-01T00:00:00.000Z');
    expect(parsed.signatureAlgorithm).to.equal('eip191');
    expect(parsed.slaUri).to.equal('https://example.com/sla');
    expect(parsed.sla).to.deep.equal({
      uri: 'https://example.com/sla',
      requiresSignature: true,
      title: 'Standard SLA',
      version: '1.2.3',
      summary: 'Uptime and response guarantees',
      termsHash: '0xabcdef',
    });
    expect(parsed.proofs.result.hash).to.equal('0x' + rawHash.toLowerCase());
    expect(parsed.proofs.result.uriHash).to.equal(
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    );
    expect(parsed.job.agent).to.equal(
      ethers.getAddress('0xcccccccccccccccccccccccccccccccccccccccc')
    );
    expect(parsed.job.employer).to.equal(
      ethers.getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    );
    expect(parsed.job.specUri).to.equal('ipfs://bafy-spec');
    expect(parsed.job.specHash).to.equal(
      '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    );
    expect(parsed.job.uriHash).to.equal(
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    );

    expect(result?.metadata).to.deep.equal(parsed);
  });
});
