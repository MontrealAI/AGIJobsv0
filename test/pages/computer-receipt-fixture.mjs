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
import {
  inspectComputerReturn,
  retainComputerHandoff,
  importComputerReturn,
  reviewComputerReturn,
} from '../../integrations/alpha-agent/vendor/alpha-computer/examples/successor-alpha/computer.mjs';
export async function protocolComputerLearningArchive(
  inputs = protocolComputerInputs(),
  { historicalSourceHash = null } = {}
) {
  const project = JSON.parse(JSON.parse(inputs.handoffRaw).projectRaw);
  const attempts = [
    inputs,
    await protocolComputerAttempt(inputs, 'interrupted', {
      sourceHash: historicalSourceHash,
    }),
    await protocolComputerAttempt(inputs, 'review'),
  ];
  let historyRaw = null;
  for (const attempt of attempts) {
    historyRaw = await retainComputerHandoff(project, attempt.handoffRaw, {
      priorRecord: historyRaw,
    });
    historyRaw = await importComputerReturn(
      project,
      attempt.handoffRaw,
      attempt.returnRaw,
      { priorRecord: historyRaw }
    );
  }
  historyRaw = await reviewComputerReturn(
    project,
    inputs.handoffRaw,
    {
      decision: 'useful',
      note: 'Protocol-double owner review; no execution or independent proof claim.',
      minutes: 1,
      criterionResults: JSON.parse(
        inputs.handoffRaw
      ).strategy.successCriteria.map(() => true),
    },
    { priorRecord: historyRaw }
  );
  historyRaw = ' \n' + historyRaw + '\n';
  const archiveRaw =
    ' \n' +
    JSON.stringify(
      {
        schema: 'successor-alpha-learning-archive/v2',
        project,
        records: [],
        nativeHandoffRaw: null,
        nativeContinuityRaw: null,
        computerHistoryRaw: historyRaw,
      },
      null,
      2
    ) +
    '\n';
  return { archiveRaw, historyRaw, attempts };
}
export async function protocolComputerAttempt(
  inputs,
  state = 'interrupted',
  { sourceHash = null } = {}
) {
  if (!['interrupted', 'review'].includes(state))
    throw Error('Protocol fixture state');
  const handoff = JSON.parse(inputs.handoffRaw),
    returned = JSON.parse(inputs.returnRaw);
  handoff.attemptId = crypto.randomUUID();
  if (sourceHash !== null) handoff.sourceHash = sourceHash;
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
  returned.sourceHash = handoff.sourceHash;
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
