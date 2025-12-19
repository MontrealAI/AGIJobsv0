const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

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

function ensureChromiumAvailable({ autoInstall, installWithDeps }) {
  const { chromium } = require('@playwright/test');

  if (autoInstall) {
    const installArgs = ['playwright', 'install', 'chromium'];
    if (installWithDeps) {
      installArgs.push('--with-deps');
    }
    runStep('npx', installArgs);
    return;
  }

  const executablePath = chromium.executablePath();
  if (!executablePath || !fs.existsSync(executablePath)) {
    console.error(
      [
        'Playwright Chromium is not installed. Either set PLAYWRIGHT_AUTO_INSTALL=1',
        'to allow automatic installation, or install manually via:',
        '  npx playwright install chromium --with-deps',
      ].join('\n'),
    );
    process.exit(1);
  }
}

// Forward npm-provided args to the Jest suite (demo runner passes --runInBand)
const forwardedArgs = process.argv.slice(2);
const playwrightAutoInstall = process.env.PLAYWRIGHT_AUTO_INSTALL !== '0';
const playwrightInstallWithDeps = process.env.PLAYWRIGHT_INSTALL_WITH_DEPS !== '0';

runStep('npm', ['run', 'test:unit', '--', ...forwardedArgs]);
// Default to auto-installing Chromium so the Playwright suite actually runs in
// CI and local environments without extra flags. Allows opt-out by explicitly
// setting PLAYWRIGHT_AUTO_INSTALL=0 while still validating that a browser is
// present.
ensureChromiumAvailable({
  autoInstall: playwrightAutoInstall,
  installWithDeps: playwrightInstallWithDeps,
});
runStep('npm', ['run', 'test:e2e'], {
  env: {
    PLAYWRIGHT_AUTO_INSTALL: playwrightAutoInstall ? '1' : '0',
    ...(playwrightAutoInstall ? {} : { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }),
  },
});
