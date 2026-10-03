import { loadEnvironment } from '../src/env.js';

const original = process.env;
const address = '0x1111111111111111111111111111111111111111';
const key = `0x${'11'.repeat(32)}`;
const token = 'local-test-token-with-at-least-thirty-two-characters';

beforeEach(() => {
  process.env = {};
});
afterEach(() => {
  process.env = original;
});

describe('on-chain configuration requirements', () => {
  it('supports an unconfigured local simulation', () => {
    expect(loadEnvironment().arenaAddress).toBeUndefined();
  });
  it('accepts empty optional Docker environment entries in local simulation', () => {
    process.env.SELF_PLAY_ARENA_ADDRESS = '';
    process.env.SELFPLAY_ARENA_ADDRESS = '';
    process.env.ORCHESTRATOR_PRIVATE_KEY = '';
    process.env.ORCHESTRATOR_API_TOKEN = '';
    expect(loadEnvironment().arenaAddress).toBeUndefined();
  });
  it.each(['SELF_PLAY_ARENA_ADDRESS', 'SELFPLAY_ARENA_ADDRESS'])(
    'accepts the documented and legacy address keys: %s',
    (name) => {
      process.env[name] = address;
      process.env.ORCHESTRATOR_PRIVATE_KEY = key;
      process.env.ORCHESTRATOR_API_TOKEN = token;
      expect(loadEnvironment()).toMatchObject({
        arenaAddress: address,
        apiToken: token,
      });
    },
  );
  it('rejects conflicting address aliases', () => {
    process.env.SELF_PLAY_ARENA_ADDRESS = address;
    process.env.SELFPLAY_ARENA_ADDRESS = `0x${'22'.repeat(20)}`;
    expect(loadEnvironment).toThrow('disagree');
  });
  it('rejects an invalid port', () => {
    process.env.ORCHESTRATOR_PORT = '-1';
    expect(loadEnvironment).toThrow('Invalid environment configuration');
  });
  it('rejects incomplete on-chain configuration', () => {
    process.env.SELF_PLAY_ARENA_ADDRESS = address;
    expect(loadEnvironment).toThrow('Configure both');
  });
  it('requires API authentication before enabling signing', () => {
    process.env.SELF_PLAY_ARENA_ADDRESS = address;
    process.env.ORCHESTRATOR_PRIVATE_KEY = key;
    expect(loadEnvironment).toThrow('requires ORCHESTRATOR_API_TOKEN');
  });
  it('rejects a zero arena address', () => {
    process.env.SELF_PLAY_ARENA_ADDRESS = `0x${'00'.repeat(20)}`;
    process.env.ORCHESTRATOR_PRIVATE_KEY = key;
    process.env.ORCHESTRATOR_API_TOKEN = token;
    expect(loadEnvironment).toThrow('nonzero');
  });
});
