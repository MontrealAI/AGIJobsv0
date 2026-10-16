'use strict';

// All inputs in this file are synthetic. No wallet, provider, network, signing,
// deployment, key environment variable, or real secret is used by these tests.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  readSecret,
  confirmPublicPlan,
  __testOnly,
} = require('../../scripts/deploy/tty-secret.cjs');
const modulePath = path.resolve(
  __dirname,
  '../../scripts/deploy/tty-secret.cjs'
);
const syntheticHex = Array.from({ length: 32 }, (_, index) =>
  index.toString(16).padStart(2, '0')
).join('');

class FakeInput extends EventEmitter {
  constructor({ raw = false, flowing = null } = {}) {
    super();
    this.isTTY = true;
    this.isRaw = raw;
    this.readableFlowing = flowing;
    this.readableEncoding = null;
    this.rawCalls = [];
    this.destroyed = false;
    this.readableEnded = false;
  }
  pause() {
    this.readableFlowing = false;
    return this;
  }
  resume() {
    this.readableFlowing = true;
    return this;
  }
  setRawMode(raw) {
    this.rawCalls.push(raw);
    this.isRaw = raw;
    if (this.throwRawAt === this.rawCalls.length)
      throw new Error('synthetic raw error');
    return this;
  }
}
class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.writes = [];
  }
  write(text) {
    this.writes.push(text);
    if (this.throwWriteAt === this.writes.length)
      throw new Error('synthetic write error');
    return true;
  }
}
function fixture(inputOptions) {
  const input = new FakeInput(inputOptions);
  const output = new FakeOutput();
  const signals = new EventEmitter();
  return {
    input,
    output,
    signals,
    read: () =>
      __testOnly.readSecretFromStreamsForTest({ input, output, signals }),
  };
}
function send(f, text) {
  const bytes = Buffer.from(text, 'ascii');
  f.input.emit('data', bytes);
  return bytes;
}
function clean(f, raw = false, flowing = false) {
  assert.equal(f.input.isRaw, raw);
  assert.equal(f.input.readableFlowing, flowing);
  for (const event of ['data', 'error', 'end', 'close'])
    assert.equal(f.input.listenerCount(event), 0);
  for (const event of ['error', 'close'])
    assert.equal(f.output.listenerCount(event), 0);
  for (const event of ['SIGINT', 'SIGTERM', 'SIGHUP', 'exit'])
    assert.equal(f.signals.listenerCount(event), 0);
  assert.ok(
    !f.output.writes.join('').includes(syntheticHex),
    'Input must not appear in terminal output'
  );
}
async function rejectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    assert.ok(
      !String(error.stack).includes(syntheticHex),
      'Input must not appear in an error'
    );
    assert.equal(error.cause, undefined);
    return true;
  });
}

test('accepts exactly 32 hexadecimal bytes, returns Buffer, and clears delivered input chunks', async () => {
  const f = fixture();
  const pending = f.read();
  assert.equal(f.input.isRaw, true);
  const chunk = send(f, syntheticHex + '\r');
  const result = await pending;
  assert.ok(Buffer.isBuffer(result));
  assert.equal(result.length, 32);
  assert.equal(result.toString('hex'), syntheticHex);
  assert.ok(chunk.every((byte) => byte === 0));
  assert.deepEqual(f.input.rawCalls, [true, false]);
  assert.equal(f.output.writes.join(''), 'Private key (hidden): \n');
  result.fill(0);
  clean(f);
});

for (const prefix of ['', '0x', '0X']) {
  test(`accepts ${prefix || 'unprefixed'} input and CRLF`, async () => {
    const f = fixture();
    const pending = f.read();
    send(f, prefix + syntheticHex.toUpperCase() + '\r\n');
    const result = await pending;
    assert.equal(result.toString('hex'), syntheticHex);
    result.fill(0);
    clean(f);
  });
}

test('supports split chunks, backspace and delete without echo', async () => {
  const f = fixture();
  const pending = f.read();
  send(f, '\b\x7f0x' + syntheticHex.slice(0, 30) + 'fa\b\x7f');
  send(f, syntheticHex.slice(30) + '\n');
  const result = await pending;
  assert.equal(result.toString('hex'), syntheticHex);
  result.fill(0);
  clean(f);
});

test('preserves prior raw mode and flowing state', async () => {
  const f = fixture({ raw: true, flowing: true });
  const pending = f.read();
  send(f, syntheticHex + '\n');
  const result = await pending;
  result.fill(0);
  assert.deepEqual(f.input.rawCalls, [true, true]);
  clean(f, true, true);
});

test('preserves an explicitly paused input', async () => {
  const f = fixture({ flowing: false });
  const pending = f.read();
  send(f, syntheticHex + '\n');
  (await pending).fill(0);
  clean(f);
});

for (const inputText of [
  '',
  '0x',
  syntheticHex.slice(1),
  syntheticHex + '0',
  '0x' + syntheticHex + '00',
  '0g' + syntheticHex.slice(2),
  syntheticHex + '\nextra',
]) {
  test(`rejects malformed input case ${inputText.length}:${inputText.includes(
    'g'
  )}`, async () => {
    const f = fixture();
    const pending = f.read();
    send(f, inputText + '\n');
    await rejectCode(pending, 'ERR_SECRET_INVALID');
    clean(f);
  });
}

for (const badStart of ['z', 'f'.repeat(1024 * 1024)]) {
  test(`drains ${
    badStart.length === 1 ? 'non-hex' : 'oversized'
  } input while hidden until newline`, async () => {
    const f = fixture();
    const pending = f.read();
    const bytes = send(f, badStart);
    assert.ok(bytes.every((byte) => byte === 0));
    assert.equal(
      f.input.isRaw,
      true,
      'Echo must remain disabled while the line is draining'
    );
    assert.equal(f.input.listenerCount('data'), 1);
    send(f, syntheticHex);
    assert.equal(f.input.isRaw, true);
    send(f, '\n');
    await rejectCode(pending, 'ERR_SECRET_INVALID');
    clean(f);
  });
}

for (const event of ['end', 'close', 'ctrl-d']) {
  test(`rejects partial input on ${event}`, async () => {
    const f = fixture();
    const pending = f.read();
    send(f, syntheticHex.slice(0, 24));
    if (event === 'ctrl-d') send(f, '\x04');
    else f.input.emit(event);
    await rejectCode(pending, 'ERR_SECRET_EOF');
    clean(f);
  });
}

for (const event of ['ctrl-c', 'SIGINT', 'exit']) {
  test(`restores raw mode and rejects on ${event}`, async () => {
    const f = fixture();
    const pending = f.read();
    send(f, syntheticHex.slice(0, 24));
    if (event === 'ctrl-c') send(f, '\x03');
    else f.signals.emit(event);
    await rejectCode(pending, 'ERR_SECRET_CANCELLED');
    clean(f);
  });
}

for (const signal of ['SIGTERM', 'SIGHUP']) {
  for (const raw of [false, true]) {
    test(`${signal} restores prior raw=${raw} and preserves foreign signal listeners`, async () => {
      const f = fixture({ raw });
      const foreignCalls = [];
      const foreignBefore = () => foreignCalls.push('before');
      const foreignAfter = () => foreignCalls.push('after');
      f.signals.on(signal, foreignBefore);
      const pending = f.read();
      f.signals.on(signal, foreignAfter);
      send(f, syntheticHex.slice(0, 24));
      f.signals.emit(signal);
      await rejectCode(pending, 'ERR_SECRET_CANCELLED');
      assert.deepEqual(f.signals.listeners(signal), [
        foreignBefore,
        foreignAfter,
      ]);
      assert.deepEqual(foreignCalls, ['before', 'after']);
      f.signals.removeListener(signal, foreignBefore);
      f.signals.removeListener(signal, foreignAfter);
      clean(f, raw);
    });
  }
}

test('normal cleanup retains foreign SIGTERM/SIGHUP listeners without invoking them', async () => {
  const f = fixture();
  const foreign = () => {
    throw new Error('Foreign signal listener must not be called');
  };
  f.signals.on('SIGTERM', foreign);
  f.signals.on('SIGHUP', foreign);
  const pending = f.read();
  send(f, syntheticHex + '\n');
  (await pending).fill(0);
  for (const signal of ['SIGTERM', 'SIGHUP']) {
    assert.deepEqual(f.signals.listeners(signal), [foreign]);
    f.signals.removeListener(signal, foreign);
  }
  clean(f);
});

for (const target of ['input', 'output']) {
  test(`restores raw mode after ${target} error without propagating error details`, async () => {
    const f = fixture();
    const pending = f.read();
    send(f, syntheticHex.slice(0, 24));
    f[target].emit('error', new Error(syntheticHex));
    await rejectCode(pending, 'ERR_SECRET_IO');
    clean(f);
  });
}

test('restores raw mode after output closure', async () => {
  const f = fixture();
  const pending = f.read();
  f.output.emit('close');
  await rejectCode(pending, 'ERR_SECRET_IO');
  clean(f);
});

test('restores mode after raw-mode setup throws after changing it', async () => {
  const f = fixture();
  f.input.throwRawAt = 1;
  await rejectCode(f.read(), 'ERR_SECRET_IO');
  assert.deepEqual(f.input.rawCalls, [true, false]);
  clean(f);
});

test('reports restoration failure generically and releases the busy guard', async () => {
  const f = fixture();
  f.input.throwRawAt = 2;
  const pending = f.read();
  send(f, syntheticHex + '\n');
  await rejectCode(pending, 'ERR_SECRET_RESTORE');
  clean(f);
  const next = fixture();
  const again = next.read();
  send(next, '\x03');
  await rejectCode(again, 'ERR_SECRET_CANCELLED');
  clean(next);
});

for (const number of [1, 2]) {
  test(`restores mode after terminal write ${number} throws`, async () => {
    const f = fixture();
    f.output.throwWriteAt = number;
    const pending = f.read();
    if (number === 2) send(f, syntheticHex + '\n');
    await rejectCode(pending, 'ERR_SECRET_IO');
    clean(f);
  });
}

test('rejects overlapping calls without disturbing the active read', async () => {
  const f = fixture();
  const pending = f.read();
  const other = fixture();
  await rejectCode(other.read(), 'ERR_SECRET_BUSY');
  assert.equal(f.input.isRaw, true);
  assert.deepEqual(other.input.rawCalls, []);
  send(f, syntheticHex + '\n');
  (await pending).fill(0);
  clean(f);
  clean(other, false, null);
});

for (const target of ['input', 'output']) {
  test(`rejects a piped ${target} before writing a prompt or changing raw mode`, async () => {
    const f = fixture();
    f[target].isTTY = false;
    await rejectCode(f.read(), 'ERR_SECRET_TTY_REQUIRED');
    assert.deepEqual(f.input.rawCalls, []);
    assert.deepEqual(f.output.writes, []);
  });
}

for (const inUse of ['encoding', 'data', 'readable']) {
  test(`rejects existing ${inUse} use of stdin`, async () => {
    const f = fixture();
    if (inUse === 'encoding') f.input.readableEncoding = 'utf8';
    else f.input.on(inUse, () => {});
    await rejectCode(f.read(), 'ERR_SECRET_IN_USE');
    assert.deepEqual(f.input.rawCalls, []);
    assert.deepEqual(f.output.writes, []);
  });
}

test('rejects an ended input and unexpected decoded string chunk', async () => {
  const ended = fixture();
  ended.input.readableEnded = true;
  await rejectCode(ended.read(), 'ERR_SECRET_EOF');
  const f = fixture();
  const pending = f.read();
  f.input.emit('data', syntheticHex);
  await rejectCode(pending, 'ERR_SECRET_IO');
  clean(f);
});

test('production API rejects pipes and ignores attempted stream injection', () => {
  const source = `const { readSecret } = require(process.argv[1]);
    readSecret({ input: { isTTY: true }, output: { isTTY: true } }).then(
      () => { process.exitCode = 2; },
      error => { process.stdout.write(error.code); });`;
  const child = spawnSync(process.execPath, ['-e', source, modulePath], {
    encoding: 'utf8',
    timeout: 3000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TERM: 'xterm' },
  });
  assert.equal(child.status, 0);
  assert.equal(child.stdout, 'ERR_SECRET_TTY_REQUIRED');
  assert.equal(child.stderr, '');
  assert.equal(readSecret.length, 0);
});

function confirm(f, phrase = 'CONFIRM LOCAL SYNTHETIC PLAN') {
  return __testOnly.confirmPublicPlanFromStreamsForTest(phrase, f);
}

test('confirmation then secret read leaves no decoder, consumer, or terminal-state residue', async () => {
  const f = fixture();
  const pendingConfirmation = confirm(f);
  send(f, 'CONFIRM LOCAL SYNTHETIC PLAN\r\n');
  assert.equal(await pendingConfirmation, true);
  assert.equal(f.input.readableEncoding, null);
  clean(f);
  const pendingSecret = f.read();
  send(f, syntheticHex + '\n');
  const value = await pendingSecret;
  assert.equal(value.toString('hex'), syntheticHex);
  value.fill(0);
  assert.equal(f.input.readableEncoding, null);
  assert.deepEqual(f.input.rawCalls, [true, false, true, false]);
  assert.equal(
    f.output.writes.join(''),
    'Type the displayed confirmation phrase, then Enter: \nPrivate key (hidden): \n'
  );
  clean(f);
});

test('split CRLF across confirmation and secret consumes only one line ending', async () => {
  const f = fixture();
  const pendingConfirmation = confirm(f, 'TEST PLAN');
  send(f, 'TEST PLAN\r');
  assert.equal(await pendingConfirmation, true);
  const pendingSecret = f.read();
  send(f, '\n');
  assert.equal(f.input.isRaw, true);
  send(f, syntheticHex + '\n');
  const value = await pendingSecret;
  assert.equal(value.toString('hex'), syntheticHex);
  value.fill(0);
  clean(f);
});

test('public confirmation supports editing and preserves prior raw state', async () => {
  const f = fixture({ raw: true });
  const pending = confirm(f, 'TEST PLAN');
  send(f, 'TEST PLANx\x7f\n');
  assert.equal(await pending, true);
  assert.deepEqual(f.input.rawCalls, [true, true]);
  clean(f, true);
});

for (const typed of ['test plan', 'TEST PLAN ', ' TEST PLAN', 'TEST\tPLAN']) {
  test(`confirmation refuses mismatched input case ${
    typed.length
  }:${typed.includes('t')}`, async () => {
    const f = fixture();
    const pending = confirm(f, 'TEST PLAN');
    send(f, typed + '\n');
    await rejectCode(pending, 'ERR_CONFIRMATION_REFUSED');
    clean(f);
  });
}

test('oversized public confirmation stays hidden until newline', async () => {
  const f = fixture();
  const pending = confirm(f, 'TEST PLAN');
  send(f, 'A'.repeat(257));
  assert.equal(f.input.isRaw, true);
  send(f, '\n');
  await rejectCode(pending, 'ERR_CONFIRMATION_REFUSED');
  clean(f);
});

test('public confirmation accepts its exact 256-byte maximum', async () => {
  const f = fixture();
  const phrase = 'A'.repeat(256);
  const pending = confirm(f, phrase);
  send(f, phrase + '\n');
  assert.equal(await pending, true);
  clean(f);
});

for (const event of ['ctrl-c', 'SIGINT', 'SIGTERM', 'SIGHUP', 'ctrl-d']) {
  test(`public confirmation handles ${event} without residue`, async () => {
    const f = fixture();
    const pending = confirm(f);
    send(f, 'CONFIRM');
    if (event.startsWith('SIG')) f.signals.emit(event);
    else send(f, event === 'ctrl-c' ? '\x03' : '\x04');
    await rejectCode(
      pending,
      event === 'ctrl-d' ? 'ERR_CONFIRMATION_EOF' : 'ERR_CONFIRMATION_CANCELLED'
    );
    clean(f);
  });
}

test('invalid expected public phrases are rejected before using stdin', async () => {
  for (const phrase of [
    '',
    'A'.repeat(257),
    'NEW\nLINE',
    '\u00e9',
    null,
    123,
  ]) {
    const f = fixture();
    await rejectCode(confirm(f, phrase), 'ERR_CONFIRMATION_PHRASE');
    assert.deepEqual(f.input.rawCalls, []);
    assert.deepEqual(f.output.writes, []);
  }
});

test('confirmation and secret reader share their concurrency guard', async () => {
  const f = fixture();
  const pending = confirm(f, 'TEST PLAN');
  await rejectCode(f.read(), 'ERR_SECRET_BUSY');
  send(f, 'TEST PLAN\n');
  assert.equal(await pending, true);
  const pendingSecret = f.read();
  await rejectCode(confirm(f, 'TEST PLAN'), 'ERR_CONFIRMATION_BUSY');
  send(f, '\x03');
  await rejectCode(pendingSecret, 'ERR_SECRET_CANCELLED');
  clean(f);
});

test('public confirmation production API also rejects pipes', () => {
  const source = `const { confirmPublicPlan } = require(process.argv[1]);
    confirmPublicPlan('TEST PLAN', { input: { isTTY: true } }).then(
      () => { process.exitCode = 2; },
      error => { process.stdout.write(error.code); });`;
  const child = spawnSync(process.execPath, ['-e', source, modulePath], {
    encoding: 'utf8',
    timeout: 3000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TERM: 'xterm' },
  });
  assert.equal(child.status, 0);
  assert.equal(child.stdout, 'ERR_CONFIRMATION_TTY_REQUIRED');
  assert.equal(child.stderr, '');
  assert.equal(confirmPublicPlan.length, 1);
});

// Local PTY integration. Python's stdlib supplies openpty/termios; Node has no
// PTY creation builtin. Synthetic input is generated in the Python harness and
// written only to the PTY master, never passed as an argv/environment value.
const ptyHarness = String.raw`
import errno, json, os, pty, select, signal, subprocess, sys, termios, time
node, module_path = sys.argv[1:]
source = r"""
const { readSecret, confirmPublicPlan } = require(process.argv[1]);
const scenario = process.argv[2];
if (scenario === 'SIGTERM' || scenario === 'SIGHUP') {
  const foreign = () => process.stdout.write('UNSAFE_SIGNAL_CONTINUATION\n');
  process.on(scenario, foreign);
  process.on('exit', () => {
    require('node:fs').writeSync(1, 'FOREIGN_LISTENER_PRESERVED:' + process.listeners(scenario).includes(foreign) + '\n');
  });
}
if (scenario === 'prior-raw') process.stdin.setRawMode(true);
const pending = scenario.startsWith('confirm-secret')
  ? confirmPublicPlan('CONFIRM LOCAL SYNTHETIC PLAN').then(() => readSecret())
  : readSecret();
if (scenario === 'exit') setTimeout(() => process.exit(7), 70);
if (scenario === 'uncaught') setTimeout(() => { throw new Error('synthetic failure'); }, 70);
pending.then(value => {
  const valid = value.length === 32 && value.every((byte, index) => byte === index);
  value.fill(0);
  process.stdout.write('RESULT:' + valid + ':RAW:' + process.stdin.isRaw + '\n');
  if (scenario === 'prior-raw') process.stdin.setRawMode(false);
  if (!valid) process.exitCode = 2;
}, error => {
  process.stdout.write('ERROR:' + error.code + ':RAW:' + process.stdin.isRaw + '\n');
});
"""
synthetic = bytes(range(32)).hex().encode('ascii')
results = []
for scenario in ['success', 'prefix-crlf', 'backspace', 'nonhex', 'oversize', 'ctrl-c', 'ctrl-d', 'SIGINT', 'SIGTERM', 'SIGHUP', 'exit', 'uncaught', 'prior-raw', 'confirm-secret', 'confirm-secret-split-crlf']:
    master, slave = pty.openpty()
    before = termios.tcgetattr(slave)
    child = subprocess.Popen([node, '-e', source, module_path, scenario], stdin=slave, stdout=slave, stderr=slave, close_fds=True, start_new_session=True)
    captured = bytearray()
    deadline = time.monotonic() + 4
    def receive_until_prompt(prompt=b'Private key (hidden): '):
        while prompt not in captured:
            if time.monotonic() > deadline:
                raise AssertionError('PTY prompt timed out: ' + scenario)
            ready, _, _ = select.select([master], [], [], 0.05)
            if ready:
                captured.extend(os.read(master, 8192))
    try:
        if scenario.startswith('confirm-secret'):
            receive_until_prompt(b'Type the displayed confirmation phrase, then Enter: ')
            assert not termios.tcgetattr(slave)[3] & termios.ECHO, 'Confirmation echo was enabled'
            os.write(master, b'CONFIRM LOCAL SYNTHETIC PLAN\r')
        receive_until_prompt()
        if scenario == 'confirm-secret-split-crlf':
            os.write(master, b'\n')
            time.sleep(0.03)
        during = termios.tcgetattr(slave)
        assert not during[3] & termios.ECHO, 'Echo was enabled during read: ' + scenario
        assert not during[3] & termios.ICANON, 'Canonical input was enabled during read: ' + scenario
        if scenario in ['success', 'prior-raw', 'confirm-secret', 'confirm-secret-split-crlf']:
            os.write(master, synthetic + b'\r')
        elif scenario == 'prefix-crlf':
            os.write(master, b'0x' + synthetic + b'\r\n')
        elif scenario == 'backspace':
            os.write(master, synthetic[:30] + b'fa\x08\x7f' + synthetic[30:] + b'\n')
        elif scenario in ['nonhex', 'oversize']:
            os.write(master, b'z' if scenario == 'nonhex' else b'f' * 512)
            time.sleep(0.03)
            assert not termios.tcgetattr(slave)[3] & termios.ECHO, 'Echo restored before invalid line ended'
            os.write(master, synthetic + b'\n')
        elif scenario == 'ctrl-c':
            os.write(master, synthetic[:24] + b'\x03')
        elif scenario == 'ctrl-d':
            os.write(master, synthetic[:24] + b'\x04')
        elif scenario in ['SIGINT', 'SIGTERM', 'SIGHUP']:
            os.write(master, synthetic[:24])
            os.kill(child.pid, getattr(signal, scenario))
        else:
            os.write(master, synthetic[:24])
        while child.poll() is None or select.select([master], [], [], 0)[0]:
            if time.monotonic() > deadline:
                raise AssertionError('PTY completion timed out: ' + scenario)
            ready, _, _ = select.select([master], [], [], 0.05)
            if ready:
                try:
                    part = os.read(master, 8192)
                    if not part: break
                    captured.extend(part)
                except OSError as error:
                    if error.errno == errno.EIO: break
                    raise
        child.wait(timeout=1)
        assert termios.tcgetattr(slave) == before, 'Terminal attributes were not restored: ' + scenario
        assert synthetic not in captured and synthetic[:24] not in captured, 'Synthetic input was echoed: ' + scenario
        if scenario in ['success', 'prefix-crlf', 'backspace', 'confirm-secret', 'confirm-secret-split-crlf']:
            assert b'RESULT:true:RAW:false' in captured, 'Unexpected success result: ' + scenario
        elif scenario == 'prior-raw':
            assert b'RESULT:true:RAW:true' in captured, 'Prior raw mode not preserved'
        elif scenario in ['nonhex', 'oversize']:
            assert b'ERROR:ERR_SECRET_INVALID:RAW:false' in captured, 'Invalid input not rejected'
        elif scenario == 'ctrl-d':
            assert b'ERROR:ERR_SECRET_EOF:RAW:false' in captured, 'EOF not rejected'
        elif scenario in ['ctrl-c', 'SIGINT']:
            assert b'ERROR:ERR_SECRET_CANCELLED:RAW:false' in captured, 'Cancellation not rejected'
        elif scenario in ['SIGTERM', 'SIGHUP']:
            assert child.returncode == 128 + getattr(signal, scenario), 'Termination exit code changed'
            assert b'FOREIGN_LISTENER_PRESERVED:true' in captured, 'Foreign signal listener was removed'
            assert b'UNSAFE_SIGNAL_CONTINUATION' not in captured, 'Foreign listener continued after termination'
            assert b'ERROR:' not in captured and b'RESULT:' not in captured, 'Caller continued after termination'
        elif scenario == 'exit':
            assert child.returncode == 7, 'Explicit exit code changed'
        elif scenario == 'uncaught':
            assert child.returncode != 0, 'Uncaught error did not exit'
        results.append(scenario)
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        os.close(master)
        os.close(slave)
print(json.dumps(results))
`;

test(
  'real local PTY hides synthetic input and restores exact terminal attributes',
  { timeout: 60000 },
  () => {
    const child = spawnSync('python3', ['-', process.execPath, modulePath], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TERM: 'xterm' },
      input: ptyHarness,
      encoding: 'utf8',
      timeout: 55000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), [
      'success',
      'prefix-crlf',
      'backspace',
      'nonhex',
      'oversize',
      'ctrl-c',
      'ctrl-d',
      'SIGINT',
      'SIGTERM',
      'SIGHUP',
      'exit',
      'uncaught',
      'prior-raw',
      'confirm-secret',
      'confirm-secret-split-crlf',
    ]);
  }
);
