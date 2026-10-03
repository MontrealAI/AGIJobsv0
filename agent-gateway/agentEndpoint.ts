/** HTTP transport shared by the gateway and its provider-contract rehearsal. */
export async function invokeAgentEndpoint(
  endpoint: string,
  payload: unknown,
  timeoutMs: number,
  maxResponseBytes = 1024 * 1024
): Promise<unknown> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('Agent timeout must be a positive integer');
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0)
    throw new Error('Agent response limit must be a positive integer');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Agent provider returned HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('Agent provider returned an empty response');
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxResponseBytes) {
        await reader.cancel();
        throw new Error('Agent provider response exceeds the size limit');
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text.trim())
      throw new Error('Agent provider returned an empty response');
    const contentType = res.headers.get('content-type') || '';
    if (/\bjson\b/i.test(contentType)) {
      try {
        const value: unknown = JSON.parse(text);
        if (value === null) throw new Error('null response');
        return value;
      } catch {
        throw new Error('Agent provider returned invalid JSON');
      }
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}
