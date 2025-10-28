import path from 'path';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { loadScenarioConfig, prepareScenario, executeScenario } from '../src/core/scenario';
import { writeReportArtifacts } from '../src/core/reporting';
import { subgraphIndexer } from '../src/core/subgraph';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('config', {
      type: 'string',
      demandOption: true,
      describe: 'Path to the scenario JSON or YAML file',
    })
    .option('out', {
      type: 'string',
      describe: 'Directory where reports will be written',
      default: path.join(__dirname, '..', 'reports', 'scenarios'),
    })
    .option('name', {
      type: 'string',
      describe: 'Override the output folder name',
    })
    .strict()
    .help()
    .parseSync();

  const scenarioPath = path.resolve(argv.config);
  const scenarioConfig = loadScenarioConfig(scenarioPath);
  subgraphIndexer.clear();
  const prepared = prepareScenario(scenarioConfig);
  const executed = executeScenario(prepared);

  const scenarioName = executed.context.scenarioName ?? 'validator-constellation-scenario';
  const slug = slugify(argv.name ?? scenarioName);
  const reportDir = path.join(path.resolve(argv.out), slug || `scenario-${Date.now()}`);

  writeReportArtifacts({
    reportDir,
    roundResult: executed.report,
    subgraphRecords: subgraphIndexer.list(),
    events: [executed.report.vrfWitness, ...executed.report.commits, ...executed.report.reveals],
    context: executed.context,
    jobBatch: prepared.plan.jobBatch,
    truthfulVote: prepared.plan.truthfulVote,
  });

  console.log(`Scenario "${scenarioName}" executed successfully.`);
  console.log('VRF witness transcript:', executed.report.vrfWitness.transcript);
  console.log(`Validators slashed: ${executed.report.slashingEvents.length}`);
  console.log(`Sentinel alerts: ${executed.report.sentinelAlerts.length}`);
  console.log(`Reports written to ${reportDir}`);
}

main().catch((error) => {
  console.error('Scenario execution failed:', error);
  process.exit(1);
});
