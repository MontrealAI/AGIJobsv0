import MockAdapter from 'axios-mock-adapter';
import { JobsClient } from '../src/jobs.client.js';

describe('JobsClient', () => {
  it('fetches tasks with retries', async () => {
    const client = new JobsClient({ endpoint: 'https://jobs.example' });
    const mock = new MockAdapter((client as any).http);
    mock.onGet('/tasks').replyOnce(500).onGet('/tasks').reply(200, { tasks: [{ id: 't1' }] });

    const tasks = await client.fetchTasks();
    expect(tasks).toHaveLength(1);
  });

  it('opens circuit after repeated failures', async () => {
    const client = new JobsClient({ endpoint: 'https://jobs.example' }, { failureThreshold: 1, cooldownMs: 10 });
    const mock = new MockAdapter((client as any).http);
    mock.onPost('/onchain').reply(500);

    await expect(client.triggerOnChainAction('/onchain', {})).rejects.toThrow();
    await expect(client.triggerOnChainAction('/onchain', {})).rejects.toThrow('Circuit breaker open');
  });
});
