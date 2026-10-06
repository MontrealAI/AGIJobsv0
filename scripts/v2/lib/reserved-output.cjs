'use strict';
const fs = require('node:fs');

// Reserve before any transaction. Retain even an empty reservation on failure:
// the operator must reconcile a potentially partial deployment before retrying.
function reserveDeploymentOutput(file) {
  const fd = fs.openSync(file, 'wx', 0o600);
  const identity = fs.fstatSync(fd);
  let closed = false;
  return {
    copyFrom(source) {
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
      const bytes = fs.readFileSync(source);
      // Write the held descriptor, never reopen a potentially replaced path.
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    },
    close() {
      if (!closed) fs.closeSync(fd);
      closed = true;
    },
  };
}
module.exports = { reserveDeploymentOutput };
