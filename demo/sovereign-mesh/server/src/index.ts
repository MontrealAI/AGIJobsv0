import express from "express";
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

type HubsMap = Record<string, HubConfig>;

type MissionStep = {
  hub: string;
  rewardWei: string;
  uri: string;
};

type Playbook = {
  id: string;
  name: string;
  steps: MissionStep[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "../..");

const meshCfg: MeshConfig = JSON.parse(
  readFileSync(path.join(root, "config/mesh.ui.config.json"), "utf8"),
);
const hubs: HubsMap = JSON.parse(
  readFileSync(path.join(root, "config/hubs.mainnet.json"), "utf8"),
);
const playbooks: Playbook[] = JSON.parse(
  readFileSync(path.join(root, "config/playbooks.json"), "utf8"),
);
const actors = JSON.parse(
  readFileSync(path.join(root, "config/actors.json"), "utf8"),
);

const jobAbi = [
  "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)",
];
const stakeAbi = ["function depositStake(uint8 role, uint256 amount)"];
const validationAbi = [
  "function commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)",
  "function revealValidation(uint256 jobId, bool approve, bytes32 salt)",
  "function finalize(uint256 jobId)",
];
const disputeAbi = [
  "function raiseDispute(uint256 jobId, string evidence)",
];
const identityAbi = [
  "function addAdditionalAgent(address)",
  "function addAdditionalValidator(address)",
];

const iface = (abi: string[]) => new ethers.Interface(abi);
const encode = (abi: string[], fn: string, args: unknown[]) =>
  iface(abi).encodeFunctionData(fn, args);

const getHub = (id: string): HubConfig => {
  const hub = hubs[id];
  if (!hub) {
    throw new Error(`Unknown hub: ${id}`);
  }
  return hub;
};

const app = express();
app.use(express.json({ limit: "1mb" }));

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
    const { rewardWei, uri } = req.body as {
      rewardWei: string;
      uri: string;
    };
    if (!rewardWei || !uri) {
      return res.status(400).json({ error: "Missing rewardWei or uri" });
    }
    const now = Math.floor(Date.now() / 1000);
    const defaultDeadline = now + 7 * 24 * 60 * 60;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri));
    const data = encode(jobAbi, "createJob", [
      rewardWei,
      defaultDeadline,
      specHash,
      uri,
    ]);
    res.json({
      tx: {
        to: hub.addresses.JobRegistry,
        data,
        value: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/stake", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, amountWei } = req.body as {
      role: number;
      amountWei: string;
    };
    const data = encode(stakeAbi, "depositStake", [role, amountWei]);
    res.json({
      tx: {
        to: hub.addresses.StakeManager,
        data,
        value: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    const data = encode(validationAbi, "commitValidation", [
      jobId,
      commitHash,
      subdomain ?? "validator",
      proof ?? [],
    ]);
    res.json({
      tx: {
        to: hub.addresses.ValidationModule,
        data,
        value: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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
    const data = encode(validationAbi, "revealValidation", [
      jobId,
      !!approve,
      salt,
    ]);
    res.json({
      tx: {
        to: hub.addresses.ValidationModule,
        data,
        value: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/finalize", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId } = req.body as { jobId: number };
    const data = encode(validationAbi, "finalize", [jobId]);
    res.json({
      tx: {
        to: hub.addresses.ValidationModule,
        data,
        value: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/dispute", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, evidence } = req.body as {
      jobId: number;
      evidence?: string;
    };
    const data = encode(disputeAbi, "raiseDispute", [jobId, evidence ?? ""]);
    res.json({
      tx: {
        to: hub.addresses.JobRegistry,
        data,
        value: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/mesh/:hub/tx/allowlist", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, addr } = req.body as { role: number; addr: string };
    const fn = role === 0 ? "addAdditionalAgent" : "addAdditionalValidator";
    const data = encode(identityAbi, fn, [addr]);
    res.json({
      tx: {
        to: hub.addresses.IdentityRegistry,
        data,
        value: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/mesh/plan/instantiate", (req, res) => {
  try {
    const { playbookId } = req.body as { playbookId: string };
    const playbook = playbooks.find((pb) => pb.id === playbookId);
    if (!playbook) {
      return res.status(404).json({ error: "Unknown playbook" });
    }
    const now = Math.floor(Date.now() / 1000);
    const deadline = now + 7 * 24 * 60 * 60;
    const txs = playbook.steps.map((step) => {
      const [, hubId] = step.hub.split("@");
      const hub = getHub(hubId);
      const specHash = ethers.keccak256(ethers.toUtf8Bytes(step.uri));
      return {
        hub: hubId,
        to: hub.addresses.JobRegistry,
        data: encode(jobAbi, "createJob", [
          step.rewardWei,
          deadline,
          specHash,
          step.uri,
        ]),
        value: 0,
      };
    });
    res.json({ txs });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const port = Number(process.env.SOVEREIGN_MESH_PORT ?? 8084);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[Sovereign Mesh] orchestrator listening on :${port}`);
});
