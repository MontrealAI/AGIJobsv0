import { DifficultyController } from '../src/difficulty.js';

describe('DifficultyController', () => {
  it('lowers difficulty when rounds are slow', () => {
    const controller = new DifficultyController({ targetSeconds: 100 });
    const initial = controller.currentDifficulty;
    const updated = controller.update(200);
    expect(updated).toBeLessThan(initial);
  });

  it('raises difficulty when rounds are fast', () => {
    const controller = new DifficultyController({ targetSeconds: 100 });
    const initial = controller.currentDifficulty;
    const updated = controller.update(20);
    expect(updated).toBeGreaterThan(initial);
  });
});
