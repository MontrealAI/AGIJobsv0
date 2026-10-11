import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { packToFs } from 'ipfs-car/pack/fs';
import { CarReader } from '@ipld/car';
import {
  readW3upConfig, createW3upClient, uploadCarBytes, uploadCarFile,
} from '../../lib/w3up-upload.mjs';

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'w3up-compat-'));
  const input = path.join(dir, 'public');
  await fs.mkdir(input);
  await fs.writeFile(path.join(input, 'index.html'), '<h1>Public test</h1>');
  await fs.writeFile(path.join(input, 'receipt.json'), '{"stage":"test"}\n');
  const output = path.join(dir, 'public.car');
  const { root } = await packToFs({ input, output, wrapWithDirectory: true });
  const bytes = new Uint8Array(await fs.readFile(output));
  const calls = [];
  const client = {
    async uploadCAR(blob) {
      calls.push(['upload', new Uint8Array(await blob.arrayBuffer())]);
      return root;
    },
    capability: { upload: { async get(cid) {
      calls.push(['get', cid.toString()]);
      return { root, shards: [root] };
    } } },
  };
  return { dir, output, root, bytes, calls, client,
    close: () => fs.rm(dir, { recursive: true, force: true }) };
}

test('configuration does not accept legacy bearer tokens or invent a space', () => {
  for (const env of [{}, { WEB3_STORAGE_TOKEN: 'private-secret' }, { ONEBOX_W3S_TOKEN: 'secret' }]) {
    assert.throws(() => readW3upConfig(env), /W3UP_CONFIGURATION_REQUIRED/);
  }
});
test('configuration requires all three bounded values', () => {
  const good = { W3UP_KEY: 'key', W3UP_PROOF: 'proof', W3UP_SPACE_DID: 'did:key:z6Mkgood' };
  assert.equal(readW3upConfig(good).space, good.W3UP_SPACE_DID);
  for (const key of Object.keys(good)) {
    assert.throws(() => readW3upConfig({ ...good, [key]: '' }));
    assert.throws(() => readW3upConfig({ ...good, [key]: 'x'.repeat(2 * 1024 * 1024 + 1) }));
  }
  assert.throws(() => readW3upConfig({ ...good, W3UP_SPACE_DID: 'https://private.invalid' }), /SPACE_DID_INVALID/);
});
test('invalid principal/proof error cannot leak either secret or a cause', async () => {
  await assert.rejects(createW3upClient({ W3UP_KEY: 'key-secret', W3UP_PROOF: 'proof-secret', W3UP_SPACE_DID: 'did:key:z6Mkgood' }),
    (error) => error.message.startsWith('W3UP_AUTHORIZATION_INVALID') &&
      !String(error).includes('secret') && error.cause === undefined);
});
test('installed w3up client supports in-memory Ed25519 agents without provisioning', async () => {
  const [{ create }, Signer, { StoreMemory }] = await Promise.all([
    import('@storacha/client'), import('@ucanto/principal/ed25519'),
    import('@storacha/client/stores/memory'),
  ]);
  const principal = await Signer.generate();
  const client = await create({ principal, store: new StoreMemory() });
  assert.equal(client.did(), principal.did());
  assert.equal(typeof client.uploadCAR, 'function');
  assert.equal(typeof client.capability.upload.get, 'function');
  assert.equal(client.currentSpace(), undefined);
});
test('existing CAR bytes and root are preserved; readback is not invented pin/deal evidence', async () => {
  const f = await fixture();
  try {
    const result = await uploadCarFile(f.output, f.root.toString(), { client: f.client });
    assert.equal(result.cid, f.root.toString());
    assert.equal(result.status.confirmation, 'upload-index-readback');
    assert.equal(result.status.storageDealsVerified, false);
    assert.equal(Object.hasOwn(result.status, 'pins'), false);
    assert.equal(f.calls.length, 2);
    assert.deepEqual(f.calls[0][1], f.bytes);
    assert.equal(createHash('sha256').update(f.calls[0][1]).digest('hex'),
      createHash('sha256').update(f.bytes).digest('hex'));
    const roots = await (await CarReader.fromBytes(f.calls[0][1])).getRoots();
    assert.equal(roots[0].toString(), f.root.toString());
    assert.equal(f.calls[1][1], f.root.toString());
  } finally { await f.close(); }
});
test('wrong expected root stops before upload', async () => {
  const f = await fixture();
  try {
    await assert.rejects(uploadCarBytes(f.bytes, 'not-the-root', { client: f.client }), /CAR_ROOT_MISMATCH/);
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});
test('invalid CAR and empty data stop before upload', async () => {
  for (const value of [null, '', new Uint8Array(), new Uint8Array([1, 2, 3])]) {
    await assert.rejects(uploadCarBytes(value, 'root', { client: {} }), /W3UP_CAR_/);
  }
});
test('upload mismatch prevents readback and publication', async () => {
  const f = await fixture();
  try {
    f.client.uploadCAR = async () => ({ toString: () => 'wrong-root' });
    await assert.rejects(uploadCarBytes(f.bytes, f.root.toString(), { client: f.client }), /UPLOAD_CID_MISMATCH/);
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});
for (const mode of ['throw', 'null', 'wrapped-ok', 'wrong-root', 'empty-shards', 'invalid-shard']) {
  test(`readback ${mode} is never promoted to a verified upload`, async () => {
    const f = await fixture();
    try {
      f.client.capability.upload.get = async () => {
        if (mode === 'throw') throw new Error('provider credential-secret');
        if (mode === 'null') return null;
        if (mode === 'wrapped-ok') return { ok: { root: f.root, shards: [f.root] } };
        if (mode === 'wrong-root') return { root: 'wrong-root', shards: [f.root] };
        if (mode === 'empty-shards') return { root: f.root, shards: [] };
        return { root: f.root, shards: [{}] };
      };
      await assert.rejects(uploadCarBytes(f.bytes, f.root.toString(), { client: f.client }),
        (error) => /READBACK_FAILED/.test(error.message) && !String(error).includes('credential-secret') && !error.cause);
    } finally { await f.close(); }
  });
}
test('upload errors omit provider details and do not trigger retries in the adapter', async () => {
  const f = await fixture(); let attempts = 0;
  try {
    f.client.uploadCAR = async () => { attempts++; throw new Error('provider secret'); };
    await assert.rejects(uploadCarBytes(f.bytes, f.root.toString(), { client: f.client }),
      (error) => /UPLOAD_FAILED/.test(error.message) && !String(error).includes('secret') && !error.cause);
    assert.equal(attempts, 1);
    assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});
test('local CAR file failures use a fixed diagnostic', async () => {
  await assert.rejects(uploadCarFile('/missing/private-path.car', 'cid'),
    (error) => error.message === 'W3UP_CAR_READ_FAILED' && !error.cause);
});
