import { normalizeAgentEndpoint } from './agentPolicy';

export function resolveArtifactUri(uri: string, gateway?: string): string {
  if (!uri.startsWith('ipfs://')) return uri;
  const [cid, ...segments] = uri.slice(7).split('/');
  // Restrict reference syntax before URL normalization. CID decoding/retrieval
  // belongs to the gateway; an invalid identifier must never escape its prefix.
  if (!/^[a-zA-Z0-9]{1,256}$/.test(cid))
    throw new Error('Invalid IPFS identifier');
  const safeSegments = segments.map((segment) => {
    const decoded = decodeURIComponent(segment);
    if (
      !decoded ||
      decoded === '.' ||
      decoded === '..' ||
      /[\\/%?#\x00-\x1f\x7f]/.test(decoded)
    )
      throw new Error('Invalid IPFS path segment');
    return encodeURIComponent(decoded);
  });
  const base = new URL(
    normalizeAgentEndpoint(
      (gateway || process.env.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs').trim()
    )
  );
  const prefix = base.pathname.replace(/\/$/, '') + '/';
  const target = new URL(
    `${base.origin}${prefix}${[cid, ...safeSegments].join('/')}`
  );
  if (target.origin !== base.origin || !target.pathname.startsWith(prefix))
    throw new Error('IPFS reference escapes gateway prefix');
  return target.href;
}

/** Job-provided URIs cannot grant the orchestrator access to arbitrary origins. */
export async function fetchArtifactBytes(
  target: string,
  trustedGateway?: string
): Promise<Uint8Array> {
  const allowed: unknown = JSON.parse(
    process.env.ORCHESTRATOR_ARTIFACT_ORIGINS ||
      '["https://ipfs.io","https://w3s.link","https://cloudflare-ipfs.com"]'
  );
  if (!Array.isArray(allowed) || !allowed.every((x) => typeof x === 'string'))
    throw new Error('Invalid artifact origin configuration');
  const origins = allowed.map((value) => {
    const url = new URL(normalizeAgentEndpoint(value));
    if (url.pathname !== '/')
      throw new Error('Configure artifact origins without paths');
    return url.origin;
  });
  const url = new URL(normalizeAgentEndpoint(target));
  let approved = origins.includes(url.origin);
  if (!approved && trustedGateway) {
    const gateway = new URL(normalizeAgentEndpoint(trustedGateway));
    const prefix = gateway.pathname.replace(/\/$/, '') + '/';
    if (url.origin === gateway.origin) {
      if (url.pathname === gateway.pathname) approved = true;
      else if (url.pathname.startsWith(prefix)) {
        // A configured gateway grants its route, not arbitrary same-origin
        // admin endpoints. Apply the same traversal rules to direct HTTP URLs.
        const resolved = resolveArtifactUri(
          `ipfs://${url.pathname.slice(prefix.length)}`,
          trustedGateway
        );
        approved = new URL(resolved).pathname === url.pathname;
      }
    }
  }
  if (!approved)
    throw new Error(
      'Artifact origin or gateway path is not approved by the operator'
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain;q=0.9' },
    });
    if (!response.ok || !response.body)
      throw new Error(`Artifact download failed: HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Artifact exceeds 4 MiB limit');
      }
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
