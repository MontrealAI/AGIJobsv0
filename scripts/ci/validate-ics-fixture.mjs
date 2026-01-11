import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const compilerOptions = {
  module: 'esnext',
  moduleResolution: 'node',
};

if (!process.env.TS_NODE_COMPILER_OPTIONS) {
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify(compilerOptions);
}

const fixturePath = join(
  process.cwd(),
  'test',
  'orchestrator',
  'fixtures',
  'create_job_complete.json'
);
const icsModuleUrl = pathToFileURL(
  join(process.cwd(), 'packages', 'orchestrator', 'src', 'ics.ts')
).href;

const fixturePayload = await readFile(fixturePath, 'utf8');
const module = await import(icsModuleUrl);
const validate = module.validateICS ?? module.default?.validateICS;

if (!validate) {
  throw new Error(
    'validateICS export not found in packages/orchestrator/src/ics.ts'
  );
}

try {
  validate(fixturePayload);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`validateICS rejected fixture payload: ${message}`);
}
