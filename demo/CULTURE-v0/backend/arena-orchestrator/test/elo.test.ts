import { describe, expect, it } from 'vitest';
import { eloUpdate } from '../src/elo.js';

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
