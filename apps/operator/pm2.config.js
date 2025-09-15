const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

module.exports = {
  apps: [
    {
      name: 'operator-telemetry',
      cwd: rootDir,
      script: 'node',
      args: 'apps/operator/dist/telemetry.js',
      autorestart: true,
      max_restarts: 10,
      watch: false,
      env: {
        ENERGY_LOG_DIR:
          process.env.ENERGY_LOG_DIR || path.join(rootDir, 'logs', 'energy'),
        TELEMETRY_STATE_FILE:
          process.env.TELEMETRY_STATE_FILE ||
          path.join(rootDir, 'storage', 'operator-telemetry-state.json'),
      },
    },
  ],
};
