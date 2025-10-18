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

const bootstrapBase =
  (window as any).__SOVEREIGN_MESH_BASE__ ??
  (import.meta as any).env?.VITE_MESH_BASE ??
  "";

const resolveUrl = (path: string, base?: string) => {
  if (/^https?:/i.test(path)) {
    return path;
  }
  const effective = (base ?? bootstrapBase).replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${effective}${normalized}`;
};

const fetchJson = async (path: string, init?: RequestInit, base?: string) => {
  const res = await fetch(resolveUrl(path, base), {
    headers: { "content-type": "application/json" },
    ...init
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status}`);
  }
  return res.json();
};

const Section: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle, children }) => (
  <section
    style={{
      background: "rgba(5, 12, 20, 0.75)",
      border: "1px solid rgba(96, 200, 255, 0.2)",
      borderRadius: 24,
      padding: "1.6rem",
      marginTop: "1.4rem",
      boxShadow: "0 24px 60px rgba(0,0,0,0.35)"
    }}
  >
    <header style={{ marginBottom: "1rem" }}>
      <h2 style={{ margin: 0, fontSize: "1.4rem" }}>{title}</h2>
      {subtitle ? (
        <p style={{ margin: "0.35rem 0 0", color: "rgba(220, 240, 255, 0.75)", maxWidth: 720 }}>{subtitle}</p>
      ) : null}
    </header>
    {children}
  </section>
);

const formatReward = (value: string) => {
  try {
    const num = BigInt(value);
    const whole = Number(num) / 1e18;
    if (!Number.isFinite(whole)) return `${value} wei`;
    return `${whole.toLocaleString(undefined, { maximumFractionDigits: 4 })} AGIA`;
  } catch {
    return value;
  }
};

const orchestrator = async (path: string, body?: unknown, base?: string) =>
  fetchJson(path, body ? { method: "POST", body: JSON.stringify(body) } : undefined, base);

export default function App(): JSX.Element {
  const [cfg, setCfg] = useState<MeshConfig | null>(null);
  const [hubMap, setHubMap] = useState<Record<string, Hub>>({});
  const [hubIds, setHubIds] = useState<string[]>([]);
  const [addr, setAddr] = useState<string | undefined>();
  const [actors, setActors] = useState<Array<{ id: string; flag: string; name: string }>>([]);
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [rewardWei, setRewardWei] = useState("1000000000000000000");
  const [uri, setUri] = useState("ipfs://mesh/spec");
  const [jobId, setJobId] = useState<string>("");
  const [approve, setApprove] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState<string[]>([]);
  const orchestratorBase = useMemo(() => cfg?.orchestratorBase ?? bootstrapBase, [cfg]);

  useEffect(() => {
    Promise.all([
      fetchJson("/mesh/config"),
      fetchJson("/mesh/hubs"),
      fetchJson("/mesh/actors"),
      fetchJson("/mesh/playbooks")
    ])
      .then(([cfgData, hubData, actorsData, playbookData]) => {
        setCfg(cfgData as MeshConfig);
        const map = (hubData as { hubs: Record<string, Hub> }).hubs;
        setHubMap(map);
        setHubIds(Object.keys(map));
        setActors(actorsData as any);
        setPlaybooks(playbookData as any[]);
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!cfg || !selectedHub) return;
    const hub = hubMap[selectedHub];
    if (!hub) return;
    const client = makeClient(hub.subgraphUrl ?? cfg.defaultSubgraphUrl);
    client
      .request(qJobs)
      .then((data) => setJobs((data as any).jobs ?? []))
      .catch((err) => console.error(err));
  }, [cfg, selectedHub, hubMap]);

  const connectWallet = async () => {
    const signer = await getSigner();
    const account = await signer.getAddress();
    setAddr(account);
  };

  const ensureHubSelected = () => {
    if (!selectedHub) {
      alert("Select a hub first");
      throw new Error("Hub not selected");
    }
  };

  const sendTx = async (tx: { to: string; data: string; value: number | string }) => {
    const signer = await getSigner();
    const resp = await signer.sendTransaction({ ...tx, value: BigInt(tx.value ?? 0) });
    const receipt = await resp.wait();
    return receipt;
  };

  const createJob = async () => {
    ensureHubSelected();
    setLoading(true);
    try {
      const payload = await orchestrator(
        `/mesh/${selectedHub}/tx/create`,
        {
          rewardWei,
          uri
        },
        orchestratorBase
      );
      const receipt = await sendTx(payload.tx);
      setTimeline((entries) => [
        `Created job on ${selectedHub} — tx ${receipt?.hash ?? ""}`,
        ...entries
      ]);
      alert(`Job created on ${selectedHub}`);
    } finally {
      setLoading(false);
    }
  };

  const stake = async (role: number, amount: string) => {
    ensureHubSelected();
    setLoading(true);
    try {
      const payload = await orchestrator(
        `/mesh/${selectedHub}/tx/stake`,
        {
          role,
          amountWei: amount
        },
        orchestratorBase
      );
      const receipt = await sendTx(payload.tx);
      setTimeline((entries) => [
        `Staked role ${role} on ${selectedHub} — tx ${receipt?.hash ?? ""}`,
        ...entries
      ]);
      alert("Stake submitted");
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    ensureHubSelected();
    if (!jobId) {
      alert("Enter a job ID");
      return;
    }
    setLoading(true);
    try {
      const { commitHash, salt } = computeCommit(approve);
      if (!addr) {
        throw new Error("Wallet must be connected");
      }
      localStorage.setItem(`mesh_salt_${selectedHub}_${jobId}_${addr}`, salt);
      const payload = await orchestrator(
        `/mesh/${selectedHub}/tx/commit`,
        {
          jobId: Number(jobId),
          commitHash,
          subdomain: "validator",
          proof: []
        },
        orchestratorBase
      );
      const receipt = await sendTx(payload.tx);
      setTimeline((entries) => [
        `Committed validation on ${selectedHub} — tx ${receipt?.hash ?? ""}`,
        ...entries
      ]);
      alert("Commit submitted");
    } finally {
      setLoading(false);
    }
  };

  const reveal = async () => {
    ensureHubSelected();
    if (!jobId) {
      alert("Enter a job ID");
      return;
    }
    if (!addr) {
      alert("Connect wallet first");
      return;
    }
    const salt = localStorage.getItem(`mesh_salt_${selectedHub}_${jobId}_${addr}`);
    if (!salt) {
      alert("Commit not found for this job");
      return;
    }
    setLoading(true);
    try {
      const payload = await orchestrator(
        `/mesh/${selectedHub}/tx/reveal`,
        {
          jobId: Number(jobId),
          approve,
          salt
        },
        orchestratorBase
      );
      const receipt = await sendTx(payload.tx);
      setTimeline((entries) => [
        `Revealed vote on ${selectedHub} — tx ${receipt?.hash ?? ""}`,
        ...entries
      ]);
      alert("Reveal submitted");
    } finally {
      setLoading(false);
    }
  };

  const finalize = async () => {
    ensureHubSelected();
    if (!jobId) {
      alert("Enter a job ID");
      return;
    }
    setLoading(true);
    try {
      const payload = await orchestrator(
        `/mesh/${selectedHub}/tx/finalize`,
        {
          jobId: Number(jobId)
        },
        orchestratorBase
      );
      const receipt = await sendTx(payload.tx);
      setTimeline((entries) => [
        `Finalized job ${jobId} on ${selectedHub} — tx ${receipt?.hash ?? ""}`,
        ...entries
      ]);
      alert("Finalize submitted");
    } finally {
      setLoading(false);
    }
  };

  const dispute = async () => {
    ensureHubSelected();
    if (!jobId) {
      alert("Enter a job ID");
      return;
    }
    setLoading(true);
    try {
      const payload = await orchestrator(
        `/mesh/${selectedHub}/tx/dispute`,
        {
          jobId: Number(jobId),
          evidence: prompt("Dispute evidence URI (optional)") ?? ""
        },
        orchestratorBase
      );
      const receipt = await sendTx(payload.tx);
      setTimeline((entries) => [
        `Dispute raised on ${selectedHub} — tx ${receipt?.hash ?? ""}`,
        ...entries
      ]);
      alert("Dispute transaction sent");
    } finally {
      setLoading(false);
    }
  };

  const allowlist = async (role: number) => {
    ensureHubSelected();
    if (!addr) {
      alert("Connect wallet first");
      return;
    }
    setLoading(true);
    try {
      const payload = await orchestrator(
        `/mesh/${selectedHub}/tx/allowlist`,
        {
          role,
          addr
        },
        orchestratorBase
      );
      const receipt = await sendTx(payload.tx);
      setTimeline((entries) => [
        `Allowlisted as ${role === 0 ? "agent" : "validator"} on ${selectedHub} — tx ${receipt?.hash ?? ""}`,
        ...entries
      ]);
      alert("Allowlist transaction sent (dev only)");
    } finally {
      setLoading(false);
    }
  };

  const instantiatePlaybook = async () => {
    if (!selectedPlaybook) {
      alert("Select a mission playbook");
      return;
    }
    setLoading(true);
    try {
      const payload = await orchestrator(
        "/mesh/plan/instantiate",
        {
          playbookId: selectedPlaybook
        },
        orchestratorBase
      );
      const signer = await getSigner();
      for (const tx of payload.txs) {
        const resp = await signer.sendTransaction({ ...tx, value: BigInt(tx.value ?? 0) });
        const receipt = await resp.wait();
        setTimeline((entries) => [
          `Mission step deployed on ${tx.hub} — tx ${receipt?.hash ?? ""}`,
          ...entries
        ]);
      }
      alert(`Mission instantiated across ${payload.txs.length} hubs`);
    } finally {
      setLoading(false);
    }
  };

  const selectedHubData = selectedHub ? hubMap[selectedHub] : undefined;
  const ownerLinks = useMemo(() => {
    if (!cfg) return [] as Array<{ hub: string; label: string; links: Array<{ module: string; url: string }> }>;
    return hubIds.map((id) => {
      const hub = hubMap[id];
      if (!hub) return { hub: id, label: id, links: [] };
      const base = `${cfg.etherscanBase}/address`;
      const modules = [
        "ValidationModule",
        "JobRegistry",
        "StakeManager",
        "IdentityRegistry",
        "CertificateNFT",
        "DisputeModule",
        "FeePool"
      ];
      return {
        hub: id,
        label: hub.label,
        links: modules
          .map((module) => {
            const addr = hub.addresses[module];
            if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
            return {
              module,
              url: `${base}/${addr}#writeContract`
            };
          })
          .filter(Boolean) as Array<{ module: string; url: string }>
      };
    });
  }, [cfg, hubIds, hubMap]);

  return (
    <div style={{ padding: "2.4rem", maxWidth: 1200, margin: "0 auto" }}>
      <header>
        <h1 style={{ fontSize: "2.6rem", marginBottom: "0.4rem" }}>🕸️ Sovereign Mesh</h1>
        <p style={{ margin: 0, maxWidth: 860, color: "rgba(220,240,255,0.75)" }}>
          Planet-scale mission control across foresight, research, optimization, and knowledge hubs. Every
          transaction stays in your wallet; every governance lever remains in the owner’s hands.
        </p>
      </header>

      <Section
        title="Mission Control"
        subtitle="Connect, choose a hub, and mint new jobs with cinematic clarity."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <button onClick={connectWallet}>
            {addr ? `Connected: ${short(addr)}` : "Connect Wallet"}
          </button>
          <select value={selectedHub} onChange={(e) => setSelectedHub(e.target.value)}>
            <option value="">— Choose Hub —</option>
            {hubIds.map((id) => (
              <option key={id} value={id}>
                {hubMap[id]?.label ?? id}
              </option>
            ))}
          </select>
          <input
            value={rewardWei}
            onChange={(e) => setRewardWei(e.target.value)}
            placeholder="reward (wei)"
            style={{ minWidth: 220 }}
          />
          <input
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="job spec URI"
            style={{ minWidth: 280 }}
          />
          <button disabled={loading} onClick={createJob}>
            {loading ? "Working…" : "Create Job"}
          </button>
          <button disabled={loading} onClick={() => allowlist(1)}>
            Dev: Allowlist Validator
          </button>
        </div>
      </Section>

      <Section
        title={`Live Intelligence${selectedHub ? ` — ${hubMap[selectedHub]?.label ?? selectedHub}` : ""}`}
        subtitle="Observe every job, validator, and reward in real time."
      >
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Proposer</th>
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
              {!jobs.length ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "1.4rem" }}>
                    No jobs indexed yet. Create one or seed via scripts.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Validator Forge"
        subtitle="Stake, commit, reveal, finalize — with salt hygiene automated for you."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="job ID"
            style={{ width: 120 }}
          />
          <button disabled={loading} onClick={() => stake(1, "1000000000000000000")}>
            Stake as Validator (1 AGIA)
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> approve
          </label>
          <button disabled={loading} onClick={commit}>
            Commit
          </button>
          <button disabled={loading} onClick={reveal}>
            Reveal
          </button>
          <button disabled={loading} onClick={finalize}>
            Finalize
          </button>
          <button disabled={loading} onClick={dispute}>
            Raise Dispute
          </button>
        </div>
      </Section>

      <Section
        title="Mission Playbooks"
        subtitle="One intent, many hubs. Launch civilization-scale missions with a click."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <select value={selectedPlaybook} onChange={(e) => setSelectedPlaybook(e.target.value)}>
            <option value="">— Choose Mission —</option>
            {playbooks.map((pb) => (
              <option key={pb.id} value={pb.id}>
                {pb.name}
              </option>
            ))}
          </select>
          <button disabled={loading} onClick={instantiatePlaybook}>
            {loading ? "Working…" : "Instantiate Mission"}
          </button>
        </div>
        {selectedPlaybook ? (
          <div style={{ marginTop: "1rem", display: "grid", gap: "0.6rem" }}>
            {playbooks
              .find((pb) => pb.id === selectedPlaybook)?.steps.map((step: any, idx: number) => {
                const [stage, hubId] = step.hub.split("@");
                return (
                  <div
                    key={`${step.hub}-${idx}`}
                    style={{
                      background: "rgba(15, 32, 46, 0.8)",
                      borderRadius: 16,
                      padding: "0.9rem 1.1rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      border: "1px solid rgba(120,200,255,0.2)"
                    }}
                  >
                    <div>
                      <strong style={{ textTransform: "uppercase", letterSpacing: 1 }}>{stage}</strong>
                      <div style={{ color: "rgba(200, 230, 255, 0.75)" }}>{hubMap[hubId]?.label ?? hubId}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600 }}>{formatReward(step.rewardWei)}</div>
                      <a href={step.uri} target="_blank" rel="noreferrer">
                        {step.uri}
                      </a>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : null}
      </Section>

      <Section title="Owner Command Deck" subtitle="All governance levers, one click away.">
        <details>
          <summary style={{ fontWeight: 600, marginBottom: "0.6rem" }}>Open owner panels</summary>
          <div style={{ display: "grid", gap: "1rem", marginTop: "0.6rem" }}>
            {ownerLinks.map((entry) => (
              <div key={entry.hub}>
                <h4 style={{ marginBottom: "0.3rem" }}>{entry.label}</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {entry.links.map((item) => (
                    <a key={item.module} href={item.url} target="_blank" rel="noreferrer">
                      {item.module}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      </Section>

      <Section title="Mission Timeline" subtitle="Immutable breadcrumbs of everything you’ve orchestrated today.">
        {!timeline.length ? (
          <p style={{ color: "rgba(220,240,255,0.65)" }}>Your mission timeline is waiting for its first imprint.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
            {timeline.map((entry, idx) => (
              <li
                key={`${entry}-${idx}`}
                style={{
                  background: "rgba(10, 24, 36, 0.8)",
                  borderRadius: 14,
                  padding: "0.75rem 1rem",
                  border: "1px solid rgba(110, 210, 255, 0.2)"
                }}
              >
                {entry}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {selectedHubData ? (
        <Section
          title="Hub Telemetry"
          subtitle="Quick look at addresses powering this domain-specific hub."
        >
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.6rem" }}>
            {Object.entries(selectedHubData.addresses).map(([module, address]) => (
              <div key={module} style={{ background: "rgba(12, 30, 46, 0.75)", padding: "0.7rem", borderRadius: 12 }}>
                <dt style={{ fontWeight: 600 }}>{module}</dt>
                <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "0.85rem" }}>{address}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {actors.length ? (
        <Section title="Actors & Stakeholders" subtitle="Sample sponsors that can front missions in the demo.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {actors.map((actor) => (
              <div
                key={actor.id}
                style={{
                  background: "rgba(18, 36, 54, 0.8)",
                  padding: "0.7rem 1rem",
                  borderRadius: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem"
                }}
              >
                <span style={{ fontSize: "1.5rem" }}>{actor.flag}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{actor.name}</div>
                  <div style={{ color: "rgba(210,230,255,0.65)" }}>Actor ID: {actor.id}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <footer style={{ marginTop: "2rem", color: "rgba(160, 200, 255, 0.6)", fontSize: "0.9rem" }}>
        Sovereign Mesh channels the full might of AGI Jobs v2 — wallet-sovereign execution, owner-controlled governance, and
        civilization-scale playbooks.
      </footer>
    </div>
  );
}
