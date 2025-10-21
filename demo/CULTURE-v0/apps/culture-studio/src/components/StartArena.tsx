import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';
import {
  buildTelemetry,
  fetchArtifacts,
  fetchScoreboard,
  launchArena,
  updateOwnerControls,
  type ArenaSummary,
  type ArenaTelemetry,
  type OwnerControlState,
  type ScoreboardResponse
} from '../lib/api.js';

Chart.register(...registerables);

interface Props {
  readonly onRoundCompleted?: (summary: ArenaSummary) => void;
  readonly onScoreboardUpdated?: (scoreboard: ScoreboardResponse) => void;
}

interface ArtifactChoice {
  readonly id: number;
  readonly title: string;
}

type Step = 'configure' | 'launching' | 'monitoring' | 'complete';

export function StartArena({ onRoundCompleted, onScoreboardUpdated }: Props) {
  const [artifacts, setArtifacts] = useState<ArtifactChoice[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<number | null>(null);
  const [studentCount, setStudentCount] = useState(6);
  const [difficultyTarget, setDifficultyTarget] = useState(0.62);
  const [step, setStep] = useState<Step>('configure');
  const [status, setStatus] = useState<string>('Choose an artifact to anchor the arena round.');
  const [summary, setSummary] = useState<ArenaSummary | null>(null);
  const [telemetry, setTelemetry] = useState<ArenaTelemetry | null>(null);
  const [controls, setControls] = useState<OwnerControlState | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchArtifacts().then((items) => {
      const mapped = items.map((item) => ({ id: item.id, title: item.title }));
      setArtifacts(mapped);
      if (mapped.length > 0) {
        setSelectedArtifact(mapped[0].id);
      }
    });
    fetchScoreboard().then((scoreboard) => {
      setTelemetry(buildTelemetry(scoreboard));
      setControls(scoreboard.ownerControls);
      onScoreboardUpdated?.(scoreboard);
    });
  }, [onScoreboardUpdated]);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const tick = async () => {
      const scoreboard = await fetchScoreboard();
      if (cancelled) return;
      const telemetrySnapshot = buildTelemetry(scoreboard);
      setTelemetry(telemetrySnapshot);
      setControls(scoreboard.ownerControls);
      onScoreboardUpdated?.(scoreboard);
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [polling, onScoreboardUpdated]);

  const handleLaunch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedArtifact) return;
    setError(null);
    setStep('launching');
    setStatus('Coordinating teacher, students, and validators…');
    try {
      const arenaSummary = await launchArena({ artifactId: selectedArtifact, studentCount, difficultyTarget });
      setSummary(arenaSummary);
      setStatus(`Round ${arenaSummary.roundId} ready. Monitoring telemetry…`);
      onRoundCompleted?.(arenaSummary);
      setPolling(true);
      setStep('monitoring');
    } catch (cause) {
      console.error(cause);
      setError('Unable to start the arena. Please confirm the orchestrator is reachable.');
      setStep('configure');
    }
  };

  const handleTogglePause = async () => {
    if (!controls) return;
    const next = await updateOwnerControls({ paused: !controls.paused });
    setControls(next);
  };

  const handleToggleAutoDifficulty = async () => {
    if (!controls) return;
    const next = await updateOwnerControls({ autoDifficulty: !controls.autoDifficulty });
    setControls(next);
  };

  const handleTargetChange = async (target: number) => {
    const next = await updateOwnerControls({ targetSuccessRate: target });
    setControls(next);
  };

  useEffect(() => {
    if (step === 'monitoring' && summary) {
      setStatus(
        `Round ${summary.roundId} running — watching success rate ${(summary.observedSuccessRate * 100).toFixed(1)}% and difficulty` +
          ` ${summary.difficulty.toFixed(2)}.`
      );
    }
    if (step === 'monitoring' && telemetry) {
      const lastRound = telemetry.scoreboard.rounds.at(-1);
      if (lastRound?.status === 'completed') {
        setStep('complete');
        setStatus('Round complete. Review results below.');
        setPolling(false);
      }
    }
  }, [step, summary, telemetry]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          min: 0,
          max: 1,
          ticks: {
            callback: (value: string | number) => `${Math.round(Number(value) * 100)}%`
          }
        }
      }
    }),
    []
  );

  const difficultyData = useMemo(() => {
    const points = telemetry?.difficultyTrend ?? [];
    return {
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: 'Difficulty',
          data: points.map((point) => point.value),
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.25)',
          tension: 0.35
        }
      ]
    };
  }, [telemetry]);

  const successData = useMemo(() => {
    const points = telemetry?.successTrend ?? [];
    return {
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: 'Success rate',
          data: points.map((point) => point.value),
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168, 85, 247, 0.2)',
          tension: 0.35
        }
      ]
    };
  }, [telemetry]);

  return (
    <section className="card">
      <header className="section-header">
        <div>
          <h2>Start arena round</h2>
          <p className="subtitle">Launch a self-play mission anchored to your latest artifact. Telemetry updates in real time.</p>
        </div>
        <span className="status-pill">{status}</span>
      </header>

      <form onSubmit={handleLaunch} className="wizard-grid">
        <div>
          <label>
            1. Pick the anchor artifact
            <select value={selectedArtifact ?? ''} onChange={(event) => setSelectedArtifact(Number(event.target.value))}>
              {artifacts.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  #{artifact.id} — {artifact.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            2. Team size
            <input
              type="number"
              min={1}
              max={12}
              value={studentCount}
              onChange={(event) => setStudentCount(Number(event.target.value))}
            />
          </label>
          <label>
            3. Aim for success rate
            <input
              type="number"
              step={0.01}
              min={0.1}
              max={0.95}
              value={difficultyTarget}
              onChange={(event) => setDifficultyTarget(Number(event.target.value))}
            />
          </label>
          <button type="submit" disabled={step === 'launching' || step === 'monitoring'}>
            {step === 'launching' ? 'Starting…' : 'Launch arena'}
          </button>
        </div>
        <div className="wizard-summary">
          <h3>Round overview</h3>
          <ul>
            <li>Selected artifact: {selectedArtifact ? `#${selectedArtifact}` : 'Choose an artifact'}</li>
            <li>Students per round: {studentCount}</li>
            <li>Target success rate: {(difficultyTarget * 100).toFixed(0)}%</li>
          </ul>
          {summary && (
            <div className="summary-card">
              <h4>Latest summary</h4>
              <p>Round {summary.roundId} • Difficulty {summary.difficulty.toFixed(2)}</p>
              <p>Observed success {(summary.observedSuccessRate * 100).toFixed(1)}%</p>
              <p>Winners: {summary.winners.length > 0 ? summary.winners.join(', ') : 'Teacher sweep'}</p>
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
        </div>
      </form>

      {telemetry && (
        <div className="telemetry-grid">
          <div className="telemetry-card">
            <h3>Difficulty trend</h3>
            <div className="chart-shell">
              <Line options={chartOptions} data={difficultyData} />
            </div>
          </div>
          <div className="telemetry-card">
            <h3>Success trend</h3>
            <div className="chart-shell">
              <Line options={chartOptions} data={successData} />
            </div>
          </div>
          <div className="telemetry-card">
            <h3>Current ratings</h3>
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
                {telemetry.scoreboard.agents.map((agent) => (
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
        </div>
      )}

      {controls && (
        <div className="owner-controls">
          <h3>Owner control panel</h3>
          <p className="subtitle">Pause rounds, adjust pacing, and review the orchestrator&apos;s current settings.</p>
          <div className="control-grid">
            <button type="button" onClick={handleTogglePause}>
              {controls.paused ? 'Resume arenas' : 'Pause arenas'}
            </button>
            <button type="button" onClick={handleToggleAutoDifficulty}>
              {controls.autoDifficulty ? 'Hold difficulty steady' : 'Auto-balance difficulty'}
            </button>
            <label>
              Target success rate
              <input
                type="number"
                min={0.1}
                max={0.95}
                step={0.05}
                value={controls.targetSuccessRate}
                onChange={(event) => handleTargetChange(Number(event.target.value))}
              />
            </label>
            <div className="control-summary">
              <p>Max concurrent jobs: {controls.maxConcurrentJobs}</p>
              <p>Telemetry refresh: every 5 seconds</p>
              <p>Status: {controls.paused ? 'Paused' : 'Active'}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
