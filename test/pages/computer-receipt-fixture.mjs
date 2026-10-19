// Explicit protocol double for UI/parser tests. No browser or model receipt is claimed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  canonical,
  digest,
} from '../../integrations/alpha-agent/vendor/alpha-computer/docs/assets/successor/engine.mjs';
import { exactDigest } from '../../integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/continuity.mjs';
import { inspectComputerReturn } from '../../integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/computer.mjs';
export async function protocolComputerAttempt(inputs, state = 'interrupted') {
  if (!['interrupted', 'review'].includes(state))
    throw Error('Protocol fixture state');
  const handoff = JSON.parse(inputs.handoffRaw),
    returned = JSON.parse(inputs.returnRaw);
  handoff.attemptId = crypto.randomUUID();
  const handoffRaw = canonical(handoff),
    context = await digest('computer-handoff', handoff);
  const commitment = await digest('computer-task', {
    task: handoff.task,
    provider: returned.execution.provider,
    image: returned.execution.image,
    worker_sha256: returned.execution.workerSha256,
    execution_context: context,
  });
  returned.handoffSha256 = await exactDigest(handoffRaw);
  returned.executionContext = context;
  returned.taskCommitment = commitment;
  returned.receipt = {
    ...returned.receipt,
    run_id: crypto.randomUUID(),
    state,
    execution_context: context,
    commitment,
  };
  returned.signedReceipt.payload = returned.receipt;
  const returnRaw = canonical(returned);
  await inspectComputerReturn(handoffRaw, returnRaw);
  return { ...inputs, handoffRaw, returnRaw };
}
export function protocolComputerInputs() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'jobs-computer-ui-protocol-')
  );
  try {
    const output = path.join(directory, 'fixture');
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('./four-repo-computer-receipt-native.mjs', import.meta.url)
        ),
        fileURLToPath(
          new URL(
            '../../integrations/alpha-agent/vendor/alpha-computer/',
            import.meta.url
          )
        ),
        output,
      ],
      { stdio: 'pipe' }
    );
    return Object.fromEntries(
      [
        ['handoffRaw', 'handoff.json'],
        ['returnRaw', 'computer-return.json'],
        ['reportRaw', 'frozen-mission-report.json'],
      ].map(([key, name]) => [
        key,
        fs.readFileSync(path.join(output, name), 'utf8'),
      ])
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
