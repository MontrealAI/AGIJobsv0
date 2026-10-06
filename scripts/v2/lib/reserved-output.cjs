'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Reserve before any transaction. Retain even an empty reservation on failure:
// the operator must reconcile a potentially partial deployment before retrying.
function reserveDeploymentOutput(file) {
  const fd = fs.openSync(file, 'wx+', 0o600);
  const identity = fs.fstatSync(fd);
  let closed = false;
  let expected;
  function verify() {
    if (closed) throw new Error('Deployment output reservation is closed');
    const current = fs.lstatSync(file);
    if (
      !current.isFile() ||
      current.dev !== identity.dev ||
      current.ino !== identity.ino
    )
      throw new Error(
        'Reserved deployment output was replaced; original receipts are retained'
      );
    if (expected) {
      const actual = Buffer.alloc(expected.length);
      const count = fs.readSync(fd, actual, 0, actual.length, 0);
      if (
        fs.fstatSync(fd).size !== expected.length ||
        count !== expected.length ||
        !actual.equals(expected)
      )
        throw new Error(
          'Reserved deployment output contents changed; reconcile original receipts'
        );
    }
  }
  return {
    verify,
    copyFrom(source) {
      verify();
      if (expected)
        throw new Error('Deployment addressbook was already written');
      const bytes = fs.readFileSync(source);
      // Write the held descriptor, never reopen a potentially replaced path.
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
      expected = Buffer.from(bytes);
      verify();
      return bytes;
    },
    close() {
      if (!closed) fs.closeSync(fd);
      closed = true;
    },
  };
}
async function withAddressbookSnapshot(bytes, invoke) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'oneclick-addressbook-')
  );
  const snapshot = path.join(directory, 'addresses.json');
  try {
    fs.chmodSync(directory, 0o700);
    fs.writeFileSync(snapshot, bytes, { flag: 'wx', mode: 0o400 });
    fs.chmodSync(directory, 0o500);
    return await invoke(snapshot);
  } finally {
    fs.chmodSync(directory, 0o700);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
module.exports = { reserveDeploymentOutput, withAddressbookSnapshot };
