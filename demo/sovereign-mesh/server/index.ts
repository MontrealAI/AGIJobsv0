import express from "express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

const meshCfg = JSON.parse(
  readFileSync(path.join(root, "config/mesh.ui.config.json"), "utf8")
);
const hubs = JSON.parse(
  readFileSync(path.join(root, "config/hubs.mainnet.json"), "utf8")
);
const playbooks = JSON.parse(
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
  "function finalize(uint256 jobId)",
  "function setCommitRevealWindows(uint256 commitWindow, uint256 revealWindow)",
  "function setValidatorsPerJob(uint256 count)",
  "function setApprovalThreshold(uint256 pct)"
];
const dispAbi = ["function raiseDispute(uint256 jobId, string evidence)"];
const idAbi = [
  "function addAdditionalAgent(address)",
  "function addAdditionalValidator(address)"
];
const idOwnerAbi = [
  "function setENS(address)",
  "function setNameWrapper(address)",
  "function setReputationEngine(address)",
  "function setAttestationRegistry(address)",
  "function setAgentRootNode(bytes32)",
  "function setClubRootNode(bytes32)",
  "function setNodeRootNode(bytes32)",
  "function setAgentMerkleRoot(bytes32)",
  "function setValidatorMerkleRoot(bytes32)"
];
const jobOwnerAbi = ["function pause()", "function unpause()"];
const stakeOwnerAbi = [
  "function setStakeRecommendations(uint256 newMin, uint256 newMax)",
  "function setUnbondingPeriod(uint256 newPeriod)",
  "function setFeePct(uint256 pct)",
  "function setBurnPct(uint256 pct)",
  "function setValidatorRewardPct(uint256 pct)"
];

const iface = (abi: string[]) => new ethers.Interface(abi);
const enc = (abi: string[], fn: string, args: unknown[]) =>
  iface(abi).encodeFunctionData(fn, args);
const getHub = (id: string) => {
  const hub = hubs[id];
  if (!hub) {
    throw new Error(`Unknown hub: ${id}`);
  }
  return hub;
};

const parseUint = (value: unknown, label: string): bigint | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  try {
    let normalized: string | number | bigint;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      normalized = trimmed;
    } else if (typeof value === "number" || typeof value === "bigint") {
      normalized = value;
    } else {
      throw new Error();
    }
    const parsed = BigInt(normalized);
    if (parsed < 0) {
      throw new Error(`${label} must be non-negative`);
    }
    return parsed;
  } catch (err) {
    throw new Error(`Invalid ${label}`);
  }
};

const parseAddress = (value: unknown, label: string): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string address`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return ethers.getAddress(trimmed);
  } catch (err) {
    throw new Error(`${label} must be a valid address`);
  }
};

const parseBytes32 = (value: unknown, label: string): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a hex string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const bytes = ethers.getBytes(trimmed);
    if (bytes.length !== 32) {
      throw new Error();
    }
    return ethers.hexlify(bytes);
  } catch (err) {
    throw new Error(`${label} must be a 32-byte hex value`);
  }
};

const app = express();
app.use(express.json());

app.get("/mesh/hubs", (_req, res) => res.json({ hubs }));
app.get("/mesh/actors", (_req, res) => res.json(actors));
app.get("/mesh/playbooks", (_req, res) => res.json(playbooks));
app.get("/mesh/config", (_req, res) => res.json(meshCfg));

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

app.post("/mesh/:hub/owner/pause", (req, res) => {
  const hub = getHub(req.params.hub);
  const data = enc(jobOwnerAbi, "pause", []);
  res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
});

app.post("/mesh/:hub/owner/unpause", (req, res) => {
  const hub = getHub(req.params.hub);
  const data = enc(jobOwnerAbi, "unpause", []);
  res.json({ tx: { to: hub.addresses.JobRegistry, data, value: 0 } });
});

app.post("/mesh/:hub/owner/validation", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const {
      validatorsPerJob,
      commitWindow,
      revealWindow,
      approvalPct
    } = req.body as {
      validatorsPerJob?: unknown;
      commitWindow?: unknown;
      revealWindow?: unknown;
      approvalPct?: unknown;
    };

    const validators = parseUint(validatorsPerJob, "validatorsPerJob");
    const commit = parseUint(commitWindow, "commitWindow");
    const reveal = parseUint(revealWindow, "revealWindow");
    const approval = parseUint(approvalPct, "approvalPct");

    const txs: { to: string; data: string; value: number }[] = [];
    if (validators !== undefined) {
      if (validators === 0n) {
        throw new Error("validatorsPerJob must be greater than 0");
      }
      txs.push({
        to: hub.addresses.ValidationModule,
        data: enc(valAbi, "setValidatorsPerJob", [validators]),
        value: 0
      });
    }
    if (commit !== undefined || reveal !== undefined) {
      if (commit === undefined || reveal === undefined) {
        throw new Error("Provide both commitWindow and revealWindow");
      }
      if (commit === 0n || reveal === 0n) {
        throw new Error("Commit and reveal windows must be greater than 0");
      }
      txs.push({
        to: hub.addresses.ValidationModule,
        data: enc(valAbi, "setCommitRevealWindows", [commit, reveal]),
        value: 0
      });
    }
    if (approval !== undefined) {
      if (approval > 100n) {
        throw new Error("approvalPct must be 0-100");
      }
      txs.push({
        to: hub.addresses.ValidationModule,
        data: enc(valAbi, "setApprovalThreshold", [approval]),
        value: 0
      });
    }

    if (!txs.length) {
      return res.status(400).json({ error: "No validation parameters provided" });
    }

    res.json({ txs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid input";
    res.status(400).json({ error: message });
  }
});

app.post("/mesh/:hub/owner/stake", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const {
      minStakeWei,
      maxStakeWei,
      unbondingPeriod,
      feePct,
      burnPct,
      validatorRewardPct
    } = req.body as {
      minStakeWei?: unknown;
      maxStakeWei?: unknown;
      unbondingPeriod?: unknown;
      feePct?: unknown;
      burnPct?: unknown;
      validatorRewardPct?: unknown;
    };

    const minStake = parseUint(minStakeWei, "minStakeWei");
    const maxStake = parseUint(maxStakeWei, "maxStakeWei");
    const unbonding = parseUint(unbondingPeriod, "unbondingPeriod");
    const fee = parseUint(feePct, "feePct");
    const burn = parseUint(burnPct, "burnPct");
    const validatorPct = parseUint(validatorRewardPct, "validatorRewardPct");

    const txs: { to: string; data: string; value: number }[] = [];

    if (minStake !== undefined || maxStake !== undefined) {
      if (minStake === undefined) {
        throw new Error("minStakeWei is required when updating stake recommendations");
      }
      const maxValue = maxStake ?? 0n;
      txs.push({
        to: hub.addresses.StakeManager,
        data: enc(stakeOwnerAbi, "setStakeRecommendations", [minStake, maxValue]),
        value: 0
      });
    }

    if (unbonding !== undefined) {
      if (unbonding === 0n) {
        throw new Error("unbondingPeriod must be greater than 0");
      }
      txs.push({
        to: hub.addresses.StakeManager,
        data: enc(stakeOwnerAbi, "setUnbondingPeriod", [unbonding]),
        value: 0
      });
    }

    const pctEntries: Array<[bigint | undefined, string]> = [
      [fee, "setFeePct"],
      [burn, "setBurnPct"],
      [validatorPct, "setValidatorRewardPct"]
    ];
    for (const [value, fn] of pctEntries) {
      if (value !== undefined) {
        if (value > 100n) {
          throw new Error(`${fn} expects 0-100`);
        }
        txs.push({
          to: hub.addresses.StakeManager,
          data: enc(stakeOwnerAbi, fn, [value]),
          value: 0
        });
      }
    }

    if (!txs.length) {
      return res.status(400).json({ error: "No stake parameters provided" });
    }

    res.json({ txs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid input";
    res.status(400).json({ error: message });
  }
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

app.post("/mesh/:hub/owner/identity", (req, res) => {
  try {
    const hub = getHub(req.params.hub);
    const {
      ens,
      nameWrapper,
      reputationEngine,
      attestationRegistry,
      agentRootNode,
      clubRootNode,
      nodeRootNode,
      agentMerkleRoot,
      validatorMerkleRoot
    } = req.body as Record<string, unknown>;

    const txs: { to: string; data: string; value: number }[] = [];

    const parsedEns = parseAddress(ens, "ens");
    if (parsedEns) {
      txs.push({
        to: hub.addresses.IdentityRegistry,
        data: enc(idOwnerAbi, "setENS", [parsedEns]),
        value: 0
      });
    }

    const parsedWrapper = parseAddress(nameWrapper, "nameWrapper");
    if (parsedWrapper) {
      txs.push({
        to: hub.addresses.IdentityRegistry,
        data: enc(idOwnerAbi, "setNameWrapper", [parsedWrapper]),
        value: 0
      });
    }

    const parsedReputation = parseAddress(reputationEngine, "reputationEngine");
    if (parsedReputation) {
      txs.push({
        to: hub.addresses.IdentityRegistry,
        data: enc(idOwnerAbi, "setReputationEngine", [parsedReputation]),
        value: 0
      });
    }

    const parsedAttestation = parseAddress(attestationRegistry, "attestationRegistry");
    if (parsedAttestation) {
      txs.push({
        to: hub.addresses.IdentityRegistry,
        data: enc(idOwnerAbi, "setAttestationRegistry", [parsedAttestation]),
        value: 0
      });
    }

    const parsedAgentRoot = parseBytes32(agentRootNode, "agentRootNode");
    if (parsedAgentRoot) {
      txs.push({
        to: hub.addresses.IdentityRegistry,
        data: enc(idOwnerAbi, "setAgentRootNode", [parsedAgentRoot]),
        value: 0
      });
    }

    const parsedClubRoot = parseBytes32(clubRootNode, "clubRootNode");
    if (parsedClubRoot) {
      txs.push({
        to: hub.addresses.IdentityRegistry,
        data: enc(idOwnerAbi, "setClubRootNode", [parsedClubRoot]),
        value: 0
      });
    }

    const parsedNodeRoot = parseBytes32(nodeRootNode, "nodeRootNode");
    if (parsedNodeRoot) {
      txs.push({
        to: hub.addresses.IdentityRegistry,
        data: enc(idOwnerAbi, "setNodeRootNode", [parsedNodeRoot]),
        value: 0
      });
    }

    const parsedAgentMerkle = parseBytes32(agentMerkleRoot, "agentMerkleRoot");
    if (parsedAgentMerkle) {
      txs.push({
        to: hub.addresses.IdentityRegistry,
        data: enc(idOwnerAbi, "setAgentMerkleRoot", [parsedAgentMerkle]),
        value: 0
      });
    }

    const parsedValidatorMerkle = parseBytes32(validatorMerkleRoot, "validatorMerkleRoot");
    if (parsedValidatorMerkle) {
      txs.push({
        to: hub.addresses.IdentityRegistry,
        data: enc(idOwnerAbi, "setValidatorMerkleRoot", [parsedValidatorMerkle]),
        value: 0
      });
    }

    if (!txs.length) {
      return res.status(400).json({ error: "No identity parameters provided" });
    }

    res.json({ txs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid input";
    res.status(400).json({ error: message });
  }
});

const PORT = Number(process.env.SOVEREIGN_MESH_PORT || 8084);
app.listen(PORT, () => {
  console.log(`[Sovereign Mesh] server listening on port ${PORT}`);
});
