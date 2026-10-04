import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  order: [] as string[],
  failIngestion: false,
  options: undefined as any,
}));
vi.mock('../src/config.js', () => ({
  loadConfig: () => ({ port: 4100, rateLimitMax: 10 }),
}));
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    $disconnect: async () => {
      state.order.push('disconnect');
    },
  },
}));
vi.mock('../src/services/networkx-validator.js', () => ({
  NetworkXInfluenceValidator: class {},
}));
vi.mock('../src/services/influence-service.js', () => ({
  InfluenceService: class {
    async recompute() {
      state.order.push('recompute');
    }
    getLastValidation() {
      return { valid: true };
    }
  },
}));
vi.mock('../src/services/event-ingestion-service.js', () => ({
  EventIngestionService: class {
    async start() {
      state.order.push('ingest');
      if (state.failIngestion) throw new Error('RPC unavailable');
    }
    async stop() {
      state.order.push('stop-ingest');
    }
  },
}));
vi.mock('../src/services/data-integrity-service.js', () => ({
  DataIntegrityService: class {
    start() {
      state.order.push('integrity');
    }
    async runChecksums() {
      state.order.push('checksums');
    }
    stop() {
      state.order.push('stop-integrity');
    }
    getStatus() {
      return { healthy: true };
    }
  },
}));
vi.mock('../src/server.js', () => ({
  createServer: async (_db: unknown, options: unknown) => {
    state.options = options;
    return {
      app: {
        listen: async (address: unknown) => {
          state.order.push('listen');
          expect(address).toEqual({ port: 4100, host: '0.0.0.0' });
        },
        close: async () => {
          state.order.push('close');
        },
      },
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
  state.order = [];
  state.failIngestion = false;
  state.options = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe('indexer process lifecycle', () => {
  it('initializes data before listening and closes services before disconnecting the database', async () => {
    const handlers = new Map<string, () => Promise<void>>();
    vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      callback: () => Promise<void>,
    ) => {
      handlers.set(event, callback);
      return process;
    }) as any);
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await import('../src/index.js');
    await vi.waitFor(() => expect(handlers.has('SIGTERM')).toBe(true));
    expect(state.order).toEqual([
      'recompute',
      'ingest',
      'integrity',
      'checksums',
      'listen',
    ]);
    expect(state.options.integrityStatusProvider()).toEqual({ healthy: true });
    expect(state.options.validationStatusProvider()).toEqual({ valid: true });
    expect(handlers.get('SIGINT')).toBe(handlers.get('SIGTERM'));
    await handlers.get('SIGTERM')!();
    expect(state.order.slice(-4)).toEqual([
      'stop-ingest',
      'stop-integrity',
      'close',
      'disconnect',
    ]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits unsuccessfully without serving when initial ingestion fails', async () => {
    state.failIngestion = true;
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('../src/index.js');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(state.order).toEqual(['recompute', 'ingest']);
    expect(error).toHaveBeenCalledWith(
      'Failed to start culture graph indexer',
      expect.any(Error),
    );
  });
});
