const { spawnSync } = require('node:child_process');

function runStep(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Forward npm-provided args to the Jest suite (demo runner passes --runInBand)
const forwardedArgs = process.argv.slice(2);

runStep('npm', ['run', 'test:unit', '--', ...forwardedArgs]);
// Default to auto-installing Chromium so the Playwright suite actually runs in
// CI and local environments without extra flags. Allows opt-out by explicitly
// setting PLAYWRIGHT_AUTO_INSTALL=0.
const playwrightAutoInstall =
  process.env.PLAYWRIGHT_AUTO_INSTALL === '0' ? '0' : '1';
runStep('npm', ['run', 'test:e2e'], {
  env: { PLAYWRIGHT_AUTO_INSTALL: playwrightAutoInstall },
});
