import { useEffect, useState } from 'react';
import { fetchArtifacts, launchArena, fetchScoreboard, type ArenaSummary, type ScoreboardResponse } from '../lib/api.js';

interface Props {
  readonly onRoundCompleted: (summary: ArenaSummary) => void;
  readonly onScoreboardUpdated: (scoreboard: ScoreboardResponse) => void;
}

export function StartArena({ onRoundCompleted, onScoreboardUpdated }: Props) {
  const [artifacts, setArtifacts] = useState<Array<{ id: number; title: string }>>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<number | null>(null);
  const [studentCount, setStudentCount] = useState(4);
  const [status, setStatus] = useState<string | null>(null);
  const [summary, setSummary] = useState<ArenaSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchArtifacts().then((items) => {
      setArtifacts(items.map((item) => ({ id: item.id, title: item.title })));
      if (items.length > 0) {
        setSelectedArtifact(items[0].id);
      }
    });
    fetchScoreboard().then(onScoreboardUpdated);
  }, []);

  const handleLaunch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedArtifact) return;
    setIsLoading(true);
    setStatus('Coordinating teacher, student, and validator agents…');
    const arenaSummary = await launchArena({ artifactId: selectedArtifact, studentCount });
    setSummary(arenaSummary);
    setStatus(`Round ${arenaSummary.roundId} finalised. Difficulty Δ ${arenaSummary.difficultyDelta}.`);
    onRoundCompleted(arenaSummary);
    const scoreboardData = await fetchScoreboard();
    onScoreboardUpdated(scoreboardData);
    setIsLoading(false);
  };

  return (
    <div className="card">
      <h2>Launch Self-Play Arena</h2>
      <p>Spin up autonomous competitions grounded in your knowledge artifacts. The orchestrator handles job creation, validation, and adaptive curricula.</p>
      <form onSubmit={handleLaunch} className="grid two-columns">
        <label>
          Base artifact
          <select value={selectedArtifact ?? ''} onChange={(event) => setSelectedArtifact(Number(event.target.value))}>
            {artifacts.map((artifact) => (
              <option key={artifact.id} value={artifact.id}>
                #{artifact.id} — {artifact.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Student agents
          <input type="number" min={1} max={12} value={studentCount} onChange={(event) => setStudentCount(Number(event.target.value))} />
        </label>
        <button type="submit" disabled={isLoading || artifacts.length === 0}>
          {isLoading ? 'Running arena…' : 'Start Arena Round'}
        </button>
      </form>
      {status && <p>{status}</p>}
      {summary && (
        <div className="card">
          <h3>Round {summary.roundId} Summary</h3>
          <p>Difficulty: {summary.difficulty} (Δ {summary.difficultyDelta})</p>
          <p>Observed success rate: {(summary.observedSuccessRate * 100).toFixed(1)}%</p>
          <p>Winning agents: {summary.winners.join(', ') || 'Teacher swept the cohort'}</p>
        </div>
      )}
    </div>
  );
}
