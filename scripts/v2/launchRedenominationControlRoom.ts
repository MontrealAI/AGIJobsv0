#!/usr/bin/env ts-node
// Compatibility entrypoint for the dependency-free, loopback-only control room.
const redenominationControlRoom = require('../../demo/REDENOMINATION/scripts/control-room.cjs');
redenominationControlRoom.main().catch((error: Error) => {
  console.error(`Control room failed: ${error.message}`);
  process.exitCode = 1;
});
export {};
