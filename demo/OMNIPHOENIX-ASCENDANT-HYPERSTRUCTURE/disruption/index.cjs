'use strict';
const { createHash } = require('node:crypto');
const { analyze } = require('../../asi-takeoff/scripts/plan.cjs');
const core = require('./core.cjs');
module.exports = {
  ...core,
  ...core.createDesk({
    analyze,
    sha256: (bytes) => createHash('sha256').update(bytes).digest('hex'),
  }),
};
