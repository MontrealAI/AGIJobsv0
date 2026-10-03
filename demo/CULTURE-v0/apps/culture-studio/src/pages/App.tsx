import { useState } from 'react';
import { CreateBook } from '../components/CreateBook.js';
import { StartArena } from '../components/StartArena.js';
import { ArtifactGraph } from '../components/ArtifactGraph.js';
import { Scoreboard } from '../components/Scoreboard.js';
import type { ScoreboardResponse, ArenaSummary } from '../lib/api.js';
import { isDemoMode, setServiceToken } from '../lib/api.js';

const tabs = ['Create Artifact', 'Self-Play Arena', 'Culture Graph'] as const;
type Tab = (typeof tabs)[number];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0]);
  const [scoreboard, setScoreboard] = useState<ScoreboardResponse | null>(null);
  const [latestRound, setLatestRound] = useState<ArenaSummary | null>(null);
  const [token, setToken] = useState('');
  const [connectionVersion, setConnectionVersion] = useState(0);

  return (
    <main>
      <header>
        <h1>🎖️ CULTURE 👁️✨ Control Studio</h1>
        <p>
          Orchestrate cultural knowledge creation and autonomous self-play
          curricula with AGI Jobs v0. Launch agent swarms, track influence
          propagation, and steer the platform from one friendly control room.
        </p>
      </header>
      <section className="card" role="status" aria-label="Connection mode">
        <strong>{isDemoMode() ? 'Interactive preview' : 'Service mode'}</strong>
        <p>
          {isDemoMode()
            ? 'Simulated data and results. No uploads, blockchain transactions, or paid jobs are submitted.'
            : 'Uses your configured services. Failed requests are shown as errors; no simulated success is substituted.'}
        </p>
        {!isDemoMode() && (
          <details>
            <summary>Operator connection</summary>
            <label>
              API access token
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <p>
              Kept in memory for this tab. Use the API token configured by your
              operator, never a wallet private key.
            </p>
            <button
              type="button"
              onClick={() => {
                setServiceToken(token);
                setToken('');
                setConnectionVersion((version) => version + 1);
              }}
            >
              Apply connection
            </button>
          </details>
        )}
      </section>
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
          <CreateBook key={`create-${connectionVersion}`} />
          <ArtifactGraph key={`graph-${connectionVersion}`} />
        </>
      )}

      {activeTab === 'Self-Play Arena' && (
        <>
          <StartArena
            key={connectionVersion}
            onRoundCompleted={setLatestRound}
            onScoreboardUpdated={setScoreboard}
          />
          {latestRound && (
            <section className="card">
              <h2>Latest round recap</h2>
              <p className="subtitle">
                Round {latestRound.roundId} closed at difficulty{' '}
                {latestRound.difficulty.toFixed(2)} with success{' '}
                {(latestRound.observedSuccessRate * 100).toFixed(1)}%.
              </p>
            </section>
          )}
          <Scoreboard data={scoreboard} />
        </>
      )}

      {activeTab === 'Culture Graph' && (
        <ArtifactGraph key={connectionVersion} />
      )}
    </main>
  );
}
