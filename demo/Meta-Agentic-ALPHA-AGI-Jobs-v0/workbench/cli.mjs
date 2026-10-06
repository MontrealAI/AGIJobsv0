import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readJson, readText } from './io.cjs';
import {
  json,
  stages,
  makeTask,
  taskDigest,
  makeProjectBrief,
  renderProjectBrief,
} from './model.mjs';
import { execute, renderReport } from './execute.mjs';
import { reviewBundle, reviewReceipt, reviewCandidate } from './review.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const source = readJson(path.join(root, 'scenario.json'));
const [command = 'help', ...args] = process.argv.slice(2);
const usage =
  'Meta-Agentic ALPHA\n  run [NEW_OUTPUT_DIRECTORY]\n  task STAGE_ID\n  inspect STAGE_ID\n  brief PROJECT_ID\n  brief-markdown PROJECT_ID\n  review EVIDENCE.json\n  review-artifact STAGE_ID CANDIDATE.json\n  review-receipt STAGE_ID RECEIPT.json EXPECTED_JOB_ID EXPECTED_DEPLOYMENT_ID\n  stages\n  help\nThe offline run makes zero provider calls or transactions. Every run uses a new directory. Project briefs are proposals requiring separate commissioning.';
try {
  if (['help', '--help'].includes(command) && !args.length) console.log(usage);
  else if (command === 'stages' && !args.length) console.log(json(stages));
  else if (['brief', 'brief-markdown'].includes(command) && args.length === 1) {
    const brief = await makeProjectBrief(source, args[0]);
    process.stdout.write(
      command === 'brief' ? json(brief) : renderProjectBrief(brief)
    );
  } else if (['task', 'inspect'].includes(command) && args.length === 1) {
    const task = await makeTask(source, args[0]);
    console.log(
      json(
        command === 'task'
          ? task
          : { task, taskSha256: await taskDigest(task), admitted: false }
      )
    );
  } else if (command === 'run' && args.length <= 1) {
    const bundle = await execute(source),
      review = await reviewBundle(bundle, source);
    if (!review.accepted)
      throw new Error(
        'Generated evidence failed independent checks: ' + review.error
      );
    const out = path.resolve(
      args[0] || path.join('reports/meta-agentic-alpha', randomUUID())
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.mkdirSync(out, { mode: 0o700 });
    const write = (name, content) =>
      fs.writeFileSync(path.join(out, name), content, {
        flag: 'wx',
        mode: 0o600,
      });
    for (const row of bundle.results) {
      write(row.artifact.name, row.artifact.content);
      write(
        row.stageId + '.task.json',
        json(await makeTask(source, row.stageId))
      );
    }
    write('scenario.json', json(source));
    write('report.md', renderReport(bundle));
    write('review.json', json(review));
    write('evidence.json', json(bundle));
    console.log(
      json({
        outputDirectory: out,
        evidence: path.join(out, 'evidence.json'),
        accepted: review.accepted,
        stages: bundle.results.length,
        providerCalls: 0,
        chainTransactions: 0,
        productionApproved: false,
        settlementApproved: false,
      })
    );
  } else if (command === 'review' && args.length === 1) {
    const result = await reviewBundle(readJson(args[0]), source);
    console.log(json(result));
    if (!result.accepted) process.exitCode = 1;
  } else if (command === 'review-artifact' && args.length === 2) {
    const result = await reviewCandidate(readText(args[1]), source, args[0]);
    console.log(json(result));
    if (!result.accepted) process.exitCode = 1;
  } else if (command === 'review-receipt' && args.length === 4) {
    const result = await reviewReceipt(
      readJson(args[1]),
      source,
      args[0],
      args[2],
      args[3]
    );
    console.log(json(result));
    if (!result.accepted) process.exitCode = 1;
  } else throw new Error(usage);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
