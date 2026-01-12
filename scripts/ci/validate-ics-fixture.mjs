import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function main() {
  const compilerOptions = {
    module: 'esnext',
    moduleResolution: 'node',
  };

  if (!process.env.TS_NODE_COMPILER_OPTIONS) {
    process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify(compilerOptions);
  }

  const fixturesDir = join(process.cwd(), 'test', 'orchestrator', 'fixtures');
  const icsModuleUrl = pathToFileURL(
    join(process.cwd(), 'packages', 'orchestrator', 'src', 'ics.ts')
  ).href;

  const [fixtureNames, module] = await Promise.all([
    readdir(fixturesDir),
    import(icsModuleUrl),
  ]);
  const validate = module.validateICS ?? module.default?.validateICS;

  if (!validate) {
    throw new Error(
      'validateICS export not found in packages/orchestrator/src/ics.ts'
    );
  }
  const jsonFixtures = fixtureNames.filter((name) => name.endsWith('.json'));

  if (jsonFixtures.length === 0) {
    throw new Error(`No JSON fixtures found under ${fixturesDir}`);
  }

  for (const name of jsonFixtures) {
    const fixturePath = join(fixturesDir, name);
    const fixturePayload = await readFile(fixturePath, 'utf8');
    try {
      validate(fixturePayload);
      console.log(`✅ validated ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`validateICS rejected ${name}: ${message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
