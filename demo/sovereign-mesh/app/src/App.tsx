import React, { useEffect, useMemo, useState } from "react";
import { getSigner } from "./lib/ethers";
import { makeClient, qJobs } from "./lib/subgraph";
import { prepareCommitSalt } from "./lib/commit";
import { short } from "./lib/format";

type MeshConfig = {
  network: string;
  etherscanBase: string;
  defaultSubgraphUrl: string;
  orchestratorBase: string;
  hubs: string[];
};

type HubDetails = {
  label: string;
  rpcUrl: string;
  subgraphUrl?: string;
  addresses: Record<string, string>;
};

type JobsResponse = {
  jobs: JobFragment[];
};

type JobFragment = {
  id: string;
  employer: string;
  reward: string;
  uri: string;
  status: string;
  validators?: { account: string }[];
};

type Playbook = {
  id: string;
  name: string;
  description?: string;
  steps: { hub: string; rewardWei: string; uri: string }[];
};

type Actor = {
  id: string;
  flag: string;
  name: string;
};

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
};

const DEFAULT_ORCHESTRATOR =
  (import.meta.env.VITE_ORCHESTRATOR_BASE as string | undefined) || "http://localhost:8084";

const gradientCard: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(236,72,153,0.18))",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 24,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 12
};

export default function App(): JSX.Element {
  const [cfg, setCfg] = useState<MeshConfig>();
  const [orchestratorBase, setOrchestratorBase] = useState<string>(DEFAULT_ORCHESTRATOR);
  const [hubMap, setHubMap] = useState<Record<string, HubDetails>>({});
  const [hubOrder, setHubOrder] = useState<string[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<JobFragment[]>([]);
  const [connected, setConnected] = useState<string>();
  const [reward, setReward] = useState<string>("1000000000000000000");
  const [uri, setUri] = useState<string>("ipfs://mesh/spec");
  const [jobId, setJobId] = useState<string>("");
  const [approve, setApprove] = useState<boolean>(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const cfgResp = await fetchJson<MeshConfig>(`${DEFAULT_ORCHESTRATOR}/mesh/config`);
        const resolvedBase = cfgResp.orchestratorBase || DEFAULT_ORCHESTRATOR;
        const [hubsResp, actorsResp, playbooksResp] = await Promise.all([
          fetchJson<{ hubs: Record<string, HubDetails> }>(`${resolvedBase}/mesh/hubs`),
          fetchJson<Actor[]>(`${resolvedBase}/mesh/actors`),
          fetchJson<Playbook[]>(`${resolvedBase}/mesh/playbooks`)
        ]);
        setCfg({ ...cfgResp, orchestratorBase: resolvedBase });
        setOrchestratorBase(resolvedBase);
        setHubMap(hubsResp.hubs);
        setHubOrder(Object.keys(hubsResp.hubs));
        setActors(actorsResp);
        setPlaybooks(playbooksResp);
        if (Object.keys(hubsResp.hubs).length > 0) {
          setSelectedHub(Object.keys(hubsResp.hubs)[0]);
        }
      } catch (error) {
        setStatusMessage(`Failed to load configuration: ${(error as Error).message}`);
      }
    };
    bootstrap().catch((err) => setStatusMessage(String(err)));
  }, []);

  useEffect(() => {
    const refresh = async () => {
      if (!cfg || !selectedHub) return;
      const hub = hubMap[selectedHub];
      if (!hub) return;
      try {
        const client = makeClient(hub.subgraphUrl || cfg.defaultSubgraphUrl);
        const data = await client.request<JobsResponse>(qJobs);
        setJobs(data.jobs ?? []);
      } catch (error) {
        setStatusMessage(`Unable to load jobs: ${(error as Error).message}`);
        setJobs([]);
      }
    };
    refresh().catch((err) => setStatusMessage(String(err)));
  }, [cfg, hubMap, selectedHub]);

  const currentHub = selectedHub ? hubMap[selectedHub] : undefined;
  const etherscanBase = cfg?.etherscanBase ?? "https://etherscan.io";

  const connectWallet = async () => {
    try {
      const signer = await getSigner();
      const addr = await signer.getAddress();
      setConnected(addr);
      setStatusMessage(`Connected wallet ${short(addr)}`);
    } catch (error) {
      setStatusMessage(`Wallet connection failed: ${(error as Error).message}`);
    }
  };

  const invokeTx = async <T,>(endpoint: string, payload: T) => {
    if (!selectedHub && !endpoint.startsWith("/mesh/plan")) {
      throw new Error("Select a hub first");
    }
    const base = orchestratorBase || DEFAULT_ORCHESTRATOR;
    const url = endpoint.startsWith("http") ? endpoint : `${base}${endpoint}`;
    return fetchJson<{ tx: { to: string; data: string; value: number } } | { txs: any[] }>(
      url,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );
  };

  const executeTx = async (tx: { to: string; data: string; value: number }) => {
    const signer = await getSigner();
    const response = await signer.sendTransaction(tx);
    await response.wait();
    return response.hash;
  };

  const createJob = async () => {
    try {
      if (!selectedHub) throw new Error("Select a hub first");
      const payload = await invokeTx(`/mesh/${selectedHub}/tx/create`, {
        rewardWei: reward,
        uri
      });
      if (!("tx" in payload)) throw new Error("Malformed response");
      const hash = await executeTx(payload.tx);
      setStatusMessage(`Job created on ${selectedHub} — ${hash}`);
    } catch (error) {
      setStatusMessage(`Create job failed: ${(error as Error).message}`);
    }
  };

  const stake = async (role: number, amountWei: string) => {
    try {
      if (!selectedHub) throw new Error("Select a hub first");
      const payload = await invokeTx(`/mesh/${selectedHub}/tx/stake`, {
        role,
        amountWei
      });
      if (!("tx" in payload)) throw new Error("Malformed response");
      const hash = await executeTx(payload.tx);
      setStatusMessage(`Stake confirmed on ${selectedHub} — ${hash}`);
    } catch (error) {
      setStatusMessage(`Stake failed: ${(error as Error).message}`);
    }
  };

  const commit = async () => {
    try {
      if (!selectedHub) throw new Error("Select a hub first");
      if (!jobId) throw new Error("Provide a job ID");
      if (!connected) throw new Error("Connect a wallet first");
      const { salt } = prepareCommitSalt();
      localStorage.setItem(`sovereign-mesh::${selectedHub}::${jobId}::${connected}`, salt);
      const payload = await invokeTx(`/mesh/${selectedHub}/tx/commit`, {
        jobId: Number(jobId),
        approve,
        salt,
        validator: connected,
        subdomain: "validator",
        proof: []
      });
      if (!("tx" in payload)) throw new Error("Malformed response");
      const hash = await executeTx(payload.tx);
      setStatusMessage(`Commit submitted for job ${jobId} — ${hash}`);
    } catch (error) {
      setStatusMessage(`Commit failed: ${(error as Error).message}`);
    }
  };

  const reveal = async () => {
    try {
      if (!selectedHub) throw new Error("Select a hub first");
      if (!jobId) throw new Error("Provide a job ID");
      const key = `sovereign-mesh::${selectedHub}::${jobId}::${connected}`;
      const salt = localStorage.getItem(key);
      if (!salt) throw new Error("Commit salt not found locally. Commit before reveal.");
      const payload = await invokeTx(`/mesh/${selectedHub}/tx/reveal`, {
        jobId: Number(jobId),
        approve,
        salt,
        subdomain: "validator",
        proof: []
      });
      if (!("tx" in payload)) throw new Error("Malformed response");
      const hash = await executeTx(payload.tx);
      setStatusMessage(`Reveal submitted for job ${jobId} — ${hash}`);
    } catch (error) {
      setStatusMessage(`Reveal failed: ${(error as Error).message}`);
    }
  };

  const finalize = async () => {
    try {
      if (!selectedHub) throw new Error("Select a hub first");
      if (!jobId) throw new Error("Provide a job ID");
      const payload = await invokeTx(`/mesh/${selectedHub}/tx/finalize`, {
        jobId: Number(jobId)
      });
      if (!("tx" in payload)) throw new Error("Malformed response");
      const hash = await executeTx(payload.tx);
      setStatusMessage(`Finalize executed for job ${jobId} — ${hash}`);
    } catch (error) {
      setStatusMessage(`Finalize failed: ${(error as Error).message}`);
    }
  };

  const allowlist = async (role: number) => {
    try {
      if (!selectedHub) throw new Error("Select a hub first");
      if (!connected) throw new Error("Connect wallet first");
      const payload = await invokeTx(`/mesh/${selectedHub}/tx/allowlist`, {
        role,
        addr: connected
      });
      if (!("tx" in payload)) throw new Error("Malformed response");
      const hash = await executeTx(payload.tx);
      setStatusMessage(`Dev allowlist transaction confirmed — ${hash}`);
    } catch (error) {
      setStatusMessage(`Allowlist failed: ${(error as Error).message}`);
    }
  };

  const instantiateMission = async () => {
    try {
      if (!selectedPlaybook) throw new Error("Choose a mission playbook");
      const payload = await invokeTx(`/mesh/plan/instantiate`, {
        playbookId: selectedPlaybook
      });
      if (!("txs" in payload)) throw new Error("Malformed response");
      const signer = await getSigner();
      for (const tx of payload.txs) {
        const resp = await signer.sendTransaction(tx);
        await resp.wait();
      }
      setStatusMessage(`Mission ${selectedPlaybook} launched across ${payload.txs.length} hubs.`);
    } catch (error) {
      setStatusMessage(`Mission launch failed: ${(error as Error).message}`);
    }
  };

  const activePlaybook = useMemo(
    () => playbooks.find((pb) => pb.id === selectedPlaybook),
    [playbooks, selectedPlaybook]
  );

  return (
    <div
      style={{
        padding: "48px 32px 96px",
        maxWidth: 1280,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 32
      }}
    >
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 44, margin: 0 }}>
            🕸️ Sovereign Mesh
            <span style={{ display: "block", fontSize: 18, color: "#94a3b8", fontWeight: 400 }}>
              Planetary network-of-networks mission console
            </span>
          </h1>
          <button onClick={connectWallet}>
            {connected ? `Connected · ${short(connected)}` : "Connect Wallet"}
          </button>
        </div>
        <p style={{ lineHeight: 1.6, maxWidth: 820, color: "#cbd5f5" }}>
          Launch foresight, research, optimization, and knowledge jobs across AGI Jobs v2 hubs in seconds. Every
          transaction is signed by your wallet; every module remains owner-governed.
        </p>
        {statusMessage && (
          <div
            style={{
              background: "rgba(15,23,42,0.75)",
              border: "1px solid rgba(56,189,248,0.35)",
              padding: "12px 16px",
              borderRadius: 16,
              color: "#e2f3ff"
            }}
          >
            {statusMessage}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        <div style={gradientCard}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", color: "#cbd5f5" }}>Hub selection</span>
          <select
            value={selectedHub}
            onChange={(event) => setSelectedHub(event.target.value)}
            style={{ fontSize: 16 }}
          >
            {hubOrder.map((hub) => (
              <option key={hub} value={hub}>
                {hubMap[hub]?.label ?? hub}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 13, color: "#e2e8f0" }}>
            Network: <strong>{cfg?.network ?? ""}</strong>
          </div>
          <div style={{ fontSize: 13, color: "#e2e8f0" }}>
            Validators stake, commit, reveal, and finalize within each sovereign hub.
          </div>
        </div>
        <div style={gradientCard}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", color: "#cbd5f5" }}>Create job</span>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Reward (wei)</span>
            <input value={reward} onChange={(event) => setReward(event.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Spec URI (IPFS, HTTPS, or data)</span>
            <input value={uri} onChange={(event) => setUri(event.target.value)} />
          </label>
          <button onClick={createJob}>Create Job</button>
        </div>
        <div style={gradientCard}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", color: "#cbd5f5" }}>Validator quick actions</span>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span>Job ID</span>
            <input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="123" />
          </label>
          <button onClick={() => stake(1, "1000000000000000000")}>Stake 1 token</button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={approve}
              onChange={(event) => setApprove(event.target.checked)}
            />
            Approve deliverable
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={commit}>Commit</button>
            <button onClick={reveal}>Reveal</button>
            <button onClick={finalize}>Finalize</button>
          </div>
          <button onClick={() => allowlist(1)} style={{ background: "rgba(148,163,184,0.25)", color: "#f8fafc" }}>
            Dev · Allowlist Validator
          </button>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>Live jobs · {currentHub?.label ?? selectedHub}</h2>
          <span style={{ color: "#94a3b8", fontSize: 14 }}>powered by The Graph</span>
        </header>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Employer</th>
                <th>Reward</th>
                <th>URI</th>
                <th>Status</th>
                <th>Validators</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={`${selectedHub}-${job.id}`} style={{ borderBottom: "1px solid rgba(148,163,184,0.12)" }}>
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
              {!jobs.length && (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
                    No jobs indexed yet. Create one or seed data using the scripts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
        <div style={{ ...gradientCard, gap: 18 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", color: "#cbd5f5" }}>Mission playbooks</span>
          <select value={selectedPlaybook} onChange={(event) => setSelectedPlaybook(event.target.value)}>
            <option value="">— Choose Mission —</option>
            {playbooks.map((pb) => (
              <option key={pb.id} value={pb.id}>
                {pb.name}
              </option>
            ))}
          </select>
          {activePlaybook && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, color: "#e2e8f0" }}>
              <p style={{ margin: 0 }}>{activePlaybook.description}</p>
              <ol style={{ margin: 0, paddingLeft: 20, color: "#cbd5f5" }}>
                {activePlaybook.steps.map((step) => (
                  <li key={step.uri}>
                    <strong>{step.hub}</strong> · reward {step.rewardWei}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <button onClick={instantiateMission}>Instantiate Mission</button>
        </div>
        <div style={{ ...gradientCard, gap: 18 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", color: "#cbd5f5" }}>Actor roster</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {actors.map((actor) => (
              <div key={actor.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>{actor.flag}</span>
                <span style={{ fontSize: 15 }}>{actor.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...gradientCard, gap: 18 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", color: "#cbd5f5" }}>Owner panels</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {hubOrder.map((hub) => {
              const details = hubMap[hub];
              if (!details) return null;
              const base = `${etherscanBase}/address`;
              return (
                <div key={hub} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <strong>{details.label}</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <a target="_blank" rel="noreferrer" href={`${base}/${details.addresses.ValidationModule}#writeContract`}>
                      ValidationModule
                    </a>
                    <a target="_blank" rel="noreferrer" href={`${base}/${details.addresses.JobRegistry}#writeContract`}>
                      JobRegistry
                    </a>
                    <a target="_blank" rel="noreferrer" href={`${base}/${details.addresses.StakeManager}#writeContract`}>
                      StakeManager
                    </a>
                    <a target="_blank" rel="noreferrer" href={`${base}/${details.addresses.IdentityRegistry}#writeContract`}>
                      IdentityRegistry
                    </a>
                    {details.addresses.FeePool &&
                      details.addresses.FeePool !== "0x0000000000000000000000000000000000000000" && (
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`${base}/${details.addresses.FeePool}#writeContract`}
                        >
                          FeePool
                        </a>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
