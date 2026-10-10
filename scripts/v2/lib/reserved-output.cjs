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
  let expected = Buffer.alloc(0);
  let copied = false;
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
    {
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
    append(bytes) {
      verify();
      const next = Buffer.from(bytes);
      let offset = 0;
      while (offset < next.length) {
        const written = fs.writeSync(
          fd,
          next,
          offset,
          next.length - offset,
          expected.length + offset
        );
        if (!written)
          throw new Error('Deployment journal write did not advance');
        offset += written;
      }
      fs.fsyncSync(fd);
      expected = Buffer.concat([expected, next]);
      verify();
    },
    write(bytes) {
      verify();
      const next = Buffer.from(bytes);
      let offset = 0;
      while (offset < next.length) {
        const written = fs.writeSync(
          fd,
          next,
          offset,
          next.length - offset,
          offset
        );
        if (!written)
          throw new Error('Deployment evidence write did not advance');
        offset += written;
      }
      fs.ftruncateSync(fd, next.length);
      fs.fsyncSync(fd);
      expected = next;
      verify();
    },
    copyFrom(source) {
      verify();
      if (copied || expected.length)
        throw new Error('Deployment addressbook was already written');
      const bytes = fs.readFileSync(source);
      // Write the held descriptor, never reopen a potentially replaced path.
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
      expected = Buffer.from(bytes);
      copied = true;
      verify();
      return bytes;
    },
    close() {
      if (!closed) fs.closeSync(fd);
      closed = true;
    },
  };
}
function prepareDeploymentSource(outputPath) {
  const directory = fs.mkdtempSync(
    path.join(path.dirname(outputPath), '.oneclick-evidence-')
  );
  fs.chmodSync(directory, 0o700);
  return {
    file: path.join(directory, 'addresses.json'),
    complete() {
      fs.rmSync(directory, { recursive: true, force: true });
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
module.exports = {
  reserveDeploymentOutput,
  prepareDeploymentSource,
  withAddressbookSnapshot,
};
