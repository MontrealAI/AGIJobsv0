import { useEffect, useState, useSyncExternalStore } from 'react';
import { CreateBook } from '../components/CreateBook.js';
import { StartArena } from '../components/StartArena.js';
import { ServiceArena } from '../components/ServiceArena.js';
import { ArtifactGraph } from '../components/ArtifactGraph.js';
import { Scoreboard } from '../components/Scoreboard.js';
import {
  isDemoMode,
  setServiceToken,
  fetchCapabilities,
  type ScoreboardResponse,
  type ServiceCapabilities,
} from '../lib/api.js';
import {
  subscribePreview,
  previewRevision,
  previewEvidence,
  resetPreview,
} from '../lib/preview.js';

const tabs = [
  'Create Artifact',
  'Self-Play Arena',
  'Culture Graph',
  'Evidence & Guide',
] as const;
const docs =
  'https://github.com/MontrealAI/AGIJobsv0/tree/main/demo/CULTURE-v0';
function downloadEvidence() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(previewEvidence(), null, 2)], {
      type: 'application/json',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'culture-preview-evidence.json';
  link.click();
  URL.revokeObjectURL(url);
}
export default function App() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const [scoreboard, setScoreboard] = useState<ScoreboardResponse | null>(null);
  const [token, setToken] = useState('');
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [capabilities, setCapabilities] = useState<ServiceCapabilities>();
  const [connectionError, setConnectionError] = useState('');
  const revision = useSyncExternalStore(subscribePreview, previewRevision);
  const evidence = previewEvidence();
  useEffect(() => {
    if (isDemoMode()) return;
    let active = true;
    fetchCapabilities()
      .then((value) => {
        if (active) {
          setCapabilities(value);
          setConnectionError('');
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setCapabilities(undefined);
          setConnectionError(
            cause instanceof Error
              ? cause.message
              : 'Cannot discover service capabilities.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [connectionVersion]);
  return (
    <>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <main>
        <div className="topbar">
          <a href="https://montrealai.github.io/AGIJobsv0/">
            AGI JOBS <span>/ DEMO OBSERVATORY</span>
          </a>
          <a href={docs}>Source & runbook ↗</a>
        </div>
        <header className="hero">
          <div>
            <p className="eyebrow">CULTURE v0 · THE KNOWLEDGE COMMONS</p>
            <h1>
              Knowledge grows
              <br />
              when it is <em>shared.</em>
            </h1>
            <p className="hero-copy">
              Create an artifact. Teach a team. Follow the ideas that make the
              next generation better.
            </p>
            <p className="hero-note">
              A hands-on lab for cultural memory, self-play learning, and
              accountable improvement.
            </p>
          </div>
          <div
            className="loop-map"
            aria-label="Learning loop: create, register, evaluate, improve"
          >
            <div className="loop-center">
              <span>↻</span>
              <strong>CULTURE</strong>
              <small>A living knowledge loop</small>
            </div>
            <ol>
              <li>
                <b>01</b>
                <span>
                  Create<strong>A useful lesson</strong>
                </span>
              </li>
              <li>
                <b>02</b>
                <span>
                  Connect<strong>Sources & lineage</strong>
                </span>
              </li>
              <li>
                <b>03</b>
                <span>
                  Evaluate<strong>Transparent practice</strong>
                </span>
              </li>
              <li>
                <b>04</b>
                <span>
                  Improve<strong>Evidence & difficulty</strong>
                </span>
              </li>
            </ol>
          </div>
        </header>
        <section className="mode-banner" aria-label="Connection mode">
          <div>
            <strong>
              <span className="mode-dot" />
              {isDemoMode()
                ? 'Interactive preview · local simulation'
                : `Service mode · ${capabilities?.mode ?? 'connecting'}`}
            </strong>
            <p>
              {isDemoMode()
                ? 'Everything runs in your browser. No wallet, uploads, paid jobs, or network requests. State lasts until reload or reset.'
                : 'Explicit API operations. The bundled job, IPFS, and stake adapters are simulations, including in hybrid on-chain mode. No provider success is assumed.'}
            </p>
          </div>
          {isDemoMode() && (
            <div className="button-row">
              <button className="secondary" onClick={downloadEvidence}>
                Download evidence
              </button>
              <button
                className="quiet"
                onClick={() => {
                  if (
                    window.confirm(
                      'Reset all preview artifacts, jobs, and rounds? Download evidence first if you want to keep it.',
                    )
                  ) {
                    resetPreview();
                    setConnectionVersion((v) => v + 1);
                    setScoreboard(null);
                    setActiveTab(tabs[0]);
                  }
                }}
              >
                Reset preview
              </button>
            </div>
          )}
        </section>
        {!isDemoMode() && (
          <section className="card">
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
                Kept in memory for this tab. Use an operator API token, never a
                wallet private key.
              </p>
              <button
                onClick={() => {
                  setServiceToken(token);
                  setToken('');
                  setConnectionVersion((v) => v + 1);
                }}
              >
                Apply connection
              </button>
            </details>
            {connectionError && (
              <p role="alert" className="error-text">
                {connectionError} Provider actions stay unavailable until
                capabilities are verified.
              </p>
            )}
          </section>
        )}
        {isDemoMode() && (
          <section className="metrics-strip" aria-label="Session progress">
            <div>
              <strong>{evidence.artifacts.length}</strong>
              <span>Linked artifacts</span>
            </div>
            <div>
              <strong>{evidence.jobs.length}</strong>
              <span>Follow-on jobs</span>
            </div>
            <div>
              <strong>{evidence.rounds.length}</strong>
              <span>Evaluated rounds</span>
            </div>
            <div>
              <strong>
                {evidence.scoreboard.currentDifficulty}
                <small> / 9</small>
              </strong>
              <span>Next difficulty</span>
            </div>
          </section>
        )}
        <div id="workspace" tabIndex={-1}>
          <nav className="tabs" aria-label="Studio sections">
            {tabs.map((tab, i) => (
              <button
                key={tab}
                className={`tab-button ${activeTab === tab ? 'active' : ''}`}
                aria-pressed={activeTab === tab}
                aria-controls={`panel-${i}`}
                onClick={() => setActiveTab(tab)}
              >
                <span>0{i + 1}</span> {tab}
              </button>
            ))}
          </nav>
          <div id="panel-0" hidden={activeTab !== tabs[0]}>
            <CreateBook
              key={`create-${connectionVersion}`}
              capabilities={capabilities}
              revision={revision}
            />
            <ArtifactGraph
              key={`create-graph-${connectionVersion}`}
              revision={revision}
              canCreateJob={isDemoMode() || !!capabilities?.derivativeJobs}
            />
          </div>
          <div id="panel-1" hidden={activeTab !== tabs[1]}>
            {isDemoMode() ? (
              <StartArena
                key={connectionVersion}
                revision={revision}
                onScoreboardUpdated={setScoreboard}
              />
            ) : (
              <ServiceArena
                key={connectionVersion}
                onScoreboardUpdated={setScoreboard}
              />
            )}
            <Scoreboard data={scoreboard} />
          </div>
          <div id="panel-2" hidden={activeTab !== tabs[2]}>
            <ArtifactGraph
              key={`graph-${connectionVersion}`}
              revision={revision}
              canCreateJob={isDemoMode() || !!capabilities?.derivativeJobs}
            />
          </div>
          <section
            id="panel-3"
            hidden={activeTab !== tabs[3]}
            className="card guide"
          >
            <p className="eyebrow">READ THE RESULTS, NOT JUST THE NUMBERS</p>
            <h2>Your field guide to CULTURE</h2>
            <div className="grid two-columns">
              <div>
                <h3>A five-minute walkthrough</h3>
                <ol>
                  <li>
                    Give your lesson a title, choose its source, and describe
                    the audience. Generate and review the local template.
                  </li>
                  <li>
                    Preview storage and registration. Its fingerprint identifies
                    the exact draft; the graph gains a citation edge.
                  </li>
                  <li>
                    Schedule a follow-on job, then choose the artifact in
                    Self-Play Arena.
                  </li>
                  <li>
                    Run a round. Inspect every score, pass threshold, and
                    winner. Adjust the target or hold difficulty and compare
                    another round.
                  </li>
                  <li>
                    Inspect lineage in Culture Graph and download the complete
                    session evidence.
                  </li>
                </ol>
              </div>
              <div>
                <h3>What the model measures</h3>
                <p>
                  <b>Success</b> = passing students ÷ participating students.
                  Fixture scores depend on artifact ID, student index, and
                  citations. They are teaching examples, not real agent
                  benchmarks.
                </p>
                <p>
                  <b>Difficulty</b> uses an integer scale from 1 to 9. The
                  preview adds 4 × (success − target), capped at ±2, rounded and
                  clamped. Pause blocks new rounds; hold keeps difficulty
                  unchanged; parallel jobs determine modeled batch count.
                </p>
                <p>
                  <b>Elo</b> uses K = 32 with the teacher’s pre-round rating.
                  Each learner’s change is balanced by the teacher’s opposite
                  change.
                </p>
                <p>
                  <b>Influence</b> is citation PageRank (damping 0.85; 40
                  iterations). A blue edge shows derivation, purple shows
                  citation. Influence is not ownership, safety, or financial
                  value.
                </p>
              </div>
            </div>
            <h3>Evidence and production boundary</h3>
            <p>
              The export contains drafts, fingerprints, artifacts, citations,
              jobs, round inputs, individual rubric scores, outcomes, controls,
              and ratings. IDs beginning with “preview” are deliberately not
              blockchain hashes or IPFS CIDs.
            </p>
            <p>
              Real deployment still needs provider adapters, durable
              transactional job recovery, independent security review, authentic
              operator authorization, and target-network commissioning. The
              simulation does not replace those requirements.{' '}
              <a href={`${docs}/RUNBOOK.md`}>Open the operator runbook</a>.
            </p>
            {isDemoMode() && (
              <>
                <button onClick={downloadEvidence}>Download evidence</button>
                <h3>Latest evaluated round</h3>
                {evidence.rounds.length ? (
                  <textarea
                    className="evidence-json"
                    readOnly
                    rows={18}
                    aria-label="Latest round evidence JSON"
                    value={JSON.stringify(evidence.rounds.at(-1), null, 2)}
                  />
                ) : (
                  <p>
                    No rounds yet. Run a preview arena to collect your first
                    evidence.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
        <footer>
          <span>CULTURE v0 · Shared knowledge, inspectable progress.</span>
          <a href={docs}>Explore the complete architecture & flowcharts ↗</a>
        </footer>
      </main>
    </>
  );
}
