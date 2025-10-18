import { ethers } from "ethers";

const ZERO_ADDRESS = ethers.ZeroAddress.toLowerCase();

const OWNER_CONTROLS = {
  JobRegistry: {
    module: "JobRegistry",
    actions: [
      {
        method: "pause()",
        description: "Pause new job intake instantly across the hub"
      },
      {
        method: "unpause()",
        description: "Resume job intake when the owner considers conditions safe"
      },
      {
        method: "transferOwnership(address)",
        description: "Hand governance to a new Safe or timelock when scaling operations",
        args: ["newOwner"]
      }
    ]
  },
  ValidationModule: {
    module: "ValidationModule",
    actions: [
      {
        method: "setCommitRevealWindows(uint64,uint64)",
        description: "Retune commit/reveal duration to match validator throughput",
        args: ["commitWindow", "revealWindow"]
      },
      {
        method: "pause()",
        description: "Freeze ongoing validations while investigating anomalies"
      },
      {
        method: "unpause()",
        description: "Resume validation once conditions stabilise"
      },
      {
        method: "transferOwnership(address)",
        description: "Rotate validation governance authority",
        args: ["newOwner"]
      }
    ]
  },
  StakeManager: {
    module: "StakeManager",
    actions: [
      {
        method: "setMinimumStake(uint256)",
        description: "Adjust collateral requirements for validator cohorts",
        args: ["amountWei"]
      },
      {
        method: "setDisputeModule(address)",
        description: "Swap in a different dispute module to upgrade adjudication",
        args: ["disputeModule"]
      },
      {
        method: "transferOwnership(address)",
        description: "Move staking authority to a new Safe",
        args: ["newOwner"]
      }
    ]
  },
  IdentityRegistry: {
    module: "IdentityRegistry",
    actions: [
      {
        method: "addAdditionalAgent(address)",
        description: "Allowlist a new mission operator",
        args: ["agentAddress"]
      },
      {
        method: "addAdditionalValidator(address)",
        description: "Allowlist a new validator cohort member",
        args: ["validatorAddress"]
      },
      {
        method: "transferOwnership(address)",
        description: "Rotate identity registry governance",
        args: ["newOwner"]
      }
    ]
  },
  SystemPause: {
    module: "SystemPause",
    actions: [
      {
        method: "pause()",
        description: "Emergency stop for the entire hub stack"
      },
      {
        method: "unpause()",
        description: "Resume normal hub activity"
      },
      {
        method: "transferOwnership(address)",
        description: "Assign pause authority to a new operator",
        args: ["newOwner"]
      }
    ]
  }
};

function normalizeAddress(address) {
  if (!address || typeof address !== "string") {
    return undefined;
  }
  if (!ethers.isAddress(address)) {
    return undefined;
  }
  const formatted = ethers.getAddress(address);
  if (formatted.toLowerCase() === ZERO_ADDRESS) {
    return undefined;
  }
  return formatted;
}

function explorerForChain(uiConfig, chainId) {
  const fromConfig = uiConfig.explorers?.[String(chainId)];
  const base = fromConfig ?? uiConfig.etherscanBase ?? "https://etherscan.io";
  return base.replace(/\/$/, "");
}

function buildModules(hub, explorerBase) {
  return Object.entries(hub.addresses ?? {})
    .map(([key, value]) => {
      const controls = OWNER_CONTROLS[key];
      const address = normalizeAddress(value);
      if (!controls || !address) {
        return undefined;
      }
      const actions = controls.actions
        .map((action) => ({
          method: action.method,
          description: action.description,
          args: action.args ?? [],
          explorerWriteUrl: `${explorerBase}/address/${address}#writeContract`,
          contractAddress: address
        }))
        .sort((a, b) => a.method.localeCompare(b.method));
      return {
        module: controls.module,
        address,
        actions
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.module.localeCompare(b.module));
}

export function buildOwnerAtlas(hubs, uiConfig) {
  const order = Array.isArray(uiConfig.hubs) ? uiConfig.hubs : Object.keys(hubs);
  const atlas = order
    .map((hubId) => {
      const hub = hubs[hubId];
      if (!hub) {
        return undefined;
      }
      const explorer = explorerForChain(uiConfig, hub.chainId);
      return {
        hubId,
        label: hub.label,
        chainId: hub.chainId,
        networkName: hub.networkName,
        owner: normalizeAddress(hub.owner) ?? hub.owner,
        governance: normalizeAddress(hub.governance) ?? hub.governance,
        explorer,
        modules: buildModules(hub, explorer)
      };
    })
    .filter(Boolean);

  return { atlas };
}

export function formatOwnerAtlasMarkdown(atlas, options = {}) {
  const lines = [];
  const titleNetwork = options.network ? ` — ${options.network}` : "";
  lines.push(`# Sovereign Constellation Owner Atlas${titleNetwork}`);
  lines.push("");
  const generated = (options.generatedAt ?? new Date()).toISOString();
  lines.push(
    `Generated ${generated}. This atlas enumerates every governance lever across the constellation, making it effortless for the owner to pause, retune, or reassign control at will.`
  );
  lines.push("");
  for (const hub of atlas) {
    lines.push(`## ${hub.label} — ${hub.networkName} (chain ${hub.chainId})`);
    lines.push("");
    lines.push(`- **Owner:** ${hub.owner}`);
    lines.push(`- **Governance executor:** ${hub.governance}`);
    lines.push(`- **Explorer:** ${hub.explorer}`);
    lines.push("");
    if (!hub.modules || hub.modules.length === 0) {
      lines.push("No controllable modules detected in the current configuration.");
      lines.push("");
      continue;
    }
    lines.push("| Module | Action | Description | Explorer write panel |");
    lines.push("| --- | --- | --- | --- |");
    for (const module of hub.modules) {
      for (const action of module.actions) {
        const actionLabel = action.args.length > 0 ? `${action.method}(${action.args.join(", ")})` : action.method;
        const link = `[Write](${action.explorerWriteUrl})`;
        lines.push(`| ${module.module} | ${actionLabel} | ${action.description} | ${link} |`);
      }
    }
    lines.push("");
  }
  lines.push(
    "This atlas is regenerated whenever the constellation configuration changes so the owner always has an up-to-the-minute command surface."
  );
  lines.push("");
  return lines.join("\n");
}
