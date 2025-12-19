const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const DEFAULT_PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '0';

function buildPlaywrightEnv({ autoInstall, env = process.env }) {
  const browsersPath = env.PLAYWRIGHT_BROWSERS_PATH ?? DEFAULT_PLAYWRIGHT_BROWSERS_PATH;
  return {
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    PLAYWRIGHT_AUTO_INSTALL: autoInstall ? '1' : '0',
    ...(autoInstall ? {} : { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }),
  };
}

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

function ensureChromiumAvailable({
  autoInstall,
  installWithDeps,
  browsersPath = DEFAULT_PLAYWRIGHT_BROWSERS_PATH,
}) {
  // Keep Playwright downloads scoped to the project directory unless callers
  // explicitly override the location. This avoids writing into system
  // directories on locked-down hosts and makes the cache easier to persist in
  // CI.
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  const { chromium } = require('@playwright/test');
  const executablePath = chromium.executablePath();
  if (executablePath && fs.existsSync(executablePath)) {
    return;
  }

  if (autoInstall) {
    const installArgs = ['playwright', 'install', 'chromium'];
    if (installWithDeps) {
      installArgs.push('--with-deps');
    }
    runStep('npx', installArgs, {
      env: {
        PLAYWRIGHT_BROWSERS_PATH: browsersPath,
      },
    });
    return;
  }

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

function main() {
  // Forward npm-provided args to the Jest suite (demo runner passes --runInBand)
  const forwardedArgs = process.argv.slice(2);
  const playwrightAutoInstall = process.env.PLAYWRIGHT_AUTO_INSTALL !== '0';
  const playwrightInstallWithDeps = process.env.PLAYWRIGHT_INSTALL_WITH_DEPS !== '0';

  const playwrightEnv = buildPlaywrightEnv({ autoInstall: playwrightAutoInstall });

  runStep('npm', ['run', 'test:unit', '--', ...forwardedArgs]);
  // Default to auto-installing Chromium so the Playwright suite actually runs in
  // CI and local environments without extra flags. Allows opt-out by explicitly
  // setting PLAYWRIGHT_AUTO_INSTALL=0 while still validating that a browser is
  // present.
  ensureChromiumAvailable({
    autoInstall: playwrightAutoInstall,
    installWithDeps: playwrightInstallWithDeps,
    browsersPath: playwrightEnv.PLAYWRIGHT_BROWSERS_PATH,
  });
  runStep('npm', ['run', 'test:e2e'], {
    env: playwrightEnv,
  });
}

module.exports = {
  buildPlaywrightEnv,
  ensureChromiumAvailable,
  runStep,
  main,
};

if (require.main === module) {
  main();
}
