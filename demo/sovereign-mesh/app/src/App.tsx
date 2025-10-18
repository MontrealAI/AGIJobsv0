import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getSigner } from "./lib/ethers";
import { makeClient, qJobs } from "./lib/subgraph";
import { computeCommit } from "./lib/commit";
import { formatAgi, short } from "./lib/format";

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

type Actor = {
  id: string;
  flag: string;
  name: string;
  tagline?: string;
};

type PlaybookStep = {
  hub: string;
  rewardWei: string;
  uri: string;
  description?: string;
};

type Playbook = {
  id: string;
  name: string;
  summary?: string;
  sponsor?: string;
  steps: PlaybookStep[];
};

type PlaybookDisplayStep = {
  key: string;
  stageLabel: string;
  hubLabel: string;
  rewardLabel: string;
  description: string;
  uri: string;
};

type TxResult = {
  hash: string;
  hub?: string;
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

  const baseHeaders: Record<string, string> = { "content-type": "application/json" };
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        baseHeaders[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        baseHeaders[key] = value;
      }
    } else {
      Object.assign(baseHeaders, init.headers as Record<string, string>);
    }
  }

  const response = await fetch(url, { ...init, headers: baseHeaders });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      if (payload && typeof payload === "object" && "error" in payload) {
        message += `: ${(payload as { error?: string }).error ?? ""}`;
      }
    } catch {
      // ignore JSON parse failures for error payloads
    }
    throw new Error(message);
  }
  return response.json();
};

const useMeshConfig = () => {
  const [cfg, setCfg] = useState<MeshConfig>();
  const [hubs, setHubs] = useState<Record<string, HubConfig>>({});
  const [actors, setActors] = useState<Actor[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);

  useEffect(() => {
    fetchJson("/mesh/config").then(setCfg).catch(console.error);
    fetchJson("/mesh/hubs")
      .then((data: { hubs?: Record<string, HubConfig> }) => setHubs(data.hubs ?? {}))
      .catch(console.error);
    fetchJson("/mesh/actors")
      .then((data: Actor[]) => setActors(Array.isArray(data) ? data : []))
      .catch(console.error);
    fetchJson("/mesh/playbooks")
      .then((data: Playbook[]) => setPlaybooks(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  return { cfg, hubs, actors, playbooks };
};

const Table: React.FC<{ jobs: Job[] }> = ({ jobs }) => (
  <table className="mesh-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Proposer</th>
        <th>Reward</th>
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
          <td title={job.reward}>{formatAgi(job.reward)}</td>
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
    h1, h3, h4 { font-family: 'Inter', system-ui, sans-serif; }
    .mesh-shell { max-width: 1200px; margin: 0 auto; padding: 32px 24px 120px; }
    .mesh-card { background: rgba(15,23,42,0.72); border: 1px solid rgba(94,234,212,0.25); border-radius: 20px; padding: 20px; margin-top: 24px; box-shadow: 0 24px 60px rgba(15,23,42,0.4); }
    button { background: linear-gradient(135deg,#38bdf8,#22d3ee); color: #020617; border: none; border-radius: 999px; padding: 10px 20px; font-weight: 600; cursor: pointer; transition: transform 0.2s ease; }
    button:hover { opacity: 0.9; transform: translateY(-1px); }
    button:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
    button:disabled:hover { opacity: 0.35; transform: none; }
    select, input { background: rgba(15,23,42,0.8); border: 1px solid rgba(148,163,184,0.4); color: #e2e8f0; padding: 8px 12px; border-radius: 12px; }
    .mesh-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .mesh-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
    .mesh-table th, .mesh-table td { border-bottom: 1px solid rgba(148,163,184,0.25); padding: 8px 12px; text-align: left; }
    .mesh-table a { color: #38bdf8; }
    .mesh-preview { margin-top: 20px; border-radius: 16px; background: rgba(8,15,30,0.72); border: 1px solid rgba(94,234,212,0.25); padding: 18px; }
    .mesh-preview-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
    .mesh-preview-summary { margin-top: 8px; color: rgba(226,232,240,0.88); max-width: 760px; line-height: 1.5; }
    .mesh-preview-sponsor { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
    .mesh-preview-sponsor-header { display: flex; align-items: center; gap: 8px; font-size: 15px; }
    .mesh-preview-sponsor-header span { font-size: 20px; }
    .mesh-preview-sponsor-header strong { font-weight: 600; }
    .mesh-preview-sponsor small { font-size: 12px; color: rgba(148,163,184,0.85); }
    .mesh-preview-total { text-align: right; min-width: 180px; }
    .mesh-preview-total span { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(94,234,212,0.8); }
    .mesh-preview-total strong { font-size: 20px; display: block; margin-top: 4px; }
    .mesh-step-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
    .mesh-step-table th, .mesh-step-table td { border-bottom: 1px solid rgba(148,163,184,0.16); padding: 10px 12px; text-align: left; vertical-align: top; }
    .mesh-step-table td a { color: #22d3ee; font-weight: 500; }
    .mesh-step-description { color: rgba(203,213,225,0.85); margin-top: 6px; line-height: 1.45; }
    .mesh-actors { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-top: 12px; }
    .mesh-actor { background: rgba(15,23,42,0.6); border: 1px solid rgba(56,189,248,0.2); border-radius: 18px; padding: 16px; box-shadow: inset 0 0 0 1px rgba(2,6,23,0.4); }
    .mesh-actor-flag { font-size: 30px; }
    .mesh-actor-name { font-weight: 600; margin-top: 8px; }
    .mesh-actor-tagline { font-size: 13px; color: rgba(148,163,184,0.88); margin-top: 6px; line-height: 1.5; }
    .mesh-owner-info { color: rgba(148,163,184,0.86); margin-bottom: 12px; line-height: 1.6; }
    .mesh-owner-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
    .mesh-owner-section { background: rgba(8,15,30,0.55); border: 1px solid rgba(94,234,212,0.18); border-radius: 16px; padding: 16px; margin-top: 18px; }
    .mesh-owner-section h4 { margin: 0 0 12px; font-size: 16px; }
    .mesh-owner-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .mesh-owner-label { display: flex; flex-direction: column; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(148,163,184,0.78); }
    .mesh-owner-label input { margin-top: 6px; }
    details { margin-top: 16px; }
    details summary { cursor: pointer; }
  `;
  document.head.appendChild(style);
};

const App: React.FC = () => {
  const { cfg, hubs, playbooks, actors } = useMeshConfig();
  const hubKeys = useMemo(() => Object.keys(hubs), [hubs]);
  const [address, setAddress] = useState<string>();
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reward, setReward] = useState("1000000000000000000");
  const [uri, setUri] = useState("ipfs://mesh/spec");
  const [jobId, setJobId] = useState("1");
  const [approve, setApprove] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState("");
  const [ownerValidators, setOwnerValidators] = useState("3");
  const [ownerCommitWindow, setOwnerCommitWindow] = useState("1800");
  const [ownerRevealWindow, setOwnerRevealWindow] = useState("1800");
  const [ownerApprovalPct, setOwnerApprovalPct] = useState("75");
  const [ownerMinStake, setOwnerMinStake] = useState("1000000000000000000");
  const [ownerMaxStake, setOwnerMaxStake] = useState("0");
  const [ownerUnbondingPeriod, setOwnerUnbondingPeriod] = useState("604800");
  const [ownerFeePct, setOwnerFeePct] = useState("2");
  const [ownerBurnPct, setOwnerBurnPct] = useState("6");
  const [ownerValidatorRewardPct, setOwnerValidatorRewardPct] = useState("12");
  const [ownerEns, setOwnerEns] = useState("");
  const [ownerNameWrapper, setOwnerNameWrapper] = useState("");
  const [ownerReputation, setOwnerReputation] = useState("");
  const [ownerAttestation, setOwnerAttestation] = useState("");
  const [ownerAgentRoot, setOwnerAgentRoot] = useState("");
  const [ownerClubRoot, setOwnerClubRoot] = useState("");
  const [ownerNodeRoot, setOwnerNodeRoot] = useState("");
  const [ownerAgentMerkle, setOwnerAgentMerkle] = useState("");
  const [ownerValidatorMerkle, setOwnerValidatorMerkle] = useState("");

  const actorMap = useMemo(() => {
    const map: Record<string, Actor> = {};
    for (const actor of actors) {
      map[actor.id] = actor;
    }
    return map;
  }, [actors]);

  const selectedPlaybookConfig = useMemo(
    () => playbooks.find((pb) => pb.id === selectedPlaybook),
    [playbooks, selectedPlaybook]
  );

  const selectedSponsor = selectedPlaybookConfig?.sponsor
    ? actorMap[selectedPlaybookConfig.sponsor]
    : undefined;

  const playbookSteps = useMemo<PlaybookDisplayStep[]>(() => {
    if (!selectedPlaybookConfig) return [];
    return selectedPlaybookConfig.steps.map((step) => {
      const [stageLabel, hubId] = String(step.hub).split("@");
      const hub = hubs[hubId];
      const key = `${step.hub}-${step.uri}`;
      return {
        key,
        stageLabel: stageLabel || step.hub,
        hubLabel: hub?.label ?? hubId ?? step.hub,
        rewardLabel: formatAgi(step.rewardWei),
        description: step.description ?? "",
        uri: step.uri
      };
    });
  }, [hubs, selectedPlaybookConfig]);

  const totalRewardWei = useMemo(() => {
    if (!selectedPlaybookConfig) return 0n;
    return selectedPlaybookConfig.steps.reduce<bigint>((acc, step) => {
      try {
        return acc + BigInt(step.rewardWei ?? 0);
      } catch {
        return acc;
      }
    }, 0n);
  }, [selectedPlaybookConfig]);

  const totalRewardLabel = formatAgi(totalRewardWei);

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

  const orchestratorBase = cfg?.orchestratorBase || meshApiBase;

  const sendTxPlan = async (
    path: string,
    body: Record<string, unknown> = {}
  ): Promise<TxResult[]> => {
    const signer = await getSigner();
    const target = new URL(path, orchestratorBase).toString();
    const response = await fetchJson(target, {
      method: "POST",
      body: JSON.stringify(body)
    });

    const plan: any[] = [];
    if (response && typeof response === "object") {
      if (Array.isArray((response as { txs?: unknown }).txs)) {
        plan.push(...((response as { txs: any[] }).txs ?? []));
      }
      if ((response as { tx?: unknown }).tx) {
        plan.push((response as { tx: any }).tx);
      }
    }

    if (!plan.length) {
      throw new Error("No transactions returned by orchestrator");
    }

    const results: TxResult[] = [];
    for (const entry of plan) {
      const txEntry = entry as { to?: string; data?: string; value?: unknown; hub?: string };
      if (!txEntry.to || !txEntry.data) {
        throw new Error("Invalid transaction payload from orchestrator");
      }
      const request = {
        to: txEntry.to,
        data: txEntry.data,
        value: txEntry.value ?? 0
      };
      const sent = await signer.sendTransaction(request);
      await sent.wait();
      results.push({ hash: sent.hash, hub: txEntry.hub });
    }

    return results;
  };

  const describeHashes = (txs: TxResult[]) =>
    txs
      .map((entry) => (entry.hub ? `${entry.hash} — ${entry.hub}` : entry.hash))
      .join("\n");

  const pickValue = (value: string) => {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  };

  const connect = async () => {
    const signer = await getSigner();
    setAddress(await signer.getAddress());
  };

  const createJob = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const [result] = await sendTxPlan(`/mesh/${selectedHub}/tx/create`, {
      rewardWei: reward,
      uri
    });
    alert(`✅ Job created on ${selectedHub}\n${result.hash}`);
  };

  const stake = async (role: number, amountWei: string) => {
    if (!selectedHub) return alert("Choose a hub first.");
    const [result] = await sendTxPlan(`/mesh/${selectedHub}/tx/stake`, {
      role,
      amountWei
    });
    alert(`✅ Stake submitted on ${selectedHub}\n${result.hash}`);
  };

  const commit = async () => {
    if (!selectedHub || !address) return alert("Connect wallet and choose hub.");
    const { commitHash, salt } = computeCommit(approve);
    localStorage.setItem(`salt_${selectedHub}_${jobId}_${address}`, salt);
    const [result] = await sendTxPlan(`/mesh/${selectedHub}/tx/commit`, {
      jobId: Number(jobId),
      commitHash,
      subdomain: "validator",
      proof: []
    });
    alert(`🌀 Commit broadcasted\n${result.hash}`);
  };

  const reveal = async () => {
    if (!selectedHub || !address) return alert("Connect wallet and choose hub.");
    const salt = localStorage.getItem(`salt_${selectedHub}_${jobId}_${address}`);
    if (!salt) return alert("Commit salt not found. Please commit first.");
    const [result] = await sendTxPlan(`/mesh/${selectedHub}/tx/reveal`, {
      jobId: Number(jobId),
      approve,
      salt
    });
    alert(`🌈 Reveal confirmed\n${result.hash}`);
  };

  const finalize = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const [result] = await sendTxPlan(`/mesh/${selectedHub}/tx/finalize`, {
      jobId: Number(jobId)
    });
    alert(`🏁 Finalization submitted\n${result.hash}`);
  };

  const dispute = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const evidence = prompt("Attach evidence (URL or summary)", "");
    const [result] = await sendTxPlan(`/mesh/${selectedHub}/tx/dispute`, {
      jobId: Number(jobId),
      evidence
    });
    alert(`⚖️ Dispute raised\n${result.hash}`);
  };

  const instantiate = async () => {
    if (!selectedPlaybook) return alert("Choose a mission playbook.");
    const results = await sendTxPlan("/mesh/plan/instantiate", {
      playbookId: selectedPlaybook
    });
    alert(
      `🚀 Mission instantiated across ${results.length} jobs\n${describeHashes(results)}`
    );
  };

  const allowlistDev = async (role: number) => {
    if (!selectedHub) return alert("Choose a hub first.");
    if (!address) return alert("Connect wallet first.");
    const [result] = await sendTxPlan(`/mesh/${selectedHub}/tx/allowlist`, {
      role,
      addr: address
    });
    alert(`🛡️ Allowlist tx sent\n${result.hash}`);
  };

  const pauseHub = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const results = await sendTxPlan(`/mesh/${selectedHub}/owner/pause`);
    alert(`⏸️ Hub paused\n${describeHashes(results)}`);
  };

  const resumeHub = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    const results = await sendTxPlan(`/mesh/${selectedHub}/owner/unpause`);
    alert(`▶️ Hub resumed\n${describeHashes(results)}`);
  };

  const updateValidation = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    try {
      const results = await sendTxPlan(`/mesh/${selectedHub}/owner/validation`, {
        validatorsPerJob: pickValue(ownerValidators),
        commitWindow: pickValue(ownerCommitWindow),
        revealWindow: pickValue(ownerRevealWindow),
        approvalPct: pickValue(ownerApprovalPct)
      });
      alert(
        `📡 Validation parameters updated (${results.length} tx)\n${describeHashes(results)}`
      );
    } catch (error) {
      if (error instanceof Error) {
        alert(`⚠️ ${error.message}`);
      } else {
        alert("⚠️ Unable to update validation settings");
      }
    }
  };

  const updateStake = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    try {
      const results = await sendTxPlan(`/mesh/${selectedHub}/owner/stake`, {
        minStakeWei: pickValue(ownerMinStake),
        maxStakeWei: pickValue(ownerMaxStake),
        unbondingPeriod: pickValue(ownerUnbondingPeriod),
        feePct: pickValue(ownerFeePct),
        burnPct: pickValue(ownerBurnPct),
        validatorRewardPct: pickValue(ownerValidatorRewardPct)
      });
      alert(
        `🏛️ Stake parameters updated (${results.length} tx)\n${describeHashes(results)}`
      );
    } catch (error) {
      if (error instanceof Error) {
        alert(`⚠️ ${error.message}`);
      } else {
        alert("⚠️ Unable to update stake parameters");
      }
    }
  };

  const updateIdentity = async () => {
    if (!selectedHub) return alert("Choose a hub first.");
    try {
      const results = await sendTxPlan(`/mesh/${selectedHub}/owner/identity`, {
        ens: pickValue(ownerEns),
        nameWrapper: pickValue(ownerNameWrapper),
        reputationEngine: pickValue(ownerReputation),
        attestationRegistry: pickValue(ownerAttestation),
        agentRootNode: pickValue(ownerAgentRoot),
        clubRootNode: pickValue(ownerClubRoot),
        nodeRootNode: pickValue(ownerNodeRoot),
        agentMerkleRoot: pickValue(ownerAgentMerkle),
        validatorMerkleRoot: pickValue(ownerValidatorMerkle)
      });
      alert(
        `🧬 Identity registry updated (${results.length} tx)\n${describeHashes(results)}`
      );
    } catch (error) {
      if (error instanceof Error) {
        alert(`⚠️ ${error.message}`);
      } else {
        alert("⚠️ Unable to update identity configuration");
      }
    }
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
        <h3>Owner Control Center</h3>
        <p className="mesh-owner-info">
          Connect with the governance wallet to pause hubs, retune validation cadence, and
          adjust staking economics. Transactions execute directly from your wallet — no
          backend custody.
        </p>
        <div className="mesh-owner-actions">
          <button onClick={pauseHub}>Pause Hub</button>
          <button onClick={resumeHub}>Resume Hub</button>
        </div>
        <div className="mesh-owner-section">
          <h4>Validation cadence</h4>
          <div className="mesh-owner-fields">
            <label className="mesh-owner-label">
              Validators / Job
              <input
                value={ownerValidators}
                onChange={(e) => setOwnerValidators(e.target.value)}
                placeholder="e.g. 3"
              />
            </label>
            <label className="mesh-owner-label">
              Commit Window (s)
              <input
                value={ownerCommitWindow}
                onChange={(e) => setOwnerCommitWindow(e.target.value)}
                placeholder="Seconds"
              />
            </label>
            <label className="mesh-owner-label">
              Reveal Window (s)
              <input
                value={ownerRevealWindow}
                onChange={(e) => setOwnerRevealWindow(e.target.value)}
                placeholder="Seconds"
              />
            </label>
            <label className="mesh-owner-label">
              Approval Threshold (%)
              <input
                value={ownerApprovalPct}
                onChange={(e) => setOwnerApprovalPct(e.target.value)}
                placeholder="0-100"
              />
            </label>
          </div>
          <button style={{ marginTop: 12 }} onClick={updateValidation}>
            Apply Validation Settings
          </button>
        </div>
        <div className="mesh-owner-section">
          <h4>Stake economics</h4>
          <div className="mesh-owner-fields">
            <label className="mesh-owner-label">
              Min Stake (wei)
              <input
                value={ownerMinStake}
                onChange={(e) => setOwnerMinStake(e.target.value)}
                placeholder="Minimum stake"
              />
            </label>
            <label className="mesh-owner-label">
              Max Stake (wei)
              <input
                value={ownerMaxStake}
                onChange={(e) => setOwnerMaxStake(e.target.value)}
                placeholder="0 = unlimited"
              />
            </label>
            <label className="mesh-owner-label">
              Unbonding Period (s)
              <input
                value={ownerUnbondingPeriod}
                onChange={(e) => setOwnerUnbondingPeriod(e.target.value)}
                placeholder="Seconds"
              />
            </label>
            <label className="mesh-owner-label">
              Fee %
              <input
                value={ownerFeePct}
                onChange={(e) => setOwnerFeePct(e.target.value)}
                placeholder="0-100"
              />
            </label>
            <label className="mesh-owner-label">
              Burn %
              <input
                value={ownerBurnPct}
                onChange={(e) => setOwnerBurnPct(e.target.value)}
                placeholder="0-100"
              />
            </label>
            <label className="mesh-owner-label">
              Validator Reward %
              <input
                value={ownerValidatorRewardPct}
                onChange={(e) => setOwnerValidatorRewardPct(e.target.value)}
                placeholder="0-100"
              />
            </label>
          </div>
          <button style={{ marginTop: 12 }} onClick={updateStake}>
            Apply Stake Settings
          </button>
        </div>
        <div className="mesh-owner-section">
          <h4>Identity registry</h4>
          <p className="mesh-owner-info" style={{ marginTop: 0 }}>
            Refresh ENS anchors, Merkle roots, and attestation registries to steer who can
            participate across the mesh hubs. Provide only the fields you want to change.
          </p>
          <div className="mesh-owner-fields">
            <label className="mesh-owner-label">
              ENS Registry Address
              <input
                value={ownerEns}
                onChange={(e) => setOwnerEns(e.target.value)}
                placeholder="0x..."
              />
            </label>
            <label className="mesh-owner-label">
              Name Wrapper Address
              <input
                value={ownerNameWrapper}
                onChange={(e) => setOwnerNameWrapper(e.target.value)}
                placeholder="0x..."
              />
            </label>
            <label className="mesh-owner-label">
              Reputation Engine Address
              <input
                value={ownerReputation}
                onChange={(e) => setOwnerReputation(e.target.value)}
                placeholder="0x..."
              />
            </label>
            <label className="mesh-owner-label">
              Attestation Registry Address
              <input
                value={ownerAttestation}
                onChange={(e) => setOwnerAttestation(e.target.value)}
                placeholder="0x..."
              />
            </label>
            <label className="mesh-owner-label">
              Agent Root Node (bytes32)
              <input
                value={ownerAgentRoot}
                onChange={(e) => setOwnerAgentRoot(e.target.value)}
                placeholder="0x…"
              />
            </label>
            <label className="mesh-owner-label">
              Club Root Node (bytes32)
              <input
                value={ownerClubRoot}
                onChange={(e) => setOwnerClubRoot(e.target.value)}
                placeholder="0x…"
              />
            </label>
            <label className="mesh-owner-label">
              Node Root Node (bytes32)
              <input
                value={ownerNodeRoot}
                onChange={(e) => setOwnerNodeRoot(e.target.value)}
                placeholder="0x…"
              />
            </label>
            <label className="mesh-owner-label">
              Agent Merkle Root (bytes32)
              <input
                value={ownerAgentMerkle}
                onChange={(e) => setOwnerAgentMerkle(e.target.value)}
                placeholder="0x…"
              />
            </label>
            <label className="mesh-owner-label">
              Validator Merkle Root (bytes32)
              <input
                value={ownerValidatorMerkle}
                onChange={(e) => setOwnerValidatorMerkle(e.target.value)}
                placeholder="0x…"
              />
            </label>
          </div>
          <button style={{ marginTop: 12 }} onClick={updateIdentity}>
            Apply Identity Settings
          </button>
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
          <button onClick={instantiate} disabled={!selectedPlaybook}>
            Instantiate Mission
          </button>
        </div>
        {selectedPlaybookConfig ? (
          <div className="mesh-preview">
            <div className="mesh-preview-header">
              <div>
                <h4>{selectedPlaybookConfig.name}</h4>
                {selectedSponsor ? (
                  <div className="mesh-preview-sponsor">
                    <div className="mesh-preview-sponsor-header">
                      <span>{selectedSponsor.flag}</span>
                      <strong>{selectedSponsor.name}</strong>
                    </div>
                    {selectedSponsor.tagline ? (
                      <small>{selectedSponsor.tagline}</small>
                    ) : null}
                  </div>
                ) : null}
                {selectedPlaybookConfig.summary ? (
                  <p className="mesh-preview-summary">{selectedPlaybookConfig.summary}</p>
                ) : null}
              </div>
              <div className="mesh-preview-total">
                <span>Total Reward</span>
                <strong>{totalRewardLabel}</strong>
              </div>
            </div>
            <table className="mesh-step-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Hub</th>
                  <th>Reward</th>
                  <th>Deliverable</th>
                </tr>
              </thead>
              <tbody>
                {playbookSteps.map((step) => (
                  <tr key={step.key}>
                    <td>{step.stageLabel}</td>
                    <td>{step.hubLabel}</td>
                    <td>{step.rewardLabel}</td>
                    <td>
                      {step.description ? (
                        <div className="mesh-step-description">{step.description}</div>
                      ) : null}
                      <a href={step.uri} target="_blank" rel="noreferrer">
                        {step.uri}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mesh-preview-summary" style={{ marginTop: 16 }}>
            Choose a mission to preview the cross-hub launch plan and signature sequence.
          </p>
        )}
      </div>

      {actors.length > 0 ? (
        <div className="mesh-card">
          <h3>Mesh Sponsors & Actors</h3>
          <div className="mesh-actors">
            {actors.map((actor) => (
              <div key={actor.id} className="mesh-actor">
                <div className="mesh-actor-flag">{actor.flag}</div>
                <div className="mesh-actor-name">{actor.name}</div>
                {actor.tagline ? <div className="mesh-actor-tagline">{actor.tagline}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
