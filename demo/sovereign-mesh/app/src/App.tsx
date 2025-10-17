import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getSigner } from "./lib/ethers";
import { makeClient, qJobs } from "./lib/subgraph";
import { computeCommit } from "./lib/commit";
import { short } from "./lib/format";

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

const fetchJson = async (path: string, init?: RequestInit) => {
  const base = new URL(path, window.location.origin);
  const response = await fetch(base.toString(), {
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
  const [playbooks, setPlaybooks] = useState<any[]>([]);

  useEffect(() => {
    fetchJson("/mesh/config").then(setCfg).catch(console.error);
    fetchJson("/mesh/hubs")
      .then((data) => setHubs(data.hubs ?? {}))
      .catch(console.error);
    fetchJson("/mesh/actors").then(setActors).catch(console.error);
    fetchJson("/mesh/playbooks").then(setPlaybooks).catch(console.error);
  }, []);

  return { cfg, hubs, actors, playbooks };
};

const Table: React.FC<{ jobs: Job[] }> = ({ jobs }) => (
  <table className="mesh-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Proposer</th>
        <th>Reward (wei)</th>
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
          <td>{job.reward}</td>
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

  useEffect(() => {
    ensureStyles();
  }, []);

  useEffect(() => {
    if (!cfg || !selectedHub) return;
    const hub = hubs[selectedHub];
    if (!hub) return;
    const subgraphUrl = hub.subgraphUrl || cfg.defaultSubgraphUrl;
    makeClient(subgraphUrl)
      .request<{ jobs: Job[] }>(qJobs)
      .then((data) => setJobs(data.jobs ?? []))
      .catch((err) => console.error("Subgraph error", err));
  }, [cfg, hubs, selectedHub]);

  const orchestratorBase = cfg?.orchestratorBase || "";

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
  };

  const finalize = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const hash = await callTx(`/mesh/${selectedHub}/tx/finalize`, {
      jobId: Number(jobId)
    });
    alert(`🏁 Finalization submitted\n${hash}`);
  };

  const dispute = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const evidence = prompt("Attach evidence (URL or summary)", "");
    const hash = await callTx(`/mesh/${selectedHub}/tx/dispute`, {
      jobId: Number(jobId),
      evidence
    });
    alert(`⚖️ Dispute raised\n${hash}`);
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
        <Table jobs={jobs} />
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
