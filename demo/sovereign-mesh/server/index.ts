import cors from "cors";
import express from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

type HubConfig = {
  label: string;
  rpcUrl: string;
  subgraphUrl?: string;
  addresses: Record<string, string>;
};

type MeshConfig = {
  network: string;
  etherscanBase: string;
  defaultSubgraphUrl: string;
  orchestratorBase: string;
  hubs: string[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

const readJson = <T>(relativePath: string): T => {
  const fullPath = path.join(root, relativePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as T;
};

const meshCfg = readJson<MeshConfig>("config/mesh.ui.config.json");
const hubs = readJson<Record<string, HubConfig>>("config/hubs.mainnet.json");
const playbooks = readJson<any[]>("config/playbooks.json");
const actors = readJson<any[]>("config/actors.json");

const jobAbi = [
  "function createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri) returns (uint256)"
];
const stakeAbi = ["function depositStake(uint8 role, uint256 amount)"];
const validationAbi = [
  "function commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)",
  "function revealValidation(uint256 jobId, bool approve, bytes32 burnTxHash, bytes32 salt, string subdomain, bytes32[] proof)",
  "function finalize(uint256 jobId)"
];
const validationReadAbi = [
  "function jobNonce(uint256 jobId) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)"
];
const jobReadAbi = ["function getSpecHash(uint256 jobId) view returns (bytes32)"];
const disputeAbi = ["function raiseDispute(uint256 jobId, string evidence)"];
const identityAbi = [
  "function addAdditionalAgent(address)",
  "function addAdditionalValidator(address)"
];

const buildInterface = (abi: string[]) => new ethers.Interface(abi);
const encodeCall = (abi: string[], fn: string, args: unknown[]) =>
  buildInterface(abi).encodeFunctionData(fn, args);

const getHub = (id: string): HubConfig => {
  const hub = hubs[id];
  if (!hub) {
    throw new Error(`Unknown hub: ${id}`);
  }
  return hub;
};

const providerCache = new Map<string, ethers.JsonRpcProvider>();
const readerCache = new Map<
  string,
  { validation: ethers.Contract; job: ethers.Contract }
>();

const getProviderForHub = (hubId: string, hub: HubConfig) => {
  if (!providerCache.has(hubId)) {
    if (!hub.rpcUrl) {
      throw new Error(`Hub ${hubId} is missing an rpcUrl`);
    }
    providerCache.set(hubId, new ethers.JsonRpcProvider(hub.rpcUrl));
  }
  return providerCache.get(hubId)!;
};

const getReadersForHub = (hubId: string, hub: HubConfig) => {
  if (!readerCache.has(hubId)) {
    const provider = getProviderForHub(hubId, hub);
    const validation = new ethers.Contract(
      hub.addresses.ValidationModule,
      validationReadAbi,
      provider
    );
    const job = new ethers.Contract(
      hub.addresses.JobRegistry,
      jobReadAbi,
      provider
    );
    readerCache.set(hubId, { validation, job });
  }
  return readerCache.get(hubId)!;
};

const makeCreateJobTx = (hub: HubConfig, rewardWei: string, uri: string) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const deadline = nowSec + 7 * 24 * 60 * 60;
  const specHash = ethers.keccak256(ethers.toUtf8Bytes(uri ?? ""));
  const data = encodeCall(jobAbi, "createJob", [rewardWei, deadline, specHash, uri]);
  return { to: hub.addresses.JobRegistry, data, value: 0 };
};

const app = express();
app.use(cors());
app.use(express.json());

app.get("/mesh/hubs", (_req, res) => {
  res.json({ hubs });
});

app.get("/mesh/actors", (_req, res) => {
  res.json(actors);
});

app.get("/mesh/playbooks", (_req, res) => {
  res.json(playbooks);
});

app.get("/mesh/config", (_req, res) => {
  res.json(meshCfg);
});

app.post("/mesh/:hub/tx/create", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { rewardWei, uri } = req.body ?? {};
    if (!rewardWei || !uri) {
      return res.status(400).json({ error: "rewardWei and uri are required" });
    }
    const tx = makeCreateJobTx(hub, String(rewardWei), String(uri));
    res.json({ tx });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/stake", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, amountWei } = req.body ?? {};
    if (role === undefined || amountWei === undefined) {
      return res.status(400).json({ error: "role and amountWei are required" });
    }
    const data = encodeCall(stakeAbi, "depositStake", [Number(role), amountWei]);
    res.json({ tx: { to: hub.addresses.StakeManager, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/commit", async (req, res) => {
  try {
    const hubId = req.params.hub;
    const hub = getHub(hubId);
    const { jobId, approve, salt, validator, subdomain, proof } = req.body ?? {};
    if (jobId === undefined) {
      return res.status(400).json({ error: "jobId is required" });
    }
    if (approve === undefined) {
      return res.status(400).json({ error: "approve is required" });
    }
    if (!salt || !ethers.isHexString(salt, 32)) {
      return res.status(400).json({ error: "salt must be a 32-byte hex string" });
    }
    if (!validator) {
      return res.status(400).json({ error: "validator address is required" });
    }
    const validatorAddr = ethers.getAddress(String(validator));
    const readers = getReadersForHub(hubId, hub);
    const provider = getProviderForHub(hubId, hub);
    const jobBigInt = BigInt(jobId);
    const nonce = await readers.validation.jobNonce(jobBigInt);
    const specHash = await readers.job.getSpecHash(jobBigInt);
    const burnTx = ethers.ZeroHash;
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const outcomeHash = ethers.keccak256(
      coder.encode(
        ["uint256", "bytes32", "bool", "bytes32"],
        [nonce, specHash, Boolean(approve), burnTx]
      )
    );
    const domain = await readers.validation.DOMAIN_SEPARATOR();
    const network = await provider.getNetwork();
    const commitHash = ethers.keccak256(
      coder.encode(
        ["uint256", "bytes32", "bytes32", "address", "uint256", "bytes32"],
        [
          jobBigInt,
          outcomeHash,
          salt,
          validatorAddr,
          BigInt(network.chainId),
          domain
        ]
      )
    );
    const data = encodeCall(validationAbi, "commitValidation", [
      Number(jobId),
      commitHash,
      subdomain ?? "validator",
      Array.isArray(proof) ? proof : []
    ]);
    res.json({
      tx: { to: hub.addresses.ValidationModule, data, value: 0 },
      commitHash
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/reveal", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, approve, salt, subdomain, proof } = req.body ?? {};
    if (jobId === undefined || salt === undefined) {
      return res.status(400).json({ error: "jobId and salt are required" });
    }
    const data = encodeCall(validationAbi, "revealValidation", [
      Number(jobId),
      Boolean(approve),
      ethers.ZeroHash,
      salt,
      subdomain ?? "validator",
      Array.isArray(proof) ? proof : []
    ]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/finalize", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId } = req.body ?? {};
    if (jobId === undefined) {
      return res.status(400).json({ error: "jobId is required" });
    }
    const data = encodeCall(validationAbi, "finalize", [Number(jobId)]);
    res.json({ tx: { to: hub.addresses.ValidationModule, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/dispute", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { jobId, evidence } = req.body ?? {};
    if (jobId === undefined) {
      return res.status(400).json({ error: "jobId is required" });
    }
    const data = encodeCall(disputeAbi, "raiseDispute", [Number(jobId), evidence ?? ""]);
    res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/:hub/tx/allowlist", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const { role, addr } = req.body ?? {};
    if (addr === undefined) {
      return res.status(400).json({ error: "addr is required" });
    }
    const fn = Number(role) === 0 ? "addAdditionalAgent" : "addAdditionalValidator";
    const data = encodeCall(identityAbi, fn, [addr]);
    res.json({ tx: { to: hub.addresses.IdentityRegistry, data, value: 0 } });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/mesh/plan/instantiate", (req, res) => {
  try {
    const { playbookId } = req.body ?? {};
    if (!playbookId) {
      return res.status(400).json({ error: "playbookId is required" });
    }
    const playbook = playbooks.find((pb) => pb.id === playbookId);
    if (!playbook) {
      return res.status(404).json({ error: "Unknown playbook" });
    }
    const txs = playbook.steps.map((step: any) => {
      const [_, hubId] = String(step.hub).split("@");
      const hub = getHub(hubId);
      return {
        hub: hubId,
        ...makeCreateJobTx(hub, String(step.rewardWei), String(step.uri))
      };
    });
    res.json({ txs });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

const PORT = Number(process.env.SOVEREIGN_MESH_PORT ?? 8084);
app.listen(PORT, () => {
  console.log(`[Sovereign Mesh] server listening on port ${PORT}`);
});
