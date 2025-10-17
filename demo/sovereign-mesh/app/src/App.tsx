import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getSigner } from "./lib/ethers";
import { makeClient, qJobs } from "./lib/subgraph";
import { computeCommit } from "./lib/commit";
import { formatToken, short, titleCase } from "./lib/format";

type MeshConfig = {
  network: string;
  etherscanBase: string;
  defaultSubgraphUrl: string;
  orchestratorBase: string;
  hubs: string[];
};

type HubConfig = {
  label: string;
  rpcUrl: string;
  subgraphUrl?: string;
  addresses: Record<string, string>;
};

type Job = {
  id: string;
  employer: string;
  reward: string;
  uri: string;
  status: string;
  validators?: { account: string }[];
};

type PlaybookStep = {
  hub: string;
  rewardWei: string;
  uri: string;
};

type Playbook = {
  id: string;
  name: string;
  steps: PlaybookStep[];
};

type MissionSummary = {
  network: string;
  hubCount: number;
  missionCount: number;
  totalRewardWei: string;
  totalRewardEther: string;
  updatedAt: string;
  missions: {
    id: string;
    name: string;
    stepCount: number;
    hubCount: number;
    stageCount: number;
    totalRewardWei: string;
    totalRewardEther: string;
    hubs: string[];
    stages: string[];
  }[];
};

const DEFAULT_MESH_API_BASE = "http://localhost:8084";

const getMeshApiBase = () => {
  if (typeof window !== "undefined") {
    const globalBase = (window as unknown as {
      __SOVEREIGN_MESH_API__?: string;
    }).__SOVEREIGN_MESH_API__;
    if (globalBase) return globalBase;

    if (typeof document !== "undefined") {
      const meta = document
        .querySelector("meta[name='mesh-api-base']")
        ?.getAttribute("content");
      if (meta) return meta;
    }
  }

  const envBase = (import.meta as unknown as {
    env?: Record<string, string | undefined>;
  }).env?.VITE_SOVEREIGN_MESH_API;

  return envBase || DEFAULT_MESH_API_BASE;
};

const meshApiBase = getMeshApiBase();

const fetchJson = async (path: string, init?: RequestInit) => {
  const url = /^(https?:)?\/\//i.test(path)
    ? path
    : new URL(path, meshApiBase).toString();
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
};

const useMeshConfig = () => {
  const [cfg, setCfg] = useState<MeshConfig>();
  const [hubs, setHubs] = useState<Record<string, HubConfig>>({});
  const [actors, setActors] = useState<any[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);

  useEffect(() => {
    fetchJson("/mesh/config").then(setCfg).catch(console.error);
    fetchJson("/mesh/hubs")
      .then((data) => setHubs(data.hubs ?? {}))
      .catch(console.error);
    fetchJson("/mesh/actors").then(setActors).catch(console.error);
    fetchJson("/mesh/playbooks")
      .then((pb) => setPlaybooks(pb as Playbook[]))
      .catch(console.error);
  }, []);

  return { cfg, hubs, actors, playbooks };
};

const Table: React.FC<{ jobs: Job[]; toToken: (wei: string | bigint) => string }> = ({
  jobs,
  toToken
}) => (
  <table className="mesh-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Proposer</th>
        <th>Reward (AGIA)</th>
        <th>URI</th>
        <th>Status</th>
        <th>#Validators</th>
      </tr>
    </thead>
    <tbody>
      {jobs.map((job) => (
        <tr key={job.id}>
          <td>{job.id}</td>
          <td>{short(job.employer)}</td>
          <td title={`${job.reward} wei`}>{toToken(job.reward)}</td>
          <td>
            <a href={job.uri} target="_blank" rel="noreferrer">
              {job.uri}
            </a>
          </td>
          <td>{job.status}</td>
          <td>{job.validators?.length ?? 0}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const MissionPreview: React.FC<{
  playbook?: Playbook;
  resolveHubLabel: (hubId: string) => string;
}> = ({ playbook, resolveHubLabel }) => {
  if (!playbook) {
    return (
      <p className="mesh-muted">
        Choose a mission to preview step sequencing, hub routing, and total rewards.
      </p>
    );
  }

  const stepDetails = playbook.steps.map((step) => {
    const parts = String(step.hub).split("@");
    const stage = titleCase(parts.length > 1 ? parts[0] : "Mission");
    const hubId = parts.length > 1 ? parts[1] : parts[0];
    return {
      stage,
      hubId,
      uri: step.uri,
      rewardWei: step.rewardWei
    };
  });

  const totalReward = stepDetails.reduce(
    (acc, step) => acc + BigInt(step.rewardWei || "0"),
    0n
  );
  const uniqueHubs = Array.from(new Set(stepDetails.map((step) => step.hubId))).filter(
    Boolean
  );

  return (
    <div className="mesh-preview">
      <div className="mesh-preview-summary">
        <span className="mesh-chip">{stepDetails.length} steps</span>
        <span className="mesh-chip">{uniqueHubs.length} hubs</span>
        <span className="mesh-chip">{formatToken(totalReward)} total</span>
      </div>
      <ol className="mesh-timeline">
        {stepDetails.map((step, index) => (
          <li key={`${step.stage}-${index}`}>
            <div className="mesh-step-index">{index + 1}</div>
            <div className="mesh-step-body">
              <div className="mesh-step-meta">{step.stage}</div>
              <div className="mesh-step-heading">
                {resolveHubLabel(step.hubId || "")} ·
                <span className="mesh-step-amount"> {formatToken(step.rewardWei)}</span>
              </div>
              <a
                className="mesh-step-uri"
                href={step.uri}
                target="_blank"
                rel="noreferrer"
              >
                {step.uri}
              </a>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

const ensureStyles = () => {
  if (document.getElementById("sovereign-mesh-styles")) return;
  const style = document.createElement("style");
  style.id = "sovereign-mesh-styles";
  style.textContent = `
    body { background: radial-gradient(circle at 20% 20%, #10192d, #05070c); color: #f8fafc; min-height: 100vh; margin: 0; }
    h1, h3 { font-family: 'Inter', system-ui, sans-serif; }
    .mesh-shell { max-width: 1200px; margin: 0 auto; padding: 32px 24px 120px; }
    .mesh-card { background: rgba(15,23,42,0.72); border: 1px solid rgba(94,234,212,0.25); border-radius: 20px; padding: 20px; margin-top: 24px; box-shadow: 0 24px 60px rgba(15,23,42,0.4); }
    button { background: linear-gradient(135deg,#38bdf8,#22d3ee); color: #020617; border: none; border-radius: 999px; padding: 10px 20px; font-weight: 600; cursor: pointer; }
    button:hover { opacity: 0.9; }
    select, input { background: rgba(15,23,42,0.8); border: 1px solid rgba(148,163,184,0.4); color: #e2e8f0; padding: 8px 12px; border-radius: 12px; }
    .mesh-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .mesh-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
    .mesh-table th, .mesh-table td { border-bottom: 1px solid rgba(148,163,184,0.25); padding: 8px 12px; text-align: left; }
    .mesh-table a { color: #38bdf8; }
    .mesh-muted { color: rgba(226,232,240,0.7); font-size: 14px; margin-top: 8px; }
    .mesh-chip { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 999px; background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.35); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    .mesh-preview { margin-top: 16px; }
    .mesh-preview-summary { display: flex; flex-wrap: wrap; gap: 12px; }
    .mesh-timeline { list-style: none; margin: 20px 0 0; padding: 0; position: relative; }
    .mesh-timeline::before { content: ""; position: absolute; left: 15px; top: 0; bottom: 0; width: 2px; background: linear-gradient(180deg, rgba(94,234,212,0.5), rgba(56,189,248,0)); }
    .mesh-timeline li { display: flex; gap: 12px; margin-bottom: 18px; position: relative; }
    .mesh-step-index { width: 32px; height: 32px; background: radial-gradient(circle, rgba(34,211,238,0.9), rgba(14,165,233,0.7)); border-radius: 50%; color: #020617; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px rgba(34,211,238,0.5); }
    .mesh-step-body { flex: 1; background: rgba(15,23,42,0.82); border: 1px solid rgba(94,234,212,0.25); border-radius: 16px; padding: 12px 16px; }
    .mesh-step-meta { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(148,163,184,0.7); margin-bottom: 4px; }
    .mesh-step-heading { font-weight: 600; font-size: 16px; display: flex; align-items: baseline; gap: 6px; color: #e2e8f0; }
    .mesh-step-amount { color: #5eead4; font-size: 14px; }
    .mesh-step-uri { font-size: 12px; color: #38bdf8; word-break: break-all; display: inline-block; margin-top: 6px; }
    .mesh-stat-grid { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px; }
    .mesh-stat { background: rgba(15,23,42,0.85); border: 1px solid rgba(148,163,184,0.25); border-radius: 16px; padding: 16px 20px; min-width: 160px; }
    .mesh-stat-value { font-size: 28px; font-weight: 700; color: #5eead4; display: block; }
    .mesh-stat-label { text-transform: uppercase; font-size: 11px; letter-spacing: 0.18em; color: rgba(148,163,184,0.7); }
    details { margin-top: 16px; }
    details summary { cursor: pointer; }
  `;
  document.head.appendChild(style);
};

const App: React.FC = () => {
  const { cfg, hubs, playbooks } = useMeshConfig();
  const hubKeys = useMemo(() => Object.keys(hubs), [hubs]);
  const [address, setAddress] = useState<string>();
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reward, setReward] = useState("1000000000000000000");
  const [uri, setUri] = useState("ipfs://mesh/spec");
  const [jobId, setJobId] = useState("1");
  const [approve, setApprove] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState("");
  const [summary, setSummary] = useState<MissionSummary>();

  const selectedPlaybookData = useMemo(
    () => playbooks.find((pb) => pb.id === selectedPlaybook),
    [playbooks, selectedPlaybook]
  );
  const resolveHubLabel = useCallback(
    (hubId: string) => hubs[hubId]?.label ?? titleCase(hubId),
    [hubs]
  );
  const toToken = useCallback((value: string | bigint) => formatToken(value), []);

  useEffect(() => {
    ensureStyles();
  }, []);

  const loadJobs = useCallback(() => {
    if (!cfg || !selectedHub) {
      setJobs([]);
      return;
    }
    const hub = hubs[selectedHub];
    if (!hub) {
      setJobs([]);
      return;
    }
    const subgraphUrl = hub.subgraphUrl || cfg.defaultSubgraphUrl;
    makeClient(subgraphUrl)
      .request<{ jobs: Job[] }>(qJobs)
      .then((data) => setJobs(data.jobs ?? []))
      .catch((err) => {
        console.error("Subgraph error", err);
        setJobs([]);
      });
  }, [cfg, hubs, selectedHub]);

  const loadSummary = useCallback(() => {
    fetchJson("/mesh/summary")
      .then((data) => setSummary(data as MissionSummary))
      .catch((err) => console.error("Mesh summary error", err));
  }, []);

  useEffect(() => {
    loadJobs();
    if (!selectedHub) return;
    const interval = window.setInterval(loadJobs, 30000);
    return () => window.clearInterval(interval);
  }, [loadJobs, selectedHub]);

  useEffect(() => {
    loadSummary();
    const interval = window.setInterval(loadSummary, 60000);
    return () => window.clearInterval(interval);
  }, [loadSummary]);

  const orchestratorBase = cfg?.orchestratorBase || meshApiBase;

  const callTx = async (path: string, body: Record<string, unknown>) => {
    const signer = await getSigner();
    const target = `${orchestratorBase}${path}`;
    const response = await fetchJson(target, {
      method: "POST",
      body: JSON.stringify(body)
    });
    const tx = "tx" in response ? response.tx : response;
    const sent = await signer.sendTransaction(tx);
    await sent.wait();
    return sent.hash;
  };

  const connect = async () => {
    const signer = await getSigner();
    setAddress(await signer.getAddress());
  };

  const createJob = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const hash = await callTx(`/mesh/${selectedHub}/tx/create`, {
      rewardWei: reward,
      uri
    });
    alert(`✅ Job created on ${selectedHub}\n${hash}`);
    loadJobs();
    loadSummary();
  };

  const stake = async (role: number, amountWei: string) => {
    if (!selectedHub) return alert("Choose a hub first.");
    const hash = await callTx(`/mesh/${selectedHub}/tx/stake`, {
      role,
      amountWei
    });
    alert(`✅ Stake submitted on ${selectedHub}\n${hash}`);
  };

  const commit = async () => {
    if (!selectedHub || !address) return alert("Connect wallet and choose hub.");
    const { commitHash, salt } = computeCommit(approve);
    localStorage.setItem(`salt_${selectedHub}_${jobId}_${address}`, salt);
    const hash = await callTx(`/mesh/${selectedHub}/tx/commit`, {
      jobId: Number(jobId),
      commitHash,
      subdomain: "validator",
      proof: []
    });
    alert(`🌀 Commit broadcasted\n${hash}`);
    loadJobs();
  };

  const reveal = async () => {
    if (!selectedHub || !address) return alert("Connect wallet and choose hub.");
    const salt = localStorage.getItem(`salt_${selectedHub}_${jobId}_${address}`);
    if (!salt) return alert("Commit salt not found. Please commit first.");
    const hash = await callTx(`/mesh/${selectedHub}/tx/reveal`, {
      jobId: Number(jobId),
      approve,
      salt
    });
    alert(`🌈 Reveal confirmed\n${hash}`);
    loadJobs();
  };

  const finalize = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const hash = await callTx(`/mesh/${selectedHub}/tx/finalize`, {
      jobId: Number(jobId)
    });
    alert(`🏁 Finalization submitted\n${hash}`);
    loadJobs();
  };

  const dispute = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const evidence = prompt("Attach evidence (URL or summary)", "");
    const hash = await callTx(`/mesh/${selectedHub}/tx/dispute`, {
      jobId: Number(jobId),
      evidence
    });
    alert(`⚖️ Dispute raised\n${hash}`);
    loadJobs();
  };

  const instantiate = async () => {
    if (!selectedPlaybook) return alert("Choose a mission playbook.");
    const signer = await getSigner();
    const target = `${orchestratorBase}/mesh/plan/instantiate`;
    const response = await fetchJson(target, {
      method: "POST",
      body: JSON.stringify({ playbookId: selectedPlaybook })
    });
    for (const txData of response.txs) {
      const sent = await signer.sendTransaction(txData);
      await sent.wait();
    }
    alert(`🚀 Mission instantiated across ${response.txs.length} jobs`);
    loadJobs();
    loadSummary();
  };

  const allowlistDev = async (role: number) => {
    if (!selectedHub) return alert("Choose a hub first.");
    if (!address) return alert("Connect wallet first.");
    const hash = await callTx(`/mesh/${selectedHub}/tx/allowlist`, {
      role,
      addr: address
    });
    alert(`🛡️ Allowlist tx sent\n${hash}`);
  };

  return (
    <div className="mesh-shell">
      <h1>🕸️ Sovereign Mesh — Beyond Civic Exocortex</h1>
      <p>
        Multi-hub orchestration for civilization-scale missions. Initiate foresight, research, optimization, and knowledge
        workflows from a single intent. Validators and owners remain fully sovereign through wallet-based control.
      </p>

      <div className="mesh-card mesh-row">
        <button onClick={connect}>
          {address ? `Connected: ${short(address)}` : "Connect Wallet"}
        </button>
        <select value={selectedHub} onChange={(e) => setSelectedHub(e.target.value)}>
          <option value="">— Choose Hub —</option>
          {hubKeys.map((key) => (
            <option key={key} value={key}>
              {hubs[key]?.label ?? key}
            </option>
          ))}
        </select>
        <input
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          placeholder="Reward in wei"
          style={{ minWidth: 220 }}
        />
        <input
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder="IPFS URI"
          style={{ minWidth: 320 }}
        />
        <button onClick={createJob}>Create Job</button>
        <button onClick={() => allowlistDev(1)}>Dev: Allowlist Validator</button>
      </div>

      <div className="mesh-card">
        <h3>Live Jobs — {selectedHub || "Select a hub"}</h3>
        <Table jobs={jobs} toToken={toToken} />
      </div>

      <div className="mesh-card">
        <h3>Mission Intelligence Feed</h3>
        {summary ? (
          <>
            <div className="mesh-stat-grid">
              <div className="mesh-stat">
                <span className="mesh-stat-value">{summary.hubCount}</span>
                <span className="mesh-stat-label">Hubs Online</span>
              </div>
              <div className="mesh-stat">
                <span className="mesh-stat-value">{summary.missionCount}</span>
                <span className="mesh-stat-label">Mission Blueprints</span>
              </div>
              <div className="mesh-stat">
                <span className="mesh-stat-value">{toToken(summary.totalRewardWei)}</span>
                <span className="mesh-stat-label">Total Incentives</span>
              </div>
            </div>
            <p className="mesh-muted">
              Network: {summary.network} · Updated {" "}
              {new Date(summary.updatedAt).toLocaleTimeString()}
            </p>
            <table className="mesh-table mesh-missions">
              <thead>
                <tr>
                  <th>Mission</th>
                  <th>Steps</th>
                  <th>Hubs</th>
                  <th>Stages</th>
                  <th>Total Reward</th>
                  <th>Hub Routing</th>
                </tr>
              </thead>
              <tbody>
                {summary.missions.map((mission) => (
                  <tr key={mission.id}>
                    <td>{mission.name}</td>
                    <td>{mission.stepCount}</td>
                    <td>{mission.hubCount}</td>
                    <td title={mission.stages.map((stage) => titleCase(stage)).join(", ")}>
                      {mission.stageCount}
                    </td>
                    <td>{toToken(mission.totalRewardWei)}</td>
                    <td>{mission.hubs.map((hub) => resolveHubLabel(hub)).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mesh-muted">Loading mission intelligence…</p>
        )}
      </div>

      <div className="mesh-card">
        <h3>Participate</h3>
        <div className="mesh-row">
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="Job ID"
            style={{ width: 120 }}
          />
          <button onClick={() => stake(1, "1000000000000000000")}>Stake 1 AGIA as Validator</button>
          <label>
            <input
              type="checkbox"
              checked={approve}
              onChange={(e) => setApprove(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Approve
          </label>
          <button onClick={commit}>Commit</button>
          <button onClick={reveal}>Reveal</button>
          <button onClick={finalize}>Finalize</button>
          <button onClick={dispute}>Raise Dispute</button>
        </div>
      </div>

      <div className="mesh-card">
        <h3>Mission Playbooks</h3>
        <div className="mesh-row">
          <select value={selectedPlaybook} onChange={(e) => setSelectedPlaybook(e.target.value)}>
            <option value="">— Choose Mission —</option>
            {playbooks.map((pb) => (
              <option key={pb.id} value={pb.id}>
                {pb.name}
              </option>
            ))}
          </select>
          <button onClick={instantiate}>Instantiate Mission</button>
        </div>
        <MissionPreview
          playbook={selectedPlaybookData}
          resolveHubLabel={resolveHubLabel}
        />
      </div>

      <div className="mesh-card">
        <details>
          <summary>
            <strong>Owner Panels</strong> — direct Etherscan write links
          </summary>
          <ul>
            {hubKeys.map((key) => {
              const hub = hubs[key];
              if (!hub) return null;
              const base = `${cfg?.etherscanBase || "https://etherscan.io"}/address`;
              return (
                <li key={key} style={{ marginTop: 8 }}>
                  <strong>{hub.label}</strong>
                  <ul>
                    <li>
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`${base}/${hub.addresses.ValidationModule}#writeContract`}
                      >
                        ValidationModule
                      </a>
                    </li>
                    <li>
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`${base}/${hub.addresses.JobRegistry}#writeContract`}
                      >
                        JobRegistry
                      </a>
                    </li>
                    <li>
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`${base}/${hub.addresses.StakeManager}#writeContract`}
                      >
                        StakeManager
                      </a>
                    </li>
                    <li>
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`${base}/${hub.addresses.IdentityRegistry}#writeContract`}
                      >
                        IdentityRegistry
                      </a>
                    </li>
                    {hub.addresses.FeePool && hub.addresses.FeePool !== ethers.ZeroAddress ? (
                      <li>
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`${base}/${hub.addresses.FeePool}#writeContract`}
                        >
                          FeePool
                        </a>
                      </li>
                    ) : null}
                  </ul>
                </li>
              );
            })}
          </ul>
        </details>
      </div>
    </div>
  );
};

export default App;
