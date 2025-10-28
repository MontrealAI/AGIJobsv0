/* eslint-disable no-console */
import chalk from 'chalk';
import { buildSimulationInput, ValidatorConstellationSimulation } from '../src/simulation';
import { formatWei, percentage } from '../src/utils';

async function main(): Promise<void> {
  const epoch = 7021;
  const input = buildSimulationInput(epoch);
  const simulation = new ValidatorConstellationSimulation(input);
  const report = simulation.run();

  console.log(chalk.bold.cyan('\n⚡ Validator Constellation v0 — Mission Playback'));
  console.log(chalk.gray('==================================================='));

  console.log(chalk.bold('\n👁️  Committee Selection (VRF mix)'));
  report.committee.forEach((validator, index) => {
    console.log(
      `${chalk.green(`#${index + 1}`)} ${validator.ens} ${chalk.gray(`stake: ${formatWei(validator.stake)}`)}`,
    );
  });

  console.log(chalk.bold('\n🛡️  Commit–Reveal Discipline'));
  report.commitments.forEach((commitment) => {
    console.log(
      `${commitment.validator.ens.padEnd(32)} committed ${chalk.gray(commitment.commitment.slice(0, 12))}… ` +
        `${commitment.revealed ? chalk.green('revealed ✅') : chalk.red('missed ❌')}`,
    );
  });

  if (report.slashedValidators.length > 0) {
    console.log(chalk.bold.red('\n⚔️  Slashing Executed'));
    report.slashedValidators.forEach((validator) => {
      console.log(`- ${validator.ens} => stake now ${formatWei(validator.stake)}`);
    });
  }

  if (report.alerts.length > 0) {
    console.log(chalk.bold.yellow('\n🚨 Sentinel Alerts'));
    report.alerts.forEach((alert) => {
      console.log(`${chalk.red(alert.severity.toUpperCase())} ${alert.domain}: ${alert.message}`);
    });
  }

  console.log(chalk.bold.magenta('\n⏸️  Domain Pause / Resume Log'));
  report.pausedDomains.forEach((domain) => console.log(`- Paused ${domain}`));
  report.resumedDomains.forEach((domain) => console.log(`- Resumed ${domain}`));

  console.log(chalk.bold.blue('\n🧠  ZK Batch Finalization'));
  console.log(`Proof ${report.zkBatch.proofId.slice(0, 12)}… validated ${report.zkBatch.jobs.length} jobs`);

  console.log(chalk.bold.green('\n📈  Impact Metrics'));
  const reveals = report.reveals.length;
  console.log(`- Reveal compliance: ${percentage(reveals, report.commitments.length)}`);
  console.log(`- Alerts triggered: ${report.alerts.length}`);
  console.log(`- Domains stabilized: ${report.resumedDomains.length}`);

  console.log(chalk.gray('\nMermaid Overview:'));
  console.log([
    '```',
    'flowchart LR',
    '  subgraph VRF Committee',
    '    A[Entropy Mix]',
    '    B[Validator Pool]',
    '    C[Selected Committee]',
    '  end',
    '  subgraph CommitReveal',
    '    C --> D[Commit Hash]',
    '    D --> E[Reveal Verification]',
    '  end',
    '  subgraph Sentinel',
    '    F[Budget Watchers]',
    '    G[Opcode Guards]',
    '    H[Domain Pause]',
    '  end',
    '  subgraph ZKProof',
    '    I[Job Batch]',
    '    J[Succinct Proof]',
    '  end',
    '  B --> F',
    '  F --> H',
    '  G --> H',
    '  E --> J',
    '```',
  ].join('\n'));

  console.log(chalk.bold.cyan('\n✅ Demo complete — AGI Jobs v0 (v2) operational.\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
