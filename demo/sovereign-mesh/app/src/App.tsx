import React, { useEffect, useState } from "react";
import { getSigner } from "./lib/ethers";
import { makeClient, qJobs } from "./lib/subgraph";
import { computeCommit } from "./lib/commit";
import { short } from "./lib/format";

interface Config {
  network: string;
  etherscanBase: string;
  defaultSubgraphUrl: string;
  orchestratorBase: string;
  hubs: string[];
}

type HubAddresses = Record<string, string>;

interface HubInfo {
  label: string;
  rpcUrl: string;
  subgraphUrl?: string;
  addresses: HubAddresses;
}

const fetchJson = async (path: string, init?: RequestInit) => {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
};

export default function App() {
  const [cfg, setCfg] = useState<Config>();
  const [apiBase, setApiBase] = useState<string>("");
  const [hubMap, setHubMap] = useState<Record<string, HubInfo>>({});
  const [hubKeys, setHubKeys] = useState<string[]>([]);
  const [address, setAddress] = useState<string>();
  const [actors, setActors] = useState<any[]>([]);
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [selectedHub, setSelectedHub] = useState<string>("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [rewardWei, setRewardWei] = useState("1000000000000000000");
  const [uri, setUri] = useState("ipfs://mesh/spec");
  const [jobId, setJobId] = useState("0");
  const [approve, setApprove] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");

  useEffect(() => {
    fetchJson("/mesh/config")
      .then((config) => {
        setCfg(config);
        setApiBase(config.orchestratorBase ?? "");
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!cfg) return;
    const base = cfg.orchestratorBase ?? "";
    fetchJson(`${base}/mesh/hubs`).then((data) => {
      setHubMap(data.hubs ?? {});
      setHubKeys(Object.keys(data.hubs ?? {}));
    });
    fetchJson(`${base}/mesh/actors`).then(setActors).catch(console.error);
    fetchJson(`${base}/mesh/playbooks`).then(setPlaybooks).catch(console.error);
  }, [cfg]);

  useEffect(() => {
    if (!cfg || !selectedHub) {
      setJobs([]);
      return;
    }
    const hub = hubMap[selectedHub];
    if (!hub) {
      setJobs([]);
      return;
    }
    const subgraph = hub.subgraphUrl || cfg.defaultSubgraphUrl;
    makeClient(subgraph)
      .request(qJobs)
      .then((data) => setJobs(data.jobs ?? []))
      .catch((err) => {
        console.error(err);
        setJobs([]);
      });
  }, [cfg, hubMap, selectedHub]);

  const connect = async () => {
    const signer = await getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
  };

  const requireHub = () => {
    if (!selectedHub) {
      alert("Choose a hub first");
      throw new Error("Hub not selected");
    }
    return selectedHub;
  };

  const sendTx = async (url: string, body: Record<string, unknown>) => {
    const hub = requireHub();
    const payload = await fetchJson(`${apiBase}${url.replace(":hub", hub)}`, {
      method: "POST",
      body: JSON.stringify(body)
    });
    const signer = await getSigner();
    const tx = await signer.sendTransaction(payload.tx ?? payload);
    await tx.wait();
    return tx.hash;
  };

  const createJob = async () => {
    const hash = await sendTx(`/mesh/${selectedHub}/tx/create`, {
      rewardWei,
      uri
    });
    alert(`✅ Submitted on ${selectedHub}: ${hash}`);
  };

  const stake = async (role: number, amountWei: string) => {
    const hash = await sendTx(`/mesh/${selectedHub}/tx/stake`, {
      role,
      amountWei
    });
    alert(`✅ Staked on ${selectedHub}: ${hash}`);
  };

  const commit = async () => {
    if (!address) {
      await connect();
    }
    const { commitHash, salt } = computeCommit(approve);
    const hub = requireHub();
    localStorage.setItem(`salt_${hub}_${jobId}_${address}`, salt);
    const hash = await sendTx(`/mesh/${selectedHub}/tx/commit`, {
      jobId: Number(jobId),
      commitHash,
      subdomain: "validator",
      proof: []
    });
    alert(`✅ Committed on ${selectedHub}: ${hash}`);
  };

  const reveal = async () => {
    const hub = requireHub();
    const salt = localStorage.getItem(`salt_${hub}_${jobId}_${address}`);
    if (!salt) {
      alert("No commit found for this job. Commit first.");
      return;
    }
    const hash = await sendTx(`/mesh/${selectedHub}/tx/reveal`, {
      jobId: Number(jobId),
      approve,
      salt
    });
    alert(`✅ Revealed on ${selectedHub}: ${hash}`);
  };

  const finalize = async () => {
    const hash = await sendTx(`/mesh/${selectedHub}/tx/finalize`, {
      jobId: Number(jobId)
    });
    alert(`✅ Finalized on ${selectedHub}: ${hash}`);
  };

  const instantiatePlaybook = async () => {
    if (!selectedPlaybook) {
      alert("Choose a mission playbook");
      return;
    }
    const payload = await fetchJson(`${apiBase}/mesh/plan/instantiate`, {
      method: "POST",
      body: JSON.stringify({ playbookId: selectedPlaybook })
    });
    const signer = await getSigner();
    for (const tx of payload.txs ?? []) {
      const resp = await signer.sendTransaction(tx);
      await resp.wait();
    }
    alert(`🚀 Mission instantiated across ${(payload.txs ?? []).length} jobs!`);
  };

  const allowlist = async (role: number) => {
    const hash = await sendTx(`/mesh/${selectedHub}/tx/allowlist`, {
      role,
      addr: address
    });
    alert(`✅ Allowlisted on ${selectedHub}: ${hash}`);
  };

  const renderOwnerPanel = (hubKey: string) => {
    const hub = hubMap[hubKey];
    if (!hub) return null;
    const base = `${cfg?.etherscanBase ?? "https://etherscan.io"}/address`;
    const contracts = [
      "ValidationModule",
      "JobRegistry",
      "StakeManager",
      "IdentityRegistry",
      "FeePool"
    ];
    return (
      <li key={hubKey}>
        <strong>{hub.label}</strong>
        <ul>
          {contracts.map((c) => {
            const addr = hub.addresses[c];
            if (!addr || addr === "0x0000000000000000000000000000000000000000") {
              return null;
            }
            return (
              <li key={c}>
                <a href={`${base}/${addr}#writeContract`} target="_blank" rel="noreferrer">
                  {c}
                </a>
              </li>
            );
          })}
        </ul>
      </li>
    );
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui", padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1>🕸️ Sovereign Mesh — Beyond Civic Exocortex</h1>
      <p>
        Multi-hub orchestration for civilization-scale missions. Choose a hub, post jobs, or instantiate
        a mission playbook spanning foresight, research, optimisation, and knowledge hubs.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={connect}>{address ? `Connected: ${short(address)}` : "Connect Wallet"}</button>
        <select onChange={(e) => setSelectedHub(e.target.value)} defaultValue="">
          <option value="">— Choose Hub —</option>
          {hubKeys.map((key) => (
            <option key={key} value={key}>
              {hubMap[key]?.label ?? key}
            </option>
          ))}
        </select>
        <input value={rewardWei} onChange={(e) => setRewardWei(e.target.value)} style={{ width: 260 }} />
        <input value={uri} onChange={(e) => setUri(e.target.value)} style={{ width: 360 }} />
        <button onClick={createJob}>Create Job</button>
        <button onClick={() => allowlist(1)}>Dev: Allowlist Validator</button>
      </div>

      <h3 style={{ marginTop: 20 }}>Live Jobs on Hub: {selectedHub || "—"}</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">ID</th>
            <th align="left">Proposer</th>
            <th align="left">Reward</th>
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

      <h3 style={{ marginTop: 20 }}>Participate on {selectedHub || "—"}</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="jobId" />
        <button onClick={() => stake(1, "1000000000000000000")}>Stake as Validator (1)</button>
        <label>
          <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> approve
        </label>
        <button onClick={commit}>Commit</button>
        <button onClick={reveal}>Reveal</button>
        <button onClick={finalize}>Finalize</button>
      </div>

      <h3 style={{ marginTop: 20 }}>Mission Playbooks (cross-hub)</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select onChange={(e) => setSelectedPlaybook(e.target.value)} defaultValue="">
          <option value="">— Choose Mission —</option>
          {playbooks.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={instantiatePlaybook}>Instantiate Mission</button>
      </div>

      <details style={{ marginTop: 24 }}>
        <summary>
          <strong>Owner Panels</strong> (links to Etherscan write interfaces)
        </summary>
        <ul>
          {hubKeys.map((key) => renderOwnerPanel(key))}
        </ul>
      </details>
    </div>
  );
}
