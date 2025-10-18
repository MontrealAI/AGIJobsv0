/// <reference path="./ownerAtlas.d.ts" />
/// <reference path="./ownerMatrix.d.ts" />
/// <reference path="../shared/autotune.d.ts" />

import express from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

// @ts-ignore — shared module is published as runtime ESM without TypeScript declarations
import { buildOwnerAtlas as untypedBuildOwnerAtlas } from "../shared/ownerAtlas.mjs";
// @ts-ignore — shared module is published as runtime ESM without TypeScript declarations
import { computeAutotunePlan as untypedComputeAutotunePlan } from "../shared/autotune.mjs";
// @ts-ignore — shared module is published as runtime ESM without TypeScript declarations
import { buildOwnerCommandMatrix as untypedBuildOwnerCommandMatrix } from "../shared/ownerMatrix.mjs";

type HubAddresses = Record<string, string>;

type HubConfig = {
  label: string;
  chainId: number;
  networkName: string;
  rpcUrl: string;
  owner: string;
  governance: string;
  subgraphUrl?: string;
  addresses: HubAddresses;
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

type UiConfig = {
  network: string;
  etherscanBase: string;
  defaultSubgraphUrl?: string;
  orchestratorBase?: string;
  featuredPlaybookId?: string;
  hubs: string[];
  explorers?: Record<string, string>;
  launchSequence?: LaunchStep[];
};

type OwnerAtlasLib = {
  buildOwnerAtlas: (hubs: Record<string, HubConfig>, ui: UiConfig) => { atlas: any[] };
};

type AutotuneLib = {
  computeAutotunePlan: (telemetry: any, options?: Record<string, unknown>) => any;
};

type OwnerMatrixLib = {
  buildOwnerCommandMatrix: (
    entries: OwnerMatrixEntry[],
    atlas: { atlas: any[] }
  ) => OwnerMatrixResolved[];
};

type MissionProfile = {
  id: string;
  title: string;
  summary: string;
  playbookId?: string;
  defaultHub?: string;
  highlights?: string[];
};

type OwnerMatrixEntry = {
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
};

type OwnerMatrixResolved = OwnerMatrixEntry & {
  hubLabel?: string;
  networkName?: string;
  contractAddress?: string;
  explorerWriteUrl?: string;
  available: boolean;
  status: string;
  resolvedAt: string;
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

type AsiAutomation = {
  launchCommands: AsiLaunchCommand[];
  ci: {
    description: string;
    ownerVisibility: string;
  };
};

type AsiOwnerAssurances = {
  pausing: string;
  upgrades: string;
  emergencyResponse: string;
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
  automation: AsiAutomation;
  ownerAssurances: AsiOwnerAssurances;
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

type AsiEmpowermentSummary = {
  headline: string;
  unstoppable: string;
  ownerSovereignty: string;
  userPromise: string;
  immediateActions: string[];
};

type AsiEmpowermentOwnerPower = {
  matrixId: string;
  description: string;
  expectation: string;
};

type AsiEmpowermentOwnerPowerResolved = AsiEmpowermentOwnerPower & {
  matrix: OwnerMatrixResolved | null;
  available: boolean;
};

type AsiEmpowermentAutomation = {
  label: string;
  command: string;
  impact: string;
};

type AsiEmpowermentVerification = {
  artifact: string;
  check: string;
};

type AsiEmpowermentSection = {
  id: string;
  title: string;
  promise: string;
  empowerment: string;
  operatorJourney: string[];
  ownerPowers: AsiEmpowermentOwnerPower[];
  automation: AsiEmpowermentAutomation[];
  verification: AsiEmpowermentVerification[];
  unstoppableSignal: string;
};

type AsiEmpowerment = {
  summary: AsiEmpowermentSummary;
  sections: AsiEmpowermentSection[];
};

type AsiVictoryObjective = {
  id: string;
  title: string;
  outcome: string;
  verification: string;
};

type AsiVictoryOwnerControl = {
  module: string;
  action: string;
  command: string;
  verification: string;
};

type AsiVictoryGate = {
  name: string;
  command: string;
  description: string;
};

type AsiVictoryMetric = {
  metric: string;
  target: string;
  source: string;
  verification: string;
};

type AsiVictoryPlan = {
  id: string;
  title: string;
  summary: string;
  operatorPromise: string;
  objectives: AsiVictoryObjective[];
  ownerControls: AsiVictoryOwnerControl[];
  ciGates: AsiVictoryGate[];
  telemetry: {
    overview: string;
    metrics: AsiVictoryMetric[];
  };
  assurance: {
    unstoppable: string;
    ownerSovereignty: string;
    readiness: string;
  };
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

type AsiFlightPlanPhase = {
  id: string;
  title: string;
  objective: string;
  nonTechnicalSteps: string[];
  ownerLevers: { module: string; action: string; description: string }[];
  automation: { command: string; outcome: string }[];
  verification: { signal: string; method: string; source: string }[];
};

type AsiFlightPlan = {
  id: string;
  summary: string;
  operatorPromise: string;
  phases: AsiFlightPlanPhase[];
};

const buildOwnerAtlas = untypedBuildOwnerAtlas as OwnerAtlasLib["buildOwnerAtlas"];
const computeAutotunePlan = untypedComputeAutotunePlan as AutotuneLib["computeAutotunePlan"];
const buildOwnerCommandMatrix = untypedBuildOwnerCommandMatrix as OwnerMatrixLib["buildOwnerCommandMatrix"];
type AutotuneTelemetry = Parameters<AutotuneLib["computeAutotunePlan"]>[0];
type AutotuneOptions = Parameters<AutotuneLib["computeAutotunePlan"]>[1];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

function loadJson<T = unknown>(rel: string): T {
  const file = path.join(root, rel);
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const uiConfig = loadJson<UiConfig>("config/constellation.ui.config.json");
const hubs = loadJson<Record<string, HubConfig>>("config/constellation.hubs.json");
const playbooks = loadJson<any[]>("config/playbooks.json");
const actors = loadJson<any[]>("config/actors.json");
const missionProfiles = loadJson<MissionProfile[]>("config/missionProfiles.json");
const asiDeck = loadJson<AsiDeck>("config/asiTakesOffMatrix.json");
const asiSystems = loadJson<AsiSystem[]>("config/asiTakesOffSystems.json");
const asiVictoryPlan = loadJson<AsiVictoryPlan>("config/asiTakesOffVictoryPlan.json");
const asiOwnerMatrix = loadJson<OwnerMatrixEntry[]>("config/asiTakesOffOwnerMatrix.json");
const asiSuperintelligence = loadJson<AsiSuperintelligence>("config/asiTakesOffSuperintelligence.json");
const asiFlightPlan = loadJson<AsiFlightPlan>("config/asiTakesOffFlightPlan.json");
const asiEmpowerment = loadJson<AsiEmpowerment>("config/asiTakesOffEmpowerment.json");

type ConstellationContext = {
  uiConfig: UiConfig;
  hubs: Record<string, HubConfig>;
  playbooks: any[];
  actors: any[];
  missionProfiles: MissionProfile[];
  asiDeck: AsiDeck;
  asiSystems: AsiSystem[];
  asiVictoryPlan: AsiVictoryPlan;
  asiOwnerMatrix: OwnerMatrixEntry[];
  asiSuperintelligence: AsiSuperintelligence;
  asiFlightPlan: AsiFlightPlan;
  asiEmpowerment: AsiEmpowerment;
};

const defaultContext: ConstellationContext = {
  uiConfig,
  hubs,
  playbooks,
  actors,
  missionProfiles,
  asiDeck,
  asiSystems,
  asiVictoryPlan,
  asiOwnerMatrix,
  asiSuperintelligence,
  asiFlightPlan,
  asiEmpowerment
};

const jobAbi = [
  "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
];
const stakeAbi = ["function depositStake(uint8 role, uint256 amount)"];
const validationAbi = [
  "function commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)",
  "function revealValidation(uint256 jobId, bool approve, bytes32 salt)",
  "function finalize(uint256 jobId)"
];
const disputeAbi = ["function raiseDispute(uint256 jobId, string evidence)"];
const identityAbi = [
  "function addAdditionalAgent(address)",
  "function addAdditionalValidator(address)"
];
const pauseAbi = ["function pause()", "function unpause()"];
const validationConfigAbi = ["function setCommitRevealWindows(uint256,uint256)"];
const stakeConfigAbi = ["function setMinStake(uint256)"];
const jobConfigAbi = ["function setDisputeModule(address)"];
const ownableAbi = ["function transferOwnership(address)"];

const iface = (abi: string[]) => new ethers.Interface(abi);
const encode = (abi: string[], fn: string, args: any[]) => iface(abi).encodeFunctionData(fn, args);

function getHub(ctx: ConstellationContext, id: string): HubConfig {
  const hub = ctx.hubs[id];
  if (!hub) {
    throw new Error(`Unknown hub: ${id}`);
  }
  return hub;
}

function getModuleAddress(hub: HubConfig, module: string): string {
  const addr = hub.addresses?.[module];
  if (!addr) {
    throw new Error(`Module ${module} not configured for hub ${hub.label}`);
  }
  return addr;
}

function loadTelemetry(): AutotuneTelemetry {
  return loadJson("config/autotune.telemetry.json");
}

function serializeTx(hub: HubConfig, payload: { to: string; data: string; value?: string | number }) {
  return {
    chainId: hub.chainId,
    networkName: hub.networkName,
    rpcUrl: hub.rpcUrl,
    to: payload.to,
    data: payload.data,
    value: payload.value ?? "0"
  };
}

export function createServer(ctx: ConstellationContext = defaultContext) {
  const app = express();
  app.use(express.json());

  app.get("/constellation/config", (_req, res) => res.json(ctx.uiConfig));
  app.get("/constellation/hubs", (_req, res) => res.json({ hubs: ctx.hubs }));
  app.get("/constellation/playbooks", (_req, res) => res.json(ctx.playbooks));
  app.get("/constellation/actors", (_req, res) => res.json(ctx.actors));
  app.get("/constellation/mission-profiles", (_req, res) => res.json({ profiles: ctx.missionProfiles }));
  app.get("/constellation/owner/atlas", (_req, res) => res.json(buildOwnerAtlas(ctx.hubs, ctx.uiConfig)));
  app.get("/constellation/asi-takes-off", (_req, res) => {
    const atlas = buildOwnerAtlas(ctx.hubs, ctx.uiConfig);
    const telemetry = loadTelemetry();
    const plan = computeAutotunePlan(telemetry, { mission: ctx.asiDeck.mission?.id ?? "asi-takes-off" });
    return res.json({
      deck: ctx.asiDeck,
      ownerAtlas: atlas,
      autotunePlan: plan,
      systems: ctx.asiSystems,
      victoryPlan: ctx.asiVictoryPlan,
      flightPlan: ctx.asiFlightPlan
    });
  });
  app.get("/constellation/asi-takes-off/owner-matrix", (_req, res) => {
    const atlas = buildOwnerAtlas(ctx.hubs, ctx.uiConfig);
    const matrix = buildOwnerCommandMatrix(ctx.asiOwnerMatrix, atlas);
    return res.json({ entries: matrix, atlas });
  });
  app.get("/constellation/asi-takes-off/empowerment", (_req, res) => {
    const atlas = buildOwnerAtlas(ctx.hubs, ctx.uiConfig);
    const matrix = buildOwnerCommandMatrix(ctx.asiOwnerMatrix, atlas);
    const matrixById = new Map(matrix.map((entry) => [entry.id, entry]));
    const sections = ctx.asiEmpowerment.sections.map<(AsiEmpowermentSection & {
      ownerPowers: AsiEmpowermentOwnerPowerResolved[];
    })>((section) => ({
      ...section,
      ownerPowers: section.ownerPowers.map((power) => ({
        ...power,
        matrix: matrixById.get(power.matrixId) ?? null,
        available: matrixById.has(power.matrixId)
      }))
    }));
    return res.json({
      summary: ctx.asiEmpowerment.summary,
      sections,
      ownerAtlas: atlas,
      ownerMatrix: matrix
    });
  });
  app.get("/constellation/asi-takes-off/victory-plan", (_req, res) =>
    res.json({ plan: ctx.asiVictoryPlan })
  );
  app.get("/constellation/asi-takes-off/systems", (_req, res) =>
    res.json({ systems: ctx.asiSystems })
  );
  app.get("/constellation/asi-takes-off/flight-plan", (_req, res) =>
    res.json({ plan: ctx.asiFlightPlan })
  );
  app.get("/constellation/asi-takes-off/superintelligence", (_req, res) => {
    const atlas = buildOwnerAtlas(ctx.hubs, ctx.uiConfig);
    const matrix = buildOwnerCommandMatrix(ctx.asiOwnerMatrix, atlas);
    const telemetry = loadTelemetry();
    const plan = computeAutotunePlan(telemetry, { mission: ctx.asiDeck.mission?.id ?? "asi-takes-off" });
    return res.json({
      summary: ctx.asiSuperintelligence.summary,
      capabilities: ctx.asiSuperintelligence.capabilities,
      ownerControls: ctx.asiSuperintelligence.ownerControls,
      automation: ctx.asiSuperintelligence.automation,
      readinessSignals: ctx.asiSuperintelligence.readinessSignals,
      ownerAtlas: atlas,
      ownerMatrix: matrix,
      autotunePlan: plan
    });
  });

  app.post("/constellation/:hub/tx/create", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { rewardWei, uri, deadlineOffsetSeconds } = req.body ?? {};
    if (!rewardWei) {
      return res.status(400).json({ error: "rewardWei is required" });
    }
    if (!uri) {
      return res.status(400).json({ error: "uri is required" });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const deadline = nowSec + Number(deadlineOffsetSeconds ?? 7 * 24 * 3600);
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    const tx = serializeTx(hub, {
      to: hub.addresses.JobRegistry,
      data: encode(jobAbi, "createJob", [rewardWei, deadline, specHash, uri]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/stake", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { role, amountWei } = req.body ?? {};
    if (role === undefined || amountWei === undefined) {
      return res.status(400).json({ error: "role and amountWei are required" });
    }
    const tx = serializeTx(hub, {
      to: hub.addresses.StakeManager,
      data: encode(stakeAbi, "depositStake", [role, amountWei]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/commit", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { jobId, commitHash, subdomain, proof } = req.body ?? {};
    if (jobId === undefined || !commitHash) {
      return res.status(400).json({ error: "jobId and commitHash are required" });
    }
    const tx = serializeTx(hub, {
      to: hub.addresses.ValidationModule,
      data: encode(validationAbi, "commitValidation", [
        jobId,
        commitHash,
        subdomain ?? "validator",
        proof ?? []
      ]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/reveal", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { jobId, approve, salt } = req.body ?? {};
    if (jobId === undefined || salt === undefined) {
      return res.status(400).json({ error: "jobId and salt are required" });
    }
    const tx = serializeTx(hub, {
      to: hub.addresses.ValidationModule,
      data: encode(validationAbi, "revealValidation", [jobId, !!approve, salt]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/finalize", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { jobId } = req.body ?? {};
    if (jobId === undefined) {
      return res.status(400).json({ error: "jobId is required" });
    }
    const tx = serializeTx(hub, {
      to: hub.addresses.ValidationModule,
      data: encode(validationAbi, "finalize", [jobId]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/dispute", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { jobId, evidence } = req.body ?? {};
    if (jobId === undefined) {
      return res.status(400).json({ error: "jobId is required" });
    }
    const tx = serializeTx(hub, {
      to: hub.addresses.JobRegistry,
      data: encode(disputeAbi, "raiseDispute", [jobId, evidence ?? ""]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/allowlist", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { role, addr } = req.body ?? {};
    if (role === undefined || !addr) {
      return res.status(400).json({ error: "role and addr are required" });
    }
    const fn = Number(role) === 0 ? "addAdditionalAgent" : "addAdditionalValidator";
    const tx = serializeTx(hub, {
      to: hub.addresses.IdentityRegistry,
      data: encode(identityAbi, fn, [addr]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/pause", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { action } = req.body ?? {};
    const fn = action === "unpause" ? "unpause" : "pause";
    const tx = serializeTx(hub, {
      to: hub.addresses.SystemPause ?? hub.addresses.JobRegistry,
      data: encode(pauseAbi, fn, []),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/validation/commit-window", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { commitWindowSeconds, revealWindowSeconds } = req.body ?? {};
    if (!commitWindowSeconds || !revealWindowSeconds) {
      return res.status(400).json({ error: "commitWindowSeconds and revealWindowSeconds are required" });
    }
    const tx = serializeTx(hub, {
      to: hub.addresses.ValidationModule,
      data: encode(validationConfigAbi, "setCommitRevealWindows", [commitWindowSeconds, revealWindowSeconds]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/stake/min", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { minStakeWei } = req.body ?? {};
    if (!minStakeWei) {
      return res.status(400).json({ error: "minStakeWei is required" });
    }
    const tx = serializeTx(hub, {
      to: hub.addresses.StakeManager,
      data: encode(stakeConfigAbi, "setMinStake", [minStakeWei]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/job/dispute-module", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { module } = req.body ?? {};
    if (!module) {
      return res.status(400).json({ error: "module is required" });
    }
    const tx = serializeTx(hub, {
      to: hub.addresses.JobRegistry,
      data: encode(jobConfigAbi, "setDisputeModule", [module]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/:hub/tx/transfer-ownership", (req, res) => {
    const hub = getHub(ctx, req.params.hub);
    const { module, newOwner } = req.body ?? {};
    if (!module || !newOwner) {
      return res.status(400).json({ error: "module and newOwner are required" });
    }
    if (!ethers.isAddress(newOwner)) {
      return res.status(400).json({ error: "newOwner must be a valid address" });
    }
    const target = getModuleAddress(hub, module);
    const tx = serializeTx(hub, {
      to: target,
      data: encode(ownableAbi, "transferOwnership", [newOwner]),
      value: 0
    });
    return res.json({ tx });
  });

  app.post("/constellation/plan/instantiate", (req, res) => {
    const { playbookId } = req.body ?? {};
    if (!playbookId) {
      return res.status(400).json({ error: "playbookId is required" });
    }
    const pb = ctx.playbooks.find((p) => p.id === playbookId);
    if (!pb) {
      return res.status(404).json({ error: "Unknown playbook" });
    }
    const now = Math.floor(Date.now() / 1000);
    const txs = pb.steps.map((step: any, index: number) => {
      const [, hubId] = String(step.hub).split("@");
      if (!hubId) {
        throw new Error(`Invalid hub step: ${step.hub}`);
      }
      const hub = getHub(ctx, hubId);
      const deadline = now + 7 * 24 * 3600;
      const uri = step.uri ?? "";
      const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
      const tx = serializeTx(hub, {
        to: hub.addresses.JobRegistry,
        data: encode(jobAbi, "createJob", [step.rewardWei, deadline, specHash, uri]),
        value: 0
      });
      return {
        order: index + 1,
        hub: hubId,
        label: hub.label,
        chainId: hub.chainId,
        networkName: hub.networkName,
        rewardWei: step.rewardWei,
        uri,
        tx
      };
    });
    return res.json({
      playbook: { id: pb.id, name: pb.name, description: pb.description, stepCount: pb.steps.length },
      txs
    });
  });

  app.get("/constellation/thermostat/plan", (_req, res) => {
    const telemetry = loadTelemetry();
    const plan = computeAutotunePlan(telemetry, {
      defaultCommitWindowSeconds: telemetry?.baseline?.commitWindowSeconds ?? 3600,
      defaultRevealWindowSeconds: telemetry?.baseline?.revealWindowSeconds ?? 1800,
      defaultMinStakeWei: telemetry?.baseline?.minStakeWei ?? "1000000000000000000"
    });
    return res.json(plan);
  });

  return app;
}

const app = createServer();

const shouldListen =
  !process.env.SOVEREIGN_CONSTELLATION_NO_LISTEN &&
  path.resolve(process.argv[1] ?? "") === __filename;

if (shouldListen) {
  const PORT = process.env.SOVEREIGN_CONSTELLATION_PORT
    ? Number(process.env.SOVEREIGN_CONSTELLATION_PORT)
    : 8090;
  app.listen(PORT, () => {
    console.log(`[Sovereign Constellation] server listening on port ${PORT}`);
  });
}

export default app;
