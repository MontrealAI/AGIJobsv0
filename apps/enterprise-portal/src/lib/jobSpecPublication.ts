import { keccak256, toUtf8Bytes } from 'ethers';
import { serializeSpecPayload } from './crypto';

const MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_ORIGINS = [
  'https://ipfs.io',
  'https://w3s.link',
  'https://cloudflare-ipfs.com',
];

export interface SpecificationPolicy {
  gateway?: string;
  allowedOrigins?: readonly string[];
  timeoutMs?: number;
}

export interface PublishedSpecification {
  uri: string;
  specHash: string;
}

export function loadSpecificationPolicy(): SpecificationPolicy {
  const origins: unknown = JSON.parse(
    process.env.NEXT_PUBLIC_SPECIFICATION_ORIGINS ||
      JSON.stringify(DEFAULT_ORIGINS)
  );
  if (
    !Array.isArray(origins) ||
    !origins.every((origin) => typeof origin === 'string')
  ) {
    throw new Error(
      'Specification origins must be a JSON array of approved origins'
    );
  }
  return {
    gateway:
      process.env.NEXT_PUBLIC_SPECIFICATION_GATEWAY || 'https://ipfs.io/ipfs',
    allowedOrigins: origins,
  };
}

function endpoint(value: string): URL {
  const url = new URL(value);
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Specification URLs require HTTPS without credentials, query or fragment'
    );
  return url;
}

function ipfsTarget(reference: string, gateway: URL): URL {
  const [cid, ...segments] = reference.split('/');
  if (!/^[a-zA-Z0-9]{1,256}$/.test(cid))
    throw new Error('Invalid IPFS specification identifier');
  const path = [
    cid,
    ...segments.map((segment) => {
      const decoded = decodeURIComponent(segment);
      if (
        !decoded ||
        decoded === '.' ||
        decoded === '..' ||
        /[\\/%?#\x00-\x1f\x7f]/.test(decoded)
      ) {
        throw new Error('Invalid IPFS specification path');
      }
      return encodeURIComponent(decoded);
    }),
  ].join('/');
  const prefix = gateway.pathname.replace(/\/$/, '') + '/';
  const target = new URL(`${gateway.origin}${prefix}${path}`);
  if (target.origin !== gateway.origin || !target.pathname.startsWith(prefix)) {
    throw new Error('Specification escapes the approved gateway');
  }
  return target;
}

export function resolveSpecificationLocation(
  uri: string,
  policy: SpecificationPolicy
): string {
  const value = uri.trim();
  if (!value)
    throw new Error(
      'Publish the downloaded specification and enter its URI before submitting'
    );
  const gateway = endpoint(policy.gateway || 'https://ipfs.io/ipfs');
  if (value.startsWith('ipfs://'))
    return ipfsTarget(value.slice(7), gateway).href;
  const target = endpoint(value);
  const origins = (policy.allowedOrigins || DEFAULT_ORIGINS).map((origin) => {
    const parsed = endpoint(origin);
    if (parsed.pathname !== '/')
      throw new Error('Configure specification origins without paths');
    return parsed.origin;
  });
  if (origins.includes(target.origin)) return target.href;
  const prefix = gateway.pathname.replace(/\/$/, '') + '/';
  if (target.origin === gateway.origin && target.pathname.startsWith(prefix)) {
    const resolved = ipfsTarget(target.pathname.slice(prefix.length), gateway);
    if (resolved.pathname === target.pathname) return target.href;
  }
  throw new Error(
    'This specification origin or gateway path is not approved by the operator'
  );
}

/** The bytes verified here are the same bytes exported for publication. */
export async function verifyPublishedSpecification(
  payload: unknown,
  uri: string,
  policy: SpecificationPolicy = loadSpecificationPolicy(),
  fetcher: typeof fetch = fetch
): Promise<PublishedSpecification> {
  const bytes = toUtf8Bytes(serializeSpecPayload(payload));
  if (bytes.length > MAX_BYTES)
    throw new Error('Specification exceeds the 4 MiB limit');
  const specHash = keccak256(bytes);
  const target = resolveSpecificationLocation(uri, policy);
  const timeoutMs = policy.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15_000) {
    throw new Error('Invalid specification verification timeout');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(target, {
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain;q=0.9' },
    });
    if (!response.ok || !response.body)
      throw new Error(`Specification download failed: HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error('Published specification exceeds the 4 MiB limit');
      }
      chunks.push(value);
    }
    const downloaded = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      downloaded.set(chunk, offset);
      offset += chunk.length;
    }
    if (keccak256(downloaded) !== specHash) {
      throw new Error(
        'Published bytes do not match this draft. Download and publish the current specification without editing or reformatting it'
      );
    }
    return { uri: uri.trim(), specHash };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** No wallet call is made until retrieval and the exact byte commitment succeed. */
export async function submitPublishedSpecification<T>(
  payload: unknown,
  uri: string,
  submit: (specification: PublishedSpecification) => Promise<T>,
  policy?: SpecificationPolicy,
  fetcher?: typeof fetch
): Promise<T> {
  const verified = await verifyPublishedSpecification(
    payload,
    uri,
    policy,
    fetcher
  );
  return submit(verified);
}
