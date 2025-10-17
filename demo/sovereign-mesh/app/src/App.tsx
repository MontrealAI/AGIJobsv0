import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getSigner } from "./lib/ethers";
import { createClient, JOBS_QUERY } from "./lib/subgraph";
import { computeCommit } from "./lib/commit";
import { shortAddress } from "./lib/format";

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

type JobsResponse = {
  jobs: Array<{
    id: string;
    employer: string;
    reward: string;
    uri: string;
    status: string;
    validators?: Array<{ account: string }>;
  }>;
};

const jsonFetch = async <T,>(url: string, init?: RequestInit) => {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return (await res.json()) as T;
};

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const rewardFormat = (value: string) => {
  try {
    const formatted = Number(value) / 1e18;
    return `${numberFormat.format(formatted)} AGIA`;
  } catch (err) {
    return value;
  }
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section style={{ marginTop: 24 }}>
    <h2 style={{ marginBottom: 12 }}>{title}</h2>
    {children}
  </section>
);

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const controlStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #cbd5f5",
  fontFamily: "inherit",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  background: "#111827",
  color: "#f9fafb",
  borderRadius: 8,
  padding: "10px 16px",
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: 220,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 13,
  color: "#6b7280",
  borderBottom: "1px solid #e5e7eb",
  padding: "8px 4px",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 4px",
  fontSize: 14,
  borderBottom: "1px solid #f1f5f9",
};

const paragraphStyle: React.CSSProperties = {
  lineHeight: 1.6,
  color: "#1f2937",
  maxWidth: 900,
};

const cardStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #eef2ff, #f0fdfa)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(79,70,229,0.12)",
  marginBottom: 24,
  boxShadow: "0 20px 45px -35px rgba(79,70,229,0.6)",
};

const App: React.FC = () => {
  const [config, setConfig] = useState<MeshConfig>();
  const [hubMap, setHubMap] = useState<Record<string, HubConfig>>({});
  const [hubList, setHubList] = useState<string[]>([]);
  const [account, setAccount] = useState<string>();
  const [actors, setActors] = useState<Array<{ id: string; name: string; flag: string }>>([]);
  const [playbooks, setPlaybooks] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<JobsResponse["jobs"]>([]);
  const [rewardWei, setRewardWei] = useState<string>("1000000000000000000");
  const [jobUri, setJobUri] = useState<string>("ipfs://mesh/spec");
  const [jobId, setJobId] = useState<string>("");
  const [approve, setApprove] = useState<boolean>(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      const cfg = await jsonFetch<MeshConfig>("/mesh/config");
      setConfig(cfg);
      const hubResponse = await jsonFetch<{ hubs: Record<string, HubConfig> }>("/mesh/hubs");
      setHubMap(hubResponse.hubs);
      setHubList(cfg.hubs.filter((id) => hubResponse.hubs[id]));
      const actorResponse = await jsonFetch<Array<{ id: string; name: string; flag: string }>>(
        "/mesh/actors",
      );
      setActors(actorResponse);
      const pbResponse = await jsonFetch<Array<{ id: string; name: string }>>(
        "/mesh/playbooks",
      );
      setPlaybooks(pbResponse);
    })().catch((err) => {
      console.error(err);
      setStatus(`Failed to load mesh configuration: ${err.message}`);
    });
  }, []);

  const activeHub = useMemo(() => (selectedHub ? hubMap[selectedHub] : undefined), [
    selectedHub,
    hubMap,
  ]);

  useEffect(() => {
    if (!config || !selectedHub) return;
    const hub = hubMap[selectedHub];
    if (!hub) return;
    const subgraphUrl = hub.subgraphUrl ?? config.defaultSubgraphUrl;
    (async () => {
      try {
        const client = createClient(subgraphUrl);
        const data = await client.request<JobsResponse>(JOBS_QUERY);
        setJobs(data.jobs ?? []);
      } catch (err) {
        console.error(err);
        setJobs([]);
      }
    })();
  }, [config, selectedHub, hubMap]);

  const connectWallet = async () => {
    try {
      const signer = await getSigner();
      const address = await signer.getAddress();
      setAccount(address);
      setStatus(`Connected ${address}`);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const submitTx = async (endpoint: string, payload: Record<string, unknown>) => {
    if (!selectedHub) {
      throw new Error("Select a hub first");
    }
    const base = config?.orchestratorBase ?? "";
    const url = `${base}/mesh/${selectedHub}${endpoint}`;
    return jsonFetch<{ tx: { to: string; data: string; value: string | number } }>(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  };

  const handleCreateJob = async () => {
    try {
      setLoading(true);
      const response = await submitTx("/tx/create", {
        rewardWei,
        uri: jobUri,
      });
      const signer = await getSigner();
      const tx = await signer.sendTransaction(response.tx);
      await tx.wait();
      setStatus(`Job created on ${selectedHub}: ${tx.hash}`);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStake = async () => {
    try {
      setLoading(true);
      const response = await submitTx("/tx/stake", {
        role: 1,
        amountWei: "1000000000000000000",
      });
      const signer = await getSigner();
      const tx = await signer.sendTransaction(response.tx);
      await tx.wait();
      setStatus(`Staked as validator on ${selectedHub}`);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    try {
      if (!jobId) throw new Error("Enter a job id");
      if (!account) throw new Error("Connect wallet first");
      setLoading(true);
      const { commitHash, salt } = computeCommit(approve);
      localStorage.setItem(`mesh_salt_${selectedHub}_${jobId}_${account}`, salt);
      const response = await submitTx("/tx/commit", {
        jobId: Number(jobId),
        commitHash,
        subdomain: "validator",
        proof: [],
      });
      const signer = await getSigner();
      const tx = await signer.sendTransaction(response.tx);
      await tx.wait();
      setStatus(`Commit accepted on ${selectedHub}`);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReveal = async () => {
    try {
      if (!jobId) throw new Error("Enter a job id");
      if (!account) throw new Error("Connect wallet first");
      setLoading(true);
      const salt = localStorage.getItem(`mesh_salt_${selectedHub}_${jobId}_${account}`);
      if (!salt) throw new Error("Commit not found for this job");
      const response = await submitTx("/tx/reveal", {
        jobId: Number(jobId),
        approve,
        salt,
      });
      const signer = await getSigner();
      const tx = await signer.sendTransaction(response.tx);
      await tx.wait();
      setStatus(`Reveal recorded on ${selectedHub}`);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    try {
      if (!jobId) throw new Error("Enter a job id");
      setLoading(true);
      const response = await submitTx("/tx/finalize", {
        jobId: Number(jobId),
      });
      const signer = await getSigner();
      const tx = await signer.sendTransaction(response.tx);
      await tx.wait();
      setStatus(`Finalized job ${jobId}`);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleMission = async () => {
    if (!selectedPlaybook) {
      setStatus("Select a mission first");
      return;
    }
    try {
      setLoading(true);
      const base = config?.orchestratorBase ?? "";
      const response = await jsonFetch<{ txs: Array<{ to: string; data: string; value: string | number }> }>(
        `${base}/mesh/plan/instantiate`,
        {
          method: "POST",
          body: JSON.stringify({ playbookId: selectedPlaybook }),
        },
      );
      const signer = await getSigner();
      for (const txData of response.txs) {
        const tx = await signer.sendTransaction(txData);
        await tx.wait();
      }
      setStatus(`Mission ${selectedPlaybook} instantiated across ${response.txs.length} jobs`);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAllowlist = async () => {
    try {
      setLoading(true);
      const response = await submitTx("/tx/allowlist", {
        role: 1,
        addr: account,
      });
      const signer = await getSigner();
      const tx = await signer.sendTransaction(response.tx);
      await tx.wait();
      setStatus("Validator allowlisted (dev helper)");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const ownerLinks = useMemo(() => {
    if (!config) return [];
    return hubList.map((id) => {
      const hub = hubMap[id];
      if (!hub) return null;
      const base = `${config.etherscanBase}/address`;
      const addresses = hub.addresses;
      const links: Array<{ label: string; url: string }> = [
        { label: "ValidationModule", url: `${base}/${addresses.ValidationModule}#writeContract` },
        { label: "JobRegistry", url: `${base}/${addresses.JobRegistry}#writeContract` },
        { label: "StakeManager", url: `${base}/${addresses.StakeManager}#writeContract` },
        { label: "IdentityRegistry", url: `${base}/${addresses.IdentityRegistry}#writeContract` },
      ];
      if (addresses.FeePool && addresses.FeePool !== ethers.ZeroAddress) {
        links.push({ label: "FeePool", url: `${base}/${addresses.FeePool}#writeContract` });
      }
      if (addresses.SystemPause && addresses.SystemPause !== ethers.ZeroAddress) {
        links.push({ label: "SystemPause", url: `${base}/${addresses.SystemPause}#writeContract` });
      }
      return { id, label: hub.label, links };
    }).filter(Boolean) as Array<{ id: string; label: string; links: Array<{ label: string; url: string }> }>;
  }, [config, hubList, hubMap]);

  return (
    <div
      style={{
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        padding: 32,
        maxWidth: 1280,
        margin: "0 auto 120px",
      }}
    >
      <header style={cardStyle}>
        <h1 style={{ fontSize: 36, marginBottom: 12 }}>
          🕸️ Sovereign Mesh – Beyond Civic Exocortex
        </h1>
        <p style={paragraphStyle}>
          Launch foresight, research, optimization, and knowledge missions across sovereign hubs with a
          single intent. Wallets stay in control, owners retain full parameter authority, and validators
          receive handrails for staking, commit/reveal, and dispute escalation.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button style={buttonStyle} onClick={connectWallet} disabled={loading}>
            {account ? `Connected ${shortAddress(account)}` : "Connect Wallet"}
          </button>
          <select
            style={selectStyle}
            value={selectedHub}
            onChange={(e) => setSelectedHub(e.target.value)}
          >
            <option value="">— Choose Hub —</option>
            {hubList.map((hub) => (
              <option key={hub} value={hub}>
                {hubMap[hub]?.label ?? hub}
              </option>
            ))}
          </select>
          <label style={labelStyle}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Reward (wei)</span>
            <input
              style={{ ...inputStyle, minWidth: 220 }}
              value={rewardWei}
              onChange={(e) => setRewardWei(e.target.value)}
            />
          </label>
          <label style={labelStyle}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Spec URI</span>
            <input
              style={{ ...inputStyle, minWidth: 320 }}
              value={jobUri}
              onChange={(e) => setJobUri(e.target.value)}
            />
          </label>
          <button style={buttonStyle} onClick={handleCreateJob} disabled={loading || !selectedHub}>
            Create Job
          </button>
          <button
            style={{ ...buttonStyle, background: "#3730a3" }}
            onClick={handleAllowlist}
            disabled={loading || !selectedHub || !account}
          >
            Dev: Allowlist Validator
          </button>
        </div>
        {status && (
          <p style={{ marginTop: 12, fontSize: 13, color: "#334155" }}>{status}</p>
        )}
      </header>

      <Section title={`Live jobs on ${activeHub?.label ?? "—"}`}>
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
              <tr key={`${selectedHub}-${job.id}`}>
                <td style={tdStyle}>{job.id}</td>
                <td style={tdStyle}>{shortAddress(job.employer)}</td>
                <td style={tdStyle}>{rewardFormat(job.reward)}</td>
                <td style={tdStyle}>
                  <a href={job.uri} target="_blank" rel="noreferrer">
                    {job.uri}
                  </a>
                </td>
                <td style={tdStyle}>{job.status}</td>
                <td style={tdStyle}>{job.validators?.length ?? 0}</td>
              </tr>
            ))}
            {!jobs.length && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#6b7280" }}>
                  No jobs indexed yet. Create one or instantiate a mission to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      <Section title="Validator participation">
        <div style={controlStyle}>
          <label style={labelStyle}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Job ID</span>
            <input
              style={{ ...inputStyle, width: 160 }}
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="123"
            />
          </label>
          <button style={buttonStyle} onClick={handleStake} disabled={loading || !selectedHub}>
            Stake 1 AGIA
          </button>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={approve}
              onChange={(e) => setApprove(e.target.checked)}
            />
            approve
          </label>
          <button style={buttonStyle} onClick={handleCommit} disabled={loading || !selectedHub}>
            Commit
          </button>
          <button style={buttonStyle} onClick={handleReveal} disabled={loading || !selectedHub}>
            Reveal
          </button>
          <button style={buttonStyle} onClick={handleFinalize} disabled={loading || !selectedHub}>
            Finalize
          </button>
        </div>
      </Section>

      <Section title="Mission playbooks">
        <div style={controlStyle}>
          <select
            style={selectStyle}
            value={selectedPlaybook}
            onChange={(e) => setSelectedPlaybook(e.target.value)}
          >
            <option value="">— Choose Mission —</option>
            {playbooks.map((playbook) => (
              <option key={playbook.id} value={playbook.id}>
                {playbook.name}
              </option>
            ))}
          </select>
          <button style={buttonStyle} onClick={handleMission} disabled={loading || !selectedPlaybook}>
            Instantiate Mission
          </button>
        </div>
        {actors.length > 0 && (
          <p style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>
            Featured mission sponsors: {actors.map((actor) => `${actor.flag} ${actor.name}`).join(" · ")}
          </p>
        )}
      </Section>

      <Section title="Owner panels">
        <details style={{ background: "#f8fafc", padding: 16, borderRadius: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Open governance surfaces</summary>
          <div style={{ marginTop: 12, display: "grid", gap: 16 }}>
            {ownerLinks.map((hub) => (
              <div key={hub.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
                <strong>{hub.label}</strong>
                <ul style={{ listStyle: "disc", marginLeft: 20, marginTop: 8 }}>
                  {hub.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.url} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </Section>
    </div>
  );
};

export default App;
