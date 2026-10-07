import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { defaults, plan, workOrder, reportMarkdown } from './model.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function run(output, settings = defaults) {
  const tasks = JSON.parse(
    fs.readFileSync(path.join(root, 'tasks.json'), 'utf8')
  );
  const result = plan(settings);
  const destination = path.resolve(output);
  fs.mkdirSync(destination, { recursive: true });
  const artifacts = {
    'plan.json': JSON.stringify(result, null, 2) + '\n',
    'work-orders.json':
      JSON.stringify(
        tasks.map((task) => workOrder(task, settings)),
        null,
        2
      ) + '\n',
    'report.md': reportMarkdown(result),
  };
  const receipt = {
    schemaVersion: 1,
    evidenceClass: 'local-planning-calculation',
    providerCalls: 0,
    chainTransactions: 0,
    productionApproved: false,
    settlementApproved: false,
    independentReviewCompleted: false,
    artifacts: Object.entries(artifacts).map(([name, content]) => ({
      name,
      sha256: hash(content),
    })),
  };
  // Exclusive creation prevents silent overwrite of an earlier evidence bundle.
  for (const name of [...Object.keys(artifacts), 'receipt.json'])
    if (fs.existsSync(path.join(destination, name)))
      throw new Error(
        `Output already contains ${name}; choose a new directory.`
      );
  for (const [name, content] of Object.entries(artifacts))
    fs.writeFileSync(path.join(destination, name), content, { flag: 'wx' });
  fs.writeFileSync(
    path.join(destination, 'receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
    { flag: 'wx' }
  );
  return receipt;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, output, source, ...extra] = process.argv.slice(2);
    if (command !== 'run' || !output || extra.length)
      throw new Error(
        'Usage: node cli.mjs run NEW_OUTPUT_DIRECTORY [scenario.json]'
      );
    console.log(
      JSON.stringify(
        run(
          output,
          source ? JSON.parse(fs.readFileSync(source, 'utf8')) : defaults
        ),
        null,
        2
      )
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
