import { normalizeAgentEndpoint } from './agentPolicy';

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
  if (trustedGateway)
    origins.push(new URL(normalizeAgentEndpoint(trustedGateway)).origin);
  const url = new URL(normalizeAgentEndpoint(target));
  if (!origins.includes(url.origin))
    throw new Error('Artifact origin is not approved by the operator');
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
