#!/usr/bin/env ts-node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import hre from 'hardhat';
import { Contract } from 'ethers';
import {
  fetchPhase6State,
  loadPhase6Config,
  planPhase6Changes,
  buildPlanSummary,
} from './apply-config-lib';
import {
  DEFAULT_CONFIG,
  PHASE6_INTERFACE,
  parsePhase6Args,
  assertPhase6Context,
  buildPhase6Transactions,
  assertPhase6ContractTargets,
} from './apply-config-safety';

function printUsage(): void {
  console.log(
    `Phase 6 governance configuration preview and applier\n\n` +
      `Usage: HARDHAT_NETWORK=<network> npm run demo:phase6:apply -- --manager <address> [options]\n\n` +
      `  --manager <address>       Deployed Phase6ExpansionManager (required)\n` +
      `  --chain-id <integer>      Expected chain id (required for --apply)\n` +
      `  --config <path>           Config JSON (default: ${DEFAULT_CONFIG})\n` +
      `  --dry-run                 Preview only; this is the default\n` +
      `  --apply                   Send ordered transactions as the configured governance signer\n` +
      `  --domain <slug>[,slug]    Limit domain actions; global actions remain included\n` +
      `  --skip-global             Skip setGlobalConfig (other global guards remain included)\n` +
      `  --skip-pause              Skip setSystemPause\n` +
      `  --skip-escalation         Skip setEscalationBridge\n` +
      `  --export-plan <path>      Export calldata and receipts (required for --apply)\n` +
      `  --help                    Show this message\n\n` +
      `Preview does not submit transactions or prove deployed connector identity. Apply requires\n` +
      `an operator-supplied scenario, an explicit chain id, an export path, contract targets, and the\n` +
      `governance signer. A Safe/timelock owner must submit exported calldata via its own process.\n` +
      `Keep RPC credentials and signing keys in protected environment configuration, never JSON.\n`
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--help')) {
    printUsage();
    return;
  }
  const args = parsePhase6Args(argv);
  const configPath = resolve(args.configPath);
  if (args.exportPath && resolve(args.exportPath) === configPath)
    throw new Error(
      '--export-plan must not overwrite the input configuration.'
    );
  const config = loadPhase6Config(configPath);
  if (!args.dryRun && (config as any).scenario?.mode !== 'operator-supplied') {
    throw new Error(
      '--apply requires scenario.mode="operator-supplied" and a reviewed deployment configuration; the bundled illustrative scenario cannot be applied.'
    );
  }
  for (const slug of args.onlyDomains) {
    if (!config.domains.some((domain) => domain.slug === slug))
      throw new Error(`Unknown --domain ${slug} in configuration.`);
  }

  const { ethers } = hre as any;
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  const readBlock = await provider.getBlock('latest');
  if (!readBlock?.hash) throw new Error('Cannot obtain an RPC state snapshot.');
  await assertPhase6ContractTargets(
    provider,
    args.manager,
    [],
    readBlock.number
  );
  const manager = new Contract(args.manager, PHASE6_INTERFACE, provider);
  const [specVersion, governance] = await Promise.all([
    manager.SPEC_VERSION({ blockTag: readBlock.number }),
    manager.governance({ blockTag: readBlock.number }),
  ]);
  // A provider-only preview does not need access to a signing key.
  const signer = args.dryRun ? undefined : (await ethers.getSigners())[0];
  const signerAddress = signer ? await signer.getAddress() : undefined;
  assertPhase6Context({
    actualChainId: network.chainId,
    expectedChainId: args.expectedChainId,
    specVersion,
    governance,
    signer: signerAddress,
    apply: !args.dryRun,
  });

  const state = await fetchPhase6State(manager, readBlock.number);
  const plan = planPhase6Changes(state, config, readBlock.number);
  const transactions = buildPhase6Transactions(plan, args);
  const summary = buildPlanSummary(plan, {
    manager: args.manager,
    governance,
    specVersion,
    network: {
      name: hre.network.name,
      chainId:
        network.chainId <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(network.chainId)
          : undefined,
    },
    configPath,
    dryRun: args.dryRun,
    filters: args,
  });
  const evidence: Record<string, any> = {
    ...summary,
    chainId: network.chainId.toString(),
    expectedChainId: args.expectedChainId?.toString() ?? null,
    observedBlock: { number: readBlock.number, hash: readBlock.hash },
    execution: {
      status: 'preview',
      connectorBytecodeChecked: false,
      implementationIdentityVerified: false,
      atomic: false,
      transactions: [],
    },
    encodedTransactions: transactions.map(
      ({ contractTargets, ...transaction }) => transaction
    ),
  };
  const exportPath = args.exportPath ? resolve(args.exportPath) : undefined;
  const persist = () => {
    if (!exportPath) return;
    mkdirSync(dirname(exportPath), { recursive: true });
    writeFileSync(exportPath, `${JSON.stringify(evidence, null, 2)}\n`, {
      mode: 0o600,
    });
  };
  persist();
  console.log(
    `Phase 6 ${args.dryRun ? 'preview' : 'apply'}: ${hre.network.name}, chain ${
      network.chainId
    }, block ${readBlock.number}`
  );
  console.log(
    `Manager: ${args.manager}; governance: ${governance}; spec: ${specVersion}`
  );
  plan.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
  transactions.forEach((transaction, index) =>
    console.log(`  [${index + 1}] ${transaction.label}`)
  );
  if (exportPath) console.log(`Plan exported to ${exportPath}`);
  if (args.dryRun) {
    console.log(
      `Preview complete: ${transactions.length} selected transactions; none submitted. Connector implementation identity and authority require operator review.`
    );
    return;
  }

  try {
    await assertPhase6ContractTargets(
      provider,
      args.manager,
      transactions,
      readBlock.number
    );
    evidence.execution.connectorBytecodeChecked = true;
    evidence.execution.status = 'applying';
    persist();
    for (const transaction of transactions) {
      // Governance may change between transactions: re-check before each submission.
      assertPhase6Context({
        actualChainId: (await provider.getNetwork()).chainId,
        expectedChainId: args.expectedChainId,
        specVersion: await manager.SPEC_VERSION(),
        governance: await manager.governance(),
        signer: signerAddress,
        apply: true,
      });
      const sent = await signer.sendTransaction({
        to: transaction.to,
        data: transaction.data,
        value: 0n,
      });
      const record: Record<string, unknown> = {
        label: transaction.label,
        hash: sent.hash,
        status: 'submitted',
      };
      evidence.execution.transactions.push(record);
      persist();
      console.log(`Submitted ${transaction.label}: ${sent.hash}`);
      const receipt = await sent.wait();
      if (!receipt || receipt.status !== 1)
        throw new Error(`Transaction failed: ${sent.hash}`);
      Object.assign(record, {
        status: 'confirmed',
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
      });
      persist();
    }
    const verifiedBlock = await provider.getBlock('latest');
    if (!verifiedBlock?.hash)
      throw new Error('Cannot obtain post-apply verification block.');
    const remaining = buildPhase6Transactions(
      planPhase6Changes(
        await fetchPhase6State(manager, verifiedBlock.number),
        config,
        verifiedBlock.number
      ),
      args
    );
    if (remaining.length)
      throw new Error(
        `Post-apply readback still requires ${remaining.length} selected actions.`
      );
    evidence.execution.status = 'verified';
    evidence.execution.verifiedBlock = {
      number: verifiedBlock.number,
      hash: verifiedBlock.hash,
    };
    persist();
    console.log(
      `Applied and read back ${transactions.length} selected configuration transactions. This verifies configuration state, not work execution or settlement.`
    );
  } catch (error) {
    evidence.execution.status = 'failed';
    evidence.execution.error =
      error instanceof Error ? error.message : String(error);
    persist();
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      'Phase 6 apply-config failed:',
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  });
}
