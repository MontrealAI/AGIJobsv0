/* eslint-disable no-console */
import chalk from 'chalk';
import { buildSimulationInput, ValidatorConstellationSimulation } from '../src/simulation';
import { formatWei } from '../src/utils';

function renderHeader(title: string): void {
  console.log(chalk.bold.cyan(title));
  console.log(chalk.gray('───────────────────────────────────────────────'));
}

function main(): void {
  const epoch = Number(process.env.EPOCH ?? 7777);
  const input = buildSimulationInput(epoch);
  const simulation = new ValidatorConstellationSimulation(input);
  simulation.run();
  const snapshot = simulation.operatorSnapshot();

  renderHeader(`Operator Console — Epoch ${snapshot.epoch}`);

  console.log(chalk.bold('Validator Health Matrix'));
  snapshot.validatorHealth.forEach((validator) => {
    console.log(
      `- ${validator.ens.padEnd(30)} stake ${formatWei(validator.stake)} misbehaviour ${validator.misbehaviourCount}`,
    );
  });

  console.log('');
  console.log(chalk.bold('Sentinel Alerts'));
  if (snapshot.outstandingAlerts.length === 0) {
    console.log(chalk.green('No outstanding alerts.'));
  } else {
    snapshot.outstandingAlerts.forEach((alert) => {
      console.log(`${alert.id} :: ${alert.domain} :: ${alert.message}`);
    });
  }

  console.log('');
  console.log(chalk.bold('Pause History'));
  if (snapshot.pausedDomains.length === 0) {
    console.log(chalk.green('No pause events recorded.'));
  } else {
    snapshot.pausedDomains.forEach((event) => {
      console.log(`${event.domain} — ${event.reason}`);
    });
  }

  console.log('');
  console.log(chalk.bold('Node Roster'));
  snapshot.nodeRoster.forEach((node) => {
    console.log(`- ${node.ens} => ${node.domain}`);
  });

  console.log('');
  console.log(chalk.bold('Latest Batch Proof'));
  console.log(`Proof ${snapshot.latestBatch.proofId.slice(0, 10)}… covering ${snapshot.latestBatch.jobs.length} jobs.`);
}

main();
