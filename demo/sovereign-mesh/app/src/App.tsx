import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getSigner } from "./lib/ethers";
import { makeClient, qJobs } from "./lib/subgraph";
import { computeCommit } from "./lib/commit";
import { formatAgia, formatTimestamp, short } from "./lib/format";

type Config = {
  network: string;
  etherscanBase: string;
  defaultSubgraphUrl: string;
  orchestratorBase?: string;
  hubs: string[];
};

type HubAddresses = Record<string, string>;

type HubInfo = {
  label: string;
  rpcUrl?: string;
  subgraphUrl?: string;
  addresses: HubAddresses;
};

type Actor = {
  id: string;
  name: string;
  flag?: string;
  description?: string;
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

const envOrchestratorBase = (
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
).VITE_ORCHESTRATOR_BASE;
const runtimeOverride =
  typeof window !== "undefined" ? (window as any).__SOVEREIGN_MESH_ORCHESTRATOR_BASE__ : undefined;
const defaultOrchestratorBase = (runtimeOverride || envOrchestratorBase || "http://localhost:8084").replace(/\/$/, "");

const buildUrl = (path: string, base: string) => {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const trimmedBase = base.replace(/\/$/, "");
  if (path.startsWith("/")) {
    return `${trimmedBase}${path}`;
  }
  return `${trimmedBase}/${path}`;
};

const fetchJson = async (path: string, init?: RequestInit, base = defaultOrchestratorBase) => {
  const url = buildUrl(path, base);
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
};

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: "linear-gradient(135deg, #f5f9ff 0%, #ecf2ff 100%)",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
  border: "1px solid #d8e3ff",
  minHeight: 90
};

export default function App() {
  const [cfg, setCfg] = useState<Config>();
  const [cfgError, setCfgError] = useState<string>();
  const [hubMap, setHubMap] = useState<Record<string, HubInfo>>({});
  const [hubKeys, setHubKeys] = useState<string[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>();
  const [rewardWei, setRewardWei] = useState("1000000000000000000");
  const [uri, setUri] = useState("ipfs://mesh/spec");
  const [jobId, setJobId] = useState<string>("");
  const [approve, setApprove] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [address, setAddress] = useState<string>();

  const orchestratorBase = useMemo(
    () => (cfg?.orchestratorBase || defaultOrchestratorBase).replace(/\/$/, ""),
    [cfg]
  );

  useEffect(() => {
    fetchJson("/mesh/config")
      .then((config) => setCfg(config))
      .catch((error) => {
        console.error(error);
        setCfgError("Unable to load Sovereign Mesh config. Check orchestrator availability.");
      });
  }, []);

  useEffect(() => {
    fetchJson("/mesh/hubs", undefined, orchestratorBase)
      .then((data) => {
        if (data?.hubs && typeof data.hubs === "object") {
          setHubMap(data.hubs as Record<string, HubInfo>);
          setHubKeys(Object.keys(data.hubs));
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/mesh/actors", undefined, orchestratorBase)
      .then((items) => {
        if (Array.isArray(items)) {
          setActors(items as Actor[]);
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/mesh/playbooks", undefined, orchestratorBase)
      .then((items) => {
        if (Array.isArray(items)) {
          setPlaybooks(items as Playbook[]);
        }
      })
      .catch((err) => console.error(err));
  }, [orchestratorBase]);

  const selectedHubInfo = selectedHub ? hubMap[selectedHub] : undefined;

  const refreshJobs = useCallback(async () => {
    if (!selectedHub) {
      setJobs([]);
      return;
    }
    const hub = hubMap[selectedHub];
    if (!hub) {
      setJobs([]);
      return;
    }
    const subgraph = hub.subgraphUrl || cfg?.defaultSubgraphUrl;
    if (!subgraph) {
      setJobs([]);
      return;
    }
    try {
      setJobsLoading(true);
      const data = await makeClient(subgraph).request(qJobs);
      setJobs(data.jobs ?? []);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error(error);
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, [cfg, hubMap, selectedHub]);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  const connect = useCallback(async () => {
    const signer = await getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
  }, []);

  const requireHub = () => {
    if (!selectedHub) {
      alert("Choose a hub first");
      throw new Error("Hub not selected");
    }
    return selectedHub;
  };

  const requireJobId = () => {
    const numeric = Number(jobId);
    if (!Number.isInteger(numeric) || numeric < 0) {
      alert("Enter a valid numeric job ID");
      throw new Error("Invalid job id");
    }
    return numeric;
  };

  const sendTx = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const payload = await fetchJson(
        path,
        {
          method: "POST",
          body: JSON.stringify(body)
        },
        orchestratorBase
      );
      const signer = await getSigner();
      const tx = await signer.sendTransaction((payload as any).tx ?? payload);
      await tx.wait();
      return tx.hash;
    },
    [orchestratorBase]
  );

  const createJob = async () => {
    try {
      const hub = requireHub();
      const hash = await sendTx(`/mesh/${hub}/tx/create`, { rewardWei, uri });
      alert(`✅ Submitted on ${hub}: ${hash}`);
      refreshJobs();
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to create job: ${error?.message ?? "Unknown error"}`);
    }
  };

  const stake = async (role: number, amountWei: string) => {
    try {
      const hub = requireHub();
      const hash = await sendTx(`/mesh/${hub}/tx/stake`, { role, amountWei });
      alert(`✅ Staked on ${hub}: ${hash}`);
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to stake: ${error?.message ?? "Unknown error"}`);
    }
  };

  const commit = async () => {
    try {
      if (!address) {
        await connect();
      }
      const hub = requireHub();
      const jobNumeric = requireJobId();
      const { commitHash, salt } = computeCommit(approve);
      const key = `salt_${hub}_${jobNumeric}_${address}`;
      localStorage.setItem(key, salt);
      const hash = await sendTx(`/mesh/${hub}/tx/commit`, {
        jobId: jobNumeric,
        commitHash,
        subdomain: "validator",
        proof: []
      });
      alert(`✅ Committed on ${hub}: ${hash}`);
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to commit: ${error?.message ?? "Unknown error"}`);
    }
  };

  const reveal = async () => {
    try {
      const hub = requireHub();
      const jobNumeric = requireJobId();
      const key = `salt_${hub}_${jobNumeric}_${address}`;
      const salt = localStorage.getItem(key);
      if (!salt) {
        alert("No commit found for this job. Commit first.");
        return;
      }
      const hash = await sendTx(`/mesh/${hub}/tx/reveal`, {
        jobId: jobNumeric,
        approve,
        salt
      });
      alert(`✅ Revealed on ${hub}: ${hash}`);
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to reveal: ${error?.message ?? "Unknown error"}`);
    }
  };

  const finalize = async () => {
    try {
      const hub = requireHub();
      const jobNumeric = requireJobId();
      const hash = await sendTx(`/mesh/${hub}/tx/finalize`, { jobId: jobNumeric });
      alert(`✅ Finalized on ${hub}: ${hash}`);
      refreshJobs();
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to finalize: ${error?.message ?? "Unknown error"}`);
    }
  };

  const instantiatePlaybook = async () => {
    if (!selectedPlaybook) {
      alert("Choose a mission playbook");
      return;
    }
    try {
      const payload = await fetchJson(
        "/mesh/plan/instantiate",
        {
          method: "POST",
          body: JSON.stringify({ playbookId: selectedPlaybook })
        },
        orchestratorBase
      );
      const signer = await getSigner();
      const txs = ((payload as any).txs ?? []) as Array<{ to: string; data: string; value?: string }>;
      for (const txData of txs) {
        const resp = await signer.sendTransaction(txData);
        await resp.wait();
      }
      alert(`🚀 Mission instantiated across ${txs.length} jobs! Switch hubs to review fresh postings.`);
      refreshJobs();
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to instantiate mission: ${error?.message ?? "Unknown error"}`);
    }
  };

  const allowlist = async (role: number) => {
    try {
      const hub = requireHub();
      const hash = await sendTx(`/mesh/${hub}/tx/allowlist`, { role, addr: address });
      alert(`✅ Allowlisted on ${hub}: ${hash}`);
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to allowlist: ${error?.message ?? "Unknown error"}`);
    }
  };

  const activePlaybook = useMemo(
    () => playbooks.find((pb) => pb.id === selectedPlaybook),
    [playbooks, selectedPlaybook]
  );

  const missionSteps = useMemo(() => {
    if (!activePlaybook) return [] as Array<{
      stage: string;
      hubKey: string;
      hubLabel: string;
      rewardWei: string;
      uri: string;
    }>;
    return activePlaybook.steps.map((step) => {
      const [stage, hubKey] = String(step.hub).split("@");
      const hub = hubMap[hubKey];
      return {
        stage: stage || "stage",
        hubKey,
        hubLabel: hub?.label || hubKey,
        rewardWei: step.rewardWei,
        uri: step.uri
      };
    });
  }, [activePlaybook, hubMap]);

  const missionTotalReward = useMemo(() => {
    return missionSteps.reduce((acc, step) => acc + BigInt(step.rewardWei || "0"), 0n);
  }, [missionSteps]);

  return (
    <div style={{ fontFamily: "Inter, system-ui", padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <h1>🕸️ Sovereign Mesh — Beyond Civic Exocortex</h1>
      <p>
        Multi-hub orchestration for civilization-scale missions. Choose a hub, post jobs, or instantiate a mission playbook
        spanning foresight, research, optimisation, and knowledge hubs. Wallet-first flows keep operators in command while
        validators coordinate planetary intelligence.
      </p>
      {cfgError ? (
        <div style={{ marginTop: 12, padding: 16, borderRadius: 12, background: "#fee2e2", color: "#7f1d1d" }}>{cfgError}</div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 24
        }}
        data-testid="hero-metrics"
      >
        <div style={cardStyle}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "#475569", letterSpacing: 1 }}>Network</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{cfg?.network || "Loading…"}</div>
          <div style={{ fontSize: 12, color: "#475569" }}>Ethereum endpoint used by all hubs.</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "#475569", letterSpacing: 1 }}>Orchestrator</div>
          <div style={{ fontSize: 16, fontWeight: 600, wordBreak: "break-all" }}>{orchestratorBase}</div>
          <div style={{ fontSize: 12, color: "#475569" }}>Stateless composer. Wallet signs every transaction.</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "#475569", letterSpacing: 1 }}>Hubs online</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{hubKeys.length}</div>
          <div style={{ fontSize: 12, color: "#475569" }}>Config-driven network-of-networks.</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "#475569", letterSpacing: 1 }}>Jobs loaded</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{jobsLoading ? "…" : jobs.length}</div>
          <div style={{ fontSize: 12, color: "#475569" }}>Last refresh: {formatTimestamp(lastRefreshed)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 28 }}>
        <button onClick={connect} data-testid="connect-wallet">
          {address ? `Connected: ${short(address)}` : "Connect Wallet"}
        </button>
        <select
          data-testid="hub-select"
          onChange={(e) => setSelectedHub(e.target.value)}
          defaultValue=""
          style={{ minWidth: 220 }}
        >
          <option value="">— Choose Hub —</option>
          {hubKeys.map((key) => (
            <option key={key} value={key}>
              {hubMap[key]?.label ?? key}
            </option>
          ))}
        </select>
        <input value={rewardWei} onChange={(e) => setRewardWei(e.target.value)} style={{ width: 260 }} />
        <input value={uri} onChange={(e) => setUri(e.target.value)} style={{ width: 360 }} />
        <button onClick={createJob} data-testid="create-job">
          Create Job
        </button>
        <button onClick={() => allowlist(1)} data-testid="allowlist-dev">
          Dev: Allowlist Validator
        </button>
      </div>

      {selectedHubInfo ? (
        <section
          style={{
            marginTop: 24,
            padding: 20,
            borderRadius: 18,
            border: "1px solid #e2e8f0",
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)"
          }}
          data-testid="hub-surface"
        >
          <h3>Hub Control Surface — {selectedHubInfo.label}</h3>
          <p style={{ marginBottom: 12 }}>
            RPC: {selectedHubInfo.rpcUrl || "—"} · Subgraph: {selectedHubInfo.subgraphUrl || cfg?.defaultSubgraphUrl || "—"}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Module</th>
                <th align="left">Address</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(selectedHubInfo.addresses || {}).map(([name, addr]) => (
                <tr key={name}>
                  <td style={{ padding: "4px 0" }}>{name}</td>
                  <td style={{ padding: "4px 0" }}>{addr === "0x0000000000000000000000000000000000000000" ? "—" : short(addr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={refreshJobs} style={{ marginTop: 16 }} data-testid="refresh-jobs">
            Refresh jobs from subgraph
          </button>
        </section>
      ) : null}

      <h3 style={{ marginTop: 28 }}>Live Jobs on Hub: {selectedHub || "—"}</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="jobs-table">
        <thead>
          <tr>
            <th align="left">ID</th>
            <th align="left">Proposer</th>
            <th align="left">Reward (wei)</th>
            <th align="left">URI</th>
            <th align="left">Status</th>
            <th align="left">#Val</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j: any) => (
            <tr key={j.id}>
              <td>{j.id}</td>
              <td>{short(j.employer)}</td>
              <td>{j.reward}</td>
              <td>
                <a href={j.uri} target="_blank" rel="noreferrer">
                  {j.uri}
                </a>
              </td>
              <td>{j.status}</td>
              <td>{j.validators?.length ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 28 }}>Participate on {selectedHub || "—"}</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="jobId" data-testid="job-id-input" />
        <button onClick={() => stake(1, "1000000000000000000")} data-testid="stake-validator">
          Stake as Validator (1)
        </button>
        <label>
          <input
            type="checkbox"
            checked={approve}
            onChange={(e) => setApprove(e.target.checked)}
            data-testid="approve-toggle"
          />
          approve
        </label>
        <button onClick={commit} data-testid="commit-validation">
          Commit
        </button>
        <button onClick={reveal} data-testid="reveal-validation">
          Reveal
        </button>
        <button onClick={finalize} data-testid="finalize-validation">
          Finalize
        </button>
      </div>

      <section style={{ marginTop: 32 }} data-testid="playbook-section">
        <h3>Mission Playbooks (cross-hub)</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select
            onChange={(e) => setSelectedPlaybook(e.target.value)}
            defaultValue=""
            style={{ minWidth: 260 }}
            data-testid="playbook-select"
          >
            <option value="">— Choose Mission —</option>
            {playbooks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button onClick={instantiatePlaybook} data-testid="instantiate-playbook">
            Instantiate Mission
          </button>
        </div>
        {activePlaybook ? (
          <div
            style={{
              marginTop: 16,
              borderRadius: 18,
              border: "1px solid #cbd5f5",
              background: "linear-gradient(135deg, #edf2ff 0%, #e0e7ff 100%)",
              padding: 20
            }}
            data-testid="playbook-preview"
          >
            <h4 style={{ marginTop: 0 }}>{activePlaybook.name}</h4>
            <p style={{ marginBottom: 16 }}>
              Steps: {missionSteps.length} · Aggregate reward: {formatAgia(missionTotalReward)}
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left">Stage</th>
                  <th align="left">Hub</th>
                  <th align="left">Reward</th>
                  <th align="left">Spec URI</th>
                </tr>
              </thead>
              <tbody>
                {missionSteps.map((step, idx) => (
                  <tr key={`${step.hubKey}-${idx}`}>
                    <td>{step.stage}</td>
                    <td>{step.hubLabel}</td>
                    <td>{formatAgia(step.rewardWei)}</td>
                    <td>
                      <a href={step.uri} target="_blank" rel="noreferrer">
                        {step.uri}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, marginTop: 12, color: "#4338ca" }}>
              All rewards denominated in on-chain AGI tokens. Owners can update playbooks via `config/playbooks.json` without
              redeploying the app.
            </p>
          </div>
        ) : null}
      </section>

      {actors.length ? (
        <section style={{ marginTop: 32 }} data-testid="actors-panel">
          <h3>Actor intelligence roster</h3>
          <p style={{ marginBottom: 12 }}>Editable personas from `config/actors.json` bring missions to life.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {actors.map((actor) => (
              <div
                key={actor.id}
                style={{
                  ...cardStyle,
                  minWidth: 180,
                  flex: "0 0 180px",
                  background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
                  border: "1px solid #fed7aa"
                }}
              >
                <div style={{ fontSize: 20 }}>
                  {actor.flag ?? "🌐"} <strong>{actor.name}</strong>
                </div>
                <div style={{ fontSize: 12, color: "#7c2d12" }}>Identity: {actor.id}</div>
                {actor.description ? <p style={{ fontSize: 12 }}>{actor.description}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <details style={{ marginTop: 32 }}>
        <summary>
          <strong>Owner Panels</strong> (links to Etherscan write interfaces)
        </summary>
        <ul>
          {hubKeys.map((key) => {
            const hub = hubMap[key];
            if (!hub) return null;
            const base = `${cfg?.etherscanBase ?? "https://etherscan.io"}/address`;
            return (
              <li key={key}>
                <strong>{hub.label}</strong>
                <ul>
                  {["ValidationModule", "JobRegistry", "StakeManager", "IdentityRegistry", "FeePool"].map((module) => {
                    const addr = hub.addresses?.[module];
                    if (!addr || addr === "0x0000000000000000000000000000000000000000") {
                      return null;
                    }
                    return (
                      <li key={module}>
                        <a href={`${base}/${addr}#writeContract`} target="_blank" rel="noreferrer">
                          {module}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
