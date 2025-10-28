import { describe, expect, it } from 'vitest';

import { AntifragileShell } from '../src/ai/antifragileShell.js';

describe('antifragile shell', () => {
  it('registers scenarios and executes them', async () => {
    const shell = new AntifragileShell({ shockFrequencyMinutes: 0, recoveryBackoffMinutes: 0 });
    let executed = false;
    shell.registerScenario({
      id: 'test',
      description: 'test scenario',
      impact: 'low',
      run: async () => {
        executed = true;
        shell.stop();
        return true;
      }
    });

    const runner = shell.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    shell.stop();
    await runner;
    expect(executed).toBe(true);
  });
});
