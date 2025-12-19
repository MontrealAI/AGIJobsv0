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

function hasWorkingChromium(executablePath) {
  if (!executablePath || !fs.existsSync(executablePath)) {
    return false;
  }

  const probe = spawnSync(executablePath, ['--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

function installChromium({ withDeps, browsersPath }) {
  const args = ['playwright', 'install', 'chromium'];
  if (withDeps) {
    args.push('--with-deps');
  }

  runStep('npx', args, {
    env: {
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    },
  });
}

function ensureChromiumAvailable({
  autoInstall,
  installWithDeps,
  browsersPath = DEFAULT_PLAYWRIGHT_BROWSERS_PATH,
  prober = hasWorkingChromium,
  installer = installChromium,
}) {
  // Keep Playwright downloads scoped to the project directory unless callers
  // explicitly override the location. This avoids writing into system
  // directories on locked-down hosts and makes the cache easier to persist in
  // CI.
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  const { chromium } = require('@playwright/test');
  const getExecutablePath = () => chromium.executablePath();

  if (prober(getExecutablePath())) {
    return;
  }

  if (autoInstall) {
    installer({ withDeps: false, browsersPath });
    if (prober(getExecutablePath())) {
      return;
    }
    if (installWithDeps) {
      installer({ withDeps: true, browsersPath });
      if (prober(getExecutablePath())) {
        return;
      }
    }
  }

  console.error(
    [
      'Playwright Chromium is not installed. Either set PLAYWRIGHT_AUTO_INSTALL=1',
      'to allow automatic installation, or install manually via:',
      `  npx playwright install chromium${installWithDeps ? ' --with-deps' : ''}`,
    ].join('\n'),
  );
  process.exit(1);
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
  hasWorkingChromium,
  installChromium,
  runStep,
  main,
};

if (require.main === module) {
  main();
}
