/// <reference path="./ownerAtlas.d.ts" />

import express from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

// @ts-ignore — shared module is published as runtime ESM without TypeScript declarations
import { buildOwnerAtlas as untypedBuildOwnerAtlas } from "../shared/ownerAtlas.mjs";

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

type UiConfig = {
  network: string;
  etherscanBase: string;
  defaultSubgraphUrl?: string;
  orchestratorBase?: string;
  hubs: string[];
  explorers?: Record<string, string>;
};

type OwnerAtlasLib = {
  buildOwnerAtlas: (hubs: Record<string, HubConfig>, ui: UiConfig) => { atlas: any[] };
};

const buildOwnerAtlas = untypedBuildOwnerAtlas as OwnerAtlasLib["buildOwnerAtlas"];

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

const iface = (abi: string[]) => new ethers.Interface(abi);
const encode = (abi: string[], fn: string, args: any[]) => iface(abi).encodeFunctionData(fn, args);

function getHub(id: string): HubConfig {
  const hub = hubs[id];
  if (!hub) {
    throw new Error(`Unknown hub: ${id}`);
  }
  return hub;
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

const app = express();
app.use(express.json());

app.get("/constellation/config", (_req, res) => res.json(uiConfig));
app.get("/constellation/hubs", (_req, res) => res.json({ hubs }));
app.get("/constellation/playbooks", (_req, res) => res.json(playbooks));
app.get("/constellation/actors", (_req, res) => res.json(actors));
app.get("/constellation/owner/atlas", (_req, res) => res.json(buildOwnerAtlas(hubs, uiConfig)));

app.post("/constellation/:hub/tx/create", (req, res) => {
  const hub = getHub(req.params.hub);
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
  const hub = getHub(req.params.hub);
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
  const hub = getHub(req.params.hub);
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
  const hub = getHub(req.params.hub);
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
  const hub = getHub(req.params.hub);
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
  const hub = getHub(req.params.hub);
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
  const hub = getHub(req.params.hub);
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
  const hub = getHub(req.params.hub);
  const { action } = req.body ?? {};
  const fn = action === "unpause" ? "unpause" : "pause";
  const tx = serializeTx(hub, {
    to: hub.addresses.SystemPause ?? hub.addresses.JobRegistry,
    data: encode(pauseAbi, fn, []),
    value: 0
  });
  return res.json({ tx });
});

app.post("/constellation/plan/instantiate", (req, res) => {
  const { playbookId } = req.body ?? {};
  if (!playbookId) {
    return res.status(400).json({ error: "playbookId is required" });
  }
  const pb = playbooks.find((p) => p.id === playbookId);
  if (!pb) {
    return res.status(404).json({ error: "Unknown playbook" });
  }
  const now = Math.floor(Date.now() / 1000);
  const txs = pb.steps.map((step: any, index: number) => {
    const [, hubId] = String(step.hub).split("@");
    if (!hubId) {
      throw new Error(`Invalid hub step: ${step.hub}`);
    }
    const hub = getHub(hubId);
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

const PORT = process.env.SOVEREIGN_CONSTELLATION_PORT ? Number(process.env.SOVEREIGN_CONSTELLATION_PORT) : 8090;
app.listen(PORT, () => {
  console.log(`[Sovereign Constellation] server listening on port ${PORT}`);
});
