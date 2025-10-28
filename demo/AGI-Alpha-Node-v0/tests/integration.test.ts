import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AntifragileShell } from '../src/ai/antifragileShell.js';
import { PlanningEngine } from '../src/ai/planningEngine.js';
import { ControlPlane } from '../src/core/controlPlane.js';
import { handleNewJob } from '../src/core/lifecycle.js';

vi.mock('../src/core/dashboard.js', () => ({
  broadcast: vi.fn()
}));

vi.mock('../src/core/metrics.js', () => ({
  incrementMetric: vi.fn(),
  setMetric: vi.fn()
}));

describe('lifecycle integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes jobs when not paused', async () => {
    const controlPlane = new ControlPlane({});
    const antifragile = new AntifragileShell({ shockFrequencyMinutes: 1, recoveryBackoffMinutes: 1 });
    const planner = new PlanningEngine(1.2);

    let executed = false;
    await handleNewJob(
      { controlPlane, antifragile, planner },
      { jobId: 1n, metadata: 'demo job' },
      async () => {
        executed = true;
        return { success: true, resultHash: '0x1234' };
      }
    );

    expect(executed).toBe(true);
  });

  it('skips jobs when paused', async () => {
    const controlPlane = new ControlPlane({});
    controlPlane.execute({ type: 'PAUSE' });
    const antifragile = new AntifragileShell({ shockFrequencyMinutes: 1, recoveryBackoffMinutes: 1 });
    const planner = new PlanningEngine(1.2);

    let executed = false;
    await handleNewJob(
      { controlPlane, antifragile, planner },
      { jobId: 2n, metadata: 'demo job' },
      async () => {
        executed = true;
        return { success: true, resultHash: '0x1234' };
      }
    );

    expect(executed).toBe(false);
  });
});
