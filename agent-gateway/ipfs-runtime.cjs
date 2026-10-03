'use strict';

// Keep native import in CommonJS output: ipfs-http-client is ESM-only.
exports.createIpfsClient = async (url) => {
  const { create } = await import('ipfs-http-client');
  return create({ url, timeout: 30_000 });
};
