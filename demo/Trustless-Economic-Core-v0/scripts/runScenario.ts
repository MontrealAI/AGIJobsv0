import { ethers } from 'hardhat';
import type { ContractTransactionReceipt } from 'ethers';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type TimelineEntry = {
  step: number;
  title: string;
  actor: string;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  details: string[];
};

type MilestoneExecution = {
  id: number;
  approvals: string[];
  agentAmount: string;
  validatorAmount: string;
  feeAmount: string;
  burnAmount: string;
};

type BalanceSheet = Record<string, { start: bigint; end: bigint; delta: bigint }>;

type ParticipantLabel = {
  role: string;
  name: string;
  ens?: string;
};

const BASIS_POINTS = 10_000n;

const labels: Record<string, ParticipantLabel> = {};
const timeline: TimelineEntry[] = [];
const milestoneExecutions: MilestoneExecution[] = [];
const approvals = new Map<number, string[]>();

const formatToken = (value: bigint): string => ethers.formatUnits(value, 18);

const checksum = (address: string): string => ethers.getAddress(address);

const labelFor = (address: string): ParticipantLabel => {
  const key = checksum(address);
  if (!labels[key]) {
    labels[key] = { role: 'Participant', name: key };
  }
  return labels[key];
};

function recordStep(
  title: string,
  actor: ParticipantLabel,
  details: string[],
  receipt?: ContractTransactionReceipt | null
) {
  const entry: TimelineEntry = {
    step: timeline.length + 1,
    title,
    actor: `${actor.name} • ${actor.role}` + (actor.ens ? ` (${actor.ens})` : ''),
    txHash: receipt?.hash,
    blockNumber: receipt?.blockNumber,
    gasUsed: receipt?.gasUsed ? receipt.gasUsed.toString() : undefined,
    details,
  };
  timeline.push(entry);

  // Console narration for the non-technical operator.
  console.log(`\n[${entry.step}] ${entry.title}`);
  console.log(`    Actor: ${entry.actor}`);
  if (entry.txHash) {
    console.log(`    Tx: ${entry.txHash} (block ${entry.blockNumber}, gas ${entry.gasUsed})`);
  }
  for (const detail of entry.details) {
    console.log(`    • ${detail}`);
  }
}

async function persistArtefacts(
  outputDir: string,
  sheet: BalanceSheet,
  networkName: string,
  parameters: {
    validatorRewardPct: bigint;
    protocolFeePct: bigint;
    burnPct: bigint;
    jobStakeLockPct: bigint;
    slashEmployerPct: bigint;
    slashValidatorPct: bigint;
    slashTreasuryPct: bigint;
    slashBurnPct: bigint;
  },
  context: {
    jobId: number;
    milestones: number;
    slashAmount: bigint;
    agentAddress: string;
    employerAddress: string;
    treasuryAddress: string;
    validatorAddresses: string[];
    totalSupplyBefore: bigint;
    totalSupplyAfter: bigint;
  }
) {
  mkdirSync(outputDir, { recursive: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    network: networkName,
    job: {
      id: context.jobId,
      milestoneCount: context.milestones,
      slashAmount: formatToken(context.slashAmount),
    },
    economics: {
      validatorRewardPct: Number(parameters.validatorRewardPct) / Number(BASIS_POINTS),
      protocolFeePct: Number(parameters.protocolFeePct) / Number(BASIS_POINTS),
      burnPct: Number(parameters.burnPct) / Number(BASIS_POINTS),
      jobStakeLockPct: Number(parameters.jobStakeLockPct) / Number(BASIS_POINTS),
      slashBreakdown: {
        employer: Number(parameters.slashEmployerPct) / Number(BASIS_POINTS),
        validator: Number(parameters.slashValidatorPct) / Number(BASIS_POINTS),
        treasury: Number(parameters.slashTreasuryPct) / Number(BASIS_POINTS),
        burn: Number(parameters.slashBurnPct) / Number(BASIS_POINTS),
      },
    },
    balances: Object.fromEntries(
      Object.entries(sheet).map(([address, entry]) => [
        checksum(address),
        {
          start: formatToken(entry.start),
          end: formatToken(entry.end),
          delta: formatToken(entry.delta),
          label: labelFor(address),
        },
      ])
    ),
    milestones: milestoneExecutions,
    timeline,
    supply: {
      before: formatToken(context.totalSupplyBefore),
      after: formatToken(context.totalSupplyAfter),
      delta: formatToken(context.totalSupplyAfter - context.totalSupplyBefore),
    },
    governance: {
      agent: checksum(context.agentAddress),
      employer: checksum(context.employerAddress),
      treasury: checksum(context.treasuryAddress),
      validators: context.validatorAddresses.map(checksum),
    },
  };

  const jsonPath = path.join(outputDir, 'trustless-core-report.json');
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  const markdownLines: string[] = [];
  markdownLines.push('# Trustless Economic Core Demo Run');
  markdownLines.push('');
  markdownLines.push(`- Generated: ${summary.generatedAt}`);
  markdownLines.push(`- Network: **${networkName}**`);
  markdownLines.push(`- Job ID: **${context.jobId}** with **${context.milestones} milestones**`);
  markdownLines.push(`- Total Supply → ${formatToken(context.totalSupplyBefore)} → ${formatToken(context.totalSupplyAfter)} $AGIALPHA`);
  markdownLines.push('');
  markdownLines.push('## Economic Parameters');
  markdownLines.push('');
  markdownLines.push('| Parameter | Value |');
  markdownLines.push('| --- | --- |');
  markdownLines.push(`| Validator reward | ${(summary.economics.validatorRewardPct * 100).toFixed(2)}% |`);
  markdownLines.push(`| Protocol fee | ${(summary.economics.protocolFeePct * 100).toFixed(2)}% |`);
  markdownLines.push(`| Burn | ${(summary.economics.burnPct * 100).toFixed(2)}% |`);
  markdownLines.push(`| Agent stake lock | ${(summary.economics.jobStakeLockPct * 100).toFixed(2)}% |`);
  markdownLines.push(`| Slash → Employer | ${(summary.economics.slashBreakdown.employer * 100).toFixed(2)}% |`);
  markdownLines.push(`| Slash → Validators | ${(summary.economics.slashBreakdown.validator * 100).toFixed(2)}% |`);
  markdownLines.push(`| Slash → Treasury | ${(summary.economics.slashBreakdown.treasury * 100).toFixed(2)}% |`);
  markdownLines.push(`| Slash → Burn | ${(summary.economics.slashBreakdown.burn * 100).toFixed(2)}% |`);
  markdownLines.push('');
  markdownLines.push('## Participant Balance Sheet (in $AGIALPHA)');
  markdownLines.push('');
  markdownLines.push('| Participant | Start | End | Δ |');
  markdownLines.push('| --- | --- | --- | --- |');
  for (const [address, entry] of Object.entries(summary.balances)) {
    const label = summary.balances[address].label as ParticipantLabel | undefined;
    const name = label ? `${label.name} (${label.role})` : address;
    markdownLines.push(`| ${name} | ${summary.balances[address].start} | ${summary.balances[address].end} | ${summary.balances[address].delta} |`);
  }
  markdownLines.push('');
  markdownLines.push('## Milestone Releases');
  markdownLines.push('');
  markdownLines.push('| Milestone | Approvals | Agent | Validators | Fee | Burn |');
  markdownLines.push('| --- | --- | --- | --- | --- | --- |');
  for (const execution of milestoneExecutions) {
    markdownLines.push(
      `| ${execution.id + 1} | ${execution.approvals.length} | ${execution.agentAmount} | ${execution.validatorAmount} | ${execution.feeAmount} | ${execution.burnAmount} |`
    );
  }
  markdownLines.push('');
  markdownLines.push('## Timeline');
  markdownLines.push('');
  markdownLines.push('| # | Title | Actor | Details |');
  markdownLines.push('| --- | --- | --- | --- |');
  for (const entry of timeline) {
    const details = entry.details.join('<br/>');
    markdownLines.push(`| ${entry.step} | ${entry.title} | ${entry.actor} | ${details} |`);
  }
  markdownLines.push('');
  markdownLines.push('```mermaid');
  markdownLines.push('sequenceDiagram');
  markdownLines.push('  participant GOV as Governance Owner');
  markdownLines.push('  participant EMP as Employer');
  markdownLines.push('  participant AGT as Agent');
  markdownLines.push('  participant VAL as Validator Council');
  markdownLines.push('  participant TRE as Treasury');
  markdownLines.push('  participant BURN as Burn Sink');
  markdownLines.push('  GOV->>GOV: Deploy contracts & register identities');
  markdownLines.push('  EMP->>GOV: Escrow 3 milestone tranches');
  markdownLines.push('  AGT->>GOV: Stake collateral locked by policy');
  markdownLines.push('  VAL->>GOV: Approve Milestone 1');
  markdownLines.push('  GOV->>AGT: Release tranche 1 (fees+burn routed)');
  markdownLines.push('  GOV->>VAL: Stream validator rewards');
  markdownLines.push('  GOV-->>GOV: System-wide pause engaged');
  markdownLines.push('  VAL-xGOV: Paused milestone attempt rejected');
  markdownLines.push('  GOV-->>GOV: System unpaused');
  markdownLines.push('  VAL->>GOV: Approve Milestone 2');
  markdownLines.push('  GOV->>AGT: Release tranche 2 (fees+burn routed)');
  markdownLines.push('  GOV->>VAL: Stream validator rewards');
  markdownLines.push('  GOV->>AGT: Slash collateral for fraud');
  markdownLines.push('  GOV->>EMP: Refund remaining escrow & slash award');
  markdownLines.push('  GOV->>TRE: Route protocol fees & slash share');
  markdownLines.push('  GOV->>BURN: Destroy economic penalties');
  markdownLines.push('```');

  const markdownPath = path.join(outputDir, 'trustless-core-report.md');
  writeFileSync(markdownPath, markdownLines.join('\n'));

  const htmlRows = Object.entries(summary.balances)
    .map(([_, entry]) => {
      const label = entry.label as ParticipantLabel | undefined;
      const name = label ? `${label.name} <small>${label.role}</small>` : checksum(_);
      return `<tr><td>${name}</td><td>${entry.start}</td><td>${entry.end}</td><td>${entry.delta}</td></tr>`;
    })
    .join('\n');

  const htmlTimeline = timeline
    .map(
      (entry) =>
        `<tr><td>${entry.step}</td><td>${entry.title}</td><td>${entry.actor}</td><td>${entry.details
          .map((line) => `<div>${line}</div>`)
          .join('')}</td></tr>`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Trustless Economic Core Demo</title>
    <style>
      body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 2rem; background: #05060f; color: #eef2ff; }
      h1, h2 { color: #f0abfc; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
      th, td { border: 1px solid rgba(255,255,255,0.1); padding: 0.5rem 0.75rem; text-align: left; }
      thead { background: rgba(240, 171, 252, 0.1); }
      code { background: rgba(15, 23, 42, 0.8); padding: 0.25rem 0.4rem; border-radius: 0.4rem; }
      .badge { display: inline-block; background: linear-gradient(135deg, #22d3ee, #818cf8); padding: 0.4rem 0.75rem; border-radius: 999px; font-size: 0.85rem; margin-right: 0.5rem; }
      footer { margin-top: 2rem; font-size: 0.85rem; opacity: 0.8; }
    </style>
  </head>
  <body>
    <h1>Trustless Economic Core Demo</h1>
    <div class="badge">Network: ${networkName}</div>
    <div class="badge">Job #${context.jobId}</div>
    <div class="badge">Milestones: ${context.milestones}</div>
    <p>The AGI Jobs trustless core executed autonomously. Every transfer, pause, and slash was enforced entirely on-chain.</p>
    <h2>Economic Parameters</h2>
    <table>
      <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>Validator reward</td><td>${(summary.economics.validatorRewardPct * 100).toFixed(2)}%</td></tr>
        <tr><td>Protocol fee</td><td>${(summary.economics.protocolFeePct * 100).toFixed(2)}%</td></tr>
        <tr><td>Burn</td><td>${(summary.economics.burnPct * 100).toFixed(2)}%</td></tr>
        <tr><td>Agent stake lock</td><td>${(summary.economics.jobStakeLockPct * 100).toFixed(2)}%</td></tr>
        <tr><td>Slash → Employer</td><td>${(summary.economics.slashBreakdown.employer * 100).toFixed(2)}%</td></tr>
        <tr><td>Slash → Validators</td><td>${(summary.economics.slashBreakdown.validator * 100).toFixed(2)}%</td></tr>
        <tr><td>Slash → Treasury</td><td>${(summary.economics.slashBreakdown.treasury * 100).toFixed(2)}%</td></tr>
        <tr><td>Slash → Burn</td><td>${(summary.economics.slashBreakdown.burn * 100).toFixed(2)}%</td></tr>
      </tbody>
    </table>
    <h2>Balances (in $AGIALPHA)</h2>
    <table>
      <thead><tr><th>Participant</th><th>Start</th><th>End</th><th>Δ</th></tr></thead>
      <tbody>${htmlRows}</tbody>
    </table>
    <h2>Milestone Releases</h2>
    <table>
      <thead><tr><th>#</th><th>Approvals</th><th>Agent</th><th>Validators</th><th>Fee</th><th>Burn</th></tr></thead>
      <tbody>
        ${milestoneExecutions
          .map(
            (execution) =>
              `<tr><td>${execution.id + 1}</td><td>${execution.approvals.length}</td><td>${execution.agentAmount}</td><td>${execution.validatorAmount}</td><td>${execution.feeAmount}</td><td>${execution.burnAmount}</td></tr>`
          )
          .join('')}
      </tbody>
    </table>
    <h2>Timeline</h2>
    <table>
      <thead><tr><th>#</th><th>Title</th><th>Actor</th><th>Details</th></tr></thead>
      <tbody>${htmlTimeline}</tbody>
    </table>
    <footer>Artefacts exported on ${summary.generatedAt}. Ready for executive circulation.</footer>
  </body>
</html>`;

  const htmlPath = path.join(outputDir, 'trustless-core-dashboard.html');
  writeFileSync(htmlPath, html);

  console.log('\nArtefacts generated:');
  console.log(`  • ${jsonPath}`);
  console.log(`  • ${markdownPath}`);
  console.log(`  • ${htmlPath}`);
}

async function main() {
  const [owner, employer, agent, validator1, validator2, validator3, treasury] = await ethers.getSigners();

  labels[checksum(owner.address)] = { role: 'Governance Owner', name: 'Owner' };
  labels[checksum(employer.address)] = { role: 'Employer', name: 'Employer' };
  labels[checksum(agent.address)] = {
    role: 'Agent',
    name: 'Prime Agent',
    ens: 'demo-agent.alpha.agent.agi.eth',
  };
  labels[checksum(validator1.address)] = {
    role: 'Validator',
    name: 'Validator One',
    ens: 'validator1.club.agi.eth',
  };
  labels[checksum(validator2.address)] = {
    role: 'Validator',
    name: 'Validator Two',
    ens: 'validator2.club.agi.eth',
  };
  labels[checksum(validator3.address)] = {
    role: 'Validator',
    name: 'Validator Three',
    ens: 'validator3.club.agi.eth',
  };
  labels[checksum(treasury.address)] = { role: 'Treasury', name: 'Treasury' };

  const Token = await ethers.getContractFactory('DemoAGIALPHAToken');
  const token = await Token.connect(owner).deploy();
  await token.waitForDeployment();
  recordStep('Deploy DemoAGIALPHA token', labelFor(owner.address), [
    `Address ${await token.getAddress()}`,
  ]);

  const participants = [owner, employer, agent, validator1, validator2, validator3, treasury];
  const mintAmount = ethers.parseUnits('1000');
  for (const signer of participants) {
    const tx = await token.connect(owner).mint(signer.address, mintAmount);
    await tx.wait();
  }
  recordStep('Seed $AGIALPHA balances', labelFor(owner.address), [
    'Minted 1,000 $AGIALPHA to governance, employer, agent, validators, and treasury.',
  ]);

  const startingBalances: Record<string, bigint> = {};
  for (const signer of participants) {
    startingBalances[checksum(signer.address)] = await token.balanceOf(signer.address);
  }
  const totalSupplyBefore = await token.totalSupply();

  const validatorRewardPct = 1000n;
  const protocolFeePct = 500n;
  const burnPct = 200n;
  const minStake = ethers.parseUnits('150');
  const jobStakeLockPct = 2000n;

  const Demo = await ethers.getContractFactory('TrustlessEconomicCoreDemo');
  const demo = await Demo.connect(owner).deploy(
    await token.getAddress(),
    treasury.address,
    validatorRewardPct,
    protocolFeePct,
    burnPct,
    minStake,
    jobStakeLockPct
  );
  await demo.waitForDeployment();
  recordStep('Deploy Trustless Economic Core', labelFor(owner.address), [
    `Contract ${await demo.getAddress()}`,
    'Validator reward 10%, fee 5%, burn 2%, stake lock 20%.',
  ]);

  const agentNode = ethers.id(labelFor(agent.address).ens!);
  const validatorNodes = [validator1, validator2, validator3].map((signer) =>
    ethers.id(labelFor(signer.address).ens!)
  );

  const registerAgentTx = await demo.connect(owner).registerAgentIdentity(agent.address, agentNode);
  recordStep('Register agent ENS identity', labelFor(owner.address), [
    `${labelFor(agent.address).ens} → ${agent.address}`,
  ], await registerAgentTx.wait());

  for (let i = 0; i < validatorNodes.length; i++) {
    const tx = await demo
      .connect(owner)
      .registerValidatorIdentity([validator1, validator2, validator3][i].address, validatorNodes[i]);
    recordStep(
      `Register validator ${i + 1} ENS identity`,
      labelFor(owner.address),
      [
        `${labelFor([validator1, validator2, validator3][i].address).ens} → ${[validator1, validator2, validator3][i].address}`,
      ],
      await tx.wait()
    );
  }

  const stakeAmount = ethers.parseUnits('200');
  const approveStakeTx = await token.connect(agent).approve(await demo.getAddress(), stakeAmount);
  await approveStakeTx.wait();
  const stakeTx = await demo.connect(agent).depositStake(stakeAmount);
  recordStep('Agent stakes collateral', labelFor(agent.address), ['Staked 200 $AGIALPHA. Policy requires ≥150 and locks 20% per job.'], await stakeTx.wait());

  const milestoneAmounts = [0, 1, 2].map(() => ethers.parseUnits('100'));
  const committee = [validator1.address, validator2.address, validator3.address];
  const threshold = 2;

  const approveJobTx = await token.connect(employer).approve(await demo.getAddress(), ethers.parseUnits('300'));
  await approveJobTx.wait();
  const createJobTx = await demo
    .connect(employer)
    .createJob(agent.address, milestoneAmounts, committee, threshold);
  const createJobReceipt = await createJobTx.wait();
  const jobCreatedLog = createJobReceipt?.logs
    .map((log) => {
      try {
        return demo.interface.parseLog(log);
      } catch (error) {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === 'JobCreated');
  const jobId = jobCreatedLog?.args?.jobId ? Number(jobCreatedLog.args.jobId) : 1;
  recordStep(
    'Employer escrows three-milestone job',
    labelFor(employer.address),
    [
      `Job ID ${jobId} with 3 × 100 $AGIALPHA milestones`,
      'Validator threshold: 2 of 3',
      `Agent stake locked: ${formatToken(await demo.agentLockedStake(agent.address))} $AGIALPHA`,
    ],
    createJobReceipt
  );

  async function approveMilestone(actor: typeof validator1, milestoneId: number) {
    const tx = await demo.connect(actor).approveMilestone(jobId, milestoneId);
    const receipt = await tx.wait();
    const current = approvals.get(milestoneId) ?? [];
    current.push(actor.address);
    approvals.set(milestoneId, current);

    const releaseLog = receipt?.logs
      .map((log) => {
        try {
          return demo.interface.parseLog(log);
        } catch (error) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === 'MilestoneReleased');

    const detailLines = [`Milestone ${milestoneId + 1} approvals: ${current.length}/${threshold}`];

    if (releaseLog) {
      const execution: MilestoneExecution = {
        id: Number(releaseLog.args?.milestoneId ?? milestoneId),
        approvals: current.map(checksum),
        agentAmount: formatToken(releaseLog.args?.agentAmount ?? 0n),
        validatorAmount: formatToken(releaseLog.args?.validatorAmount ?? 0n),
        feeAmount: formatToken(releaseLog.args?.feeAmount ?? 0n),
        burnAmount: formatToken(releaseLog.args?.burnAmount ?? 0n),
      };
      milestoneExecutions.push(execution);
      detailLines.push(
        `Agent received ${execution.agentAmount} $AGIALPHA, validators ${execution.validatorAmount}, fee ${execution.feeAmount}, burn ${execution.burnAmount}.`
      );
    }

    recordStep(
      `Validator ${labelFor(actor.address).name} approves milestone ${milestoneId + 1}`,
      labelFor(actor.address),
      detailLines,
      receipt
    );
  }

  await approveMilestone(validator1, 0);
  await approveMilestone(validator2, 0);

  const pauseTx = await demo.connect(owner).pauseAll();
  recordStep('Governance executes global pause', labelFor(owner.address), ['All milestone approvals blocked.'], await pauseTx.wait());

  try {
    await demo.connect(validator1).approveMilestone(jobId, 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordStep('Paused milestone attempt rejected', labelFor(validator1.address), [
      'Custom error captured: EnforcedPause',
      message.split('\n')[0],
    ]);
  }

  const unpauseTx = await demo.connect(owner).unpauseAll();
  recordStep('Governance resumes payouts', labelFor(owner.address), ['Milestone approvals re-enabled.'], await unpauseTx.wait());

  await approveMilestone(validator2, 1);
  await approveMilestone(validator3, 1);

  const slashAmount = ethers.parseUnits('60');
  const slashTx = await demo.connect(owner).slashAgent(jobId, slashAmount);
  const slashReceipt = await slashTx.wait();
  const slashLog = slashReceipt?.logs
    .map((log) => {
      try {
        return demo.interface.parseLog(log);
      } catch (error) {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === 'AgentSlashed');
  recordStep(
    'Governance slashes agent for failed milestone',
    labelFor(owner.address),
    [
      `Slashed ${formatToken(slashAmount)} $AGIALPHA collateral`,
      `Employer share: ${formatToken(slashLog?.args?.employerShare ?? 0n)}`,
      `Validators share: ${formatToken(slashLog?.args?.validatorShare ?? 0n)}`,
      `Treasury share: ${formatToken(slashLog?.args?.treasuryShare ?? 0n)}`,
      `Burn: ${formatToken(slashLog?.args?.burnShare ?? 0n)}`,
    ],
    slashReceipt
  );

  const cancelTx = await demo.connect(employer).cancelJob(jobId);
  recordStep(
    'Employer cancels job and retrieves escrow',
    labelFor(employer.address),
    ['Unused milestone funds reclaimed after slashing.'],
    await cancelTx.wait()
  );

  const addresses = [owner, employer, agent, validator1, validator2, validator3, treasury];
  const balanceSheet: BalanceSheet = {};
  for (const signer of addresses) {
    const key = checksum(signer.address);
    const start = startingBalances[key];
    const end = await token.balanceOf(signer.address);
    balanceSheet[key] = {
      start,
      end,
      delta: end - start,
    };
  }

  const network = await ethers.provider.getNetwork();
  const outputDir = path.join(__dirname, '..', 'reports');

  await persistArtefacts(
    outputDir,
    balanceSheet,
    network.name,
    {
      validatorRewardPct,
      protocolFeePct,
      burnPct,
      jobStakeLockPct,
      slashEmployerPct: 5000n,
      slashValidatorPct: 2000n,
      slashTreasuryPct: 2000n,
      slashBurnPct: 1000n,
    },
    {
      jobId,
      milestones: milestoneAmounts.length,
      slashAmount,
      agentAddress: agent.address,
      employerAddress: employer.address,
      treasuryAddress: treasury.address,
      validatorAddresses: committee,
      totalSupplyBefore,
      totalSupplyAfter: await token.totalSupply(),
    }
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
