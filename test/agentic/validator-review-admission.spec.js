const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ethers } = require('ethers');
const {
  readPrivateJson,
  readReviewDecision,
  reviewTemplate,
  validateReviewFile,
  writePrivateReport,
} = require('../../apps/validator/review-admission.cjs');

describe('validator explicit review admission', () => {
  let directory, file, context, registry, resultHash, review;
  beforeEach(() => {
    directory = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), 'review-admission-')
    );
    file = path.join(directory, 'reviews.json');
    context = {
      scope: {
        chainId: '31337',
        validationModule: `0x${'11'.repeat(20)}`,
        validator: `0x${'22'.repeat(20)}`,
      },
      jobId: '7',
      nonce: '1',
      specHash: ethers.id('spec'),
      selection: {
        blockNumber: 10,
        blockHash: ethers.id('selection'),
        logIndex: 3,
      },
    };
    registry = `0x${'33'.repeat(20)}`;
    resultHash = ethers.id('reviewed artifact bytes');
    review = reviewTemplate(context, registry, resultHash);
    Object.assign(review.decisions[0], {
      approve: true,
      reviewedBy: 'independent reviewer',
      reviewedAt: '2026-10-08T20:00:00.000Z',
    });
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  function save(data = review) {
    fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
  }
  const lookup = () => readReviewDecision(file, context, registry, resultHash);

  it('admits explicit approval and rejection while missing admission abstains', () => {
    assert.equal(
      readReviewDecision(undefined, context, registry, resultHash),
      null
    );
    save();
    assert.equal(lookup().approve, true);
    review.decisions[0].approve = false;
    save();
    assert.equal(lookup().approve, false);
    review.decisions = [];
    save();
    assert.equal(lookup(), null);
  });
  it('exports an intentionally unapproved template that cannot authorize a transaction', () => {
    const draft = reviewTemplate(context, registry, resultHash);
    assert.equal(draft.decisions[0].approve, null);
    assert.throws(() => validateReviewFile(draft), /VALIDATOR_REVIEW_INVALID/);
  });
  it('binds authority to the exact chain, registry, validation contract and wallet', () => {
    for (const key of [
      'chainId',
      'jobRegistry',
      'validationModule',
      'validator',
    ]) {
      const changed = structuredClone(review);
      changed[key] = key === 'chainId' ? '1' : `0x${'44'.repeat(20)}`;
      save(changed);
      assert.throws(lookup, /VALIDATOR_REVIEW_SCOPE_MISMATCH/);
    }
  });
  it('requires exact job, nonce, canonical selection, spec and result hashes', () => {
    for (const [key, value] of [
      ['jobId', '8'],
      ['nonce', '2'],
      ['specHash', ethers.id('other spec')],
      ['resultHash', ethers.id('other result')],
    ]) {
      const changed = structuredClone(review);
      changed.decisions[0][key] = value;
      save(changed);
      assert.equal(lookup(), null);
    }
    for (const [key, value] of [
      ['blockNumber', 11],
      ['logIndex', 4],
      ['blockHash', ethers.id('reorg')],
    ]) {
      const changed = structuredClone(review);
      changed.decisions[0].selection[key] = value;
      save(changed);
      assert.equal(lookup(), null);
    }
  });
  it('validates every admission and rejects duplicates before selecting a matching entry', () => {
    review.decisions.push({ ...review.decisions[0], approve: false });
    save();
    assert.throws(lookup, /VALIDATOR_REVIEW_DUPLICATE/);
    review.decisions[1].nonce = '2';
    review.decisions[1].approve = 'true';
    save();
    assert.throws(lookup, /VALIDATOR_REVIEW_INVALID/);
  });
  it('rejects invalid reviewer attribution, integer overflow, empty hashes and excessive entries', () => {
    for (const [key, value] of [
      ['reviewedBy', ''],
      ['reviewedAt', 'yesterday'],
      ['nonce', (1n << 256n).toString()],
      ['specHash', ethers.ZeroHash],
      ['resultHash', ethers.ZeroHash],
    ]) {
      const changed = structuredClone(review);
      changed.decisions[0][key] = value;
      assert.throws(
        () => validateReviewFile(changed),
        /VALIDATOR_REVIEW_INVALID/
      );
    }
    review.decisions = Array(1025).fill(review.decisions[0]);
    assert.throws(() => validateReviewFile(review), /VALIDATOR_REVIEW_INVALID/);
  });
  it('rejects public permissions, hardlinks, symlink leaves and symlink ancestors', () => {
    save();
    fs.chmodSync(file, 0o644);
    assert.throws(lookup, /VALIDATOR_REVIEW_PERMISSIONS/);
    fs.chmodSync(file, 0o600);
    fs.linkSync(file, path.join(directory, 'hardlink'));
    assert.throws(lookup, /VALIDATOR_REVIEW_PERMISSIONS/);
    fs.unlinkSync(path.join(directory, 'hardlink'));
    const link = path.join(directory, 'link');
    fs.symlinkSync(file, link);
    assert.throws(() => readPrivateJson(link));
    const dirLink = path.join(directory, 'alias');
    fs.symlinkSync(directory, dirLink);
    assert.throws(
      () => readPrivateJson(path.join(dirLink, 'reviews.json')),
      /VALIDATOR_REVIEW_PATH_UNSAFE/
    );
  });
  it('bounds private reads and rejects malformed JSON and invalid UTF-8', () => {
    fs.writeFileSync(file, Buffer.alloc(1024 * 1024 + 1), { mode: 0o600 });
    assert.throws(lookup, /VALIDATOR_REVIEW_TOO_LARGE/);
    fs.writeFileSync(file, '{');
    assert.throws(lookup, /VALIDATOR_REVIEW_INVALID/);
    fs.writeFileSync(file, Buffer.from([0xff]));
    assert.throws(lookup, /VALIDATOR_REVIEW_INVALID/);
    assert.throws(
      () => readPrivateJson('relative.json'),
      /VALIDATOR_REVIEW_PATH_INVALID/
    );
  });
  it('writes bounded private reports atomically without following an existing symlink', () => {
    const reports = path.join(directory, 'reports');
    writePrivateReport(reports, '1-evaluation.json', { approve: false });
    assert.equal(fs.statSync(reports).mode & 0o777, 0o700);
    assert.equal(
      fs.statSync(path.join(reports, '1-evaluation.json')).mode & 0o777,
      0o600
    );
    const outside = path.join(directory, 'outside');
    fs.writeFileSync(outside, 'preserve');
    fs.symlinkSync(outside, path.join(reports, '2-evaluation.json'));
    writePrivateReport(reports, '2-evaluation.json', { approve: true });
    assert.equal(fs.readFileSync(outside, 'utf8'), 'preserve');
    assert.throws(
      () => writePrivateReport(reports, '../escape.json', {}),
      /VALIDATOR_REPORT_NAME_INVALID/
    );
  });
});
