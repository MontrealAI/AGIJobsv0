import type { ScoreboardResponse } from '../lib/api.js';

interface Props {
  readonly data: ScoreboardResponse | null;
}

export function Scoreboard({ data }: Props) {
  if (!data) {
    return null;
  }

  return (
    <section className="card">
      <h2>Telemetry snapshot</h2>
      <p className="subtitle">
        Difficulty {data.currentDifficulty.toFixed(2)} • Success {(data.currentSuccessRate * 100).toFixed(1)}% • Target{' '}
        {(data.ownerControls.targetSuccessRate * 100).toFixed(0)}%
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
