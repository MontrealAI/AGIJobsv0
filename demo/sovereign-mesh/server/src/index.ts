import cors from "cors";
import express, { Request, Response } from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
  description?: string;
  steps: Array<{
    hub: string;
    rewardWei: string;
    uri: string;
  }>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../");

const meshCfg: MeshConfig = JSON.parse(
  readFileSync(path.join(root, "config/mesh.ui.config.json"), "utf8")
);
const hubs: Record<string, HubConfig> = JSON.parse(
  readFileSync(path.join(root, "config/hubs.mainnet.json"), "utf8")
);
const playbooks: Playbook[] = JSON.parse(
  readFileSync(path.join(root, "config/playbooks.json"), "utf8")
);
const actors: unknown[] = JSON.parse(
  readFileSync(path.join(root, "config/actors.json"), "utf8")
);

const jobIface = new ethers.Interface([
  "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
]);
const stakeIface = new ethers.Interface([
  "function depositStake(uint8 role, uint256 amount)"
]);
const validationIface = new ethers.Interface([
  "function commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)",
  "function revealValidation(uint256 jobId, bool approve, bytes32 salt)",
  "function finalize(uint256 jobId)"
]);
const disputeIface = new ethers.Interface([
  "function raiseDispute(uint256 jobId, string evidence)"
]);
const identityIface = new ethers.Interface([
  "function addAdditionalAgent(address)",
  "function addAdditionalValidator(address)"
]);

type TransactionDescriptor = {
  to: string;
  data: string;
  value: number | string;
};

const app = express();
app.use(cors());
app.use(express.json());

const getHub = (key: string): HubConfig => {
  const hub = hubs[key];
  if (!hub) {
    throw new Error(`Unknown hub: ${key}`);
  }
  return hub;
};

const encode = (iface: ethers.Interface, fn: string, args: unknown[]): string =>
  iface.encodeFunctionData(fn, args);

// healthcheck for monitoring
app.get("/mesh/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", network: meshCfg.network, hubs: meshCfg.hubs.length });
});

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
  const hub = getHub(req.params.hub);
  const { rewardWei, uri } = req.body as { rewardWei: string; uri: string };
  if (!rewardWei || !uri) {
    return res.status(400).json({ error: "rewardWei and uri are required" });
  }
  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
  const data = encode(jobIface, "createJob", [rewardWei, deadline, specHash, uri]);
  const tx: TransactionDescriptor = {
    to: hub.addresses.JobRegistry,
    data,
    value: 0
  };
  res.json({ tx });
});

app.post("/mesh/:hub/tx/stake", (req, res) => {
  const hub = getHub(req.params.hub);
  const { role, amountWei } = req.body as { role: number; amountWei: string };
  if (role === undefined || !amountWei) {
    return res.status(400).json({ error: "role and amountWei are required" });
  }
  const data = encode(stakeIface, "depositStake", [role, amountWei]);
  res.json({
    tx: {
      to: hub.addresses.StakeManager,
      data,
      value: 0
    }
  });
});

app.post("/mesh/:hub/tx/commit", (req, res) => {
  const hub = getHub(req.params.hub);
  const { jobId, commitHash, subdomain, proof } = req.body as {
    jobId: number;
    commitHash: string;
    subdomain?: string;
    proof?: string[];
  };
  if (jobId === undefined || !commitHash) {
    return res.status(400).json({ error: "jobId and commitHash are required" });
  }
  const data = encode(validationIface, "commitValidation", [
    jobId,
    commitHash,
    subdomain ?? "validator",
    proof ?? []
  ]);
  res.json({
    tx: {
      to: hub.addresses.ValidationModule,
      data,
      value: 0
    }
  });
});

app.post("/mesh/:hub/tx/reveal", (req, res) => {
  const hub = getHub(req.params.hub);
  const { jobId, approve, salt } = req.body as {
    jobId: number;
    approve: boolean;
    salt: string;
  };
  if (jobId === undefined || salt === undefined) {
    return res.status(400).json({ error: "jobId and salt are required" });
  }
  const data = encode(validationIface, "revealValidation", [jobId, !!approve, salt]);
  res.json({
    tx: {
      to: hub.addresses.ValidationModule,
      data,
      value: 0
    }
  });
});

app.post("/mesh/:hub/tx/finalize", (req, res) => {
  const hub = getHub(req.params.hub);
  const { jobId } = req.body as { jobId: number };
  if (jobId === undefined) {
    return res.status(400).json({ error: "jobId is required" });
  }
  const data = encode(validationIface, "finalize", [jobId]);
  res.json({
    tx: {
      to: hub.addresses.ValidationModule,
      data,
      value: 0
    }
  });
});

app.post("/mesh/:hub/tx/dispute", (req, res) => {
  const hub = getHub(req.params.hub);
  const { jobId, evidence } = req.body as { jobId: number; evidence?: string };
  if (jobId === undefined) {
    return res.status(400).json({ error: "jobId is required" });
  }
  const data = encode(disputeIface, "raiseDispute", [jobId, evidence ?? ""]);
  res.json({
    tx: {
      to: hub.addresses.JobRegistry,
      data,
      value: 0
    }
  });
});

app.post("/mesh/:hub/tx/allowlist", (req, res) => {
  const hub = getHub(req.params.hub);
  const { role, addr } = req.body as { role: number; addr: string };
  if (!addr) {
    return res.status(400).json({ error: "addr is required" });
  }
  const fn = role === 0 ? "addAdditionalAgent" : "addAdditionalValidator";
  const data = encode(identityIface, fn, [addr]);
  res.json({
    tx: {
      to: hub.addresses.IdentityRegistry,
      data,
      value: 0
    }
  });
});

app.post("/mesh/plan/instantiate", (req, res) => {
  const { playbookId } = req.body as { playbookId: string };
  const playbook = playbooks.find((pb) => pb.id === playbookId);
  if (!playbook) {
    return res.status(404).json({ error: "Unknown playbook" });
  }
  const txs = playbook.steps.map((step) => {
    const [_, hubKey] = step.hub.split("@");
    const hub = getHub(hubKey);
    const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(step.uri));
    return {
      hub: hubKey,
      to: hub.addresses.JobRegistry,
      data: encode(jobIface, "createJob", [step.rewardWei, deadline, specHash, step.uri]),
      value: 0
    };
  });
  res.json({ txs });
});

const PORT = Number(process.env.SOVEREIGN_MESH_PORT ?? 8084);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Sovereign Mesh orchestrator listening on :${PORT}`);
});
