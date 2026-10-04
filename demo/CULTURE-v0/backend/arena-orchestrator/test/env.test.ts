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

describe('local listener and configuration safety', () => {
  it('binds local simulation to loopback', () => {
    expect(loadEnvironment().host).toBe('127.0.0.1');
  });
  it('requires a token for a network listener', () => {
    process.env.ORCHESTRATOR_HOST = '0.0.0.0';
    expect(loadEnvironment).toThrow('Non-loopback');
    process.env.ORCHESTRATOR_API_TOKEN = token;
    expect(loadEnvironment().host).toBe('0.0.0.0');
  });
  it('rejects reversed difficulty bounds', () => {
    process.env.MIN_DIFFICULTY = '10';
    expect(loadEnvironment).toThrow('MIN_DIFFICULTY');
  });
  it('rejects reversed Elo bounds', () => {
    process.env.ELO_MIN_RATING = '2000';
    process.env.ELO_MAX_RATING = '1000';
    expect(loadEnvironment).toThrow('ELO_MIN_RATING');
  });
  it('accepts finite PID and explicit Elo bounds', () => {
    Object.assign(process.env, {
      DIFFICULTY_KI: '0.2',
      DIFFICULTY_KD: '0.1',
      DIFFICULTY_INTEGRAL_DECAY: '0.5',
      DIFFICULTY_MAX_INTEGRAL: '3',
      ELO_MIN_RATING: '800',
      ELO_MAX_RATING: '2400',
    });
    expect(loadEnvironment().arena.maxIntegral).toBe(3);
  });
});
