import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { eloUpdate, EloEngine } from '../src/elo.js';
import { jsonFileAdapter } from '../src/persistence.js';

describe('eloUpdate', () => {
  it('awards rating to the winner', () => {
    const { ratingA, ratingB } = eloUpdate(1200, 1200, 1);
    expect(ratingA).toBeGreaterThan(1200);
    expect(ratingB).toBeLessThan(1200);
  });

  it('handles loss scenario', () => {
    const { ratingA, ratingB } = eloUpdate(1500, 1500, 0);
    expect(ratingA).toBeLessThan(1500);
    expect(ratingB).toBeGreaterThan(1500);
  });

  it('is symmetric for draw', () => {
    const { ratingA, ratingB } = eloUpdate(1400, 1400, 0.5);
    expect(ratingA).toBe(1400);
    expect(ratingB).toBe(1400);
  });
});

describe('EloEngine', () => {
  const file = path.join(os.tmpdir(), 'elo-engine.test.json');
  const config = {
    kFactor: 24,
    defaultRating: 1200,
    floor: 800,
    ceiling: 2000
  };

  beforeEach(async () => {
    await fs.rm(file, { force: true });
  });

  it('persists ratings across reloads', async () => {
    const engineA = new EloEngine(config, jsonFileAdapter(file, {}));
    await engineA.load();
    engineA.recordMatch('alice', 'bob', 1);
    await engineA.save();

    const engineB = new EloEngine(config, jsonFileAdapter(file, {}));
    await engineB.load();
    const alice = engineB.getRating('alice');
    const bob = engineB.getRating('bob');
    expect(alice.rating).toBeGreaterThan(bob.rating);
  });

  it('respects rating floor under losing streaks', async () => {
    const engine = new EloEngine(config, jsonFileAdapter(file, {}));
    await engine.load();
    for (let i = 0; i < 50; i += 1) {
      engine.recordMatch('loser', 'opponent', 0);
    }
    const loser = engine.getRating('loser');
    expect(loser.rating).toBeGreaterThanOrEqual(config.floor as number);
  });

  it('respects rating ceiling for winning streaks', async () => {
    const engine = new EloEngine(config, jsonFileAdapter(file, {}));
    await engine.load();
    for (let i = 0; i < 50; i += 1) {
      engine.recordMatch('champion', 'opponent', 1);
    }
    const champion = engine.getRating('champion');
    expect(champion.rating).toBeLessThanOrEqual(config.ceiling as number);
  });
});
