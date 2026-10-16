#!/usr/bin/env node
'use strict';

// Trusted native-driver API only. Browser/Ubuntu requests must never supply
// modules, provider URLs, executable paths or local file paths to this API.
// The operator chooses input/output paths at their trusted command line. The
// caller supplies the already-qualified session and independently configured
// read provider. This module has no RPC construction, signing or relay client.
const fs = require('node:fs');
const path = require('node:path');
const { canonicalJson } = require('./external-envelope.cjs');
const { parseJson } = require('./external-profile.cjs');
const COMMANDS = Object.freeze([
  'inspect',
  'handoff',
  'retrieve',
  'import-signed',
  'authorize-relay',
  'observe',
  'repair-head',
  'recover-command',
]);
class CommandError extends Error {
  constructor(message) {
    super(`External command: ${message}`);
    this.code = 'EXTERNAL_COMMAND_FAILED';
  }
}
function need(value, message) {
  if (!value) throw new CommandError(message);
}
function statIdentity(stat) {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    uid: String(stat.uid),
    ...(stat.isFile() ? { nlink: String(stat.nlink) } : {}),
  };
}
function entry(file, kind, ownerOnly = false) {
  need(
    typeof file === 'string' &&
      path.isAbsolute(file) &&
      path.resolve(file) === file &&
      !/[\u0000-\u001f\u007f]/.test(file),
    'exact absolute local paths required'
  );
  const stat = fs.lstatSync(file, { bigint: true });
  need(
    !stat.isSymbolicLink() &&
      (kind === 'directory' ? stat.isDirectory() : stat.isFile()) &&
      fs.realpathSync(file) === file,
    'real non-symlink local paths required'
  );
  if (ownerOnly)
    need(
      stat.uid === BigInt(process.getuid()) && (stat.mode & 0o077n) === 0n,
      'private owner-only input/output required'
    );
  if (kind === 'file')
    need(stat.nlink === 1n, 'hard-linked capability files are forbidden');
  return { file, kind, ownerOnly, identity: statIdentity(stat) };
}
function verify(pin) {
  need(
    canonicalJson(entry(pin.file, pin.kind, pin.ownerOnly).identity) ===
      canonicalJson(pin.identity),
    'reserved path identity changed'
  );
}
function privatePath(file) {
  need(
    typeof file === 'string' &&
      path.isAbsolute(file) &&
      path.resolve(file) === file,
    'exact absolute local paths required'
  );
  const root = path.resolve(__dirname, '../..');
  need(
    file !== root && !file.startsWith(root + path.sep),
    'private input/output must remain outside source checkout'
  );
  entry(path.dirname(file), 'directory', true);
}
function parentPins(directory) {
  const pins = [];
  for (let current = directory; ; current = path.dirname(current)) {
    pins.push(entry(current, 'directory'));
    if (current === path.dirname(current)) return pins;
  }
}
function syncDirectory(directory) {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function reserveOutput(file) {
  privatePath(file);
  const parents = parentPins(path.dirname(file));
  const fd = fs.openSync(
    file,
    fs.constants.O_RDWR |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_NOFOLLOW,
    0o600
  );
  let expected = Buffer.alloc(0);
  try {
    const pin = entry(file, 'file', true);
    need(
      canonicalJson(statIdentity(fs.fstatSync(fd, { bigint: true }))) ===
        canonicalJson(pin.identity),
      'output reservation changed'
    );
    syncDirectory(path.dirname(file));
    function check() {
      parents.forEach(verify);
      verify(pin);
      need(
        canonicalJson(statIdentity(fs.fstatSync(fd, { bigint: true }))) ===
          canonicalJson(pin.identity) &&
          fs.fstatSync(fd).size === expected.length,
        'output reservation changed'
      );
      const actual = Buffer.alloc(expected.length);
      need(
        fs.readSync(fd, actual, 0, actual.length, 0) === actual.length &&
          actual.equals(expected),
        'output reservation contents changed'
      );
    }
    return {
      check,
      write(value) {
        check();
        const bytes = Buffer.from(canonicalJson(value) + '\n');
        let offset = 0;
        while (offset < bytes.length) {
          const written = fs.writeSync(
            fd,
            bytes,
            offset,
            bytes.length - offset,
            offset
          );
          need(written > 0, 'private output write failed');
          offset += written;
        }
        fs.fsyncSync(fd);
        expected = bytes;
        check();
        syncDirectory(path.dirname(file));
      },
      close() {
        fs.closeSync(fd);
      },
    };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}
function signedInput(file) {
  privatePath(file);
  const pin = entry(file, 'file', true),
    parents = parentPins(path.dirname(file));
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let bytes;
  try {
    need(
      canonicalJson(statIdentity(fs.fstatSync(fd, { bigint: true }))) ===
        canonicalJson(pin.identity) && fs.fstatSync(fd).size <= 8 * 1024 * 1024,
      'signed input changed or is oversized'
    );
    bytes = fs.readFileSync(fd);
    verify(pin);
  } finally {
    fs.closeSync(fd);
  }
  const input = parseJson(bytes);
  need(
    input &&
      Object.getPrototypeOf(input) === Object.prototype &&
      Object.keys(input).length === 1 &&
      Object.hasOwn(input, 'raw') &&
      typeof input.raw === 'string' &&
      /^0x(?:[0-9a-f]{2})+$/.test(input.raw),
    'signed file requires exactly one canonical raw field'
  );
  return {
    raw: input.raw,
    check() {
      parents.forEach(verify);
      verify(pin);
      need(fs.readFileSync(file).equals(bytes), 'signed input bytes changed');
    },
  };
}
function validateArguments(options) {
  need(
    options && Object.getPrototypeOf(options) === Object.prototype,
    'plain trusted native arguments required'
  );
  const { command } = options;
  need(COMMANDS.includes(command), 'unsupported command');
  const permitted = ['session', 'command', 'output'];
  if (command === 'handoff') permitted.push('review');
  if (command === 'import-signed') permitted.push('signedFile');
  if (['authorize-relay', 'repair-head', 'recover-command'].includes(command))
    permitted.push('acknowledgement');
  need(
    Reflect.ownKeys(options).every((key) => permitted.includes(key)) &&
      ['session', 'command', 'output'].every((key) =>
        Object.hasOwn(options, key)
      ),
    'missing or unsupported command arguments'
  );
  for (const key of Object.keys(options))
    need(
      Object.hasOwn(Object.getOwnPropertyDescriptor(options, key), 'value'),
      'command arguments must be plain data'
    );
  if (command === 'handoff') {
    const review = options.review;
    need(
      review &&
        Object.getPrototypeOf(review) === Object.prototype &&
        Object.keys(review).sort().join() ===
          'planHash,policyHash,unsignedHash' &&
        Object.values(review).every(
          (value) => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value)
        ),
      'exact independent operation review required'
    );
  }
  if (
    ['authorize-relay', 'repair-head'].includes(command) ||
    options.acknowledgement !== undefined
  )
    need(
      typeof options.acknowledgement === 'string' &&
        options.acknowledgement.length > 0 &&
        options.acknowledgement.length <= 2048 &&
        !/[\u0000-\u001f\u007f]/.test(options.acknowledgement),
      'exact operator acknowledgement required'
    );
}
async function runCommand(options) {
  let reservation;
  try {
    validateArguments(options);
    const { session, command, review, signedFile, acknowledgement, output } =
      options;
    const method = {
      inspect: 'inspect',
      handoff: 'handoff',
      retrieve: 'retrieve',
      'import-signed': 'importSigned',
      'authorize-relay': 'authorizeRelay',
      observe: 'observe',
      'repair-head': 'repairHead',
      'recover-command':
        acknowledgement === undefined ? 'inspectRecovery' : 'recoverCommand',
    }[command];
    need(
      session && typeof session[method] === 'function',
      'trusted session command is unavailable'
    );
    const signed = command === 'import-signed' ? signedInput(signedFile) : null;
    reservation = reserveOutput(output); // Before any potentially durable action.
    const argument =
      command === 'handoff' ? review : signed ? signed.raw : acknowledgement;
    const result = await session[method](argument);
    reservation.check();
    if (signed) signed.check();
    if (command === 'authorize-relay')
      need(
        result &&
          typeof result.raw === 'string' &&
          /^0x(?:[0-9a-f]{2})+$/.test(result.raw) &&
          result.oneAuthorizedAttempt === true &&
          /^0x[0-9a-f]{64}$/.test(result.transactionHash),
        'invalid private relay capability'
      );
    reservation.write(result);
    // Never return raw capability, user-controlled result data, provider errors,
    // stack traces, input paths, or the review/acknowledgement to stdout callers.
    return Object.freeze({
      schema: 'jobs-external-command-result-v1',
      command,
      outputWritten: true,
      broadcastByCoordinator: false,
    });
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError(
      'failed; retain private output and original session for inspection; no automatic retry'
    );
  } finally {
    if (reservation) reservation.close();
  }
}
if (require.main === module) {
  // An executable launcher must be independently integrated with the trusted
  // runtime. Deliberately do not accept --rpc, --module or browser-supplied paths.
  process.stderr.write(
    'External command launcher is unsupported until a reviewed trusted runtime driver supplies the session. No command was executed.\n'
  );
  process.exitCode = 1;
}
module.exports = { runCommand, COMMANDS };
