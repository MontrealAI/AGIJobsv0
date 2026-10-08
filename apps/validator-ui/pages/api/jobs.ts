import type { NextApiRequest, NextApiResponse } from 'next';

// Fixed operator-configured read-only endpoint: do not proxy request URLs,
// headers, credentials, query strings or browser-supplied destinations.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const base =
      process.env.GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL ||
      'http://localhost:8090';
    // Only operator configuration can establish the destination authority.
    // Request data is never an input to the URL constructor or its base URL.
    const url = new URL(base);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('Invalid gateway URL');
    const gatewayOrigin = url.origin;
    url.search = '';
    url.hash = '';
    url.pathname = '/jobs';

    const jobId = req.query.jobId;
    if (jobId !== undefined) {
      if (
        typeof jobId !== 'string' ||
        jobId.length > 78 ||
        !/^(0|[1-9][0-9]*)$/.test(jobId) ||
        BigInt(jobId) >
          BigInt(
            '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
          )
      ) {
        res.status(400).json({ error: 'Invalid job identifier' });
        return;
      }
      // The URL pathname setter cannot replace scheme, host or port. Numeric
      // canonicalization additionally restricts the only variable path segment
      // to a uint256, matching the on-chain job identifier type.
      url.pathname = `/jobs/${BigInt(jobId).toString(10)}/deliverables`;
    }
    if (url.origin !== gatewayOrigin || url.username || url.password)
      throw new Error('Gateway authority changed');
    const upstream = await fetch(url, {
      signal: controller.signal,
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    if (!upstream.ok) throw new Error('Gateway unavailable');
    const reader = upstream.body?.getReader();
    if (!reader) throw new Error('Empty response');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(body)) throw new Error('Invalid jobs response');
    res.status(200).json(body);
  } catch {
    res.status(502).json({
      error:
        'The jobs gateway is unavailable. Check the server GATEWAY_URL and gateway health.',
    });
  } finally {
    clearTimeout(timer);
  }
}
