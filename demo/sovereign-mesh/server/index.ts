import express from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

function readJson(name: string) {
  const file = path.join(root, "config", name);
  return JSON.parse(readFileSync(file, "utf8"));
}

const meshCfg = readJson("mesh.ui.config.json");
const hubs: Record<string, any> = readJson("hubs.mainnet.json");
const playbooks: any[] = readJson("playbooks.json");
const actors: any[] = readJson("actors.json");

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
const enc = (abi: string[], fn: string, args: any[]) => iface(abi).encodeFunctionData(fn, args);

function getHub(id: string) {
  const hub = hubs[id];
  if (!hub) {
    throw new Error(`Unknown hub: ${id}`);
  }
  return hub;
}

const app = express();
app.use(express.json());

app.get("/mesh/config", (_req, res) => {
  res.json(meshCfg);
});

app.get("/mesh/hubs", (_req, res) => {
  res.json({ hubs });
});

app.get("/mesh/playbooks", (_req, res) => {
  res.json(playbooks);
});

app.get("/mesh/actors", (_req, res) => {
  res.json(actors);
});

app.post("/mesh/:hub/tx/create", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { rewardWei, uri } = req.body;
    const nowSec = Math.floor(Date.now() / 1000);
    const deadline = nowSec + 7 * 24 * 3600;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri || ""));
    const data = enc(jobAbi, "createJob", [rewardWei, deadline, specHash, uri]);
    res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/mesh/:hub/tx/stake", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, amountWei } = req.body;
    const data = enc(stakeAbi, "depositStake", [role, amountWei]);
    res.json({ tx: { to: hub.addresses.StakeManager, data, value: 0 } });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/mesh/:hub/tx/commit", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, commitHash, subdomain, proof } = req.body;
    const data = enc(valAbi, "commitValidation", [
      jobId,
      commitHash,
      subdomain || "validator",
      proof || []
    ]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/mesh/:hub/tx/reveal", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, approve, salt } = req.body;
    const data = enc(valAbi, "revealValidation", [jobId, !!approve, salt]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/mesh/:hub/tx/finalize", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId } = req.body;
    const data = enc(valAbi, "finalize", [jobId]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/mesh/:hub/tx/dispute", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, evidence } = req.body;
    const data = enc(dispAbi, "raiseDispute", [jobId, evidence || ""]);
    res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/mesh/:hub/tx/allowlist", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, addr } = req.body;
    const method = role === 0 ? "addAdditionalAgent" : "addAdditionalValidator";
    const data = enc(idAbi, method, [addr]);
    res.json({ tx: { to: hub.addresses.IdentityRegistry, data, value: 0 } });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/mesh/plan/instantiate", (req, res) => {
  try {
    const { playbookId } = req.body;
    const playbook = playbooks.find((p) => p.id === playbookId);
    if (!playbook) {
      return res.status(404).json({ error: "Unknown playbook" });
    }
    const txs = playbook.steps.map((step: any) => {
      const [, hubId] = step.hub.split("@");
      const hub = getHub(hubId);
      const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
      const specHash = ethers.keccak256(ethers.toUtf8Bytes(step.uri || ""));
      return {
        hub: hubId,
        to: hub.addresses.JobRegistry,
        data: enc(jobAbi, "createJob", [step.rewardWei, deadline, specHash, step.uri]),
        value: 0
      };
    });
    res.json({ txs });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = Number(process.env.SOVEREIGN_MESH_PORT || 8084);
app.listen(PORT, () => {
  console.log(`[Sovereign Mesh] orchestrator listening on ${PORT}`);
});
