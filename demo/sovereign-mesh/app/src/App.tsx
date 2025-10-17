import React, { useEffect, useMemo, useState } from "react";
import { getSigner } from "./lib/ethers";
import { computeCommit } from "./lib/commit";
import { makeClient, qJobs } from "./lib/subgraph";
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
  rpcUrl?: string;
  subgraphUrl?: string;
  addresses: Record<string, string>;
};

type MissionPlaybook = {
  id: string;
  name: string;
  summary?: string;
  steps: Array<{
    hub: string;
    rewardWei: string;
    uri: string;
  }>;
};

type Actor = {
  id: string;
  flag: string;
  name: string;
};

const DEFAULT_REWARD = "1000000000000000000";
const DEFAULT_URI = "ipfs://mesh/spec";

type TxDescriptor = {
  to: string;
  data: string;
  value: number | string;
};

const gradientCard: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(14,165,233,0.15), rgba(236,72,153,0.12))",
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 16,
  padding: "1.5rem",
  boxShadow: "0 30px 80px rgba(15,23,42,0.45)",
  backdropFilter: "blur(24px)"
};

const buttonStyle: React.CSSProperties = {
  padding: "0.6rem 1.4rem",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(14,165,233,0.15)",
  color: "#e0f2fe",
  cursor: "pointer",
  fontWeight: 600,
  transition: "all 0.2s ease"
};

const inputStyle: React.CSSProperties = {
  padding: "0.55rem 0.9rem",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.65)",
  color: "#f8fafc",
  minWidth: 160
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: 220
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "rgba(15,23,42,0.6)",
  borderRadius: 18,
  overflow: "hidden"
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.75rem 1rem",
  background: "rgba(148,163,184,0.12)",
  fontWeight: 600,
  color: "#e2e8f0"
};

const tdStyle: React.CSSProperties = {
  padding: "0.7rem 1rem",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  color: "#cbd5f5"
};

const sectionTitle: React.CSSProperties = {
  marginTop: "2.5rem",
  fontSize: "1.35rem",
  fontWeight: 700,
  color: "#f8fafc"
};

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

const App: React.FC = () => {
  const [cfg, setCfg] = useState<MeshConfig>();
  const [hubs, setHubs] = useState<Record<string, HubConfig>>({});
  const [hubList, setHubList] = useState<string[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [playbooks, setPlaybooks] = useState<MissionPlaybook[]>([]);
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [wallet, setWallet] = useState<string>();
  const [reward, setReward] = useState(DEFAULT_REWARD);
  const [uri, setUri] = useState(DEFAULT_URI);
  const [jobId, setJobId] = useState<string>("");
  const [approve, setApprove] = useState<boolean>(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const base = cfg?.orchestratorBase ?? "";

  const orchestratorFetch = useMemo(() => {
    return async <T,>(endpoint: string, init?: RequestInit) => {
      const url = base ? `${base}${endpoint}` : endpoint;
      return fetchJson<T>(url, init);
    };
  }, [base]);

  useEffect(() => {
    orchestratorFetch<MeshConfig>("/mesh/config")
      .then((data) => {
        setCfg(data);
      })
      .catch((err) => {
        setStatus(`Failed to load mesh config: ${err.message}`);
      });
  }, [orchestratorFetch]);

  useEffect(() => {
    if (!cfg) return;
    orchestratorFetch<{ hubs: Record<string, HubConfig> }>("/mesh/hubs")
      .then((data) => {
        setHubs(data.hubs);
        setHubList(Object.keys(data.hubs));
      })
      .catch((err) => setStatus(`Failed to load hubs: ${err.message}`));
    orchestratorFetch<MissionPlaybook[]>("/mesh/playbooks")
      .then(setPlaybooks)
      .catch((err) => setStatus(`Failed to load playbooks: ${err.message}`));
    orchestratorFetch<Actor[]>("/mesh/actors")
      .then(setActors)
      .catch((err) => setStatus(`Failed to load actors: ${err.message}`));
  }, [cfg, orchestratorFetch]);

  useEffect(() => {
    if (!cfg || !selectedHub) return;
    const hubCfg = hubs[selectedHub];
    if (!hubCfg) return;
    const subgraphUrl = hubCfg.subgraphUrl || cfg.defaultSubgraphUrl;
    makeClient(subgraphUrl)
      .request(qJobs)
      .then((data: any) => setJobs(data.jobs ?? []))
      .catch((err) => setStatus(`Failed to load jobs: ${err.message}`));
  }, [cfg, hubs, selectedHub]);

  const connectWallet = async () => {
    try {
      const signer = await getSigner();
      const address = await signer.getAddress();
      setWallet(address);
      setStatus(`Connected to ${short(address)}`);
    } catch (error) {
      setStatus(`Wallet connection failed: ${(error as Error).message}`);
    }
  };

  const sendTx = async (tx: TxDescriptor) => {
    const signer = await getSigner();
    const response = await signer.sendTransaction(tx);
    await response.wait();
    return response.hash;
  };

  const withStatus = async (action: () => Promise<string | void>) => {
    try {
      setStatus("Processing...");
      const hash = await action();
      if (hash) {
        setStatus(`Transaction confirmed: ${hash}`);
      } else {
        setStatus("Completed");
      }
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    }
  };

  const ensureHubSelected = () => {
    if (!selectedHub) {
      throw new Error("Please choose a hub first");
    }
  };

  const createJob = () =>
    withStatus(async () => {
      ensureHubSelected();
      const payload = await orchestratorFetch<{ tx: TxDescriptor }>(`/mesh/${selectedHub}/tx/create`, {
        method: "POST",
        body: JSON.stringify({ rewardWei: reward, uri })
      });
      return sendTx(payload.tx);
    });

  const stake = (role: number, amountWei: string) =>
    withStatus(async () => {
      ensureHubSelected();
      const payload = await orchestratorFetch<{ tx: TxDescriptor }>(`/mesh/${selectedHub}/tx/stake`, {
        method: "POST",
        body: JSON.stringify({ role, amountWei })
      });
      return sendTx(payload.tx);
    });

  const commit = () =>
    withStatus(async () => {
      ensureHubSelected();
      if (!jobId) {
        throw new Error("Enter a job ID");
      }
      const { commitHash, salt } = computeCommit(approve);
      if (wallet) {
        localStorage.setItem(`salt_${selectedHub}_${jobId}_${wallet}`, salt);
      }
      const payload = await orchestratorFetch<{ tx: TxDescriptor }>(`/mesh/${selectedHub}/tx/commit`, {
        method: "POST",
        body: JSON.stringify({ jobId: Number(jobId), commitHash, subdomain: "validator", proof: [] })
      });
      return sendTx(payload.tx);
    });

  const reveal = () =>
    withStatus(async () => {
      ensureHubSelected();
      if (!jobId) {
        throw new Error("Enter a job ID");
      }
      if (!wallet) {
        throw new Error("Connect wallet first");
      }
      const salt = localStorage.getItem(`salt_${selectedHub}_${jobId}_${wallet}`);
      if (!salt) {
        throw new Error("No commit salt stored. Commit first or use the same wallet.");
      }
      const payload = await orchestratorFetch<{ tx: TxDescriptor }>(`/mesh/${selectedHub}/tx/reveal`, {
        method: "POST",
        body: JSON.stringify({ jobId: Number(jobId), approve, salt })
      });
      return sendTx(payload.tx);
    });

  const finalize = () =>
    withStatus(async () => {
      ensureHubSelected();
      if (!jobId) {
        throw new Error("Enter a job ID");
      }
      const payload = await orchestratorFetch<{ tx: TxDescriptor }>(`/mesh/${selectedHub}/tx/finalize`, {
        method: "POST",
        body: JSON.stringify({ jobId: Number(jobId) })
      });
      return sendTx(payload.tx);
    });

  const instantiateMission = () =>
    withStatus(async () => {
      if (!selectedPlaybook) {
        throw new Error("Select a mission first");
      }
      const payload = await orchestratorFetch<{ txs: TxDescriptor[] & { hub?: string }[] }>("/mesh/plan/instantiate", {
        method: "POST",
        body: JSON.stringify({ playbookId: selectedPlaybook })
      });
      const signer = await getSigner();
      for (const tx of payload.txs) {
        const response = await signer.sendTransaction(tx);
        await response.wait();
      }
      return `Mission deployed across ${payload.txs.length} jobs`;
    });

  const allowlist = (role: number) =>
    withStatus(async () => {
      ensureHubSelected();
      if (!wallet) {
        throw new Error("Connect wallet first");
      }
      const payload = await orchestratorFetch<{ tx: TxDescriptor }>(`/mesh/${selectedHub}/tx/allowlist`, {
        method: "POST",
        body: JSON.stringify({ role, addr: wallet })
      });
      return sendTx(payload.tx);
    });

  const ownerLinks = useMemo(() => {
    if (!cfg) return [] as Array<{ hubId: string; label: string; links: Array<{ name: string; url: string }> }>;
    const base = cfg.etherscanBase || "https://etherscan.io";
    return hubList.map((key) => {
      const hub = hubs[key];
      const addresses = hub?.addresses ?? {};
      const modules = [
        "ValidationModule",
        "JobRegistry",
        "StakeManager",
        "IdentityRegistry",
        "CertificateNFT",
        "DisputeModule",
        "FeePool"
      ];
      const links = modules
        .filter((m) => addresses[m] && addresses[m] !== "0x0000000000000000000000000000000000000000")
        .map((m) => ({ name: m, url: `${base}/address/${addresses[m]}#writeContract` }));
      return { hubId: key, label: hub?.label ?? key, links };
    });
  }, [cfg, hubList, hubs]);

  const activePlaybook = playbooks.find((pb) => pb.id === selectedPlaybook);

  return (
    <div style={{ padding: "2.5rem", maxWidth: 1220, margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2.8rem", fontWeight: 800, margin: 0, color: "#f1f5f9" }}>
          🕸️ Sovereign Mesh — Beyond Civic Exocortex
        </h1>
        <p style={{ maxWidth: 860, color: "#cbd5f5", fontSize: "1.05rem", lineHeight: 1.6 }}>
          Orchestrate foresight, research, optimisation, and knowledge streams across every AGI Jobs v2 hub. Every click crafts
          multi-hub missions, every signature stays in your wallet, and every owner control remains one hop away.
        </p>
        {status && (
          <div style={{ marginTop: "1rem", color: status.startsWith("Error") ? "#fca5a5" : "#bbf7d0" }}>{status}</div>
        )}
      </header>

      <section style={{ ...gradientCard }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
          <button style={buttonStyle} onClick={connectWallet}>
            {wallet ? `Connected: ${short(wallet)}` : "Connect Wallet"}
          </button>
          <select
            style={selectStyle}
            value={selectedHub}
            onChange={(event) => setSelectedHub(event.target.value)}
          >
            <option value="">Choose hub</option>
            {hubList.map((key) => (
              <option key={key} value={key}>
                {hubs[key]?.label ?? key}
              </option>
            ))}
          </select>
          <input
            style={{ ...inputStyle, minWidth: 200 }}
            value={reward}
            onChange={(event) => setReward(event.target.value)}
            placeholder="Reward (wei)"
          />
          <input
            style={{ ...inputStyle, minWidth: 320 }}
            value={uri}
            onChange={(event) => setUri(event.target.value)}
            placeholder="Specification URI"
          />
          <button style={buttonStyle} onClick={createJob}>
            Create Job
          </button>
          <button style={{ ...buttonStyle, background: "rgba(190,242,100,0.15)", color: "#ecfccb" }} onClick={() => allowlist(1)}>
            Dev: Allowlist Validator
          </button>
        </div>
      </section>

      <section>
        <h2 style={sectionTitle}>Live jobs on {selectedHub || "—"}</h2>
        <div style={{ overflowX: "auto", borderRadius: 18 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Proposer</th>
                <th style={thStyle}>Reward</th>
                <th style={thStyle}>URI</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Validators</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td style={tdStyle}>{job.id}</td>
                  <td style={tdStyle}>{short(job.employer)}</td>
                  <td style={tdStyle}>{job.reward}</td>
                  <td style={tdStyle}>
                    <a href={job.uri} target="_blank" rel="noreferrer" style={{ color: "#f8fafc" }}>
                      {job.uri}
                    </a>
                  </td>
                  <td style={tdStyle}>{job.status}</td>
                  <td style={tdStyle}>{job.validators?.length ?? 0}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td style={{ ...tdStyle, textAlign: "center" }} colSpan={6}>
                    No jobs yet – craft one above or instantiate a mission.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={sectionTitle}>Validator operations</h2>
        <div style={{ ...gradientCard, display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
          <input
            style={inputStyle}
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            placeholder="Job ID"
          />
          <button style={buttonStyle} onClick={() => stake(1, DEFAULT_REWARD)}>
            Stake as Validator (1)
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#f8fafc" }}>
            <input type="checkbox" checked={approve} onChange={(event) => setApprove(event.target.checked)} />
            Approve
          </label>
          <button style={buttonStyle} onClick={commit}>
            Commit
          </button>
          <button style={buttonStyle} onClick={reveal}>
            Reveal
          </button>
          <button style={buttonStyle} onClick={finalize}>
            Finalize
          </button>
        </div>
      </section>

      <section>
        <h2 style={sectionTitle}>Mission playbooks</h2>
        <div style={{ ...gradientCard }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
            <select
              style={selectStyle}
              value={selectedPlaybook}
              onChange={(event) => setSelectedPlaybook(event.target.value)}
            >
              <option value="">Choose mission</option>
              {playbooks.map((pb) => (
                <option key={pb.id} value={pb.id}>
                  {pb.name}
                </option>
              ))}
            </select>
            <button style={buttonStyle} onClick={instantiateMission}>
              Instantiate Mission
            </button>
          </div>
          {activePlaybook && (
            <div style={{ marginTop: "1.5rem", color: "#e2e8f0" }}>
              <h3 style={{ margin: "0 0 0.5rem 0" }}>{activePlaybook.name}</h3>
              {activePlaybook.summary && <p style={{ marginTop: 0 }}>{activePlaybook.summary}</p>}
              <ol style={{ lineHeight: 1.6 }}>
                {activePlaybook.steps.map((step, idx) => (
                  <li key={`${step.hub}-${idx}`}>
                    <strong>{step.hub}</strong> — reward {step.rewardWei} wei — <code>{step.uri}</code>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 style={sectionTitle}>Owner command palette</h2>
        <details style={{ ...gradientCard }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: "1rem" }}>Expand owner panels</summary>
          {ownerLinks.map((item) => (
            <div key={item.hubId} style={{ marginBottom: "1.2rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{item.label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                {item.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...buttonStyle, textDecoration: "none" }}
                  >
                    {link.name}
                  </a>
                ))}
                {item.links.length === 0 && <span style={{ color: "#94a3b8" }}>No contract addresses configured.</span>}
              </div>
            </div>
          ))}
        </details>
      </section>

      <section>
        <h2 style={sectionTitle}>Actor roster</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {actors.map((actor) => (
            <div
              key={actor.id}
              style={{
                ...gradientCard,
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.85rem 1.2rem",
                fontSize: "1rem"
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>{actor.flag}</span>
              <span>{actor.name}</span>
            </div>
          ))}
          {actors.length === 0 && <span style={{ color: "#94a3b8" }}>Actors configuration empty.</span>}
        </div>
      </section>
    </div>
  );
};

export default App;
