import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../pages/api/jobs';

function response() {
  const res: any = { headers: {}, statusCode: 0, body: undefined };
  res.setHeader = (key: string, value: string) => {
    res.headers[key] = value;
  };
  res.status = (status: number) => {
    res.statusCode = status;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('read-only same-origin jobs proxy', () => {
  it('fetches only the configured jobs endpoint without forwarding browser headers', async () => {
    vi.stubEnv('GATEWAY_URL', 'http://agent-gateway:8090');
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify([{ jobId: '1' }]))
    );
    vi.stubGlobal('fetch', fetch);
    const res = response();
    await handler(
      {
        method: 'GET',
        query: {},
        headers: { authorization: 'private-wallet-data' },
      } as any,
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ jobId: '1' }]);
    const [url, options] = fetch.mock.calls[0] as any;
    expect(String(url)).toBe('http://agent-gateway:8090/jobs');
    expect(options.headers).toEqual({ Accept: 'application/json' });
    expect(options.redirect).toBe('error');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('allows only canonical job identifiers for evidence and rejects writes or path injection', async () => {
    vi.stubEnv('GATEWAY_URL', 'http://agent-gateway:8090');
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('[]')
    );
    vi.stubGlobal('fetch', fetch);
    for (const request of [
      { method: 'POST', query: {} },
      { method: 'GET', query: { jobId: '../admin' } },
      { method: 'GET', query: { jobId: '//untrusted.invalid/path' } },
      { method: 'GET', query: { jobId: 'https://untrusted.invalid/' } },
      { method: 'GET', query: { jobId: '%2f%2funtrusted.invalid' } },
      { method: 'GET', query: { jobId: '42?next=https://untrusted.invalid/' } },
      { method: 'GET', query: { jobId: '42#fragment' } },
      { method: 'GET', query: { jobId: ['1', '2'] } },
      ...[
        '',
        '00',
        '01',
        '-1',
        '+42',
        '0x2a',
        '4.2',
        '4e2',
        '42\n',
        '9'.repeat(78),
        (BigInt(2) ** BigInt(256)).toString(),
      ].map((jobId) => ({ method: 'GET', query: { jobId } })),
    ]) {
      const res = response();
      await handler(request as any, res);
      expect([400, 405]).toContain(res.statusCode);
    }
    expect(fetch).not.toHaveBeenCalled();
    const res = response();
    await handler(
      {
        method: 'GET',
        query: { jobId: '42', url: 'https://untrusted.invalid' },
      } as any,
      res
    );
    expect(String(fetch.mock.calls[0][0])).toBe(
      'http://agent-gateway:8090/jobs/42/deliverables'
    );
    expect(res.statusCode).toBe(200);
  });

  it('keeps the configured origin and removes configured query, fragment and path for both uint256 boundaries', async () => {
    vi.stubEnv(
      'GATEWAY_URL',
      'https://trusted.example:8443/old/path?token=server-only#fragment'
    );
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('[]')
    );
    vi.stubGlobal('fetch', fetch);
    for (const jobId of [
      '0',
      (BigInt(2) ** BigInt(256) - BigInt(1)).toString(),
    ]) {
      const res = response();
      await handler(
        {
          method: 'GET',
          query: { jobId, host: 'untrusted.invalid', protocol: 'http:' },
        } as any,
        res
      );
      expect(res.statusCode).toBe(200);
      const [destination, options] = fetch.mock.calls[
        fetch.mock.calls.length - 1
      ] as any;
      expect(destination.origin).toBe('https://trusted.example:8443');
      expect(destination.pathname).toBe(`/jobs/${jobId}/deliverables`);
      expect(destination.search).toBe('');
      expect(destination.hash).toBe('');
      expect(options.redirect).toBe('error');
    }
    const res = response();
    await handler({ method: 'GET', query: {} } as any, res);
    expect(String(fetch.mock.calls[fetch.mock.calls.length - 1][0])).toBe(
      'https://trusted.example:8443/jobs'
    );
  });

  it('rejects unsafe operator URL configuration without fetching or leaking credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('[]')
    );
    vi.stubGlobal('fetch', fetch);
    for (const base of [
      'file:///private/config',
      'ftp://trusted.example/jobs',
      'http://operator:private-secret@trusted.example',
      'not a URL',
    ]) {
      vi.stubEnv('GATEWAY_URL', base);
      const res = response();
      await handler({ method: 'GET', query: {} } as any, res);
      expect(res.statusCode).toBe(502);
      expect(JSON.stringify(res.body)).not.toContain(base);
      expect(JSON.stringify(res.body)).not.toContain('private-secret');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds responses and surfaces malformed or failing upstream services without their private errors', async () => {
    for (const upstream of [
      new Response('[]', { status: 500 }),
      new Response('{}'),
      new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof globalThis.fetch>(async () => upstream)
      );
      const res = response();
      await handler({ method: 'GET', query: {} } as any, res);
      expect(res.statusCode).toBe(502);
      expect(res.body.error).toContain('gateway is unavailable');
    }
  });
});
