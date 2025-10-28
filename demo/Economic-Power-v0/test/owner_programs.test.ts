import { strict as assert } from 'node:assert';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_SCENARIO_PATH,
  ProgramCategory,
  ProgramRecord,
  loadPrograms,
  renderProgram,
} from '../scripts/ownerPrograms';
import { loadScenarioFromFile } from '../scripts/runDemo';

const scenarioPath = path.join(__dirname, '..', 'scenario', 'baseline.json');

function matches(program: ProgramRecord, id: string, name?: string): boolean {
  const target = program.target.trim().toLowerCase();
  if (target === '*' || target === 'all') {
    return true;
  }
  if (target === id.toLowerCase()) {
    return true;
  }
  if (name && target === name.toLowerCase()) {
    return true;
  }
  return false;
}

test('owner program catalog covers every operational surface', async () => {
  const scenario = await loadScenarioFromFile(scenarioPath);
  const programs = await loadPrograms(scenarioPath);

  const expectedCategories: ProgramCategory[] = [
    'job',
    'validator',
    'adapter',
    'module',
    'treasury',
    'orchestrator',
  ];
  for (const category of expectedCategories) {
    assert(
      programs.some((program) => program.category === category),
      `Missing program category ${category}`,
    );
  }

  const seenIds = new Set<string>();
  for (const program of programs) {
    assert(program.script.trim().length > 0, `Program ${program.id} should define a command`);
    assert(!seenIds.has(program.id), `Program identifiers must be unique: ${program.id}`);
    seenIds.add(program.id);
  }

  const jobPrograms = programs.filter((program) => program.category === 'job');
  for (const job of scenario.jobs) {
    assert(
      jobPrograms.some((program) => matches(program, job.id, job.name)),
      `Owner catalog missing job program for ${job.id}`,
    );
  }

  const validatorPrograms = programs.filter((program) => program.category === 'validator');
  for (const validator of scenario.validators) {
    assert(
      validatorPrograms.some((program) => matches(program, validator.id, validator.name)),
      `Owner catalog missing validator program for ${validator.id}`,
    );
  }

  const modulePrograms = programs.filter((program) => program.category === 'module');
  for (const module of scenario.modules) {
    assert(
      modulePrograms.some((program) => matches(program, module.id, module.name)),
      `Owner catalog missing module program for ${module.id}`,
    );
  }

  const adapterPrograms = programs.filter((program) => program.category === 'adapter');
  for (const adapter of scenario.stablecoinAdapters) {
    assert(
      adapterPrograms.some((program) => matches(program, adapter.name)),
      `Owner catalog missing adapter program for ${adapter.name}`,
    );
  }

  const treasuryPrograms = programs.filter((program) => program.category === 'treasury');
  assert(treasuryPrograms.length >= 1, 'Treasury command catalog should include funding programs');
});

test('renderProgram produces a non-empty operator briefing', async () => {
  const programs = await loadPrograms(DEFAULT_SCENARIO_PATH);
  assert.ok(programs.length > 0, 'Expected at least one program');
  const rendered = renderProgram(programs[0]);
  assert(rendered.includes('Program:'), 'Rendered output should include a program header');
  assert(rendered.includes('Command:'), 'Rendered output should include the command line');
  assert(
    rendered
      .trim()
      .endsWith(
        'Run the command above with the owner multi-sig to execute the deterministic program.',
      ),
    'Rendered output should include deterministic execution guidance',
  );
});
