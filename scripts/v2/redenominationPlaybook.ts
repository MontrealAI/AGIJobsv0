#!/usr/bin/env ts-node
// Compatibility entrypoint; the standalone planner has no npm dependencies.
const redenominationPlanner = require('../../demo/REDENOMINATION/scripts/playbook.cjs');
process.exitCode = redenominationPlanner.main(process.argv.slice(2));
export {};
