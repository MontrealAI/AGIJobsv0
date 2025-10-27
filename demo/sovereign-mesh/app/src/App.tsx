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

type Playbook = {
  id: string;
  name: string;
  description?: string;
  steps: Array<{ hub: string; rewardWei: string; uri: string }>;
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

const weiToEth = (wei: string) => {
  try {
    return (Number(wei) / 1e18).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } catch (err) {
    return wei;
  }
};

type JobRow = {
  id: string;
  employer: string;
  reward: string;
  uri: string;
  status: string;
  validators?: Array<{ account: string }>;
};

const orchestratorBase = ""; // always relative

const Section: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
  children
}) => (
  <section style={{ marginTop: 32 }}>
    <h2 style={{ fontSize: "1.35rem", marginBottom: 4 }}>{title}</h2>
    {subtitle ? (
      <p style={{ marginTop: 0, color: "rgba(255,255,255,0.6)", maxWidth: 720 }}>
        {subtitle}
      </p>
    ) : null}
    {children}
  </section>
);

const Pill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      background: "rgba(255,255,255,0.06)",
      borderRadius: 999,
      padding: "0.35rem 0.75rem",
      fontSize: "0.75rem",
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      marginRight: 8,
      display: "inline-flex",
      alignItems: "center",
      gap: 6
    }}
  >
    <span style={{ opacity: 0.6 }}>{label}</span>
    <strong>{value}</strong>
  </div>
);

const App: React.FC = () => {
  const [cfg, setCfg] = useState<MeshConfig>();
  const [hubs, setHubs] = useState<Record<string, Hub>>({});
  const [hubKeys, setHubKeys] = useState<string[]>([]);
  const [address, setAddress] = useState<string>();
  const [actors, setActors] = useState<Array<{ id: string; name: string; flag: string }>>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [reward, setReward] = useState<string>("1000000000000000000");
  const [uri, setUri] = useState<string>("ipfs://mesh/spec");
  const [jobId, setJobId] = useState<string>("");
  const [approve, setApprove] = useState<boolean>(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [loadingJobs, setLoadingJobs] = useState<boolean>(false);

  useEffect(() => {
    void (async () => {
      const cfg = await fetchJson<MeshConfig>(`${orchestratorBase}/mesh/config`);
      setCfg(cfg);
      const hubResponse = await fetchJson<{ hubs: Record<string, Hub> }>(
        `${orchestratorBase}/mesh/hubs`
      );
      setHubs(hubResponse.hubs);
      setHubKeys(Object.keys(hubResponse.hubs));
      setActors(await fetchJson(`${orchestratorBase}/mesh/actors`));
      setPlaybooks(await fetchJson(`${orchestratorBase}/mesh/playbooks`));
    })();
  }, []);

  useEffect(() => {
    if (!cfg || !selectedHub) return;
    const hub = hubs[selectedHub];
    if (!hub) return;
    setLoadingJobs(true);
    const subgraphUrl = hub.subgraphUrl ?? cfg.defaultSubgraphUrl;
    makeClient(subgraphUrl)
      .request<{ jobs: JobRow[] }>(qJobs)
      .then((data) => {
        setJobs(data.jobs ?? []);
      })
      .catch((err) => {
        console.error("Failed to load jobs", err);
        setJobs([]);
      })
      .finally(() => setLoadingJobs(false));
  }, [cfg, selectedHub, hubs]);

  const connect = async () => {
    const signer = await getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
  };

  const orchestratorCall = async <T,>(
    path: string,
    body: Record<string, unknown>
  ): Promise<T> => {
    return fetchJson<T>(`${orchestratorBase}${path}`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  };

  const ensureHubSelected = () => {
    if (!selectedHub) {
      throw new Error("Select a hub first");
    }
  };

  const sendTx = async (payload: { to: string; data: string; value: number | string }) => {
    const signer = await getSigner();
    const tx = await signer.sendTransaction({
      to: payload.to,
      data: payload.data,
      value:
        typeof payload.value === "string"
          ? BigInt(payload.value)
          : BigInt(payload.value ?? 0)
    });
    await tx.wait();
    return tx.hash;
  };

  const createJob = async () => {
    try {
      ensureHubSelected();
      const resp = await orchestratorCall<{ tx: { to: string; data: string; value: number | string } }>(
        `/mesh/${selectedHub}/tx/create`,
        { rewardWei: reward, uri }
      );
      const hash = await sendTx(resp.tx);
      alert(`Job submitted on ${selectedHub}: ${hash}`);
    } catch (err: any) {
      alert(err.message ?? "Failed to create job");
    }
  };

  const stake = async (role: number, amountWei: string) => {
    try {
      ensureHubSelected();
      const resp = await orchestratorCall<{ tx: { to: string; data: string; value: number | string } }>(
        `/mesh/${selectedHub}/tx/stake`,
        { role, amountWei }
      );
      const hash = await sendTx(resp.tx);
      alert(`Staked on ${selectedHub}: ${hash}`);
    } catch (err: any) {
      alert(err.message ?? "Failed to stake");
    }
  };

  const commit = async () => {
    try {
      ensureHubSelected();
      if (!jobId) {
        throw new Error("Enter a job id");
      }
      const { commitHash, salt } = computeCommit(approve);
      if (address) {
        localStorage.setItem(`mesh_salt_${selectedHub}_${jobId}_${address}`, salt);
      }
      const resp = await orchestratorCall<{ tx: { to: string; data: string; value: number | string } }>(
        `/mesh/${selectedHub}/tx/commit`,
        { jobId: Number(jobId), commitHash, subdomain: "validator", proof: [] }
      );
      const hash = await sendTx(resp.tx);
      alert(`Commit submitted: ${hash}`);
    } catch (err: any) {
      alert(err.message ?? "Commit failed");
    }
  };

  const reveal = async () => {
    try {
      ensureHubSelected();
      if (!jobId) {
        throw new Error("Enter a job id");
      }
      const saltKey = `mesh_salt_${selectedHub}_${jobId}_${address}`;
      const salt = localStorage.getItem(saltKey);
      if (!salt) {
        throw new Error("No commit found for this hub/job/account");
      }
      const resp = await orchestratorCall<{ tx: { to: string; data: string; value: number | string } }>(
        `/mesh/${selectedHub}/tx/reveal`,
        { jobId: Number(jobId), approve, salt }
      );
      const hash = await sendTx(resp.tx);
      alert(`Reveal submitted: ${hash}`);
    } catch (err: any) {
      alert(err.message ?? "Reveal failed");
    }
  };

  const finalize = async () => {
    try {
      ensureHubSelected();
      if (!jobId) {
        throw new Error("Enter a job id");
      }
      const resp = await orchestratorCall<{ tx: { to: string; data: string; value: number | string } }>(
        `/mesh/${selectedHub}/tx/finalize`,
        { jobId: Number(jobId) }
      );
      const hash = await sendTx(resp.tx);
      alert(`Finalize tx: ${hash}`);
    } catch (err: any) {
      alert(err.message ?? "Finalize failed");
    }
  };

  const dispute = async () => {
    try {
      ensureHubSelected();
      if (!jobId) {
        throw new Error("Enter a job id");
      }
      const evidence = prompt("Attach evidence URI (optional)", "ipfs://");
      const resp = await orchestratorCall<{ tx: { to: string; data: string; value: number | string } }>(
        `/mesh/${selectedHub}/tx/dispute`,
        { jobId: Number(jobId), evidence: evidence ?? "" }
      );
      const hash = await sendTx(resp.tx);
      alert(`Dispute raised: ${hash}`);
    } catch (err: any) {
      alert(err.message ?? "Dispute failed");
    }
  };

  const instantiateMission = async () => {
    try {
      if (!selectedPlaybook) {
        throw new Error("Select a mission playbook");
      }
      const resp = await orchestratorCall<{ txs: Array<{ to: string; data: string; value: number | string }> }>(
        "/mesh/plan/instantiate",
        { playbookId: selectedPlaybook }
      );
      const signer = await getSigner();
      for (const tx of resp.txs) {
        const sent = await signer.sendTransaction({
          to: tx.to,
          data: tx.data,
          value: typeof tx.value === "string" ? BigInt(tx.value) : BigInt(tx.value ?? 0)
        });
        await sent.wait();
      }
      alert(`Mission instantiated across ${resp.txs.length} hubs.`);
    } catch (err: any) {
      alert(err.message ?? "Mission instantiation failed");
    }
  };

  const allowlistValidator = async () => {
    try {
      ensureHubSelected();
      if (!address) {
        throw new Error("Connect your wallet first");
      }
      const resp = await orchestratorCall<{ tx: { to: string; data: string; value: number | string } }>(
        `/mesh/${selectedHub}/tx/allowlist`,
        { role: 1, addr: address }
      );
      const hash = await sendTx(resp.tx);
      alert(`Address allowlisted on ${selectedHub}: ${hash}`);
    } catch (err: any) {
      alert(err.message ?? "Allowlist failed");
    }
  };

  const selectedHubConfig = useMemo(() => hubs[selectedHub], [selectedHub, hubs]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 120px" }}>
      <header>
        <h1 style={{ fontSize: "2.8rem", marginBottom: 12 }}>
          🕸️ Sovereign Mesh <span style={{ opacity: 0.6, fontSize: "1.1rem" }}>— Beyond Civic Exocortex</span>
        </h1>
        <p style={{ maxWidth: 840, lineHeight: 1.6, color: "rgba(255,255,255,0.75)" }}>
          Compose foresight, research, optimization, and knowledge missions across autonomous AGI Jobs hubs. Every action is
          wallet-signed; every module remains owner-governed. Launch civilization-scale intents with the confidence of complete
          operational control.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
          <button onClick={connect}>
            {address ? `Connected: ${short(address)}` : "Connect wallet"}
          </button>
          <select value={selectedHub} onChange={(e) => setSelectedHub(e.target.value)}>
            <option value="">— Choose hub —</option>
            {hubKeys.map((key) => (
              <option key={key} value={key}>
                {hubs[key]?.label ?? key}
              </option>
            ))}
          </select>
          <input
            style={{ width: 220 }}
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            placeholder="Reward in wei"
          />
          <input
            style={{ flex: "1 1 320px" }}
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="Job spec URI"
          />
          <button onClick={createJob}>Create job</button>
          <button onClick={allowlistValidator} style={{ background: "rgba(138,180,255,0.25)", color: "#fff" }}>
            Dev: allowlist validator
          </button>
        </div>
        {cfg ? (
          <div style={{ marginTop: 16 }}>
            <Pill label="Network" value={cfg.network} />
            <Pill label="Hubs" value={String(cfg.hubs.length)} />
          </div>
        ) : null}
      </header>

      <Section
        title={`Live jobs — ${selectedHubConfig?.label ?? "select a hub"}`}
        subtitle="Subgraph-backed mission feed. Switch hubs to watch jobs materialize across the Sovereign Mesh."
      >
        {loadingJobs ? (
          <p>Loading jobs…</p>
        ) : jobs.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No jobs found for this hub yet. Instantiate a mission to begin.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Employer</th>
                <th>Reward (AGI)</th>
                <th>URI</th>
                <th>Status</th>
                <th>Validators</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={`${selectedHub}-${job.id}`}>
                  <td>{job.id}</td>
                  <td>{short(job.employer)}</td>
                  <td>{weiToEth(job.reward)}</td>
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
        )}
      </Section>

      <Section
        title="Participate"
        subtitle="Stake, commit, reveal, and finalize validations directly from your wallet."
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Job ID"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            style={{ width: 120 }}
          />
          <button onClick={() => stake(1, "1000000000000000000")}>Stake 1 AGI as validator</button>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> approve
          </label>
          <button onClick={commit}>Commit</button>
          <button onClick={reveal}>Reveal</button>
          <button onClick={finalize}>Finalize</button>
          <button onClick={dispute} style={{ background: "rgba(255,87,87,0.25)", color: "#fff" }}>
            Raise dispute
          </button>
        </div>
      </Section>

      <Section
        title="Mission playbooks"
        subtitle="Trigger chained foresight → research → optimization → knowledge missions across hubs."
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select value={selectedPlaybook} onChange={(e) => setSelectedPlaybook(e.target.value)}>
            <option value="">— Choose mission —</option>
            {playbooks.map((pb) => (
              <option key={pb.id} value={pb.id}>
                {pb.name}
              </option>
            ))}
          </select>
          <button onClick={instantiateMission}>Instantiate mission</button>
        </div>
        {selectedPlaybook ? (
          <ul style={{ marginTop: 16, lineHeight: 1.6 }}>
            {playbooks
              .find((pb) => pb.id === selectedPlaybook)
              ?.steps.map((step) => {
                const [stage, hub] = step.hub.split("@");
                return (
                  <li key={`${step.hub}-${step.uri}`}>
                    <strong>{stage.toUpperCase()}</strong> → {hubs[hub]?.label ?? hub} — reward {weiToEth(step.rewardWei)} AGI
                  </li>
                );
              })}
          </ul>
        ) : null}
      </Section>

      <Section
        title="Owner control surface"
        subtitle="Immediate access to every documented setter across the hub constellation."
      >
        {cfg ? (
          <details>
            <summary style={{ cursor: "pointer" }}>Open contract panels</summary>
            <ul>
              {hubKeys.map((key) => {
                const hub = hubs[key];
                if (!hub) return null;
                const base = `${cfg.etherscanBase}/address`;
                const link = (addr: string, label: string) => (
                  <li key={`${key}-${label}`}>
                    <a href={`${base}/${addr}#writeContract`} target="_blank" rel="noreferrer">
                      {hub.label} — {label}
                    </a>
                  </li>
                );
                return (
                  <li key={key} style={{ marginTop: 12 }}>
                    <strong>{hub.label}</strong>
                    <ul>
                      {link(hub.addresses.ValidationModule, "ValidationModule")}
                      {link(hub.addresses.JobRegistry, "JobRegistry")}
                      {link(hub.addresses.StakeManager, "StakeManager")}
                      {link(hub.addresses.IdentityRegistry, "IdentityRegistry")}
                      {hub.addresses.FeePool &&
                      hub.addresses.FeePool !== "0x0000000000000000000000000000000000000000"
                        ? link(hub.addresses.FeePool, "FeePool")
                        : null}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : (
          <p style={{ opacity: 0.6 }}>Loading owner panels…</p>
        )}
      </Section>

      {actors.length ? (
        <Section title="Mission sponsors" subtitle="Sample identities powering the mesh.">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {actors.map((actor) => (
              <div
                key={actor.id}
                style={{
                  padding: "0.75rem 1.1rem",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.05)",
                  minWidth: 140
                }}
              >
                <div style={{ fontSize: "1.5rem" }}>{actor.flag}</div>
                <div style={{ fontWeight: 600 }}>{actor.name}</div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
};

export default App;
