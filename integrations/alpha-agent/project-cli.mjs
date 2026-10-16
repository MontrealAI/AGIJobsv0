#!/usr/bin/env node
import fs from 'node:fs';
import { importAlphaProject, inspectProjectTransfer, runProjectTransfer, PROJECT_TRANSFER_LIMIT } from './project-transfer.mjs';
function read(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > BigInt(PROJECT_TRANSFER_LIMIT)) throw Error('JOBS_PROJECT_INPUT_LIMIT');
    const buffer = Buffer.alloc(PROJECT_TRANSFER_LIMIT + 1); let length = 0;
    while (length < buffer.length) { const n = fs.readSync(fd, buffer, length, buffer.length - length, length); if (!n) break; length += n; }
    const after = fs.fstatSync(fd, { bigint: true });
    if (length > PROJECT_TRANSFER_LIMIT || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || BigInt(length) !== after.size) throw Error('JOBS_PROJECT_INPUT_CHANGED');
    // Keep a leading BOM visible so strict JSON rejects it without changing source bytes.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
  } finally { fs.closeSync(fd); }
}
async function main() {
  const [action, input, ...args] = process.argv.slice(2);
  let raw, output;
  if (action === 'import' && args.length === 3) {
    const [amountBaseUnits, compiledAt, file] = args;
    raw = await importAlphaProject(read(input), { amountBaseUnits, compiledAt }); output = file;
  } else if (action === 'run' && args.length === 1) {
    raw = await runProjectTransfer(read(input)); output = args[0];
  } else if (action === 'inspect' && args.length === 0) {
    const { transfer, lastRecord } = await inspectProjectTransfer(read(input));
    process.stdout.write(JSON.stringify({ project: transfer.project, route: transfer.route, planning: transfer.planning, checkpoints: transfer.history.length, result: lastRecord.result?.pack.result.summary ?? null, authority: transfer.authority, qualification: transfer.qualification, settlement: transfer.settlement }, null, 2) + '\n'); return;
  } else throw Error('JOBS_PROJECT_USAGE: import INPUT AGIALPHA_BASE_UNITS ISO_CLOCK OUTPUT | run INPUT OUTPUT | inspect INPUT');
  fs.writeFileSync(output, raw, { flag: 'wx', mode: 0o600 });
  process.stdout.write('Saved project checkpoint. No funding or authority created.\n');
}
main().catch(error => { process.stderr.write((error.code || (/^JOBS_PROJECT_[A-Z_]+/.exec(error.message)?.[0]) || 'JOBS_PROJECT_INVALID') + '\n'); process.exitCode = 1; });
