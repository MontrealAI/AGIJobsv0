import React, { useCallback, useEffect, useMemo, useState } from "react";
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

type HubMap = Record<
  string,
  {
    label: string;
    rpcUrl: string;
    subgraphUrl?: string;
    addresses: Record<string, string>;
  }
>;

const jsonFetch = async <T,>(url: string, options?: RequestInit) => {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
};

const saltKey = (hub: string, job: string, account: string | undefined) =>
  `sovereign_mesh_salt_${hub}_${job}_${account ?? "anon"}`;

export default function App() {
  const [cfg, setCfg] = useState<MeshConfig>();
  const [hubMap, setHubMap] = useState<HubMap>({});
  const [hubList, setHubList] = useState<string[]>([]);
  const [addr, setAddr] = useState<string>();
  const [actors, setActors] = useState<any[]>([]);
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [reward, setReward] = useState("1000000000000000000");
  const [uri, setUri] = useState("ipfs://mesh/spec");
  const [jobId, setJobId] = useState("");
  const [approve, setApprove] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState("");

  const baseUrl = useMemo(() => cfg?.orchestratorBase ?? "", [cfg]);

  const api = useCallback(
    async <T,>(path: string, options?: RequestInit) => {
      const url = `${baseUrl}${path}`;
      return jsonFetch<T>(url, options);
    },
    [baseUrl]
  );

  useEffect(() => {
    api<MeshConfig>("/mesh/config")
      .then(setCfg)
      .catch((err) => console.error("Failed to load config", err));
    api<{ hubs: HubMap }>("/mesh/hubs")
      .then((data) => {
        setHubMap(data.hubs || {});
        setHubList(Object.keys(data.hubs || {}));
      })
      .catch((err) => console.error("Failed to load hubs", err));
    api<any[]>("/mesh/actors")
      .then(setActors)
      .catch((err) => console.error("Failed to load actors", err));
    api<any[]>("/mesh/playbooks")
      .then(setPlaybooks)
      .catch((err) => console.error("Failed to load playbooks", err));
  }, [api]);

  useEffect(() => {
    if (!cfg || !selectedHub) return;
    const hub = hubMap[selectedHub];
    if (!hub) return;
    const endpoint = hub.subgraphUrl || cfg.defaultSubgraphUrl;
    if (!endpoint) return;
    makeClient(endpoint)
      .request(qJobs)
      .then((data: any) => setJobs(data.jobs || []))
      .catch((err) => console.error("Failed to query jobs", err));
  }, [cfg, selectedHub, hubMap]);

  const connect = async () => {
    const signer = await getSigner();
    const address = await signer.getAddress();
    setAddr(address);
  };

  const withSigner = async (callback: (signer: any) => Promise<void>) => {
    const signer = await getSigner();
    await callback(signer);
  };

  const ensureHub = () => {
    if (!selectedHub) {
      throw new Error("Choose a hub first");
    }
    return selectedHub;
  };

  const createJob = async () => {
    const hub = ensureHub();
    await withSigner(async (signer) => {
      const body = JSON.stringify({ rewardWei: reward, uri });
      const payload = await api<{ tx: any }>(`/mesh/${hub}/tx/create`, {
        method: "POST",
        body
      });
      const txResp = await signer.sendTransaction(payload.tx);
      await txResp.wait();
      alert(`✅ Submitted on ${hub}: ${txResp.hash}`);
    });
  };

  const stake = async (role: number, amountWei: string) => {
    const hub = ensureHub();
    await withSigner(async (signer) => {
      const payload = await api<{ tx: any }>(`/mesh/${hub}/tx/stake`, {
        method: "POST",
        body: JSON.stringify({ role, amountWei })
      });
      const txResp = await signer.sendTransaction(payload.tx);
      await txResp.wait();
      alert(`✅ Staked on ${hub}: ${txResp.hash}`);
    });
  };

  const commit = async () => {
    const hub = ensureHub();
    if (!jobId) throw new Error("Specify jobId");
    await withSigner(async (signer) => {
      const { commitHash, salt } = computeCommit(approve);
      localStorage.setItem(saltKey(hub, jobId, addr), salt);
      const payload = await api<{ tx: any }>(`/mesh/${hub}/tx/commit`, {
        method: "POST",
        body: JSON.stringify({
          jobId: Number(jobId),
          commitHash,
          subdomain: "validator",
          proof: []
        })
      });
      const txResp = await signer.sendTransaction(payload.tx);
      await txResp.wait();
      alert(`✅ Committed on ${hub}: ${txResp.hash}`);
    });
  };

  const reveal = async () => {
    const hub = ensureHub();
    if (!jobId) throw new Error("Specify jobId");
    const salt = localStorage.getItem(saltKey(hub, jobId, addr));
    if (!salt) throw new Error("No commit found for this job");
    await withSigner(async (signer) => {
      const payload = await api<{ tx: any }>(`/mesh/${hub}/tx/reveal`, {
        method: "POST",
        body: JSON.stringify({ jobId: Number(jobId), approve, salt })
      });
      const txResp = await signer.sendTransaction(payload.tx);
      await txResp.wait();
      alert(`✅ Revealed on ${hub}: ${txResp.hash}`);
    });
  };

  const finalize = async () => {
    const hub = ensureHub();
    if (!jobId) throw new Error("Specify jobId");
    await withSigner(async (signer) => {
      const payload = await api<{ tx: any }>(`/mesh/${hub}/tx/finalize`, {
        method: "POST",
        body: JSON.stringify({ jobId: Number(jobId) })
      });
      const txResp = await signer.sendTransaction(payload.tx);
      await txResp.wait();
      alert(`✅ Finalized on ${hub}: ${txResp.hash}`);
    });
  };

  const dispute = async () => {
    const hub = ensureHub();
    if (!jobId) throw new Error("Specify jobId");
    await withSigner(async (signer) => {
      const payload = await api<{ tx: any }>(`/mesh/${hub}/tx/dispute`, {
        method: "POST",
        body: JSON.stringify({ jobId: Number(jobId), evidence: "" })
      });
      const txResp = await signer.sendTransaction(payload.tx);
      await txResp.wait();
      alert(`⚖️ Dispute raised on ${hub}: ${txResp.hash}`);
    });
  };

  const allowlist = async (role: number) => {
    const hub = ensureHub();
    if (!addr) throw new Error("Connect wallet first");
    await withSigner(async (signer) => {
      const payload = await api<{ tx: any }>(`/mesh/${hub}/tx/allowlist`, {
        method: "POST",
        body: JSON.stringify({ role, addr })
      });
      const txResp = await signer.sendTransaction(payload.tx);
      await txResp.wait();
      alert("✅ Allowlisted address (development use only)");
    });
  };

  const instantiate = async () => {
    if (!selectedPlaybook) throw new Error("Choose a mission playbook");
    await withSigner(async (signer) => {
      const payload = await api<{ txs: any[] }>(`/mesh/plan/instantiate`, {
        method: "POST",
        body: JSON.stringify({ playbookId: selectedPlaybook })
      });
      for (const tx of payload.txs) {
        const resp = await signer.sendTransaction(tx);
        await resp.wait();
      }
      alert(`🚀 Mission instantiated across ${payload.txs.length} jobs`);
    });
  };

  const onAction = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err: any) {
      console.error(err);
      alert(err.message || String(err));
    }
  };

  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 24,
        maxWidth: 1240,
        margin: "0 auto"
      }}
    >
      <h1>🕸️ Sovereign Mesh — Beyond Civic Exocortex</h1>
      <p>
        Mission control for civilization-scale intelligence. Compose foresight, research, optimization and knowledge hubs into
        unstoppable campaigns — all governed directly by your wallet.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => onAction(connect)}>
          {addr ? `Connected: ${short(addr)}` : "Connect Wallet"}
        </button>
        <select value={selectedHub} onChange={(e) => setSelectedHub(e.target.value)}>
          <option value="">— Choose Hub —</option>
          {hubList.map((h) => (
            <option key={h} value={h}>
              {hubMap[h]?.label || h}
            </option>
          ))}
        </select>
        <input
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          style={{ width: 220 }}
          placeholder="Reward (wei)"
        />
        <input
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          style={{ width: 320 }}
          placeholder="Job URI"
        />
        <button onClick={() => onAction(createJob)}>Create Job</button>
        <button onClick={() => onAction(() => allowlist(1))}>Dev: Allowlist Validator</button>
      </div>

      <section>
        <h3>Live Jobs on Hub: {selectedHub || "—"}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "ID",
                  "Proposer",
                  "Reward",
                  "URI",
                  "Status",
                  "Validators"
                ].map((label) => (
                  <th key={label} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #ddd" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 8px" }}>{job.id}</td>
                  <td style={{ padding: "6px 8px" }}>{short(job.employer)}</td>
                  <td style={{ padding: "6px 8px" }}>{job.reward}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <a href={job.uri} target="_blank" rel="noreferrer">
                      {job.uri}
                    </a>
                  </td>
                  <td style={{ padding: "6px 8px" }}>{job.status}</td>
                  <td style={{ padding: "6px 8px" }}>{job.validators?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h3>Participate on {selectedHub || "—"}</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="jobId"
            style={{ width: 120 }}
          />
          <button onClick={() => onAction(() => stake(1, "1000000000000000000"))}>Stake as Validator (1)</button>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> approve
          </label>
          <button onClick={() => onAction(commit)}>Commit</button>
          <button onClick={() => onAction(reveal)}>Reveal</button>
          <button onClick={() => onAction(finalize)}>Finalize</button>
          <button onClick={() => onAction(dispute)}>Raise Dispute</button>
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h3>Mission Playbooks (cross-hub)</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select value={selectedPlaybook} onChange={(e) => setSelectedPlaybook(e.target.value)}>
            <option value="">— Choose Mission —</option>
            {playbooks.map((pb) => (
              <option key={pb.id} value={pb.id}>
                {pb.name}
              </option>
            ))}
          </select>
          <button onClick={() => onAction(instantiate)}>Instantiate Mission</button>
        </div>
      </section>

      <details style={{ marginTop: 24 }}>
        <summary>
          <strong>Owner Panels</strong> — direct links to every documented setter
        </summary>
        <ul>
          {hubList.map((hubKey) => {
            const hub = hubMap[hubKey];
            if (!hub) return null;
            const etherscan = (cfg?.etherscanBase || "https://etherscan.io") + "/address";
            const entries = [
              { label: "ValidationModule", address: hub.addresses.ValidationModule },
              { label: "JobRegistry", address: hub.addresses.JobRegistry },
              { label: "StakeManager", address: hub.addresses.StakeManager },
              { label: "IdentityRegistry", address: hub.addresses.IdentityRegistry },
              { label: "CertificateNFT", address: hub.addresses.CertificateNFT },
              { label: "DisputeModule", address: hub.addresses.DisputeModule },
              { label: "FeePool", address: hub.addresses.FeePool }
            ].filter((entry) => entry.address && entry.address !== "0x0000000000000000000000000000000000000000");
            return (
              <li key={hubKey} style={{ marginBottom: 12 }}>
                <strong>{hub.label}</strong>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.label}>
                      <a href={`${etherscan}/${entry.address}#writeContract`} target="_blank" rel="noreferrer">
                        {entry.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </details>

      {actors.length > 0 ? (
        <footer style={{ marginTop: 32, fontSize: 14, color: "#4a4a4a" }}>
          Sponsor identities available for mission storytelling: {actors.map((a) => `${a.flag} ${a.name}`).join(" · ")}
        </footer>
      ) : null}
    </div>
  );
}
