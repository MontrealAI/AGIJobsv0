import { useState } from 'react';
import { CreateBook } from '../components/CreateBook.js';
import { StartArena } from '../components/StartArena.js';
import { ArtifactGraph } from '../components/ArtifactGraph.js';
import { Scoreboard } from '../components/Scoreboard.js';
import type { ScoreboardResponse, ArenaSummary } from '../lib/api.js';

const tabs = ['Create Artifact', 'Self-Play Arena', 'Culture Graph'] as const;
type Tab = (typeof tabs)[number];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0]);
  const [scoreboard, setScoreboard] = useState<ScoreboardResponse | null>(null);
  const [latestRound, setLatestRound] = useState<ArenaSummary | null>(null);

  return (
    <main>
      <header>
        <h1>🎖️ CULTURE 👁️✨ Control Studio</h1>
        <p>
          Orchestrate cultural knowledge creation and autonomous self-play curricula with AGI Jobs v0. Launch agent swarms,
          track influence propagation, and steer the platform from one friendly control room.
        </p>
      </header>
      <nav className="tabs" aria-label="Studio sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === 'Create Artifact' && (
        <>
          <CreateBook />
          <ArtifactGraph />
        </>
      )}

      {activeTab === 'Self-Play Arena' && (
        <>
          <StartArena onRoundCompleted={setLatestRound} onScoreboardUpdated={setScoreboard} />
          {latestRound && (
            <section className="card">
              <h2>Latest round recap</h2>
              <p className="subtitle">
                Round {latestRound.roundId} closed at difficulty {latestRound.difficulty.toFixed(2)} with success{' '}
                {(latestRound.observedSuccessRate * 100).toFixed(1)}%.
              </p>
            </section>
          )}
          <Scoreboard data={scoreboard} />
        </>
      )}

      {activeTab === 'Culture Graph' && <ArtifactGraph />}
    </main>
  );
}
