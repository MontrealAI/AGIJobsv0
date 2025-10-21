import type { ScoreboardResponse } from '../lib/api.js';

interface Props {
  readonly data: ScoreboardResponse | null;
}

export function Scoreboard({ data }: Props) {
  if (!data) {
    return null;
  }

  return (
    <div className="card">
      <h2>Arena Telemetry</h2>
      <p>Current difficulty: {data.currentDifficulty}</p>
      <div className="grid two-columns">
        <div>
          <h3>Elo Rankings</h3>
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
          <h3>Recent Rounds</h3>
          <ul>
            {data.rounds.slice(-5).map((round) => (
              <li key={round.id}>
                Round {round.id}: diff {round.difficulty} (Δ {round.difficultyDelta}), success{' '}
                {(round.successRate * 100).toFixed(1)}%
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
