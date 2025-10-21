#!/usr/bin/env node
const { runDemo } = require('../lib/launcher.js');

(async () => {
  try {
    await runDemo();
  } catch (error) {
    console.error('Failed to launch AGI Jobs One-Box demo:', error.message);
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
})();
