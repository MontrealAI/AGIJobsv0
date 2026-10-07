import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  json,
  MAX_BYTES,
  runAnalysis,
  makeWorkOrder,
  handoff,
} from './core.mjs';
import { reviewEvidence } from './review.mjs';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(file) {
  if (fs.statSync(file).size > MAX_BYTES)
    throw new Error('Input exceeds 1 MiB.');
  return fs.readFileSync(file, 'utf8');
}
async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (command === 'help' || command === '--help') {
    console.log(
      'Hypernova: run | task | review\n  --source FILE (default: project-plan.json)\n  --out NEW_DIRECTORY (run/task; refuses overwrite)\n  --type WORK_TYPE --region REGION --budget USDC (task)\n  --evidence FILE (review; exit 2 if checks fail)'
    );
    return;
  }
  const allowed = {
    run: ['source', 'out'],
    task: ['source', 'out', 'type', 'region', 'budget'],
    review: ['source', 'evidence'],
  }[command];
  if (!allowed) throw new Error('Unknown command. Use help.');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (
      !args[i].startsWith('--') ||
      !allowed.includes(key) ||
      !args[i + 1] ||
      args[i + 1].startsWith('--') ||
      Object.hasOwn(options, key)
    )
      throw new Error('Unknown, duplicate, or missing option: ' + args[i]);
    options[key] = args[i + 1];
  }
  const source = read(options.source || path.join(base, 'project-plan.json'));
  if (command === 'review') {
    if (!options.evidence) throw new Error('--evidence is required.');
    const result = await reviewEvidence(
      JSON.parse(read(options.evidence)),
      source
    );
    console.log(json(result));
    if (!result.passed) process.exitCode = 2;
    return;
  }
  let files;
  if (command === 'run') {
    const bundle = await runAnalysis(source),
      review = await reviewEvidence(bundle, source);
    if (!review.passed)
      throw new Error(
        'Generated analysis failed independent calculation checks.'
      );
    files = [
      ['source-plan.json', source],
      ['evidence.json', json(bundle)],
      ['review.json', json(review)],
      ...bundle.artifacts.map((a) => [a.name, a.content]),
    ];
  } else {
    const order = await makeWorkOrder(source, options.type, options.region, {
      budgetUSDC: options.budget,
    });
    files = [
      ['source-plan.json', source],
      ['work-order.json', json(order)],
      ['handoff.md', handoff(order)],
    ];
  }
  const out = path.resolve(
    options.out ||
      `reports/zenith-hypernova-work/${command}-${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}`
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.mkdirSync(out); // EEXIST preserves previous evidence and avoids symlink overwrite.
  for (const [name, content] of files)
    fs.writeFileSync(path.join(out, name), content, { flag: 'wx' });
  console.log(
    `${
      command === 'run'
        ? 'Analysis and content checks completed'
        : 'Unfunded proposal prepared'
    }: ${out}\nNo provider calls or blockchain transactions.`
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
