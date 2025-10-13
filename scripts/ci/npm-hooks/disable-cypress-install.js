'use strict';

const shouldForceInstall = [
  '1',
  'true'
].includes((process.env.ENABLE_CYPRESS_BINARY_INSTALL || '').toLowerCase());

if (!shouldForceInstall && !process.env.CYPRESS_INSTALL_BINARY) {
  process.env.CYPRESS_INSTALL_BINARY = '0';
}

module.exports = {};
