import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const subprocess = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => subprocess);
import {
  NetworkXInfluenceValidator,
  NoopInfluenceValidator,
} from '../src/services/networkx-validator.js';
const graph = {
  nodes: ['a', 'b'],
  edges: [
    ['a', 'b'],
    ['b', 'a'],
  ] as [string, string][],
};
const scores = new Map([
  ['a', 0.5],
  ['b', 0.5],
]);
const config = { dampingFactor: 0.85, maxIterations: 100, tolerance: 1e-8 };
let child: EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};
function responds(output: string | null, code = 0, stderr = '') {
  subprocess.spawn.mockImplementation(() => {
    child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => true),
    });
    child.stdin.on('finish', () =>
      queueMicrotask(() => {
        if (output === null) return;
        child.stdout.write(output);
        child.stderr.write(stderr);
        child.emit('close', code);
      }),
    );
    return child;
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  responds(JSON.stringify({ engine: 'networkx', scores: { a: 0.5, b: 0.5 } }));
});

describe('External influence validation', () => {
  it('verifies scores, sends graph/config without shell interpolation, and reports mismatches', async () => {
    const validator = new NetworkXInfluenceValidator({
      pythonCommand: '/safe/python',
      toleranceMultiplier: 2,
    });
    expect(await validator.validate(graph, scores, config)).toMatchObject({
      ok: true,
      skipped: false,
      engine: 'networkx',
      maxDelta: 0,
    });
    expect(subprocess.spawn.mock.calls[0][0]).toBe('/safe/python');
    expect(subprocess.spawn.mock.calls[0][2]).toEqual({
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    responds(
      JSON.stringify({ engine: 'fallback', scores: { a: 0.9, b: 0.1 } }),
    );
    expect(await validator.validate(graph, scores, config)).toMatchObject({
      ok: false,
      skipped: false,
      engine: 'fallback',
      maxDelta: 0.4,
    });
    expect(await validator.validate(graph, new Map(), config)).toMatchObject({
      ok: false,
      skipped: false,
    });
  });
  it('rejects incomplete, malformed, non-numeric, and non-finite scores', async () => {
    for (const output of [
      'not-json',
      '',
      'null',
      '{}',
      JSON.stringify({ engine: 'x', scores: [] }),
      JSON.stringify({ engine: 'x', scores: { a: 0.5 } }),
      JSON.stringify({ engine: 'x', scores: { a: 'NaN', b: 0.5 } }),
      JSON.stringify({ engine: 'x', scores: { a: -1, b: 2 } }),
    ]) {
      responds(output);
      expect(
        await new NetworkXInfluenceValidator().validate(graph, scores, config),
      ).toMatchObject({ ok: false, skipped: true });
    }
    responds(JSON.stringify({ engine: 'x', scores: { a: 0.5, b: 0.5 } }));
    expect(
      await new NetworkXInfluenceValidator().validate(
        graph,
        new Map([['a', NaN]]),
        config,
      ),
    ).toMatchObject({ ok: false, skipped: true });
  });
  it('reports failed processes and kills timeout/output-limit violations', async () => {
    responds('', 2, 'missing dependency');
    expect(
      (await new NetworkXInfluenceValidator().validate(graph, scores, config))
        .error,
    ).toContain('code 2: missing dependency');
    responds(null);
    expect(
      (
        await new NetworkXInfluenceValidator({ timeoutMs: 20 }).validate(
          graph,
          scores,
          config,
        )
      ).error,
    ).toContain('timed out');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    responds('x'.repeat(101));
    expect(
      (
        await new NetworkXInfluenceValidator({ maxOutputBytes: 100 }).validate(
          graph,
          scores,
          config,
        )
      ).error,
    ).toContain('output exceeded limit');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    responds('', 0, 'x'.repeat(101));
    expect(
      (
        await new NetworkXInfluenceValidator({ maxOutputBytes: 100 }).validate(
          graph,
          scores,
          config,
        )
      ).error,
    ).toContain('output exceeded limit');
  });
  it('handles spawn and broken-pipe failures and identifies intentionally skipped verification', async () => {
    responds(null);
    const pending = new NetworkXInfluenceValidator().validate(
      graph,
      scores,
      config,
    );
    child.emit('error', new Error('spawn ENOENT'));
    expect((await pending).error).toBe('spawn ENOENT');
    responds(null);
    const brokenPipe = new NetworkXInfluenceValidator().validate(
      graph,
      scores,
      config,
    );
    child.stdin.emit('error', new Error('EPIPE'));
    expect((await brokenPipe).error).toBe('EPIPE');
    subprocess.spawn.mockImplementation(() => {
      throw 'unavailable';
    });
    expect(
      (await new NetworkXInfluenceValidator().validate(graph, scores, config))
        .error,
    ).toBe('Unknown validation error');
    expect(
      await new NoopInfluenceValidator().validate(graph, scores, config),
    ).toMatchObject({ ok: true, skipped: true, engine: null });
  });
});
