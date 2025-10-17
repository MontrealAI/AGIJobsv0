import express from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

type PlaybookStep = {
  hub: string;
  rewardWei: string;
  uri?: string;
};

type Playbook = {
  id: string;
  name: string;
  steps: PlaybookStep[];
};

type MissionSummary = {
  id: string;
  name: string;
  stepCount: number;
  hubCount: number;
  stageCount: number;
  totalRewardWei: string;
  totalRewardEther: string;
  hubs: string[];
  stages: string[];
};

type HubConfig = {
  label: string;
  rpcUrl: string;
  subgraphUrl?: string;
  addresses: Record<string, string>;
};

type HubMap = Record<string, HubConfig>;

const meshCfg = JSON.parse(
  readFileSync(path.join(root, "config/mesh.ui.config.json"), "utf8")
);
const hubs: HubMap = JSON.parse(
  readFileSync(path.join(root, "config/hubs.mainnet.json"), "utf8")
);
const playbooks: Playbook[] = JSON.parse(
  readFileSync(path.join(root, "config/playbooks.json"), "utf8")
);
const actors = JSON.parse(
  readFileSync(path.join(root, "config/actors.json"), "utf8")
);

const jobAbi = [
  "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
];
const stakeAbi = ["function depositStake(uint8 role, uint256 amount)"];
const valAbi = [
  "function commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)",
  "function revealValidation(uint256 jobId, bool approve, bytes32 salt)",
  "function finalize(uint256 jobId)"
];
const dispAbi = ["function raiseDispute(uint256 jobId, string evidence)"];
const idAbi = [
  "function addAdditionalAgent(address)",
  "function addAdditionalValidator(address)"
];

const iface = (abi: string[]) => new ethers.Interface(abi);
const enc = (abi: string[], fn: string, args: unknown[]) =>
  iface(abi).encodeFunctionData(fn, args);
const toBigInt = (value: unknown): bigint => {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.trunc(value));
    if (typeof value === "string" && value) return BigInt(value);
  } catch (err) {
    console.warn("[Sovereign Mesh] Unable to coerce bigint", value, err);
  }
  return 0n;
};
const parseHubStage = (value: string) => {
  const parts = String(value || "").split("@");
  if (parts.length === 1) {
    return { stage: parts[0] || "mission", hubId: parts[0] || "" };
  }
  const [stage, hubId] = parts as [string, string];
  return { stage: stage || "mission", hubId: hubId || stage };
};
const unique = <T,>(values: T[]) => Array.from(new Set(values));
const getHub = (id: string) => {
  const hub = hubs[id];
  if (!hub) {
    throw new Error(`Unknown hub: ${id}`);
  }
  return hub;
};

const app = express();
app.use(express.json());

app.get("/mesh/hubs", (_req, res) => res.json({ hubs }));
app.get("/mesh/actors", (_req, res) => res.json(actors));
app.get("/mesh/playbooks", (_req, res) => res.json(playbooks));
app.get("/mesh/config", (_req, res) => res.json(meshCfg));
app.get("/mesh/summary", (_req, res) => {
  const missions: MissionSummary[] = playbooks.map((playbook) => {
    const steps = playbook.steps || [];
    const stepSummaries = steps.map((step) => {
      const { stage, hubId } = parseHubStage(step.hub);
      return {
        stage,
        hubId,
        reward: toBigInt(step.rewardWei),
        uri: step.uri || ""
      };
    });
    const totalReward = stepSummaries.reduce(
      (acc, step) => acc + step.reward,
      0n
    );
    const hubsInMission = unique(stepSummaries.map((s) => s.hubId).filter(Boolean));
    const stagesInMission = unique(stepSummaries.map((s) => s.stage).filter(Boolean));

    return {
      id: playbook.id,
      name: playbook.name,
      stepCount: steps.length,
      hubCount: hubsInMission.length,
      stageCount: stagesInMission.length,
      totalRewardWei: totalReward.toString(),
      totalRewardEther: ethers.formatEther(totalReward || 0n),
      hubs: hubsInMission,
      stages: stagesInMission
    };
  });

  const totalRewardWei = missions.reduce(
    (acc, mission) => acc + toBigInt(mission.totalRewardWei),
    0n
  );

  res.json({
    network: meshCfg.network,
    hubCount: Object.keys(hubs).length,
    missionCount: playbooks.length,
    totalRewardWei: totalRewardWei.toString(),
    totalRewardEther: ethers.formatEther(totalRewardWei || 0n),
    missions,
    hubs: Object.entries(hubs).map(([id, hub]) => ({
      id,
      label: hub.label,
      moduleCount: Object.keys(hub.addresses || {}).length
    })),
    updatedAt: new Date().toISOString()
  });
});

app.post("/mesh/:hub/tx/create", (req, res) => {
  const hub = getHub(req.params.hub);
  const { rewardWei, uri } = req.body as { rewardWei: string; uri: string };
  const nowSec = Math.floor(Date.now() / 1000);
  const defaultDeadline = nowSec + 7 * 24 * 3600;
  const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri || ""));
  const data = enc(jobAbi, "createJob", [rewardWei, defaultDeadline, specHash, uri]);
  res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
});

app.post("/mesh/:hub/tx/stake", (req, res) => {
  const hub = getHub(req.params.hub);
  const { role, amountWei } = req.body as { role: number; amountWei: string };
  const data = enc(stakeAbi, "depositStake", [role, amountWei]);
  res.json({ tx: { to: hub.addresses.StakeManager, data, value: 0 } });
});

app.post("/mesh/:hub/tx/commit", (req, res) => {
  const hub = getHub(req.params.hub);
  const { jobId, commitHash, subdomain, proof } = req.body as {
    jobId: number;
    commitHash: string;
    subdomain?: string;
    proof?: string[];
  };
  const data = enc(valAbi, "commitValidation", [
    jobId,
    commitHash,
    subdomain || "validator",
    proof || []
  ]);
  res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
});

app.post("/mesh/:hub/tx/reveal", (req, res) => {
  const hub = getHub(req.params.hub);
  const { jobId, approve, salt } = req.body as {
    jobId: number;
    approve: boolean;
    salt: string;
  };
  const data = enc(valAbi, "revealValidation", [jobId, !!approve, salt]);
  res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
});

app.post("/mesh/:hub/tx/finalize", (req, res) => {
  const hub = getHub(req.params.hub);
  const { jobId } = req.body as { jobId: number };
  const data = enc(valAbi, "finalize", [jobId]);
  res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
});

app.post("/mesh/:hub/tx/dispute", (req, res) => {
  const hub = getHub(req.params.hub);
  const { jobId, evidence } = req.body as { jobId: number; evidence?: string };
  const data = enc(dispAbi, "raiseDispute", [jobId, evidence || ""]);
  res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
});

app.post("/mesh/:hub/tx/allowlist", (req, res) => {
  const hub = getHub(req.params.hub);
  const { role, addr } = req.body as { role: number; addr: string };
  const fnName = role === 0 ? "addAdditionalAgent" : "addAdditionalValidator";
  const data = enc(idAbi, fnName, [addr]);
  res.json({ tx: { to: hub.addresses.IdentityRegistry, data, value: 0 } });
});

app.post("/mesh/plan/instantiate", (req, res) => {
  const { playbookId } = req.body as { playbookId: string };
  const playbook = playbooks.find((p: { id: string }) => p.id === playbookId);
  if (!playbook) {
    return res.status(404).json({ error: "Unknown playbook" });
  }
  const now = Math.floor(Date.now() / 1000);
  const txs = playbook.steps.map((step: any) => {
    const [, hubId] = String(step.hub).split("@");
    const hub = getHub(hubId);
    const deadline = now + 7 * 24 * 3600;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(step.uri || ""));
    return {
      hub: hubId,
      to: hub.addresses.JobRegistry,
      data: enc(jobAbi, "createJob", [step.rewardWei, deadline, specHash, step.uri]),
      value: 0
    };
  });
  res.json({ txs });
});

const PORT = Number(process.env.SOVEREIGN_MESH_PORT || 8084);
app.listen(PORT, () => {
  console.log(`[Sovereign Mesh] server listening on port ${PORT}`);
});
