/* eslint-disable no-console */
import { buildSimulationInput, ValidatorConstellationSimulation } from '../src/simulation';

function main(): void {
  const epoch = Number(process.env.EPOCH ?? Date.now().toString().slice(-4));
  const input = buildSimulationInput(epoch);
  const simulation = new ValidatorConstellationSimulation(input);
  const report = simulation.run();
  const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);
  console.log(JSON.stringify(report, replacer, 2));
}

main();
