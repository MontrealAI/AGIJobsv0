import React, { useEffect, useMemo, useState } from "react";
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

type Hub = {
  label: string;
  rpcUrl: string;
  subgraphUrl?: string;
  addresses: Record<string, string>;
};

type HubMap = Record<string, Hub>;

const fetchJson = async (path: string) => {
  const res = await fetch(path, { headers: { "content-type": "application/json" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.statusText}`);
  }
  return res.json();
};

const formatReward = (wei: string) => {
  if (!wei) return "0";
  try {
    const value = BigInt(wei);
    const whole = value / 10n ** 18n;
    const frac = value % 10n ** 18n;
    if (frac === 0n) return `${whole.toString()} AGIA`;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 4);
    return `${whole.toString()}.${fracStr} AGIA`;
  } catch {
    return wei;
  }
};

const SectionCard: React.FC<React.PropsWithChildren<{ title: string; subtitle?: string }>> = ({ title, subtitle, children }) => (
  <section
    style={{
      marginTop: 32,
      padding: "24px 28px",
      borderRadius: 24,
      background: "rgba(15, 23, 42, 0.55)",
      border: "1px solid rgba(148, 163, 184, 0.25)",
      boxShadow: "0 30px 60px rgba(15, 23, 42, 0.35)"
    }}
  >
    <header style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2>
      {subtitle ? (
        <p style={{ margin: "6px 0 0", color: "rgba(226,232,240,0.72)", maxWidth: 760 }}>{subtitle}</p>
      ) : null}
    </header>
    {children}
  </section>
);

const Badge: React.FC<{ text: string }> = ({ text }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 12px",
      borderRadius: 999,
      background: "linear-gradient(90deg,#0ea5e9,#6366f1)",
      color: "#0b1120",
      fontWeight: 600,
      fontSize: 13,
      letterSpacing: 0.3
    }}
  >
    {text}
  </span>
);

const useMeshData = () => {
  const [cfg, setCfg] = useState<MeshConfig>();
  const [hmap, setHmap] = useState<HubMap>({});
  const [actors, setActors] = useState<any[]>([]);
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const load = async () => {
      try {
        const [c, hubsRes, actorsRes, pbRes] = await Promise.all([
          fetchJson("/mesh/config"),
          fetchJson("/mesh/hubs"),
          fetchJson("/mesh/actors"),
          fetchJson("/mesh/playbooks")
        ]);
        setCfg(c as MeshConfig);
        setHmap((hubsRes as { hubs: HubMap }).hubs);
        setActors(actorsRes as any[]);
        setPlaybooks(pbRes as any[]);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    load();
  }, []);

  return { cfg, hmap, actors, playbooks, error };
};

const JobTable: React.FC<{ jobs: any[] }> = ({ jobs }) => (
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
          <tr key={job.id}>
            <td>{job.id}</td>
            <td>{short(job.employer)}</td>
            <td>{formatReward(job.reward)}</td>
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
  </div>
);

const MissionPreview: React.FC<{ playbook?: any }> = ({ playbook }) => {
  if (!playbook) return null;
  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 18,
        background: "rgba(30, 41, 59, 0.6)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        fontSize: 14,
        lineHeight: 1.6
      }}
    >
      <p style={{ marginTop: 0 }}>{playbook.description}</p>
      <ol style={{ paddingLeft: 20, marginBottom: 0 }}>
        {playbook.steps.map((step: any, idx: number) => (
          <li key={idx} style={{ marginBottom: 6 }}>
            <strong>{step.hub}</strong> → reward {formatReward(step.rewardWei)} at {step.uri}
          </li>
        ))}
      </ol>
    </div>
  );
};

const MermaidBlock: React.FC = () => (
  <pre
    style={{
      background: "rgba(15, 23, 42, 0.75)",
      borderRadius: 16,
      padding: 20,
      overflow: "auto",
      fontSize: 13,
      border: "1px solid rgba(148, 163, 184, 0.25)"
    }}
  >
{`mermaid
flowchart LR
  intent(["Mission Intent\nNon-technical leader"]) --> plan{ "Playbook selected" }
  plan -->|Generates| orchestrator[["Sovereign Mesh Orchestrator\n(Express / ethers)"]]
  orchestrator -->|Tx payloads| wallet{{"User Wallet"}}
  wallet -->|Signs| hub1[("JobRegistry\nPublic Research")]
  wallet -->|Signs| hub2[("JobRegistry\nIndustrial Ops")]
  wallet -->|Signs| hub3[("JobRegistry\nCivic Governance")]
  hub1 --> graph1[("Subgraph Indexer")]
  hub2 --> graph2[("Subgraph Indexer")]
  hub3 --> graph3[("Subgraph Indexer")]
  graph1 & graph2 & graph3 --> ui["Sovereign Mesh UI"]
  ui --> ownerPanel[("Owner Panels\n(Etherscan links)")]
`}
  </pre>
);

const App: React.FC = () => {
  const { cfg, hmap, playbooks, error } = useMeshData();
  const [address, setAddress] = useState<string>();
  const [selHub, setSelHub] = useState<string>("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [reward, setReward] = useState("1000000000000000000");
  const [uri, setUri] = useState("ipfs://mesh/spec");
  const [jobId, setJobId] = useState("");
  const [approve, setApprove] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");

  const orchestratorBase = cfg?.orchestratorBase ?? "";

  useEffect(() => {
    if (!cfg || !selHub) return;
    const hub = hmap[selHub];
    if (!hub) return;
    const client = makeClient(hub.subgraphUrl ?? cfg.defaultSubgraphUrl);
    client
      .request(qJobs)
      .then((data: any) => setJobs(data.jobs ?? []))
      .catch(() => setJobs([]));
  }, [cfg, hmap, selHub]);

  const selectedPlaybookMeta = useMemo(
    () => playbooks.find((pb) => pb.id === selectedPlaybook),
    [playbooks, selectedPlaybook]
  );

  const withBase = (path: string) => `${orchestratorBase}${path}`;

  const ensureHub = () => {
    if (!selHub) {
      throw new Error("Select a hub first");
    }
    return selHub;
  };

  const connect = async () => {
    const signer = await getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
  };

  const sendTx = async (path: string, body: any) => {
    const hub = ensureHub();
    const res = await fetch(withBase(path.replace(":hub", hub)), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  };

  const handleCreateJob = async () => {
    const payload = await sendTx(`/mesh/${selHub}/tx/create`, { rewardWei: reward, uri });
    const signer = await getSigner();
    const tx = await signer.sendTransaction(payload.tx);
    await tx.wait();
    alert(`Job submitted to ${selHub}: ${tx.hash}`);
  };

  const handleStake = async () => {
    const payload = await sendTx(`/mesh/${selHub}/tx/stake`, {
      role: 1,
      amountWei: "1000000000000000000"
    });
    const signer = await getSigner();
    const tx = await signer.sendTransaction(payload.tx);
    await tx.wait();
    alert(`Staked on ${selHub}`);
  };

  const handleCommit = async () => {
    if (!jobId) throw new Error("Enter job ID");
    const { commitHash, salt } = computeCommit(approve);
    if (address) {
      localStorage.setItem(`salt_${selHub}_${jobId}_${address}`, salt);
    }
    const payload = await sendTx(`/mesh/${selHub}/tx/commit`, {
      jobId: Number(jobId),
      commitHash,
      subdomain: "validator",
      proof: []
    });
    const signer = await getSigner();
    const tx = await signer.sendTransaction(payload.tx);
    await tx.wait();
    alert(`Commit recorded: ${tx.hash}`);
  };

  const handleReveal = async () => {
    if (!jobId) throw new Error("Enter job ID");
    const salt = address ? localStorage.getItem(`salt_${selHub}_${jobId}_${address}`) : undefined;
    if (!salt) throw new Error("Commit salt not found. Commit before reveal.");
    const payload = await sendTx(`/mesh/${selHub}/tx/reveal`, {
      jobId: Number(jobId),
      approve,
      salt
    });
    const signer = await getSigner();
    const tx = await signer.sendTransaction(payload.tx);
    await tx.wait();
    alert(`Reveal submitted: ${tx.hash}`);
  };

  const handleFinalize = async () => {
    if (!jobId) throw new Error("Enter job ID");
    const payload = await sendTx(`/mesh/${selHub}/tx/finalize`, { jobId: Number(jobId) });
    const signer = await getSigner();
    const tx = await signer.sendTransaction(payload.tx);
    await tx.wait();
    alert(`Finalize executed: ${tx.hash}`);
  };

  const handleDispute = async () => {
    if (!jobId) throw new Error("Enter job ID");
    const evidence = prompt("Attach evidence URI or text", "ipfs://disputes/example");
    const payload = await sendTx(`/mesh/${selHub}/tx/dispute`, {
      jobId: Number(jobId),
      evidence
    });
    const signer = await getSigner();
    const tx = await signer.sendTransaction(payload.tx);
    await tx.wait();
    alert(`Dispute raised: ${tx.hash}`);
  };

  const handleMission = async () => {
    if (!selectedPlaybook) throw new Error("Select a mission playbook");
    const res = await fetch(withBase("/mesh/plan/instantiate"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playbookId: selectedPlaybook })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const signer = await getSigner();
    for (const txData of data.txs as any[]) {
      const tx = await signer.sendTransaction(txData);
      await tx.wait();
    }
    alert(`Mission ${selectedPlaybook} launched across ${data.txs.length} jobs`);
  };

  const handleAllowlist = async () => {
    const payload = await sendTx(`/mesh/${selHub}/tx/allowlist`, {
      role: 1,
      addr: address
    });
    const signer = await getSigner();
    const tx = await signer.sendTransaction(payload.tx);
    await tx.wait();
    alert("Validator temporarily allowlisted (dev use)");
  };

  return (
    <div style={{ padding: "48px 8vw 64px", maxWidth: 1280, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 42, margin: 0, letterSpacing: -1 }}>🕸️ Sovereign Mesh</h1>
          <p style={{ margin: "8px 0 0", maxWidth: 720, color: "rgba(226,232,240,0.75)", fontSize: 16 }}>
            A planet-scale network-of-networks orchestrating foresight, research, optimization, and knowledge missions across autonomous hubs.
            Non-technical leaders wield AGI Jobs v2 primitives through an intuitive console.
          </p>
        </div>
        <Badge text={cfg ? `Connected to ${cfg.network}` : "Configuring"} />
      </header>

      <MermaidBlock />

      {error ? <SectionCard title="Status" subtitle="Configuration failed to load."><p>{error}</p></SectionCard> : null}

      <SectionCard
        title="Command Deck"
        subtitle="Connect your wallet, choose a hub, and launch new economic intelligence.">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={connect}>
            {address ? `Connected: ${short(address)}` : "Connect Wallet"}
          </button>
          <select value={selHub} onChange={(e) => setSelHub(e.target.value)}>
            <option value="">— Choose Hub —</option>
            {Object.entries(hmap).map(([key, hub]) => (
              <option key={key} value={key}>
                {hub.label}
              </option>
            ))}
          </select>
          <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Reward (wei)" />
          <input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="Specification URI" style={{ minWidth: 280 }} />
          <button onClick={() => handleCreateJob().catch((err) => alert(err.message))}>Create Job</button>
          <button onClick={() => handleAllowlist().catch((err) => alert(err.message))}>
            Dev: Allowlist Validator
          </button>
        </div>
      </SectionCard>

      <SectionCard title={`Live Jobs — ${selHub || "choose a hub"}`} subtitle="Real-time intelligence aggregated from TheGraph subgraphs per hub.">
        {jobs.length === 0 ? <p style={{ opacity: 0.7 }}>No jobs indexed yet.</p> : <JobTable jobs={jobs} />}
      </SectionCard>

      <SectionCard title="Validator Arena" subtitle="Stake, commit, reveal, finalize, or dispute outcomes to uphold truth and integrity.">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="Job ID" style={{ width: 120 }} />
          <button onClick={() => handleStake().catch((err) => alert(err.message))}>Stake 1 AGIA</button>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> Approve
          </label>
          <button onClick={() => handleCommit().catch((err) => alert(err.message))}>Commit</button>
          <button onClick={() => handleReveal().catch((err) => alert(err.message))}>Reveal</button>
          <button onClick={() => handleFinalize().catch((err) => alert(err.message))}>Finalize</button>
          <button onClick={() => handleDispute().catch((err) => alert(err.message))}>Dispute</button>
        </div>
      </SectionCard>

      <SectionCard
        title="Mission Playbooks"
        subtitle="Trigger multi-hub, multi-stage deployments with a single signature. Each step is a composable AGI Jobs v2 posting.">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select value={selectedPlaybook} onChange={(e) => setSelectedPlaybook(e.target.value)}>
            <option value="">— Choose Mission —</option>
            {playbooks.map((pb) => (
              <option key={pb.id} value={pb.id}>
                {pb.name}
              </option>
            ))}
          </select>
          <button onClick={() => handleMission().catch((err) => alert(err.message))}>Instantiate Mission</button>
        </div>
        <MissionPreview playbook={selectedPlaybookMeta} />
      </SectionCard>

      <SectionCard title="Owner Control Grid" subtitle="Every hub remains governable by the owner multisig with pause/update controls.">
        <details open style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", marginBottom: 12 }}>Expand governance surface</summary>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
            {Object.entries(hmap).map(([key, hub]) => {
              const base = `${cfg?.etherscanBase ?? "https://etherscan.io"}/address`;
              return (
                <li key={key} style={{ background: "rgba(15,23,42,0.7)", padding: 16, borderRadius: 16, border: "1px solid rgba(148,163,184,0.25)" }}>
                  <h3 style={{ marginTop: 0 }}>{hub.label}</h3>
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    <li>
                      <a target="_blank" rel="noreferrer" href={`${base}/${hub.addresses.ValidationModule}#writeContract`}>
                        ValidationModule
                      </a>
                    </li>
                    <li>
                      <a target="_blank" rel="noreferrer" href={`${base}/${hub.addresses.JobRegistry}#writeContract`}>
                        JobRegistry
                      </a>
                    </li>
                    <li>
                      <a target="_blank" rel="noreferrer" href={`${base}/${hub.addresses.StakeManager}#writeContract`}>
                        StakeManager
                      </a>
                    </li>
                    <li>
                      <a target="_blank" rel="noreferrer" href={`${base}/${hub.addresses.IdentityRegistry}#writeContract`}>
                        IdentityRegistry
                      </a>
                    </li>
                    {hub.addresses.FeePool && hub.addresses.FeePool !== "0x0000000000000000000000000000000000000000" ? (
                      <li>
                        <a target="_blank" rel="noreferrer" href={`${base}/${hub.addresses.FeePool}#writeContract`}>
                          FeePool
                        </a>
                      </li>
                    ) : null}
                  </ol>
                </li>
              );
            })}
          </ul>
        </details>
      </SectionCard>
    </div>
  );
};

export default App;
