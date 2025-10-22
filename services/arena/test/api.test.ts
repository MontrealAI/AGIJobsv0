import request from 'supertest';
import type { ArenaService } from '../src/arena.service.js';
import { createApp } from '../src/index.js';

describe('Arena API', () => {
  const service: jest.Mocked<ArenaService> = {
    startRound: jest.fn(),
    commitSubmission: jest.fn(),
    revealSubmission: jest.fn(),
    closeRound: jest.fn(),
    getScoreboard: jest.fn(),
    getStatus: jest.fn()
  } as unknown as jest.Mocked<ArenaService>;

  const { app } = createApp({ arenaService: service });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('starts a round', async () => {
    service.startRound.mockResolvedValue({
      id: 'round-1',
      state: 'COMMIT' as never,
      commitDeadline: new Date(),
      revealDeadline: new Date(),
      difficultyScore: 1
    });

    const response = await request(app)
      .post('/arena/start')
      .send({ contestantIds: ['agent-1'], validatorIds: ['validator-1'] })
      .expect(201);

    expect(response.body.id).toBe('round-1');
    expect(service.startRound).toHaveBeenCalledTimes(1);
  });

  it('validates start round payload', async () => {
    const response = await request(app).post('/arena/start').send({}).expect(400);
    expect(response.body.error).toBeDefined();
  });

  it('closes a round', async () => {
    service.closeRound.mockResolvedValue({ id: 'round-1' } as never);
    const response = await request(app).post('/arena/close/round-1').expect(200);
    expect(response.body.id).toBe('round-1');
    expect(service.closeRound).toHaveBeenCalledWith('round-1');
  });

  it('returns scoreboard', async () => {
    service.getScoreboard.mockResolvedValue([{ id: 'agent-1', rating: 1600 }] as never);
    const response = await request(app).get('/arena/scoreboard?limit=5').expect(200);
    expect(response.body.agents).toHaveLength(1);
    expect(service.getScoreboard).toHaveBeenCalledWith(5);
  });
});
