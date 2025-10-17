import React, { useEffect, useMemo, useState } from "react";
import { getSigner } from "./lib/ethers";
import { makeClient, JOBS_QUERY } from "./lib/subgraph";
import { shorten } from "./lib/format";

const DEFAULT_API = import.meta.env.VITE_SOVEREIGN_MESH_API ?? "http://localhost:8084";

const fetchJson = async (base: string, path: string, init?: RequestInit) => {
  const response = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json" },
    ...init
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text}`);
  }
  return response.json();
};

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
  subgraphUrl: string;
  addresses: Record<string, string>;
};

type Playbook = {
  id: string;
  name: string;
  summary?: string;
  steps: Array<{ hub: string; rewardWei: string; uri: string }>;
};

type Job = {
  id: string;
  employer: string;
  reward: string;
  uri: string;
  status: string;
  validators: Array<{ account: string }>;
};

type TxPayload = { to: string; data: string; value: number | string };

type MissionTx = TxPayload & { hub: string };

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ marginTop: 32 }}>
    <h2 style={{ margin: "16px 0" }}>{title}</h2>
    {children}
  </section>
);

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      background: "rgba(10, 14, 34, 0.65)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      borderRadius: 16,
      padding: 20,
      boxShadow: "0 12px 32px rgba(5, 9, 18, 0.45)"
    }}
  >
    {children}
  </div>
);

const tagStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "rgba(80, 120, 255, 0.12)",
  color: "#bcd2ff",
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 12,
  letterSpacing: 0.3
};

const buttonBase: React.CSSProperties = {
  background: "linear-gradient(135deg, #4d7fff, #9a5bff)",
  color: "white",
  border: "none",
  borderRadius: 999,
  padding: "10px 18px",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(98, 135, 255, 0.35)"
};

const inputBase: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(8, 10, 20, 0.75)",
  color: "#f7f9fc"
};

const layoutStyles: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: 32,
  display: "flex",
  flexDirection: "column",
  gap: 24
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginBottom: 8
};

const useAsyncEffect = (fn: () => Promise<void>, deps: React.DependencyList) => {
  useEffect(() => {
    void fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};

const App: React.FC = () => {
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [config, setConfig] = useState<MeshConfig>();
  const [hubMap, setHubMap] = useState<Record<string, HubConfig>>({});
  const [hubList, setHubList] = useState<string[]>([]);
  const [address, setAddress] = useState<string>();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [rewardWei, setRewardWei] = useState("1000000000000000000");
  const [jobUri, setJobUri] = useState("ipfs://mesh/spec");
  const [jobId, setJobId] = useState("1");
  const [approve, setApprove] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");

  useAsyncEffect(async () => {
    const cfg = (await fetchJson(apiBase, "/mesh/config")) as MeshConfig;
    setConfig(cfg);
    if (cfg.orchestratorBase && cfg.orchestratorBase !== apiBase) {
      setApiBase(cfg.orchestratorBase);
    }
    const hubsResponse = (await fetchJson(apiBase, "/mesh/hubs")) as { hubs: Record<string, HubConfig> };
    setHubMap(hubsResponse.hubs);
    setHubList(Object.keys(hubsResponse.hubs));
    const playbookResponse = (await fetchJson(apiBase, "/mesh/playbooks")) as Playbook[];
    setPlaybooks(playbookResponse);
    // actors are fetched for completeness even if not yet displayed
    await fetchJson(apiBase, "/mesh/actors");
  }, [apiBase]);

  useAsyncEffect(async () => {
    if (!config || !selectedHub) {
      setJobs([]);
      return;
    }
    const hub = hubMap[selectedHub];
    if (!hub) {
      setJobs([]);
      return;
    }
    try {
      const subgraphUrl = hub.subgraphUrl || config.defaultSubgraphUrl;
      const client = makeClient(subgraphUrl);
      const response = await client.request<{ jobs: Job[] }>(JOBS_QUERY);
      setJobs(response.jobs ?? []);
    } catch (error) {
      console.warn("Failed to load jobs", error);
      setJobs([]);
    }
  }, [config, selectedHub, hubMap]);

  const connect = async () => {
    const signer = await getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
  };

  const sendTx = async (payload: TxPayload | MissionTx) => {
    const signer = await getSigner();
    const txResponse = await signer.sendTransaction({
      to: payload.to,
      data: payload.data,
      value: payload.value ?? 0
    });
    await txResponse.wait();
    return txResponse.hash;
  };

  const post = (path: string, body: unknown) =>
    fetchJson(apiBase, path, {
      method: "POST",
      body: JSON.stringify(body)
    });

  const ensureHub = () => {
    if (!selectedHub) {
      alert("Select a hub first.");
      throw new Error("Hub not selected");
    }
  };

  const createJob = async () => {
    try {
      ensureHub();
      const tx = await post(`/mesh/${selectedHub}/tx/create`, { rewardWei, uri: jobUri });
      const hash = await sendTx(tx.tx as TxPayload);
      alert(`Job submitted on ${selectedHub}: ${hash}`);
    } catch (error) {
      console.error(error);
    }
  };

  const stake = async (role: number, amountWei: string) => {
    try {
      ensureHub();
      const tx = await post(`/mesh/${selectedHub}/tx/stake`, { role, amountWei });
      const hash = await sendTx(tx.tx as TxPayload);
      alert(`Stake confirmed: ${hash}`);
    } catch (error) {
      console.error(error);
    }
  };

  const commit = async () => {
    try {
      ensureHub();
      const storageKey = `mesh_salt_${selectedHub}_${jobId}_${address}`;
      const existingSalt = localStorage.getItem(storageKey) ?? undefined;
      const response = await post(`/mesh/${selectedHub}/tx/commit`, {
        jobId: Number(jobId),
        approve,
        salt: existingSalt,
        subdomain: "validator",
        proof: [],
        validator: address
      });
      const payload = response.tx as TxPayload;
      const salt = String(response.salt ?? existingSalt ?? "");
      if (salt) {
        localStorage.setItem(storageKey, salt);
      }
      const hash = await sendTx(payload);
      const commitHash = response.commitHash ? String(response.commitHash) : "";
      alert(`Commit accepted (${hash}).${commitHash ? `\nCommit hash: ${commitHash}` : ""}`);
    } catch (error) {
      console.error(error);
    }
  };

  const reveal = async () => {
    try {
      ensureHub();
      const storageKey = `mesh_salt_${selectedHub}_${jobId}_${address}`;
      const salt = localStorage.getItem(storageKey);
      if (!salt) {
        alert("No commit salt found. Commit first.");
        return;
      }
      const tx = await post(`/mesh/${selectedHub}/tx/reveal`, {
        jobId: Number(jobId),
        approve,
        salt
      });
      const hash = await sendTx(tx.tx as TxPayload);
      alert(`Reveal broadcast: ${hash}`);
    } catch (error) {
      console.error(error);
    }
  };

  const finalize = async () => {
    try {
      ensureHub();
      const tx = await post(`/mesh/${selectedHub}/tx/finalize`, { jobId: Number(jobId) });
      const hash = await sendTx(tx.tx as TxPayload);
      alert(`Finalize transaction: ${hash}`);
    } catch (error) {
      console.error(error);
    }
  };

  const instantiateMission = async () => {
    try {
      if (!selectedPlaybook) {
        alert("Select a mission first.");
        return;
      }
      const response = await post("/mesh/plan/instantiate", { playbookId: selectedPlaybook });
      const txs = response.txs as MissionTx[];
      for (const tx of txs) {
        await sendTx(tx);
      }
      alert(`Mission executed across ${txs.length} jobs.`);
    } catch (error) {
      console.error(error);
    }
  };

  const allowlist = async (role: number) => {
    try {
      ensureHub();
      if (!address) {
        alert("Connect wallet first.");
        return;
      }
      const tx = await post(`/mesh/${selectedHub}/tx/allowlist`, { role, addr: address });
      const hash = await sendTx(tx.tx as TxPayload);
      alert(`Allowlist transaction: ${hash}`);
    } catch (error) {
      console.error(error);
    }
  };

  const ownerLinks = useMemo(() => {
    if (!config) return [];
    const base = config.etherscanBase || "https://etherscan.io";
    return hubList.map((key) => {
      const hub = hubMap[key];
      const addresses = hub?.addresses ?? {};
      const entries = Object.entries(addresses)
        .filter(([, addr]) => addr && addr !== "0x0000000000000000000000000000000000000000")
        .map(([label, addr]) => ({
          label,
          url: `${base}/address/${addr}#writeContract`
        }));
      return { key, hub, entries };
    });
  }, [config, hubList, hubMap]);

  const selectedHubLabel = selectedHub ? hubMap[selectedHub]?.label ?? selectedHub : "—";

  return (
    <div style={layoutStyles}>
      <header style={headerStyles}>
        <span style={tagStyles}>Sovereign Mesh • AGI Jobs v2</span>
        <h1 style={{ fontSize: 48, margin: 0 }}>Beyond Civic Exocortex</h1>
        <p style={{ maxWidth: 840, lineHeight: 1.6, color: "#dbe3ff" }}>
          Coordinate foresight, research, optimization, and knowledge across independent AGI Jobs hubs. Wallet-first, owner-governed, mission ready.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button style={buttonBase} onClick={connect}>
            {address ? `Connected ${shorten(address)}` : "Connect wallet"}
          </button>
          <select
            style={{ ...inputBase, minWidth: 220 }}
            onChange={(event) => setSelectedHub(event.target.value)}
            value={selectedHub}
          >
            <option value="">— Choose hub —</option>
            {hubList.map((key) => (
              <option key={key} value={key}>
                {hubMap[key]?.label ?? key}
              </option>
            ))}
          </select>
          <input
            style={{ ...inputBase, width: 260 }}
            value={rewardWei}
            onChange={(event) => setRewardWei(event.target.value)}
            placeholder="Reward in wei"
          />
          <input
            style={{ ...inputBase, width: 340 }}
            value={jobUri}
            onChange={(event) => setJobUri(event.target.value)}
            placeholder="Specification URI"
          />
          <button style={buttonBase} onClick={createJob}>
            Create job
          </button>
          <button
            style={{ ...buttonBase, background: "rgba(255,255,255,0.05)", color: "#9fb4ff" }}
            onClick={() => allowlist(1)}
          >
            Dev: allowlist validator
          </button>
        </div>
      </header>

      <Section title={`Live jobs on ${selectedHubLabel}`}>
        <Panel>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead style={{ textAlign: "left", color: "#7f9cff" }}>
                <tr>
                  <th style={{ padding: "8px 12px" }}>Job</th>
                  <th style={{ padding: "8px 12px" }}>Employer</th>
                  <th style={{ padding: "8px 12px" }}>Reward</th>
                  <th style={{ padding: "8px 12px" }}>URI</th>
                  <th style={{ padding: "8px 12px" }}>Status</th>
                  <th style={{ padding: "8px 12px" }}>Validators</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "10px 12px" }}>{job.id}</td>
                    <td style={{ padding: "10px 12px" }}>{shorten(job.employer)}</td>
                    <td style={{ padding: "10px 12px" }}>{job.reward}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <a href={job.uri} target="_blank" rel="noreferrer" style={{ color: "#90c7ff" }}>
                        {job.uri}
                      </a>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{job.status}</td>
                    <td style={{ padding: "10px 12px" }}>{job.validators?.length ?? 0}</td>
                  </tr>
                ))}
                {!jobs.length && (
                  <tr>
                    <td colSpan={6} style={{ padding: 18, textAlign: "center", color: "#7d88b6" }}>
                      No jobs yet — instantiate a mission or post a new job.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </Section>

      <Section title={`Participate on ${selectedHubLabel}`}>
        <Panel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...inputBase, width: 120 }}
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              placeholder="Job ID"
            />
            <button style={buttonBase} onClick={() => stake(1, "1000000000000000000")}>
              Stake 1 token (validator)
            </button>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={approve} onChange={(event) => setApprove(event.target.checked)} />
              Approve result
            </label>
            <button style={buttonBase} onClick={commit}>
              Commit vote
            </button>
            <button style={buttonBase} onClick={reveal}>
              Reveal vote
            </button>
            <button style={buttonBase} onClick={finalize}>
              Finalize job
            </button>
          </div>
        </Panel>
      </Section>

      <Section title="Mission playbooks (cross-hub orchestration)">
        <Panel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select
              style={{ ...inputBase, minWidth: 240 }}
              value={selectedPlaybook}
              onChange={(event) => setSelectedPlaybook(event.target.value)}
            >
              <option value="">— Choose mission —</option>
              {playbooks.map((playbook) => (
                <option key={playbook.id} value={playbook.id}>
                  {playbook.name}
                </option>
              ))}
            </select>
            <button style={buttonBase} onClick={instantiateMission}>
              Instantiate mission
            </button>
          </div>
          {selectedPlaybook && (
            <div style={{ marginTop: 16, color: "#9fb4ff" }}>
              {(playbooks.find((pb) => pb.id === selectedPlaybook)?.steps ?? []).map((step, index) => (
                <div key={`${step.hub}-${index}`} style={{ marginBottom: 6 }}>
                  <strong>{step.hub}</strong> — reward {step.rewardWei} wei — <span>{step.uri}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </Section>

      <Section title="Owner panels">
        <Panel>
          <details>
            <summary style={{ cursor: "pointer", marginBottom: 12 }}>Open owner interface links</summary>
            <div style={{ display: "grid", gap: 16 }}>
              {ownerLinks.map(({ key, hub, entries }) => (
                <div key={key}>
                  <h3 style={{ marginBottom: 6 }}>{hub?.label ?? key}</h3>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
                    {entries.map((entry) => (
                      <li key={entry.label}>
                        <a href={entry.url} target="_blank" rel="noreferrer" style={{ color: "#90c7ff" }}>
                          {entry.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </Panel>
      </Section>

      <footer style={{ color: "#6d799f", fontSize: 13, textAlign: "center", marginTop: 32 }}>
        Sovereign Mesh proves AGI Jobs v2 already behaves like a planetary coordination engine. One wallet, infinite missions.
      </footer>
    </div>
  );
};

export default App;
