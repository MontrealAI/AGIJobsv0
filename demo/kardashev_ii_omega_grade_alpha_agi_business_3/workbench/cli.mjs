import io from './io.cjs';
import {
  makeTask,
  taskDigest,
  createExample,
  reviewEvidence,
  json,
} from './core.mjs';
import { templates, families } from './catalog.mjs';
const [command = 'help', value, family = 'foundation', ...extra] =
  process.argv.slice(2);
try {
  if (extra.length) throw new Error('Too many arguments.');
  if (command === 'help')
    console.log(
      'Usage: node workbench/cli.mjs templates | task TEMPLATE [FAMILY] | example [FAMILY] | review RECEIPT [FAMILY]\nNo command contacts a provider or submits a transaction.'
    );
  else if (command === 'templates') console.log(json({ templates, families }));
  else if (command === 'task') {
    const task = await makeTask(value, family);
    console.log(
      json({ task, taskSha256: await taskDigest(task), admitted: false })
    );
  } else if (command === 'example')
    console.log(json(await createExample(value || 'foundation')));
  else if (command === 'review') {
    const result = await reviewEvidence(
      io.readJson(value),
      await makeTask('energy', family)
    );
    console.log(json(result));
    process.exitCode = result.accepted ? 0 : 1;
  } else throw new Error('Unknown command. Use help.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
