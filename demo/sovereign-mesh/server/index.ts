import express from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

type MeshConfig = {
  orchestratorBase: string;
  network: string;
  etherscanBase: string;
  defaultSubgraphUrl: string;
  hubs: string[];
};

type HubConfig = {
  label: string;
  rpcUrl?: string;
  subgraphUrl?: string;
  addresses: Record<string, string>;
};

type MissionPlaybook = {
  id: string;
  name: string;
  summary?: string;
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

function readJson<T>(relative: string): T {
  const filePath = path.join(root, relative);
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

const meshConfig = readJson<MeshConfig>("config/mesh.ui.config.json");
const hubsConfig = readJson<Record<string, HubConfig>>("config/hubs.mainnet.json");
const playbooks = readJson<MissionPlaybook[]>("config/playbooks.json");
const actors = readJson<Actor[]>("config/actors.json");

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

const app = express();
app.use(express.json());

const encoder = (abi: string[]) => new ethers.Interface(abi);

function getHub(hubId: string): HubConfig {
  const hub = hubsConfig[hubId];
  if (!hub) {
    throw new Error(`Unknown hub: ${hubId}`);
  }
  return hub;
}

app.get("/mesh/config", (_req, res) => {
  res.json(meshConfig);
});

app.get("/mesh/hubs", (_req, res) => {
  res.json({ hubs: hubsConfig });
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
    const { rewardWei, uri } = req.body as { rewardWei: string; uri: string };
    if (!rewardWei || !uri) {
      return res.status(400).json({ error: "rewardWei and uri are required" });
    }
    const now = Math.floor(Date.now() / 1000);
    const deadline = now + 7 * 24 * 3600;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    const data = encoder(jobAbi).encodeFunctionData("createJob", [rewardWei, deadline, specHash, uri]);
    res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/stake", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, amountWei } = req.body as { role: number; amountWei: string };
    if (typeof role !== "number" || !amountWei) {
      return res.status(400).json({ error: "role and amountWei are required" });
    }
    const data = encoder(stakeAbi).encodeFunctionData("depositStake", [role, amountWei]);
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
    if (typeof jobId !== "number" || !commitHash) {
      return res.status(400).json({ error: "jobId and commitHash are required" });
    }
    const data = encoder(validationAbi).encodeFunctionData("commitValidation", [
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
    const { jobId, approve, salt } = req.body as {
      jobId: number;
      approve: boolean;
      salt: string;
    };
    if (typeof jobId !== "number" || typeof approve !== "boolean" || !salt) {
      return res.status(400).json({ error: "jobId, approve, and salt are required" });
    }
    const data = encoder(validationAbi).encodeFunctionData("revealValidation", [jobId, approve, salt]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/finalize", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId } = req.body as { jobId: number };
    if (typeof jobId !== "number") {
      return res.status(400).json({ error: "jobId is required" });
    }
    const data = encoder(validationAbi).encodeFunctionData("finalize", [jobId]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/dispute", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, evidence } = req.body as { jobId: number; evidence?: string };
    if (typeof jobId !== "number") {
      return res.status(400).json({ error: "jobId is required" });
    }
    const data = encoder(disputeAbi).encodeFunctionData("raiseDispute", [jobId, evidence ?? ""]);
    res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/allowlist", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, addr } = req.body as { role: number; addr: string };
    if (typeof role !== "number" || !addr) {
      return res.status(400).json({ error: "role and addr are required" });
    }
    const fn = role === 0 ? "addAdditionalAgent" : "addAdditionalValidator";
    const data = encoder(identityAbi).encodeFunctionData(fn, [addr]);
    res.json({ tx: { to: hub.addresses.IdentityRegistry, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/plan/instantiate", (req, res) => {
  try {
    const { playbookId } = req.body as { playbookId: string };
    if (!playbookId) {
      return res.status(400).json({ error: "playbookId is required" });
    }
    const playbook = playbooks.find((p) => p.id === playbookId);
    if (!playbook) {
      return res.status(404).json({ error: "Unknown playbook" });
    }
    const now = Math.floor(Date.now() / 1000);
    const deadline = now + 7 * 24 * 3600;
    const iface = encoder(jobAbi);
    const txs = playbook.steps.map((step) => {
      const [, hubId] = step.hub.split("@");
      const hub = getHub(hubId);
      const specHash = ethers.keccak256(ethers.toUtf8Bytes(step.uri));
      const data = iface.encodeFunctionData("createJob", [step.rewardWei, deadline, specHash, step.uri]);
      return {
        hub: hubId,
        to: hub.addresses.JobRegistry,
        data,
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
  // eslint-disable-next-line no-console
  console.log(`[Sovereign Mesh] orchestrator listening on ${PORT}`);
});
