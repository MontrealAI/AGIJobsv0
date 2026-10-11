import { promises as fs } from 'node:fs';
import { CarReader } from '@ipld/car';

const MAX_CAR_BYTES = 256 * 1024 * 1024;
const fail = (code) => new Error(code);

/** No persistent login, automatic provisioning, or legacy bearer-token fallback. */
export function readW3upConfig(env = process.env) {
  const names = ['W3UP_KEY', 'W3UP_PROOF', 'W3UP_SPACE_DID'];
  const limits = [1024, 2 * 1024 * 1024, 256];
  const values = names.map((name, index) => {
    const value = env[name];
    if (typeof value !== 'string' || !value.trim()) {
      throw fail(`W3UP_CONFIGURATION_REQUIRED: ${names.join(', ')}`);
    }
    if (value.length > limits[index]) throw fail('W3UP_CONFIGURATION_TOO_LARGE');
    return value.trim();
  });
  if (!/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/.test(values[2])) {
    throw fail('W3UP_SPACE_DID_INVALID');
  }
  return { key: values[0], proof: values[1], space: values[2] };
}

export async function createW3upClient(env = process.env) {
  const config = readW3upConfig(env);
  try {
    const [Client, Signer, Proof, Delegation, { StoreMemory }] = await Promise.all([
      import('@storacha/client'),
      import('@ucanto/principal/ed25519'),
      import('@storacha/client/proof'),
      import('@storacha/client/delegation'),
      import('@storacha/client/stores/memory'),
    ]);
    const principal = Signer.parse(config.key);
    let proof;
    // Modern delegation.archive() CARs have an archive descriptor, not the
    // legacy last-block root assumed by the SDK's raw-base64 fallback.
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(config.proof)) {
      const bytes = Buffer.from(config.proof, 'base64');
      if (bytes.toString('base64').replace(/=+$/, '') === config.proof.replace(/=+$/, '')) {
        const extracted = await Delegation.extract(bytes);
        if (extracted.ok) proof = extracted.ok;
      }
    }
    proof ??= await Proof.parse(config.proof);
    const now = Math.floor(Date.now() / 1000);
    if (proof.audience.did() !== principal.did() ||
      (proof.expiration !== Infinity &&
        (!Number.isSafeInteger(proof.expiration) || proof.expiration <= now)) ||
      (proof.notBefore !== undefined &&
        (!Number.isSafeInteger(proof.notBefore) || proof.notBefore > now))) {
      throw fail('W3UP_AUTHORIZATION_INVALID');
    }
    const client = await Client.create({ principal, store: new StoreMemory() });
    const space = await client.addSpace(proof);
    if (space.did() !== config.space) throw fail('W3UP_AUTHORIZATION_INVALID');
    await client.setCurrentSpace(config.space);
    if (client.currentSpace()?.did() !== config.space) {
      throw fail('W3UP_AUTHORIZATION_INVALID');
    }
    return client;
  } catch {
    // Neither the principal nor delegation may appear in diagnostic causes.
    throw fail('W3UP_AUTHORIZATION_INVALID: check the agent, delegation and space');
  }
}

/** Preserve the existing CAR and CID; never silently repack during upload. */
export async function uploadCarBytes(bytes, expectedRoot, options = {}) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_CAR_BYTES) {
    throw fail('W3UP_CAR_SIZE_INVALID');
  }
  let root;
  try {
    const reader = await CarReader.fromBytes(bytes);
    const roots = await reader.getRoots();
    if (roots.length !== 1) throw fail('W3UP_CAR_ROOT_INVALID');
    [root] = roots;
    if (typeof expectedRoot !== 'string' || root.toString() !== expectedRoot) {
      throw fail('W3UP_CAR_ROOT_MISMATCH');
    }
  } catch {
    throw fail('W3UP_CAR_ROOT_MISMATCH: provide a single-root CAR with its exact CID');
  }
  const client = options.client ?? (await createW3upClient(options.env));
  let uploaded;
  try {
    uploaded = await client.uploadCAR(new Blob([bytes]));
  } catch {
    throw fail('W3UP_UPLOAD_FAILED: remote state may exist; inspect before retrying');
  }
  if (uploaded?.toString() !== expectedRoot) {
    throw fail('W3UP_UPLOAD_CID_MISMATCH: do not publish ENS or release metadata');
  }
  let entry;
  try {
    entry = await client.capability.upload.get(root);
    if (!entry || entry.root?.toString() !== expectedRoot ||
      !Array.isArray(entry.shards) || entry.shards.length === 0 ||
      entry.shards.some((shard) => !shard || typeof shard.toString !== 'function' ||
        !root.constructor.asCID(shard))) {
      throw fail('W3UP_READBACK_INVALID');
    }
  } catch {
    throw fail('W3UP_READBACK_FAILED: upload may exist; do not publish ENS or release metadata');
  }
  return {
    cid: expectedRoot,
    status: {
      provider: 'w3up',
      root: expectedRoot,
      shards: entry.shards.map((shard) => shard.toString()),
      confirmation: 'upload-index-readback',
      storageDealsVerified: false,
    },
  };
}

export async function uploadCarFile(carPath, expectedRoot, options = {}) {
  let bytes;
  try {
    const handle = await fs.open(carPath, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > MAX_CAR_BYTES) {
        throw fail('W3UP_CAR_SIZE_INVALID');
      }
      bytes = await handle.readFile();
    } finally {
      await handle.close();
    }
  } catch {
    throw fail('W3UP_CAR_READ_FAILED');
  }
  return uploadCarBytes(bytes, expectedRoot, options);
}
