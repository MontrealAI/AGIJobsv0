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
  featuredPlaybookId?: string;
  launchSequence?: LaunchStep[];
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

type MissionProfile = {
  id: string;
  title: string;
  summary: string;
  playbookId?: string;
  defaultHub?: string;
  highlights?: string[];
};

type AsiPillar = {
  id: string;
  title: string;
  headline: string;
  operatorAction: string;
  ownerLever: string;
  proof: string;
};

type AsiLaunchCommand = {
  label: string;
  run: string;
};

type AsiDeck = {
  mission: {
    id: string;
    title: string;
    tagline: string;
  };
  constellation: {
    label: string;
    summary: string;
    operatorPromise: string;
  };
  pillars: AsiPillar[];
  automation: {
    launchCommands: AsiLaunchCommand[];
    ci: {
      description: string;
      ownerVisibility: string;
    };
  };
  ownerAssurances: {
    pausing: string;
    upgrades: string;
    emergencyResponse: string;
  };
};

type AsiSystemControl = {
  module: string;
  action: string;
  description: string;
};

type AsiSystemAutomation = {
  label: string;
  command: string;
  impact: string;
};

type AsiSystemVerification = {
  artifact: string;
  description: string;
};

type AsiSystem = {
  id: string;
  title: string;
  summary: string;
  operatorWorkflow: string[];
  ownerControls: AsiSystemControl[];
  automation: AsiSystemAutomation[];
  verification: AsiSystemVerification[];
  assurance: string;
};

type AsiFlightPlanVerification = {
  signal: string;
  method: string;
  source: string;
};

type AsiFlightPlanPhase = {
  id: string;
  title: string;
  objective: string;
  nonTechnicalSteps: string[];
  ownerLevers: { module: string; action: string; description: string }[];
  automation: { command: string; outcome: string }[];
  verification: AsiFlightPlanVerification[];
};

type AsiFlightPlan = {
  id: string;
  summary: string;
  operatorPromise: string;
  phases: AsiFlightPlanPhase[];
};

type SuperintelligenceCapability = {
  id: string;
  title: string;
  description: string;
  operatorFocus: string;
  ownerAuthority: string;
  autonomyLoop: string;
  proof: string[];
};

type SuperintelligenceOwnerControl = {
  module: string;
  method: string;
  impact: string;
  command: string;
  verification: string;
};

type SuperintelligenceAutomation = {
  label: string;
  command: string;
  effect: string;
};

type SuperintelligenceSignal = {
  signal: string;
  description: string;
  source: string;
};

type AsiSuperintelligence = {
  summary: {
    headline: string;
    valueProposition: string;
    outcome: string;
    nonTechnicalPromise: string;
  };
  capabilities: SuperintelligenceCapability[];
  ownerControls: SuperintelligenceOwnerControl[];
  automation: SuperintelligenceAutomation[];
  readinessSignals: SuperintelligenceSignal[];
};

type AsiDominanceVector = {
  id: string;
  title: string;
  description: string;
  operatorFocus: string;
  ownerLever: string;
  automation: { command: string; impact: string }[];
  proofs: string[];
};

type AsiDominanceIndicator = {
  metric: string;
  signal: string;
  target: string;
  source: string;
  verification: string;
};

type AsiDominanceDirective = {
  action: string;
  command: string;
  proof: string;
  impact: string;
};

type AsiDominanceAutomationCommand = {
  label: string;
  command: string;
  purpose: string;
};

type AsiDominanceAutomation = {
  commands: AsiDominanceAutomationCommand[];
  ci: {
    workflow: string;
    job: string;
    description: string;
    ownerVisibility: string;
  };
};

type AsiDominance = {
  mission: {
    title: string;
    tagline: string;
    operatorPromise: string;
    ownerSupremacy: string;
    ciGuardrail: string;
  };
  vectors: AsiDominanceVector[];
  indicators: AsiDominanceIndicator[];
  ownerDirectives: AsiDominanceDirective[];
  automation: AsiDominanceAutomation;
};

type OwnerMatrixResolved = {
  id: string;
  pillarId: string;
  title: string;
  hub: string;
  module: string;
  method: string;
  ownerAction: string;
  operatorSignal: string;
  proof: string;
  automation?: string[];
  notes?: string[];
  hubLabel?: string;
  networkName?: string;
  contractAddress?: string;
  explorerWriteUrl?: string;
  available: boolean;
  status: string;
  resolvedAt: string;
  atlasModules?: string[];
  atlasActions?: string[];
};

type LaunchCommand = {
  label: string;
  run: string;
};

type LaunchStep = {
  id: string;
  title: string;
  objective: string;
  commands: LaunchCommand[];
  successSignal: string;
  ownerLever: string;
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

const codeStyle: React.CSSProperties = {
  display: "block",
  background: "#0f172a",
  color: "#e2e8f0",
  padding: "8px 12px",
  borderRadius: 12,
  fontSize: 12,
  whiteSpace: "pre-wrap"
};

export default function App() {
  const [cfg, setCfg] = useState<Config>();
  const [cfgError, setCfgError] = useState<string>();
  const [hubMap, setHubMap] = useState<Record<string, HubInfo>>({});
  const [hubKeys, setHubKeys] = useState<string[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [missionProfiles, setMissionProfiles] = useState<MissionProfile[]>([]);
  const [asiDeck, setAsiDeck] = useState<AsiDeck>();
  const [asiSystems, setAsiSystems] = useState<AsiSystem[]>([]);
  const [asiSuperintelligence, setAsiSuperintelligence] = useState<AsiSuperintelligence>();
  const [asiDominance, setAsiDominance] = useState<AsiDominance>();
  const [asiFlightPlan, setAsiFlightPlan] = useState<AsiFlightPlan>();
  const [launchSequence, setLaunchSequence] = useState<LaunchStep[]>([]);
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
  const [ownerMatrixEntries, setOwnerMatrixEntries] = useState<OwnerMatrixResolved[]>([]);
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

  const deckPillars = useMemo(() => (asiDeck?.pillars ?? []).slice(0, 5), [asiDeck]);
  const deckCommands = useMemo(() => asiDeck?.automation?.launchCommands ?? [], [asiDeck]);
  const flightPhases = useMemo(() => asiFlightPlan?.phases ?? [], [asiFlightPlan]);
  const dominanceVectors = useMemo(() => asiDominance?.vectors ?? [], [asiDominance]);
  const dominanceIndicators = useMemo(() => asiDominance?.indicators ?? [], [asiDominance]);
  const dominanceDirectives = useMemo(() => asiDominance?.ownerDirectives ?? [], [asiDominance]);
  const dominanceAutomationCommands = useMemo(
    () => asiDominance?.automation?.commands ?? [],
    [asiDominance]
  );
  const dominanceCi = useMemo(() => asiDominance?.automation?.ci, [asiDominance]);

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

  const ownerMatrixSummary = useMemo(
    () => {
      if (!ownerMatrixEntries || ownerMatrixEntries.length === 0) {
        return { ready: 0, pending: 0 };
      }
      const ready = ownerMatrixEntries.filter((entry) => entry.available).length;
      return { ready, pending: ownerMatrixEntries.length - ready };
    },
    [ownerMatrixEntries]
  );

  const ownerMatrixSample = useMemo(
    () => ownerMatrixEntries.slice(0, 3),
    [ownerMatrixEntries]
  );

  useEffect(() => {
    fetchJson("/constellation/config")
      .then((config: Config) => {
        setCfg(config);
        if (Array.isArray(config.launchSequence)) {
          setLaunchSequence(config.launchSequence as LaunchStep[]);
        } else {
          setLaunchSequence([]);
        }
      })
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
    fetchJson("/constellation/mission-profiles", undefined, orchestratorBase)
      .then((payload) => {
        if (payload && typeof payload === "object" && Array.isArray((payload as any).profiles)) {
          setMissionProfiles((payload as any).profiles as MissionProfile[]);
          return;
        }
        if (Array.isArray(payload)) {
          setMissionProfiles(payload as MissionProfile[]);
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
    fetchJson("/constellation/asi-takes-off", undefined, orchestratorBase)
      .then((payload) => {
        if (payload && typeof payload === "object") {
          if ((payload as any).deck) {
            setAsiDeck((payload as any).deck as AsiDeck);
          }
          if ((payload as any).ownerAtlas?.atlas && Array.isArray((payload as any).ownerAtlas.atlas)) {
            setOwnerAtlas((payload as any).ownerAtlas.atlas as OwnerHub[]);
          }
          if ((payload as any).autotunePlan) {
            setAutotunePlan((payload as any).autotunePlan as AutotunePlan);
          }
          if (Array.isArray((payload as any).systems)) {
            setAsiSystems((payload as any).systems as AsiSystem[]);
          }
          if ((payload as any).flightPlan) {
            setAsiFlightPlan((payload as any).flightPlan as AsiFlightPlan);
          }
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/constellation/asi-takes-off/systems", undefined, orchestratorBase)
      .then((payload) => {
        if (payload && typeof payload === "object" && Array.isArray((payload as any).systems)) {
          setAsiSystems((payload as any).systems as AsiSystem[]);
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/constellation/asi-takes-off/flight-plan", undefined, orchestratorBase)
      .then((payload) => {
        if (payload && typeof payload === "object") {
          if ((payload as any).plan) {
            setAsiFlightPlan((payload as any).plan as AsiFlightPlan);
            return;
          }
          if (Array.isArray((payload as any).phases)) {
            setAsiFlightPlan(payload as AsiFlightPlan);
          }
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/constellation/asi-takes-off/superintelligence", undefined, orchestratorBase)
      .then((payload) => {
        if (payload && typeof payload === "object") {
          if ((payload as any).summary) {
            setAsiSuperintelligence((payload as any) as AsiSuperintelligence);
          }
          if ((payload as any).ownerAtlas?.atlas && Array.isArray((payload as any).ownerAtlas.atlas)) {
            setOwnerAtlas((payload as any).ownerAtlas.atlas as OwnerHub[]);
          }
          if ((payload as any).autotunePlan) {
            setAutotunePlan((payload as any).autotunePlan as AutotunePlan);
          }
          if (Array.isArray((payload as any).ownerMatrix)) {
            setOwnerMatrixEntries((payload as any).ownerMatrix as OwnerMatrixResolved[]);
          }
        }
      })
      .catch((err) => console.error(err));
    fetchJson("/constellation/asi-takes-off/dominance", undefined, orchestratorBase)
      .then((payload) => {
        if (payload && typeof payload === "object") {
          if ((payload as any).dominance) {
            setAsiDominance((payload as any).dominance as AsiDominance);
          }
          if ((payload as any).ownerAtlas?.atlas && Array.isArray((payload as any).ownerAtlas.atlas)) {
            setOwnerAtlas((payload as any).ownerAtlas.atlas as OwnerHub[]);
          }
          if (Array.isArray((payload as any).ownerMatrix)) {
            setOwnerMatrixEntries((payload as any).ownerMatrix as OwnerMatrixResolved[]);
          }
          if ((payload as any).autotunePlan) {
            setAutotunePlan((payload as any).autotunePlan as AutotunePlan);
          }
        }
      })
      .catch((err) => console.error(err));
  }, [orchestratorBase]);

  const selectedHubInfo = selectedHub ? hubMap[selectedHub] : undefined;

  useEffect(() => {
    if (selectedPlaybook) {
      return;
    }
    if (!playbooks || playbooks.length === 0) {
      return;
    }
    const availableIds = new Set(playbooks.map((pb) => pb.id));
    let candidate: string | undefined;
    if (cfg?.featuredPlaybookId && availableIds.has(cfg.featuredPlaybookId)) {
      candidate = cfg.featuredPlaybookId;
    } else {
      const profileMatch = missionProfiles.find(
        (profile) => profile.playbookId && availableIds.has(profile.playbookId)
      );
      candidate = profileMatch?.playbookId ?? playbooks[0]?.id;
    }
    if (candidate) {
      setSelectedPlaybook(candidate);
      const profile = missionProfiles.find((item) => item.playbookId === candidate);
      if (profile?.defaultHub && !selectedHub) {
        setSelectedHub(profile.defaultHub);
      }
    }
  }, [cfg, missionProfiles, playbooks, selectedHub, selectedPlaybook]);

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

      {launchSequence.length > 0 ? (
        <section data-testid="launch-sequence" style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>ASI Takes Off Launch Sequence</h2>
          <p style={{ maxWidth: 860 }}>
            Follow these preflight steps to command the Sovereign Constellation without writing any code. Each action was
            curated so a single director can deploy hubs, load the flagship mission, and assert owner supremacy in minutes.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18
            }}
          >
            {launchSequence.map((step, index) => (
              <div
                key={step.id}
                style={{
                  ...cardStyle,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  minHeight: 0
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "#1e3a8a"
                  }}
                >
                  Step {index + 1}
                </span>
                <h3 style={{ margin: 0 }}>{step.title}</h3>
                <p style={{ marginTop: 0 }}>{step.objective}</p>
                {Array.isArray(step.commands) && step.commands.length > 0 ? (
                  <div>
                    <strong style={{ fontSize: 13 }}>Execute</strong>
                    <ul style={{ listStyle: "none", paddingLeft: 0, marginTop: 8, marginBottom: 12 }}>
                      {step.commands.map((command, cmdIdx) => (
                        <li key={`${step.id}-command-${cmdIdx}`} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                            {command.label}
                          </div>
                          <code style={codeStyle}>{command.run}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 13,
                    background: "rgba(59, 130, 246, 0.12)",
                    padding: 12,
                    borderRadius: 12
                  }}
                >
                  <strong>Success signal:</strong> {step.successSignal}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    background: "rgba(22, 163, 74, 0.12)",
                    padding: 12,
                    borderRadius: 12
                  }}
                >
                  <strong>Owner control:</strong> {step.ownerLever}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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

      {asiDeck ? (
        <section data-testid="asi-takes-off-deck" style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>ASI Takes Off Control Deck</h2>
          <p style={{ maxWidth: 860 }}>
            {asiDeck.mission.tagline} {asiDeck.constellation.operatorPromise}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
              marginBottom: 24
            }}
          >
            {deckPillars.map((pillar) => (
              <div key={pillar.id} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "#1e40af"
                  }}
                >
                  {pillar.title}
                </span>
                <strong>{pillar.headline}</strong>
                <p style={{ fontSize: 13, flexGrow: 1 }}>{pillar.operatorAction}</p>
                <div style={{ fontSize: 12, background: "rgba(56, 189, 248, 0.16)", padding: 10, borderRadius: 10 }}>
                  <strong>Owner supremacy:</strong> {pillar.ownerLever}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Proof: {pillar.proof}</div>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 18
            }}
          >
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Automation Spine</h3>
              <p>{asiDeck.constellation.summary}</p>
              <ul style={{ paddingLeft: 18 }}>
                {deckCommands.map((command) => (
                  <li key={command.run} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{command.label}</div>
                    <code style={codeStyle}>{command.run}</code>
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: 13, background: "rgba(59, 130, 246, 0.12)", padding: 12, borderRadius: 12 }}>
                <strong>CI guardrail:</strong> {asiDeck.automation?.ci.description ?? "Automation plan generated from repo config."}
                <br />
                {asiDeck.automation?.ci.ownerVisibility ?? "Review AGI Jobs CI dashboards for live status."}
              </div>
            </div>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Owner assurances</h3>
              <ul style={{ paddingLeft: 20, fontSize: 14 }}>
                <li>
                  <strong>Pausing:</strong> {asiDeck.ownerAssurances?.pausing ?? "Owner can trigger SystemPause across hubs."}
                </li>
                <li>
                  <strong>Upgrades:</strong> {asiDeck.ownerAssurances?.upgrades ?? "Upgradeable proxies remain under owner control."}
                </li>
                <li>
                  <strong>Emergency response:</strong> {asiDeck.ownerAssurances?.emergencyResponse ?? "Owner atlas links each override entry point."}
                </li>
              </ul>
              <p style={{ fontSize: 13 }}>
                Use the new CLI to print a zero-code launch briefing for stakeholders before signing anything.
              </p>
              <code style={{ ...codeStyle, marginTop: 8 }}>npm run demo:sovereign-constellation:asi-takes-off</code>
            </div>
          </div>
        </section>
      ) : null}

      {asiFlightPlan ? (
        <section data-testid="asi-takes-off-flight-plan" style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>ASI Takes Off Flight Plan</h2>
          <p style={{ maxWidth: 860 }}>{asiFlightPlan.summary}</p>
          <p style={{ fontSize: 13, maxWidth: 840, opacity: 0.85 }}>{asiFlightPlan.operatorPromise}</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18
            }}
          >
            {flightPhases.map((phase) => (
              <div key={phase.id} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "#0f172a"
                  }}
                >
                  {phase.title}
                </span>
                <strong>{phase.objective}</strong>
                {phase.nonTechnicalSteps && phase.nonTechnicalSteps.length > 0 ? (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Non-technical steps</div>
                    <ol style={{ paddingLeft: 20, fontSize: 12, lineHeight: 1.5 }}>
                      {phase.nonTechnicalSteps.map((step, idx) => (
                        <li key={`${phase.id}-step-${idx}`} style={{ marginBottom: 4 }}>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {phase.ownerLevers && phase.ownerLevers.length > 0 ? (
                  <div style={{ fontSize: 12, background: "rgba(59, 130, 246, 0.12)", padding: 10, borderRadius: 10 }}>
                    <strong>Owner levers:</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 8 }}>
                      {phase.ownerLevers.map((lever, idx) => (
                        <li key={`${phase.id}-lever-${idx}`} style={{ marginBottom: 6 }}>
                          <strong>{lever.module}</strong> :: {lever.action}
                          <br />
                          <span style={{ opacity: 0.85 }}>{lever.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {phase.automation && phase.automation.length > 0 ? (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Automation spine</div>
                    <ul style={{ paddingLeft: 18, fontSize: 12 }}>
                      {phase.automation.map((entry, idx) => (
                        <li key={`${phase.id}-automation-${idx}`} style={{ marginBottom: 6 }}>
                          <code style={codeStyle}>{entry.command}</code>
                          <div style={{ opacity: 0.8 }}>{entry.outcome}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {phase.verification && phase.verification.length > 0 ? (
                  <div style={{ fontSize: 12, background: "rgba(34, 197, 94, 0.12)", padding: 10, borderRadius: 10 }}>
                    <strong>Verification</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 8 }}>
                      {phase.verification.map((entry, idx) => (
                        <li key={`${phase.id}-verification-${idx}`} style={{ marginBottom: 6 }}>
                          <strong>{entry.signal}</strong>
                          <div>{entry.method}</div>
                          <span style={{ fontSize: 11, opacity: 0.7 }}>{entry.source}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {asiSuperintelligence ? (
        <section data-testid="asi-superintelligence" style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>ASI Superintelligence Assurance</h2>
          <p style={{ maxWidth: 880 }}>
            {asiSuperintelligence.summary.headline} {asiSuperintelligence.summary.valueProposition} This control deck proves
            the constellation is an unstoppable, sovereign superintelligence that a non-technical owner can steer by
            following the repository's launch sequence.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
              marginBottom: 24
            }}
          >
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Mission Outcome</h3>
              <p style={{ fontSize: 14 }}>{asiSuperintelligence.summary.outcome}</p>
              <p style={{ fontSize: 13, opacity: 0.8 }}>{asiSuperintelligence.summary.nonTechnicalPromise}</p>
              <code style={{ ...codeStyle, marginTop: 12 }}>npm run demo:sovereign-constellation:superintelligence</code>
            </div>
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
              <h3 style={{ marginTop: 0 }}>Owner Matrix Readiness</h3>
              <p style={{ margin: 0 }}>Ready levers: {ownerMatrixSummary.ready}</p>
              <p style={{ margin: 0 }}>Pending levers: {ownerMatrixSummary.pending}</p>
              {ownerMatrixSample.length > 0 ? (
                <ul style={{ paddingLeft: 18, fontSize: 13, marginTop: 8 }}>
                  {ownerMatrixSample.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.title}</strong> — {entry.status.replace(/-/g, " ")}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 13 }}>Run the constellation once to populate live readiness logs.</p>
              )}
              <small style={{ opacity: 0.7 }}>
                Regenerate with <code style={codeStyle}>npm run demo:sovereign-constellation:atlas</code> for fresh explorer
                links.
              </small>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18,
              marginBottom: 24
            }}
          >
            {asiSuperintelligence.capabilities.map((capability) => (
              <div key={capability.id} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "#1e40af"
                  }}
                >
                  {capability.title}
                </span>
                <p style={{ fontSize: 13 }}>{capability.description}</p>
                <div style={{ fontSize: 12, background: "rgba(14, 116, 144, 0.1)", padding: 10, borderRadius: 10 }}>
                  <strong>Operator focus:</strong> {capability.operatorFocus}
                </div>
                <div style={{ fontSize: 12, background: "rgba(30, 64, 175, 0.1)", padding: 10, borderRadius: 10 }}>
                  <strong>Owner authority:</strong> {capability.ownerAuthority}
                </div>
                <div style={{ fontSize: 12, background: "rgba(22, 163, 74, 0.1)", padding: 10, borderRadius: 10 }}>
                  <strong>Autonomy loop:</strong> {capability.autonomyLoop}
                </div>
                <details style={{ fontSize: 12 }}>
                  <summary style={{ cursor: "pointer" }}>Proof artefacts</summary>
                  <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                    {capability.proof.map((item, idx) => (
                      <li key={`${capability.id}-proof-${idx}`} style={{ marginBottom: 4 }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18
            }}
          >
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Owner Sovereignty Controls</h3>
              <ul style={{ paddingLeft: 18, fontSize: 13 }}>
                {asiSuperintelligence.ownerControls.map((control) => (
                  <li key={`${control.module}-${control.method}`} style={{ marginBottom: 10 }}>
                    <strong>{control.module}</strong> :: {control.method}
                    <br />
                    {control.impact}
                    <br />
                    <code style={{ ...codeStyle, marginTop: 6 }}>{control.command}</code>
                    <br />
                    <span style={{ fontSize: 12, opacity: 0.75 }}>{control.verification}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Automation Spine</h3>
              <ul style={{ paddingLeft: 18, fontSize: 13 }}>
                {asiSuperintelligence.automation.map((entry) => (
                  <li key={entry.command} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{entry.label}</div>
                    <code style={codeStyle}>{entry.command}</code>
                    <div style={{ fontSize: 12 }}>{entry.effect}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Readiness Signals</h3>
              <ul style={{ paddingLeft: 18, fontSize: 13 }}>
                {asiSuperintelligence.readinessSignals.map((signal) => (
                  <li key={signal.signal} style={{ marginBottom: 8 }}>
                    <strong>{signal.signal}</strong>
                    <div>{signal.description}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{signal.source}</div>
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 12, marginTop: 12 }}>
                Keep the "ci (v2) → Sovereign Constellation" workflow green to prove unstoppable deployment readiness.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {asiSystems.length > 0 ? (
        <section data-testid="asi-takes-off-systems" style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>ASI Takes Off Systems Matrix</h2>
          <p style={{ maxWidth: 860 }}>
            Each pillar of the flagship objective is grounded in live code, deterministic automation, and owner-only
            controls. Review the matrix to understand exactly how non-technical directors and governance owners co-pilot
            the superintelligent launch.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 18
            }}
          >
            {asiSystems.map((system) => (
              <div key={system.id} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 4 }}>{system.title}</h3>
                  <p style={{ marginTop: 0 }}>{system.summary}</p>
                </div>
                {Array.isArray(system.operatorWorkflow) && system.operatorWorkflow.length > 0 ? (
                  <div>
                    <strong style={{ fontSize: 13 }}>Operator workflow</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                      {system.operatorWorkflow.map((item, idx) => (
                        <li key={`${system.id}-operator-${idx}`} style={{ fontSize: 13, marginBottom: 4 }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {Array.isArray(system.ownerControls) && system.ownerControls.length > 0 ? (
                  <div>
                    <strong style={{ fontSize: 13 }}>Owner levers</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                      {system.ownerControls.map((control, idx) => (
                        <li key={`${system.id}-owner-${idx}`} style={{ fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>{control.module}</span> · {control.action}
                          <div style={{ fontSize: 12, color: "#334155" }}>{control.description}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {Array.isArray(system.automation) && system.automation.length > 0 ? (
                  <div>
                    <strong style={{ fontSize: 13 }}>Automation spine</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                      {system.automation.map((entry, idx) => (
                        <li key={`${system.id}-automation-${idx}`} style={{ fontSize: 13, marginBottom: 6 }}>
                          <div style={{ fontWeight: 600 }}>{entry.label}</div>
                          <code style={codeStyle}>{entry.command}</code>
                          <div style={{ fontSize: 12, color: "#334155" }}>{entry.impact}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {Array.isArray(system.verification) && system.verification.length > 0 ? (
                  <div>
                    <strong style={{ fontSize: 13 }}>Proof points</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                      {system.verification.map((item, idx) => (
                        <li key={`${system.id}-verification-${idx}`} style={{ fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>{item.artifact}</span>
                          <div style={{ fontSize: 12, color: "#334155" }}>{item.description}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 13,
                    background: "rgba(22, 163, 74, 0.12)",
                    padding: 12,
                    borderRadius: 12,
                    marginTop: "auto"
                  }}
                >
                  <strong>Assurance:</strong> {system.assurance}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {asiDominance ? (
        <section data-testid="asi-takes-off-dominance" style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>ASI Dominance Protocol</h2>
          <p style={{ maxWidth: 880 }}>{asiDominance.mission.tagline}</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
              marginBottom: 24
            }}
          >
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>{asiDominance.mission.title}</h3>
              <p style={{ fontSize: 13 }}>{asiDominance.mission.operatorPromise}</p>
              <div style={{ fontSize: 13, background: "rgba(37, 99, 235, 0.12)", padding: 12, borderRadius: 12 }}>
                <strong>Owner supremacy:</strong> {asiDominance.mission.ownerSupremacy}
              </div>
              <p style={{ fontSize: 12, marginTop: 12 }}>{asiDominance.mission.ciGuardrail}</p>
            </div>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Automation & CI Guardrails</h3>
              <ul style={{ paddingLeft: 18, fontSize: 13 }}>
                {dominanceAutomationCommands.map((command) => (
                  <li key={command.command} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{command.label}</div>
                    <code style={codeStyle}>{command.command}</code>
                    <div style={{ fontSize: 12 }}>{command.purpose}</div>
                  </li>
                ))}
              </ul>
              {dominanceCi ? (
                <div style={{ fontSize: 12, background: "rgba(59, 130, 246, 0.12)", padding: 10, borderRadius: 10 }}>
                  <strong>Required workflow:</strong> {dominanceCi.workflow} → {dominanceCi.job}
                  <br />
                  {dominanceCi.description}
                  <br />
                  {dominanceCi.ownerVisibility}
                </div>
              ) : null}
            </div>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Owner Readiness Metrics</h3>
              <p style={{ margin: 0 }}>Ready levers: {ownerMatrixSummary.ready}</p>
              <p style={{ margin: 0 }}>Pending levers: {ownerMatrixSummary.pending}</p>
              {autotunePlan?.summary ? (
                <p style={{ fontSize: 12, marginTop: 12 }}>
                  Thermostat: {(autotunePlan.summary.averageParticipation * 100).toFixed(2)}% participation ·
                  commit {autotunePlan.summary.commitWindowSeconds}s · reveal {autotunePlan.summary.revealWindowSeconds}s
                </p>
              ) : null}
              <div style={{ fontSize: 12, marginTop: 12 }}>
                <div>Keep these metrics refreshed via:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  <code style={codeStyle}>npm run demo:sovereign-constellation:owner</code>
                  <code style={codeStyle}>npm run demo:sovereign-constellation:plan</code>
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18,
              marginBottom: 24
            }}
          >
            {dominanceVectors.map((vector) => (
              <div key={vector.id} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "#1e3a8a"
                  }}
                >
                  {vector.title}
                </span>
                <strong>{vector.description}</strong>
                <p style={{ fontSize: 13 }}>{vector.operatorFocus}</p>
                <div style={{ fontSize: 12, background: "rgba(22, 163, 74, 0.15)", padding: 10, borderRadius: 10 }}>
                  <strong>Owner lever:</strong> {vector.ownerLever}
                </div>
                {Array.isArray(vector.automation) && vector.automation.length > 0 ? (
                  <div>
                    <strong style={{ fontSize: 13 }}>Automation</strong>
                    <ul style={{ paddingLeft: 18, fontSize: 12, marginTop: 6 }}>
                      {vector.automation.map((entry, idx) => (
                        <li key={`${vector.id}-automation-${idx}`} style={{ marginBottom: 4 }}>
                          <code style={codeStyle}>{entry.command}</code>
                          <div style={{ fontSize: 12 }}>{entry.impact}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <details style={{ fontSize: 12 }}>
                  <summary style={{ cursor: "pointer" }}>Proof artefacts</summary>
                  <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                    {vector.proofs.map((proof, idx) => (
                      <li key={`${vector.id}-proof-${idx}`} style={{ marginBottom: 4 }}>
                        {proof}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18
            }}
          >
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Dominance Indicators</h3>
              <ul style={{ paddingLeft: 18, fontSize: 13 }}>
                {dominanceIndicators.map((indicator, idx) => (
                  <li key={`${indicator.metric}-${idx}`} style={{ marginBottom: 8 }}>
                    <strong>{indicator.metric}</strong> — {indicator.signal}
                    <div style={{ fontSize: 12, color: "#334155" }}>Target: {indicator.target}</div>
                    <div style={{ fontSize: 12, color: "#334155" }}>Source: {indicator.source}</div>
                    <div style={{ fontSize: 12, color: "#334155" }}>Verification: {indicator.verification}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0 }}>Owner Directives</h3>
              <ul style={{ paddingLeft: 18, fontSize: 13 }}>
                {dominanceDirectives.map((directive, idx) => (
                  <li key={`${directive.action}-${idx}`} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600 }}>{directive.action}</div>
                    <code style={codeStyle}>{directive.command}</code>
                    <div style={{ fontSize: 12 }}>{directive.proof}</div>
                    <div style={{ fontSize: 12, color: "#0f172a" }}>{directive.impact}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {missionProfiles.length > 0 ? (
        <section data-testid="mission-profiles" style={{ marginBottom: 32 }}>
          <h2 style={{ marginTop: 0 }}>ASI Takes Off Mission Profiles</h2>
          <p style={{ maxWidth: 820 }}>
            Five mission archetypes translate the grand "ASI Takes Off" objective into concrete wallet-first actions. Choose a
            profile to auto-load the flagship playbook, align hubs, and unleash the Sovereign Constellation without touching raw
            contracts.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18
            }}
          >
            {missionProfiles.map((profile) => (
              <div key={profile.id} style={{ ...cardStyle, display: "flex", flexDirection: "column" }}>
                <h3 style={{ marginTop: 0 }}>{profile.title}</h3>
                <p style={{ flexGrow: 0 }}>{profile.summary}</p>
                {profile.highlights && profile.highlights.length > 0 ? (
                  <ul style={{ paddingLeft: 20, marginTop: 8, marginBottom: 12 }}>
                    {profile.highlights.map((item, idx) => (
                      <li key={`${profile.id}-highlight-${idx}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {profile.defaultHub ? (
                  <p style={{ fontSize: 12, color: "#475569" }}>
                    Suggested hub focus: {hubMap[profile.defaultHub]?.label ?? profile.defaultHub}
                  </p>
                ) : null}
                <button
                  style={{
                    marginTop: "auto",
                    alignSelf: "flex-start",
                    borderRadius: 12,
                    border: "none",
                    padding: "8px 14px",
                    background: selectedPlaybook === profile.playbookId ? "#1e293b" : "#4338ca",
                    color: "white",
                    cursor: profile.playbookId ? "pointer" : "not-allowed",
                    opacity: profile.playbookId ? 1 : 0.5
                  }}
                  disabled={!profile.playbookId}
                  onClick={() => {
                    if (!profile.playbookId) {
                      return;
                    }
                    setSelectedPlaybook(profile.playbookId);
                    if (profile.defaultHub) {
                      setSelectedHub(profile.defaultHub);
                    }
                  }}
                >
                  {selectedPlaybook === profile.playbookId ? "Mission loaded" : "Load mission plan"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
