import express from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..", "..");

const load = (rel: string) => JSON.parse(readFileSync(path.join(root, "config", rel), "utf8"));

const meshCfg = load("mesh.ui.config.json");
const hubs = load("hubs.mainnet.json");
const playbooks = load("playbooks.json");
const actors = load("actors.json");

type Hub = {
  label: string;
  rpcUrl: string;
  subgraphUrl?: string;
  addresses: Record<string, string>;
};

type HubMap = Record<string, Hub>;

const jobAbi = [
  "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
];
const stakeAbi = [
  "function depositStake(uint8 role, uint256 amount)"
];
const valAbi = [
  "function commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)",
  "function revealValidation(uint256 jobId, bool approve, bytes32 salt)",
  "function finalize(uint256 jobId)"
];
const dispAbi = [
  "function raiseDispute(uint256 jobId, string evidence)"
];
const idAbi = [
  "function addAdditionalAgent(address)",
  "function addAdditionalValidator(address)"
];

const iface = (abi: string[]) => new ethers.Interface(abi);
const encode = (abi: string[], fn: string, args: unknown[]) => iface(abi).encodeFunctionData(fn, args);

const getHub = (id: string): Hub => {
  const hub = (hubs as HubMap)[id];
  if (!hub) {
    throw new Error(`Unknown hub: ${id}`);
  }
  return hub;
};

const app = express();
app.use(express.json());

app.get("/mesh/config", (_req, res) => res.json(meshCfg));
app.get("/mesh/hubs", (_req, res) => res.json({ hubs }));
app.get("/mesh/actors", (_req, res) => res.json(actors));
app.get("/mesh/playbooks", (_req, res) => res.json(playbooks));

app.post("/mesh/:hub/tx/create", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { rewardWei, uri } = req.body as { rewardWei: string; uri: string };
    const nowSec = Math.floor(Date.now() / 1000);
    const deadline = nowSec + 7 * 24 * 60 * 60;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri ?? ""));
    const data = encode(jobAbi, "createJob", [rewardWei, deadline, specHash, uri]);
    res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/stake", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, amountWei } = req.body as { role: number; amountWei: string };
    const data = encode(stakeAbi, "depositStake", [role, amountWei]);
    res.json({ tx: { to: hub.addresses.StakeManager, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/commit", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, commitHash, subdomain, proof } = req.body as {
      jobId: number;
      commitHash: string;
      subdomain?: string;
      proof?: string[];
    };
    const data = encode(valAbi, "commitValidation", [
      jobId,
      commitHash,
      subdomain ?? "validator",
      proof ?? []
    ]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/reveal", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, approve, salt } = req.body as { jobId: number; approve: boolean; salt: string };
    const data = encode(valAbi, "revealValidation", [jobId, Boolean(approve), salt]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/finalize", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId } = req.body as { jobId: number };
    const data = encode(valAbi, "finalize", [jobId]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/dispute", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, evidence } = req.body as { jobId: number; evidence?: string };
    const data = encode(dispAbi, "raiseDispute", [jobId, evidence ?? ""]);
    res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/allowlist", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, addr } = req.body as { role: number; addr: string };
    const fn = role === 0 ? "addAdditionalAgent" : "addAdditionalValidator";
    const data = encode(idAbi, fn, [addr]);
    res.json({ tx: { to: hub.addresses.IdentityRegistry, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/plan/instantiate", (req, res) => {
  try {
    const { playbookId } = req.body as { playbookId: string };
    const pb = playbooks.find((p: any) => p.id === playbookId);
    if (!pb) {
      return res.status(404).json({ error: "Unknown playbook" });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const deadline = nowSec + 7 * 24 * 60 * 60;
    const txs = pb.steps.map((step: any) => {
      const [, hubId] = (step.hub as string).split("@");
      const hub = getHub(hubId);
      const specHash = ethers.keccak256(ethers.toUtf8Bytes(step.uri ?? ""));
      return {
        hub: hubId,
        to: hub.addresses.JobRegistry,
        data: encode(jobAbi, "createJob", [step.rewardWei, deadline, specHash, step.uri]),
        value: 0
      };
    });
    res.json({ txs });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

const PORT = Number(process.env.SOVEREIGN_MESH_PORT ?? 8084);
app.listen(PORT, () => {
  console.log(`[Sovereign Mesh] server listening on :${PORT}`);
});
