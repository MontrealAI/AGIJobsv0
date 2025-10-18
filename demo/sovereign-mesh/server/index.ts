import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

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

type Playbook = {
  id: string;
  name: string;
  steps: Array<{
    hub: string;
    rewardWei: string;
    uri: string;
  }>;
};

type Actor = {
  id: string;
  flag: string;
  name: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

const meshCfg: MeshConfig = JSON.parse(
  readFileSync(path.join(root, "config/mesh.ui.config.json"), "utf8")
);
const hubs: Record<string, HubConfig> = JSON.parse(
  readFileSync(path.join(root, "config/hubs.mainnet.json"), "utf8")
);
const playbooks: Playbook[] = JSON.parse(
  readFileSync(path.join(root, "config/playbooks.json"), "utf8")
);
const actors: Actor[] = JSON.parse(
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
const encode = (abi: string[], method: string, args: unknown[]) =>
  iface(abi).encodeFunctionData(method, args);

const getHub = (hubId: string): HubConfig => {
  const hub = hubs[hubId];
  if (!hub) {
    throw new Error(`Unknown hub: ${hubId}`);
  }
  return hub;
};

const app = express();
app.use(express.json());

app.get("/mesh/config", (_req, res) => {
  res.json(meshCfg);
});

app.get("/mesh/hubs", (_req, res) => {
  res.json({ hubs });
});

app.get("/mesh/actors", (_req, res) => {
  res.json(actors);
});

app.get("/mesh/playbooks", (_req, res) => {
  res.json(playbooks);
});

app.post("/mesh/:hub/tx/create", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { rewardWei, uri } = req.body ?? {};
    if (!rewardWei || typeof rewardWei !== "string") {
      return res.status(400).json({ error: "rewardWei (string) is required" });
    }
    if (!uri || typeof uri !== "string") {
      return res.status(400).json({ error: "uri (string) is required" });
    }
    const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    const data = encode(jobAbi, "createJob", [rewardWei, deadline, specHash, uri]);
    res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/stake", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, amountWei } = req.body ?? {};
    if (typeof role !== "number") {
      return res.status(400).json({ error: "role (number) is required" });
    }
    if (!amountWei || typeof amountWei !== "string") {
      return res.status(400).json({ error: "amountWei (string) is required" });
    }
    const data = encode(stakeAbi, "depositStake", [role, amountWei]);
    res.json({ tx: { to: hub.addresses.StakeManager, data, value: 0 } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/commit", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, commitHash, subdomain, proof } = req.body ?? {};
    if (typeof jobId !== "number") {
      return res.status(400).json({ error: "jobId (number) is required" });
    }
    if (!commitHash || typeof commitHash !== "string") {
      return res.status(400).json({ error: "commitHash (string) is required" });
    }
    const data = encode(valAbi, "commitValidation", [
      jobId,
      commitHash,
      typeof subdomain === "string" && subdomain.length > 0 ? subdomain : "validator",
      Array.isArray(proof) ? proof : []
    ]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/reveal", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, approve, salt } = req.body ?? {};
    if (typeof jobId !== "number") {
      return res.status(400).json({ error: "jobId (number) is required" });
    }
    if (typeof approve !== "boolean") {
      return res.status(400).json({ error: "approve (boolean) is required" });
    }
    if (!salt || typeof salt !== "string") {
      return res.status(400).json({ error: "salt (string) is required" });
    }
    const data = encode(valAbi, "revealValidation", [jobId, approve, salt]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/finalize", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId } = req.body ?? {};
    if (typeof jobId !== "number") {
      return res.status(400).json({ error: "jobId (number) is required" });
    }
    const data = encode(valAbi, "finalize", [jobId]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/dispute", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, evidence } = req.body ?? {};
    if (typeof jobId !== "number") {
      return res.status(400).json({ error: "jobId (number) is required" });
    }
    const data = encode(dispAbi, "raiseDispute", [jobId, typeof evidence === "string" ? evidence : ""]);
    res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/allowlist", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, addr } = req.body ?? {};
    if (typeof role !== "number") {
      return res.status(400).json({ error: "role (number) is required" });
    }
    if (!addr || typeof addr !== "string") {
      return res.status(400).json({ error: "addr (string) is required" });
    }
    const fnName = role === 0 ? "addAdditionalAgent" : "addAdditionalValidator";
    const data = encode(idAbi, fnName, [addr]);
    res.json({ tx: { to: hub.addresses.IdentityRegistry, data, value: 0 } });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post("/mesh/plan/instantiate", (req, res) => {
  try {
    const { playbookId } = req.body ?? {};
    if (!playbookId || typeof playbookId !== "string") {
      return res.status(400).json({ error: "playbookId (string) is required" });
    }
    const playbook = playbooks.find((pb) => pb.id === playbookId);
    if (!playbook) {
      return res.status(404).json({ error: "Unknown playbook" });
    }
    const now = Math.floor(Date.now() / 1000);
    const txs = playbook.steps.map((step) => {
      const [, hubId] = step.hub.split("@");
      const hub = getHub(hubId);
      const deadline = now + 7 * 24 * 60 * 60;
      const specHash = ethers.keccak256(ethers.toUtf8Bytes(step.uri));
      return {
        hub: hubId,
        to: hub.addresses.JobRegistry,
        data: encode(jobAbi, "createJob", [step.rewardWei, deadline, specHash, step.uri]),
        value: 0
      };
    });
    res.json({ txs });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const PORT = Number(process.env.SOVEREIGN_MESH_PORT ?? 8084);

app.listen(PORT, () => {
  console.log(`[Sovereign Mesh] server listening on port ${PORT}`);
});
