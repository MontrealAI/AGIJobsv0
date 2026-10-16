'use strict';

// Read only from the caller's real terminal. Never put the input in argv, an
// environment variable, a child process, or a log. The caller owns the returned
// Buffer and should fill it with zero after use. Buffer clearing is best effort;
// JavaScript/V8 does not provide a secure-memory-erasure guarantee. Operators
// can disable core dumps in their own shell (ulimit -c 0) before the launcher.
const fs = require('node:fs');
const tty = require('node:tty');

const PROMPT = 'Private key (hidden): ';
const CONFIRM_PROMPT = 'Type the displayed confirmation phrase, then Enter: ';
const MAX_ASCII_BYTES = 66;
const MAX_PUBLIC_PHRASE_BYTES = 256;
// Treat a split CRLF as one line ending even across confirmation -> secret.
const pendingLineFeed = new WeakSet();
let activeRead = false;

function failure(code, message = 'Secret input failed.') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function nibble(byte) {
  if (byte >= 48 && byte <= 57) return byte - 48;
  if (byte >= 65 && byte <= 70) return byte - 65 + 10;
  if (byte >= 97 && byte <= 102) return byte - 97 + 10;
  return -1;
}

function readFromTerminal(
  input,
  output,
  signals,
  writeText,
  realTerminal,
  expectedPhrase,
  terminateProcess = false
) {
  const confirming = expectedPhrase !== undefined;
  const capacity = confirming ? MAX_PUBLIC_PHRASE_BYTES : MAX_ASCII_BYTES;
  function inputFailure(suffix, message) {
    return failure(
      (confirming ? 'ERR_CONFIRMATION_' : 'ERR_SECRET_') + suffix,
      confirming ? 'Confirmation input was not accepted.' : message
    );
  }
  if (activeRead) {
    return Promise.reject(
      inputFailure('BUSY', 'Secret input is already active.')
    );
  }
  if (
    !realTerminal ||
    input.isTTY !== true ||
    output.isTTY !== true ||
    typeof input.setRawMode !== 'function'
  ) {
    return Promise.reject(
      inputFailure('TTY_REQUIRED', 'A terminal is required for secret input.')
    );
  }
  // A pre-existing decoder or data consumer could retain a copy of the secret.
  if (
    input.readableEncoding != null ||
    input.listenerCount('data') !== 0 ||
    input.listenerCount('readable') !== 0
  ) {
    return Promise.reject(
      inputFailure('IN_USE', 'Terminal input is already in use.')
    );
  }
  if (input.destroyed || input.readableEnded) {
    return Promise.reject(inputFailure('EOF'));
  }

  activeRead = true;
  return new Promise((resolve, reject) => {
    const ascii = Buffer.alloc(capacity);
    const wasRaw = input.isRaw === true;
    const wasFlowing = input.readableFlowing === true;
    let rawModeAttempted = false;
    let prompted = false;
    let settled = false;
    let invalid = false;
    let length = 0;

    function finish(error, value, exiting = false) {
      if (settled) {
        if (Buffer.isBuffer(value)) value.fill(0);
        return;
      }
      settled = true;
      let restoreFailed = false;
      try {
        input.pause();
      } catch {
        restoreFailed = true;
      }
      if (rawModeAttempted) {
        try {
          input.setRawMode(wasRaw);
        } catch {
          restoreFailed = true;
        }
      }
      ascii.fill(0);
      length = 0;
      input.removeListener('data', onData);
      input.removeListener('error', onIOError);
      input.removeListener('end', onEOF);
      input.removeListener('close', onEOF);
      output.removeListener('error', onIOError);
      output.removeListener('close', onIOError);
      signals.removeListener('SIGINT', onInterrupt);
      signals.removeListener('SIGTERM', onTerminate);
      signals.removeListener('SIGHUP', onHangup);
      signals.removeListener('exit', onExit);
      // An initially idle or paused stdin stays paused. Do not drain later input.
      if (wasFlowing && !exiting) {
        try {
          input.resume();
        } catch {
          restoreFailed = true;
        }
      }
      if (prompted && !exiting) {
        try {
          writeText('\n');
        } catch {
          error = inputFailure('IO');
        }
      }
      activeRead = false;
      if (restoreFailed) {
        error = inputFailure(
          'RESTORE',
          'Secret input failed; terminal state could not be restored.'
        );
      }
      if (error) {
        if (Buffer.isBuffer(value)) value.fill(0);
        reject(error);
      } else {
        resolve(value);
      }
    }

    function onIOError() {
      finish(inputFailure('IO'));
    }
    function onEOF() {
      finish(inputFailure('EOF'));
    }
    function onInterrupt() {
      finish(inputFailure('CANCELLED', 'Secret input cancelled.'));
    }
    function onExit() {
      finish(inputFailure('CANCELLED'), undefined, true);
    }
    function terminate(exitCode) {
      try {
        finish(inputFailure('CANCELLED'), undefined, true);
      } finally {
        // Termination signals must not become a catchable path back to signing.
        // Only our listeners are removed; foreign signal listeners are retained.
        if (terminateProcess) process.exit(exitCode);
      }
    }
    function onTerminate() {
      terminate(143);
    } // 128 + SIGTERM (15).
    function onHangup() {
      terminate(129);
    } // 128 + SIGHUP (1).

    function invalidate() {
      invalid = true;
      ascii.fill(0);
      length = 0;
    }

    function completeLine(chunk, index) {
      // Accept CRLF when it arrives in one chunk. Refuse pasted extra lines.
      const trailing = chunk.length - index - 1;
      if (chunk[index] === 13 && trailing === 0) pendingLineFeed.add(input);
      else pendingLineFeed.delete(input);
      if (
        trailing !== 0 &&
        !(chunk[index] === 13 && trailing === 1 && chunk[index + 1] === 10)
      ) {
        invalidate();
      }
      if (confirming) {
        let matches = !invalid && length === expectedPhrase.length;
        for (let i = 0; matches && i < length; i += 1) {
          matches = ascii[i] === expectedPhrase.charCodeAt(i);
        }
        finish(
          matches ? undefined : inputFailure('REFUSED'),
          matches ? true : undefined
        );
        return;
      }
      const prefixed =
        length === 66 &&
        ascii[0] === 48 &&
        (ascii[1] === 120 || ascii[1] === 88);
      if (invalid || (!prefixed && length !== 64)) {
        finish(
          inputFailure(
            'INVALID',
            'Enter exactly 32 bytes of hexadecimal secret input.'
          )
        );
        return;
      }
      const value = Buffer.alloc(32);
      const offset = prefixed ? 2 : 0;
      for (let i = 0; i < 32; i += 1) {
        const high = nibble(ascii[offset + i * 2]);
        const low = nibble(ascii[offset + i * 2 + 1]);
        if (high < 0 || low < 0) {
          value.fill(0);
          finish(
            inputFailure(
              'INVALID',
              'Enter exactly 32 bytes of hexadecimal secret input.'
            )
          );
          return;
        }
        value[i] = (high << 4) | low;
      }
      finish(undefined, value);
    }

    function onData(chunk) {
      if (settled) return;
      // Never turn secret input into an immutable JavaScript string.
      if (!Buffer.isBuffer(chunk)) {
        invalidate();
        finish(inputFailure('IO'));
        return;
      }
      try {
        for (let i = 0; i < chunk.length; i += 1) {
          const byte = chunk[i];
          if (pendingLineFeed.has(input)) {
            pendingLineFeed.delete(input);
            if (byte === 10) continue;
          }
          if (byte === 3) {
            onInterrupt();
            return;
          }
          if (byte === 4) {
            onEOF();
            return;
          }
          if (byte === 13 || byte === 10) {
            completeLine(chunk, i);
            return;
          }
          // Once invalid, drain this line while hidden. Restoring echo early
          // could expose the remainder of a pasted or slowly typed secret.
          if (invalid) continue;
          if (byte === 8 || byte === 127) {
            if (length > 0) ascii[--length] = 0;
            continue;
          }
          const prefixX =
            length === 1 && ascii[0] === 48 && (byte === 120 || byte === 88);
          const allowed = confirming
            ? byte >= 32 && byte <= 126
            : nibble(byte) >= 0 || prefixX;
          if (length === capacity || !allowed) {
            invalidate();
            continue;
          }
          ascii[length++] = byte;
        }
      } catch {
        finish(inputFailure('IO'));
      } finally {
        // No other data consumer is allowed while this reader owns stdin.
        chunk.fill(0);
      }
    }

    try {
      input.pause();
      input.on('error', onIOError);
      input.on('end', onEOF);
      input.on('close', onEOF);
      output.on('error', onIOError);
      output.on('close', onIOError);
      signals.on('SIGINT', onInterrupt);
      // Restore before a pre-existing termination listener can exit the process.
      signals.prependListener('SIGTERM', onTerminate);
      signals.prependListener('SIGHUP', onHangup);
      signals.on('exit', onExit);
      rawModeAttempted = true;
      input.setRawMode(true);
      input.on('data', onData);
      prompted = true;
      writeText(confirming ? CONFIRM_PROMPT : PROMPT);
      if (!settled) input.resume();
    } catch {
      finish(inputFailure('IO'));
    }
  });
}

function readRealTerminal(expectedPhrase) {
  const input = process.stdin;
  const output = process.stdout;
  const realTerminal =
    typeof input.fd === 'number' &&
    typeof output.fd === 'number' &&
    tty.isatty(input.fd) &&
    tty.isatty(output.fd);
  // Synchronous terminal writes avoid an outstanding asynchronous write error
  // after the temporary stream error listeners have been removed.
  return readFromTerminal(
    input,
    output,
    process,
    (text) => fs.writeSync(output.fd, text),
    realTerminal,
    expectedPhrase,
    true
  );
}

/** Return a 32-byte Buffer from hidden terminal input, optionally prefixed 0x. */
function readSecret() {
  return readRealTerminal();
}

function validPublicPhrase(expectedPhrase) {
  return (
    typeof expectedPhrase === 'string' &&
    expectedPhrase.length >= 1 &&
    expectedPhrase.length <= MAX_PUBLIC_PHRASE_BYTES &&
    /^[\x20-\x7e]+$/.test(expectedPhrase)
  );
}

/** Accept only the exact bounded public phrase, then restore stdin for readSecret. */
function confirmPublicPlan(expectedPhrase) {
  if (!validPublicPhrase(expectedPhrase)) {
    return Promise.reject(
      failure(
        'ERR_CONFIRMATION_PHRASE',
        'The public confirmation phrase is invalid.'
      )
    );
  }
  return readRealTerminal(expectedPhrase);
}

// Explicit unit helpers only. Production APIs never accept alternate streams,
// writers, signals, input bytes, or other dependency-injection options.
function readSecretFromStreamsForTest({ input, output, signals }) {
  return readFromTerminal(
    input,
    output,
    signals,
    (text) => output.write(text),
    true
  );
}

function confirmPublicPlanFromStreamsForTest(
  expectedPhrase,
  { input, output, signals }
) {
  if (!validPublicPhrase(expectedPhrase)) {
    return Promise.reject(
      failure(
        'ERR_CONFIRMATION_PHRASE',
        'The public confirmation phrase is invalid.'
      )
    );
  }
  return readFromTerminal(
    input,
    output,
    signals,
    (text) => output.write(text),
    true,
    expectedPhrase
  );
}

module.exports = Object.freeze({
  readSecret,
  confirmPublicPlan,
  __testOnly: Object.freeze({
    readSecretFromStreamsForTest,
    confirmPublicPlanFromStreamsForTest,
  }),
});
