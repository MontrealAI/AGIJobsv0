import type { ScoreboardResponse } from '../lib/api.js';

interface Props {
  readonly data: ScoreboardResponse | null;
}

export function Scoreboard({ data }: Props) {
  if (!data) {
    return null;
  }

  const safeNumber = (value: unknown, fallback: number) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const latestRound = data.rounds.at(-1);
  const difficulty = safeNumber(data.currentDifficulty, latestRound?.difficulty ?? 0);
  const successRate = safeNumber(data.currentSuccessRate, latestRound?.successRate ?? 0);
  const ownerControls = {
    paused: false,
    autoDifficulty: true,
    maxConcurrentJobs: 3,
    targetSuccessRate: successRate,
    ...(data.ownerControls ?? {})
  };
  const targetSuccessRate = safeNumber(ownerControls.targetSuccessRate, successRate);

  return (
    <section className="card">
      <h2>Telemetry snapshot</h2>
      <p className="subtitle">
        Difficulty {difficulty.toFixed(2)} • Success {(successRate * 100).toFixed(1)}% • Target{' '}
        {(targetSuccessRate * 100).toFixed(0)}%
      </p>
      <div className="grid two-columns">
        <div>
          <h3>Elo rankings</h3>
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Role</th>
                <th>Elo</th>
                <th>W</th>
                <th>L</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map((agent) => (
                <tr key={agent.address}>
                  <td>{agent.address}</td>
                  <td>{agent.role}</td>
                  <td>{agent.rating}</td>
                  <td>{agent.wins}</td>
                  <td>{agent.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>Recent rounds</h3>
          <ul>
            {data.rounds.slice(-5).map((round) => (
              <li key={round.id}>
                Round {round.id}: diff {round.difficulty.toFixed(2)} (Δ {round.difficultyDelta.toFixed(2)}), success{' '}
                {(round.successRate * 100).toFixed(1)}% — {round.status}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
