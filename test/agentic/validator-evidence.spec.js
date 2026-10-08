const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { loadDisputeEvidence } = require('../../apps/validator/evidence');

describe('validator dispute evidence commitments', () => {
  const bytes = ethers.toUtf8Bytes('{"evidence":"independently inspect"}');
  const hash = ethers.keccak256(bytes);
  it('preserves the commitment without making an invented CID request', async () => {
    const result = await loadDisputeEvidence(hash, '', '', async () => {
      throw new Error('must not fetch');
    });
    assert.equal(result.commitment, hash);
    assert.equal(result.verified, false);
    assert.equal(result.error, 'EVIDENCE_LOCATION_REQUIRED');
  });
  it('verifies exact bytes from an operator-configured location', async () => {
    let requested;
    const result = await loadDisputeEvidence(
      hash,
      'https://evidence.example/record/{hash}',
      '',
      async (url) => {
        requested = url;
        return bytes;
      }
    );
    assert.equal(requested, `https://evidence.example/record/${hash}`);
    assert.equal(result.verified, true);
    assert.equal(result.text, new TextDecoder().decode(bytes));
  });
  it('retains the commitment while rejecting mismatched bytes and transport failures', async () => {
    const changed = await loadDisputeEvidence(
      hash,
      'https://evidence.example/{hash}',
      '',
      async () => ethers.toUtf8Bytes('tampered')
    );
    assert.equal(changed.error, 'EVIDENCE_HASH_MISMATCH');
    assert.equal(changed.text, '');
    const unavailable = await loadDisputeEvidence(
      hash,
      'https://evidence.example/{hash}',
      '',
      async () => {
        throw new Error('private provider details');
      }
    );
    assert.equal(unavailable.error, 'EVIDENCE_UNAVAILABLE');
    assert.equal(unavailable.commitment, hash);
    assert.ok(
      !JSON.stringify(unavailable).includes('private provider details')
    );
  });
  it('validates template and commitment before requesting bytes and retains explicit legacy mappings', async () => {
    let calls = 0;
    const read = async () => {
      calls++;
      return bytes;
    };
    assert.equal(
      (
        await loadDisputeEvidence(
          'not-a-hash',
          'https://evidence.example/{hash}',
          '',
          read
        )
      ).error,
      'INVALID_EVIDENCE_HASH'
    );
    assert.equal(
      (
        await loadDisputeEvidence(
          hash,
          'https://evidence.example/{hash}/{hash}',
          '',
          read
        )
      ).error,
      'EVIDENCE_TEMPLATE_INVALID'
    );
    assert.equal(calls, 0);
    assert.equal(
      (
        await loadDisputeEvidence(
          hash,
          '',
          'https://evidence.example/by-hash/',
          read
        )
      ).verified,
      true
    );
  });
});
