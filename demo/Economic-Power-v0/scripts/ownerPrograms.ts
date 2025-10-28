import path from 'node:path';
import process from 'node:process';
import { stdout } from 'node:process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadScenarioFromFile } from './runDemo';

const DEFAULT_SCENARIO = path.join(__dirname, '..', 'scenario', 'baseline.json');

type ProgramCategory =
  | 'job'
  | 'validator'
  | 'adapter'
  | 'module'
  | 'treasury'
  | 'orchestrator';

type ProgramRecord = {
  id: string;
  target: string;
  script: string;
  description: string;
  category: ProgramCategory;
};

function flattenPrograms(scenario: Awaited<ReturnType<typeof loadScenarioFromFile>>): ProgramRecord[] {
  const catalog = scenario.commandCatalog;
  const entries: ProgramRecord[] = [];
  const pushAll = (category: ProgramCategory, programs: typeof catalog.jobPrograms) => {
    for (const program of programs) {
      entries.push({
        id: program.id,
        target: program.target,
        script: program.script,
        description: program.description,
        category,
      });
    }
  };
  pushAll('job', catalog.jobPrograms);
  pushAll('validator', catalog.validatorPrograms);
  pushAll('adapter', catalog.adapterPrograms);
  pushAll('module', catalog.modulePrograms);
  pushAll('treasury', catalog.treasuryPrograms);
  pushAll('orchestrator', catalog.orchestratorPrograms);
  return entries;
}

function renderProgram(program: ProgramRecord): string {
  return [
    `Program: ${program.id} (${program.category})`,
    `Target: ${program.target}`,
    `Command: ${program.script}`,
    `Description: ${program.description}`,
    '',
    'Run the command above with the owner multi-sig to execute the deterministic program.',
  ].join('\n');
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .option('scenario', {
      type: 'string',
      default: DEFAULT_SCENARIO,
      describe: 'Scenario JSON file to load command catalog from',
    })
    .option('program', {
      type: 'string',
      describe: 'Program identifier to execute',
    })
    .option('list', {
      type: 'boolean',
      describe: 'List all available programs',
      default: false,
    })
    .option('json', {
      type: 'boolean',
      describe: 'Emit machine-readable JSON output',
      default: false,
    })
    .check((args) => {
      if (!args.list && !args.program) {
        throw new Error('Specify --list to enumerate programs or --program <id> to execute one.');
      }
      return true;
    })
    .help()
    .parse();

  const scenario = await loadScenarioFromFile(argv.scenario);
  const programs = flattenPrograms(scenario);

  if (argv.list) {
    if (argv.json) {
      stdout.write(JSON.stringify({ programs }, null, 2));
      stdout.write('\n');
      return;
    }
    const header = 'Owner program catalog';
    stdout.write(`${header}\n${'='.repeat(header.length)}\n`);
    for (const program of programs) {
      stdout.write(renderProgram(program));
      stdout.write('\n---\n');
    }
    return;
  }

  const programId = String(argv.program);
  const program = programs.find((entry) => entry.id === programId);
  if (!program) {
    throw new Error(`Program ${programId} not found. Run with --list to view options.`);
  }

  if (argv.json) {
    stdout.write(JSON.stringify({ program }, null, 2));
    stdout.write('\n');
    return;
  }

  stdout.write(renderProgram(program));
  stdout.write('\n');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Owner command execution failed:', error);
    process.exitCode = 1;
  });
}
