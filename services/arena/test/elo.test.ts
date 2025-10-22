import { expectedScore, updateRating } from '../src/elo.js';

describe('Elo calculations', () => {
  it('computes expected score correctly', () => {
    const exp = expectedScore({ rating: 1600 }, { rating: 1500 });
    expect(exp).toBeGreaterThan(0.5);
  });

  it('updates rating after win', () => {
    const newRating = updateRating({ rating: 1500 }, { rating: 1600 }, 1);
    expect(newRating).toBeGreaterThan(1500);
  });
});
