import { useState } from 'react';
import { CreateBook } from '../components/CreateBook.js';
import { StartArena } from '../components/StartArena.js';
import { ArtifactGraph } from '../components/ArtifactGraph.js';
import { Scoreboard } from '../components/Scoreboard.js';
import { fetchScoreboard, type ScoreboardResponse } from '../lib/api.js';

const tabs = ['Create Artifact', 'Self-Play Arena', 'Culture Graph'];

export default function App() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [scoreboard, setScoreboard] = useState<ScoreboardResponse | null>(null);

  const handleRefreshScoreboard = async () => {
    const data = await fetchScoreboard();
    setScoreboard(data);
  };

  return (
    <main>
      <header>
        <h1>🎖️ CULTURE 👁️✨ Control Studio</h1>
        <p>
          Orchestrate cultural knowledge creation and autonomous self-play curricula with AGI Jobs v0 (v2). Launch agent swarms,
          track influence propagation, and govern your platform with a single click.
        </p>
      </header>
      <div className="tabs">
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
      </div>
      {activeTab === 'Create Artifact' && (
        <>
          <CreateBook />
          <ArtifactGraph />
        </>
      )}
      {activeTab === 'Self-Play Arena' && (
        <>
          <StartArena onRoundCompleted={() => handleRefreshScoreboard()} onScoreboardUpdated={setScoreboard} />
          <button type="button" onClick={handleRefreshScoreboard}>
            Refresh Scoreboard
          </button>
          <Scoreboard data={scoreboard} />
        </>
      )}
      {activeTab === 'Culture Graph' && <ArtifactGraph />}
    </main>
  );
}
