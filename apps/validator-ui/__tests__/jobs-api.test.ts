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
    const fetch = vi.fn(
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
    const fetch = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', fetch);
    for (const request of [
      { method: 'POST', query: {} },
      { method: 'GET', query: { jobId: '../admin' } },
      { method: 'GET', query: { jobId: ['1', '2'] } },
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

  it('bounds responses and surfaces malformed or failing upstream services without their private errors', async () => {
    for (const upstream of [
      new Response('[]', { status: 500 }),
      new Response('{}'),
      new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => upstream)
      );
      const res = response();
      await handler({ method: 'GET', query: {} } as any, res);
      expect(res.statusCode).toBe(502);
      expect(res.body.error).toContain('gateway is unavailable');
    }
  });
});
