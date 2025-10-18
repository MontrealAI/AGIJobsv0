import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getSigner } from "./lib/ethers";
import { makeClient, qJobs } from "./lib/subgraph";
import { computeCommit } from "./lib/commit";
import { formatAgia, formatTimestamp, short } from "./lib/format";

type Config = {
  network: string;
  etherscanBase: string;
  defaultSubgraphUrl?: string;
  orchestratorBase?: string;
  hubs: string[];
  explorers?: Record<string, string>;
};

type HubAddresses = Record<string, string>;

type HubInfo = {
  label: string;
  chainId: number;
  networkName: string;
  rpcUrl: string;
  owner: string;
  governance: string;
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
  description?: string;
  steps: PlaybookStep[];
};

type OwnerAction = {
  method: string;
  description: string;
  args: string[];
  explorerWriteUrl: string;
  contractAddress: string;
};

type OwnerModule = {
  module: string;
  address: string;
  actions: OwnerAction[];
};

type OwnerHub = {
  hubId: string;
  label: string;
  chainId: number;
  networkName: string;
  owner: string;
  governance: string;
  explorer: string;
  modules: OwnerModule[];
};

type PlanTx = {
  order: number;
  hub: string;
  label: string;
  chainId: number;
  networkName: string;
  rewardWei: string;
  uri: string;
  tx: {
    chainId: number;
    networkName: string;
    rpcUrl: string;
    to: string;
    data: string;
    value: string | number;
  };
};

type AutotuneAction = {
  action: string;
  hub?: string;
  hubs?: string | string[];
  commitWindowSeconds?: number;
  revealWindowSeconds?: number;
  minStakeWei?: string;
  module?: string;
  reason: string;
};

type AutotunePlan = {
  summary: {
    averageParticipation: number;
    commitWindowSeconds: number;
    revealWindowSeconds: number;
    minStakeWei: string;
    actionsRecommended: number;
    avgRevealLatencySeconds: number;
    avgCommitLatencySeconds: number;
    notes: string[];
  };
  actions: AutotuneAction[];
  analytics: {
    totalMissions: number;
    totalSlashingEvents: number;
    criticalAlerts: number;
    participationLower: number;
    participationUpper: number;
  };
};

const envOrchestratorBase = (
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
).VITE_ORCHESTRATOR_BASE;
const runtimeOverride =
  typeof window !== "undefined"
    ? (window as any).__SOVEREIGN_CONSTELLATION_ORCHESTRATOR_BASE__
    : undefined;
const defaultOrchestratorBase = (runtimeOverride || envOrchestratorBase || "http://localhost:8090").replace(/\/$/, "");

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
  const [rewardWei, setRewardWei] = useState("4000000000000000000");
  const [uri, setUri] = useState("ipfs://sovereign-constellation/spec");
  const [jobId, setJobId] = useState<string>("");
  const [approve, setApprove] = useState(true);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [address, setAddress] = useState<string>();
  const [planPreview, setPlanPreview] = useState<{ playbook?: Playbook; txs: PlanTx[] }>({ txs: [] });
  const [ownerAtlas, setOwnerAtlas] = useState<OwnerHub[]>([]);
  const [autotunePlan, setAutotunePlan] = useState<AutotunePlan>();
  const [commitWindowSeconds, setCommitWindowSeconds] = useState("3600");
  const [revealWindowSeconds, setRevealWindowSeconds] = useState("1800");
  const [minStakeWeiInput, setMinStakeWeiInput] = useState("2000000000000000000");
  const [disputeModuleAddress, setDisputeModuleAddress] = useState("");
  const [ownershipModule, setOwnershipModule] = useState<string>("");
  const [newOwnerAddress, setNewOwnerAddress] = useState("");

  const orchestratorBase = useMemo(
    () => (cfg?.orchestratorBase || defaultOrchestratorBase).replace(/\/$/, ""),
    [cfg]
  );

  const ownerModuleDetails = useMemo(
    () => {
      if (!selectedHub) {
        return [] as { module: string; address: string }[];
      }
      const hub = ownerAtlas.find((item) => item.hubId === selectedHub);
      if (!hub || !Array.isArray(hub.modules)) {
        return [] as { module: string; address: string }[];
      }
      return hub.modules.map((module) => ({ module: module.module, address: module.address }));
    },
    [ownerAtlas, selectedHub]
  );

  useEffect(() => {
    fetchJson("/constellation/config")
      .then((config) => setCfg(config))
      .catch((error) => {
        console.error(error);
        setCfgError("Unable to load Sovereign Constellation config. Check orchestrator availability.");
      });
  }, []);

  useEffect(() => {
    fetchJson("/constellation/hubs", undefined, orchestratorBase)
      .then((data) => {
        if (data?.hubs && typeof data.hubs === "object") {
          setHubMap(data.hubs as Record<string, HubInfo>);
          setHubKeys(Object.keys(data.hubs));
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/constellation/actors", undefined, orchestratorBase)
      .then((items) => {
        if (Array.isArray(items)) {
          setActors(items as Actor[]);
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/constellation/playbooks", undefined, orchestratorBase)
      .then((items) => {
        if (Array.isArray(items)) {
          setPlaybooks(items as Playbook[]);
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/constellation/owner/atlas", undefined, orchestratorBase)
      .then((data) => {
        if (data?.atlas && Array.isArray(data.atlas)) {
          setOwnerAtlas(data.atlas as OwnerHub[]);
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/constellation/thermostat/plan", undefined, orchestratorBase)
      .then((plan) => {
        if (plan && typeof plan === "object") {
          setAutotunePlan(plan as AutotunePlan);
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

  useEffect(() => {
    if (!autotunePlan) {
      return;
    }
    if (autotunePlan.summary?.commitWindowSeconds) {
      setCommitWindowSeconds(String(autotunePlan.summary.commitWindowSeconds));
    }
    if (autotunePlan.summary?.revealWindowSeconds) {
      setRevealWindowSeconds(String(autotunePlan.summary.revealWindowSeconds));
    }
    if (autotunePlan.summary?.minStakeWei) {
      setMinStakeWeiInput(String(autotunePlan.summary.minStakeWei));
    }
    const dispute = autotunePlan.actions?.find((action) => action.action === "jobRegistry.setDisputeModule");
    if (dispute?.module) {
      setDisputeModuleAddress(dispute.module);
    }
  }, [autotunePlan]);

  useEffect(() => {
    if (!ownershipModule && ownerModuleDetails.length > 0) {
      setOwnershipModule(ownerModuleDetails[0].module);
    }
  }, [ownerModuleDetails, ownershipModule]);

  const connect = useCallback(async (): Promise<string> => {
    const signer = await getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
    return addr;
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
      const request = (payload as any).tx ?? payload;
      if (!request.chainId && selectedHubInfo) {
        request.chainId = selectedHubInfo.chainId;
      }
      const network = await signer.provider?.getNetwork();
      if (request.chainId && network && request.chainId !== Number(network.chainId)) {
        alert(
          `Switch your wallet to chain ${request.chainId} (${selectedHubInfo?.networkName ?? "unknown"}) before approving.`
        );
      }
      const tx = await signer.sendTransaction(request);
      await tx.wait();
      return tx.hash;
    },
    [orchestratorBase, selectedHubInfo]
  );

  const createJob = async () => {
    try {
      const hub = requireHub();
      const hash = await sendTx(`/constellation/${hub}/tx/create`, { rewardWei, uri });
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
      const hash = await sendTx(`/constellation/${hub}/tx/stake`, { role, amountWei });
      alert(`✅ Staked on ${hub}: ${hash}`);
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to stake: ${error?.message ?? "Unknown error"}`);
    }
  };

  const commit = async () => {
    try {
      let signerAddress = address;
      if (!signerAddress) {
        signerAddress = await connect();
      }
      const hub = requireHub();
      const jobNumeric = requireJobId();
      const { commitHash, salt } = computeCommit(approve);
      const key = `salt_${hub}_${jobNumeric}_${signerAddress}`;
      localStorage.setItem(key, salt);
      const hash = await sendTx(`/constellation/${hub}/tx/commit`, {
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
      const hash = await sendTx(`/constellation/${hub}/tx/reveal`, {
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
      const hash = await sendTx(`/constellation/${hub}/tx/finalize`, { jobId: jobNumeric });
      alert(`✅ Finalized on ${hub}: ${hash}`);
      refreshJobs();
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to finalize: ${error?.message ?? "Unknown error"}`);
    }
  };

  const updateCommitWindows = async () => {
    try {
      const hub = requireHub();
      const commitSeconds = Number(commitWindowSeconds);
      const revealSeconds = Number(revealWindowSeconds);
      if (!Number.isFinite(commitSeconds) || commitSeconds <= 0 || !Number.isFinite(revealSeconds) || revealSeconds <= 0) {
        alert("Enter positive commit and reveal window durations");
        return;
      }
      const hash = await sendTx(`/constellation/${hub}/tx/validation/commit-window`, {
        commitWindowSeconds: commitSeconds,
        revealWindowSeconds: revealSeconds
      });
      alert(`✅ Updated commit/reveal windows on ${hub}: ${hash}`);
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to update commit/reveal windows: ${error?.message ?? "Unknown error"}`);
    }
  };

  const updateMinStake = async () => {
    try {
      const hub = requireHub();
      if (!minStakeWeiInput || BigInt(minStakeWeiInput) <= 0n) {
        alert("Enter a positive min stake in wei");
        return;
      }
      const hash = await sendTx(`/constellation/${hub}/tx/stake/min`, { minStakeWei: minStakeWeiInput });
      alert(`✅ Updated minimum stake on ${hub}: ${hash}`);
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to update minimum stake: ${error?.message ?? "Unknown error"}`);
    }
  };

  const updateDisputeModule = async () => {
    try {
      const hub = requireHub();
      if (!disputeModuleAddress) {
        alert("Enter a dispute module address");
        return;
      }
      const hash = await sendTx(`/constellation/${hub}/tx/job/dispute-module`, { module: disputeModuleAddress });
      alert(`✅ Routed dispute module update on ${hub}: ${hash}`);
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to update dispute module: ${error?.message ?? "Unknown error"}`);
    }
  };

  const transferOwnership = async () => {
    try {
      const hub = requireHub();
      if (!ownershipModule) {
        alert("Select a module to transfer");
        return;
      }
      if (!newOwnerAddress) {
        alert("Enter the new owner address");
        return;
      }
      const hash = await sendTx(`/constellation/${hub}/tx/transfer-ownership`, {
        module: ownershipModule,
        newOwner: newOwnerAddress
      });
      alert(`✅ Ownership transfer initiated on ${hub}: ${hash}`);
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to transfer ownership: ${error?.message ?? "Unknown error"}`);
    }
  };

  const applyPlanAction = async (action: AutotuneAction) => {
    try {
      if (action.action === "validation.setCommitRevealWindows") {
        if (action.commitWindowSeconds) {
          setCommitWindowSeconds(String(action.commitWindowSeconds));
        }
        if (action.revealWindowSeconds) {
          setRevealWindowSeconds(String(action.revealWindowSeconds));
        }
        await updateCommitWindows();
        return;
      }
      if (action.action === "stakeManager.setMinStake" && action.minStakeWei) {
        setMinStakeWeiInput(action.minStakeWei);
        await updateMinStake();
        return;
      }
      if (action.action === "jobRegistry.setDisputeModule" && action.module) {
        setDisputeModuleAddress(action.module);
        await updateDisputeModule();
        return;
      }
      if (action.action === "systemPause.pause") {
        if (action.hub && action.hub !== selectedHub) {
          alert(`Select hub ${action.hub} to dispatch the pause command.`);
          return;
        }
        const hub = action.hub ?? requireHub();
        const hash = await sendTx(`/constellation/${hub}/tx/pause`, { action: "pause" });
        alert(`✅ Pause signal dispatched to ${hub}: ${hash}`);
        return;
      }
      alert("Action type not directly executable. Use owner console to execute manually.");
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to apply plan action: ${error?.message ?? "Unknown error"}`);
    }
  };

  const previewPlaybook = useCallback(
    async (playbookId: string) => {
      if (!playbookId) {
        setPlanPreview({ txs: [] });
        return;
      }
      try {
        const payload = await fetchJson(
          "/constellation/plan/instantiate",
          {
            method: "POST",
            body: JSON.stringify({ playbookId })
          },
          orchestratorBase
        );
        const txs = Array.isArray((payload as any).txs) ? ((payload as any).txs as PlanTx[]) : [];
        const pb = playbooks.find((p) => p.id === playbookId);
        setPlanPreview({ playbook: pb, txs });
      } catch (error) {
        console.error(error);
        setPlanPreview({ txs: [] });
      }
    },
    [orchestratorBase, playbooks]
  );

  useEffect(() => {
    if (selectedPlaybook) {
      previewPlaybook(selectedPlaybook);
    } else {
      setPlanPreview({ txs: [] });
    }
  }, [selectedPlaybook, previewPlaybook]);

  const instantiatePlaybook = async () => {
    if (!selectedPlaybook) {
      alert("Choose a mission playbook");
      return;
    }
    try {
      const signer = await getSigner();
      const payload = await fetchJson(
        "/constellation/plan/instantiate",
        {
          method: "POST",
          body: JSON.stringify({ playbookId: selectedPlaybook })
        },
        orchestratorBase
      );
      const txs = ((payload as any).txs ?? []) as PlanTx[];
      for (const item of txs) {
        const request = item.tx;
        const network = await signer.provider?.getNetwork();
        if (request.chainId && network && request.chainId !== Number(network.chainId)) {
          alert(`Switch to chain ${request.chainId} (${item.networkName}) to sign step ${item.order}.`);
        }
        const resp = await signer.sendTransaction(request);
        await resp.wait();
      }
      alert(`🚀 Mission instantiated across ${txs.length} jobs! Review hub dashboards for live updates.`);
      refreshJobs();
    } catch (error: any) {
      console.error(error);
      alert(`❌ Failed to instantiate mission: ${error?.message ?? "Unknown error"}`);
    }
  };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", padding: 24, background: "#f3f4ff", minHeight: "100vh" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 36, margin: 0 }}>🎖️ Sovereign Constellation 👁️✨</h1>
        <p style={{ maxWidth: 720 }}>
          One wallet, many worlds. Launch multi-network AGI missions that span research, industrial execution, and civic
          governance. Every transaction is prepared for you; you stay in command by reviewing and signing from your own wallet.
        </p>
        {cfgError ? <p style={{ color: "red" }}>{cfgError}</p> : null}
        <button onClick={connect} style={{ padding: "8px 16px", borderRadius: 12, border: "none", cursor: "pointer" }}>
          {address ? `Connected: ${short(address)}` : "Connect wallet"}
        </button>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 32
        }}
        data-testid="constellation-hero"
      >
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Hubs Online</h3>
          <p style={{ fontSize: 28, margin: 0 }}>{hubKeys.length}</p>
          <small>Each hub runs a full AGI Jobs v2 stack on its own network.</small>
        </div>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Networks</h3>
          <p style={{ fontSize: 28, margin: 0 }}>
            {Array.from(new Set(Object.values(hubMap).map((h) => h.networkName))).length}
          </p>
          <small>Transactions prompt chain-specific signatures automatically.</small>
        </div>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Actors</h3>
          <p style={{ fontSize: 28, margin: 0 }}>{actors.length}</p>
          <small>Mission personas shaping the constellation narrative.</small>
        </div>
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Playbooks</h3>
          <p style={{ fontSize: 28, margin: 0 }}>{playbooks.length}</p>
          <small>Curated multi-hub campaigns ready for lift-off.</small>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24, marginBottom: 32 }}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Mission control</h2>
          <p>
            Select a hub to inspect live jobs, post new work, and walk through the validator lifecycle. When you send a
            transaction the orchestrator tags it with the correct chain ID so your wallet knows where to broadcast.
          </p>
          <label>
            Choose hub:
            <select
              data-testid="hub-select"
              style={{ marginLeft: 12 }}
              value={selectedHub}
              onChange={(evt) => setSelectedHub(evt.target.value)}
            >
              <option value="">--</option>
              {hubKeys.map((key) => (
                <option key={key} value={key}>
                  {hubMap[key]?.label ?? key} ({hubMap[key]?.networkName ?? "Unknown"})
                </option>
              ))}
            </select>
          </label>
          {selectedHubInfo ? (
            <div style={{ marginTop: 16, fontSize: 14 }}>
              <strong>Network:</strong> {selectedHubInfo.networkName} (chain {selectedHubInfo.chainId}) · RPC {selectedHubInfo.rpcUrl}
              <br />
              <strong>Owner:</strong> {selectedHubInfo.owner} · <strong>Governance:</strong> {selectedHubInfo.governance}
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <label>
              Reward (wei)
              <input value={rewardWei} onChange={(evt) => setRewardWei(evt.target.value)} style={{ marginLeft: 8 }} />
            </label>
            <br />
            <label>
              Spec URI
              <input value={uri} onChange={(evt) => setUri(evt.target.value)} style={{ marginLeft: 8, width: "60%" }} />
            </label>
            <br />
            <button onClick={createJob} style={{ marginTop: 8 }}>
              Launch job on hub
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <label>
              Job ID
              <input value={jobId} onChange={(evt) => setJobId(evt.target.value)} style={{ marginLeft: 8, width: 120 }} />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={() => stake(0, rewardWei)}>Stake as agent</button>
              <button onClick={() => stake(1, rewardWei)}>Stake as validator</button>
              <button onClick={commit}>Commit vote</button>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={approve} onChange={(evt) => setApprove(evt.target.checked)} /> Approve
              </label>
              <button onClick={reveal}>Reveal vote</button>
              <button onClick={finalize}>Finalize job</button>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <strong>Jobs</strong>
            <button style={{ marginLeft: 12 }} onClick={refreshJobs}>
              Refresh
            </button>
            {jobsLoading ? <span style={{ marginLeft: 8 }}>Loading…</span> : null}
            <ul>
              {jobs.map((job) => (
                <li key={job.id}>
                  #{job.id} · reward {formatAgia(job.reward)} · deadline {formatTimestamp(job.deadline)} · employer {short(job.employer)}
                </li>
              ))}
              {jobs.length === 0 ? <li>No jobs found for this hub yet.</li> : null}
            </ul>
            {lastRefreshed ? <small>Last refreshed {lastRefreshed.toLocaleTimeString()}</small> : null}
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginBottom: 32 }}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Mission playbooks</h2>
          <p>Select a playbook to preview the cross-network plan, then launch to sign each prepared transaction.</p>
          <select
            data-testid="playbook-select"
            value={selectedPlaybook}
            onChange={(evt) => setSelectedPlaybook(evt.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 12, border: "1px solid #cbd5f5" }}
          >
            <option value="">Choose a mission</option>
            {playbooks.map((pb) => (
              <option key={pb.id} value={pb.id}>
                {pb.name}
              </option>
            ))}
          </select>
          <div data-testid="playbook-preview" style={{ marginTop: 16 }}>
            {planPreview.playbook ? (
              <>
                <h3 style={{ marginTop: 0 }}>{planPreview.playbook.name}</h3>
                <p>{planPreview.playbook.description}</p>
                <ol>
                  {planPreview.txs.map((step) => (
                    <li key={step.order}>
                      <strong>Step {step.order}</strong>: {step.label} · {step.networkName} · reward {formatAgia(step.rewardWei)}
                      <br />
                      URI: {step.uri}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p>Select a playbook to preview mission choreography.</p>
            )}
          </div>
          <button onClick={instantiatePlaybook} style={{ marginTop: 16 }}>
            Launch mission
          </button>
        </div>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Thermostat autopilot</h2>
          <p>
            Autotune digests telemetry across the constellation and proposes governance actions so the owner can adjust
            parameters in seconds. Select the relevant hub and apply the recommended actions below.
          </p>
          {autotunePlan ? (
            <div>
              <div style={{ fontSize: 14, marginBottom: 12 }}>
                <strong>Average validator participation:</strong> {(autotunePlan.summary.averageParticipation * 100).toFixed(2)}%
                <br />
                <strong>Recommended commit/reveal windows:</strong> {autotunePlan.summary.commitWindowSeconds}s / {autotunePlan.summary.revealWindowSeconds}s
                <br />
                <strong>Recommended min stake:</strong> {formatAgia(autotunePlan.summary.minStakeWei)}
              </div>
              {autotunePlan.summary.notes.length > 0 ? (
                <ul style={{ fontSize: 13 }}>
                  {autotunePlan.summary.notes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              ) : null}
              <h3 style={{ marginTop: 16 }}>Actions</h3>
              <ol style={{ fontSize: 14, paddingLeft: 20 }}>
                {autotunePlan.actions.map((action, idx) => (
                  <li key={`${action.action}-${idx}`} style={{ marginBottom: 8 }}>
                    <div>
                      {(() => {
                        const scope = action.hub
                          ? `→ ${action.hub}`
                          : action.hubs
                          ? `→ ${Array.isArray(action.hubs) ? action.hubs.join(", ") : action.hubs}`
                          : "";
                        return (
                          <>
                            <strong>{action.action}</strong> {scope} – {action.reason}
                          </>
                        );
                      })()}
                    </div>
                    <button onClick={() => applyPlanAction(action)} style={{ marginTop: 4 }}>
                      Apply to selected hub
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p>Loading telemetry-driven recommendations…</p>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Owner command atlas</h2>
          <p>
            Every module stays under owner control. These links open the explorer write panels so you can pause, retune, or
            rotate governance instantly.
          </p>
          <div style={{ maxHeight: 320, overflowY: "auto", paddingRight: 8 }}>
            {ownerAtlas.map((hub) => (
              <details key={hub.hubId} style={{ marginBottom: 8 }}>
                <summary>
                  {hub.label} · {hub.networkName} (chain {hub.chainId})
                </summary>
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  Owner {short(hub.owner)} · Governance {short(hub.governance)}
                </div>
                {hub.modules.map((module) => (
                  <div key={module.module} style={{ marginTop: 6 }}>
                    <strong>{module.module}</strong>
                    <ul>
                      {module.actions.map((action) => (
                        <li key={action.method}>
                          <a href={action.explorerWriteUrl} target="_blank" rel="noreferrer">
                            {action.method}
                          </a>
                          : {action.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </details>
            ))}
            {ownerAtlas.length === 0 ? <p>No modules detected yet.</p> : null}
          </div>
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Owner controls</h3>
            <p style={{ fontSize: 13 }}>
              Choose a hub above, then execute direct governance calls without leaving this console. Inputs are prefilled from
              the autopilot plan when available.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <label>
                Commit window (seconds)
                <input
                  value={commitWindowSeconds}
                  onChange={(evt) => setCommitWindowSeconds(evt.target.value)}
                  style={{ marginLeft: 8, width: 140 }}
                />
              </label>
              <label>
                Reveal window (seconds)
                <input
                  value={revealWindowSeconds}
                  onChange={(evt) => setRevealWindowSeconds(evt.target.value)}
                  style={{ marginLeft: 8, width: 140 }}
                />
              </label>
              <button onClick={updateCommitWindows}>Update commit/reveal windows</button>
              <label>
                Minimum stake (wei)
                <input
                  value={minStakeWeiInput}
                  onChange={(evt) => setMinStakeWeiInput(evt.target.value)}
                  style={{ marginLeft: 8, width: 220 }}
                />
              </label>
              <button onClick={updateMinStake}>Update minimum stake</button>
              <label>
                Dispute module address
                <input
                  value={disputeModuleAddress}
                  onChange={(evt) => setDisputeModuleAddress(evt.target.value)}
                  style={{ marginLeft: 8, width: "100%" }}
                />
              </label>
              <button onClick={updateDisputeModule}>Rotate dispute module</button>
              <label>
                Ownership target
                <select
                  value={ownershipModule}
                  onChange={(evt) => setOwnershipModule(evt.target.value)}
                  style={{ marginLeft: 8 }}
                >
                  <option value="">Select module</option>
                  {ownerModuleDetails.map((module) => (
                    <option key={module.module} value={module.module}>
                      {module.module}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                New owner address
                <input
                  value={newOwnerAddress}
                  onChange={(evt) => setNewOwnerAddress(evt.target.value)}
                  style={{ marginLeft: 8, width: "100%" }}
                />
              </label>
              <button onClick={transferOwnership}>Transfer ownership</button>
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, marginBottom: 32 }}>
        <h2 style={{ marginTop: 0 }}>Constellation personas</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {actors.map((actor) => (
            <div
              key={actor.id}
              style={{
                padding: 12,
                borderRadius: 12,
                background: "rgba(59, 130, 246, 0.08)",
                minWidth: 180
              }}
            >
              <div style={{ fontSize: 28 }}>{actor.flag ?? "🌐"}</div>
              <strong>{actor.name}</strong>
              <p style={{ fontSize: 13 }}>{actor.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ textAlign: "center", opacity: 0.7 }}>
        Sovereign Constellation proves that AGI Jobs v0 (v2) lets anyone orchestrate a civilization-scale workforce with a few
        clicks. Review, sign, and watch the networks move for you.
      </footer>
    </div>
  );
}
