#!/usr/bin/env node
const { runDemo, parseCliArgs } = require('../lib/launcher.js');

(async () => {
  try {
    const cliOptions = parseCliArgs(process.argv.slice(2));
    await runDemo(cliOptions);
  } catch (error) {
    console.error('Failed to launch AGI Jobs One-Box demo:', error.message);
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
})();
