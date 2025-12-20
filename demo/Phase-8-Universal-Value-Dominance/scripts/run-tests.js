const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const DEFAULT_PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '0';
const OPTIONAL_E2E =
  process.env.PLAYWRIGHT_OPTIONAL_E2E === undefined ||
  process.env.PLAYWRIGHT_OPTIONAL_E2E !== '0';

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
  if (options.exitOnFail !== false && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
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

  const result = runStep('npx', args, {
    env: {
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    },
    exitOnFail: false,
  });
  return result.status === 0;
}

function canInstallPlaywrightDeps() {
  if (process.platform !== 'linux') return false;
  const hasApt = spawnSync('which', ['apt-get'], { stdio: 'ignore' }).status === 0;
  if (!hasApt) return false;

  // Allow attempts to install dependencies even when the current user is not
  // root. Playwright's dependency installer will elevate via sudo when
  // available and emit actionable errors otherwise, so gating on UID here
  // would incorrectly skip runnable environments (e.g., passwordless sudo).
  return true;
}

function ensureChromiumAvailable({
  autoInstall,
  installWithDeps,
  browsersPath = DEFAULT_PLAYWRIGHT_BROWSERS_PATH,
  prober = hasWorkingChromium,
  installer = installChromium,
  canInstallDeps = canInstallPlaywrightDeps,
}) {
  // Keep Playwright downloads scoped to the project directory unless callers
  // explicitly override the location. This avoids writing into system
  // directories on locked-down hosts and makes the cache easier to persist in
  // CI.
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  const { chromium } = require('@playwright/test');
  const getExecutablePath = () => chromium.executablePath();

  if (prober(getExecutablePath())) {
    return true;
  }

  if (autoInstall) {
    const installedWithoutDeps = installer({ withDeps: false, browsersPath });
    if (installedWithoutDeps && prober(getExecutablePath())) {
      return true;
    }
    if (installWithDeps && canInstallDeps()) {
      const installedWithDeps = installer({ withDeps: true, browsersPath });
      if (installedWithDeps && prober(getExecutablePath())) {
        return true;
      }
    } else if (installWithDeps) {
      console.warn(
        'Skipping Playwright system dependency installation (insufficient privileges or package manager unavailable).',
      );
    }
  }

  console.error(
    [
      'Playwright Chromium is not installed. Either set PLAYWRIGHT_AUTO_INSTALL=1',
      'to allow automatic installation, or install manually via:',
      `  npx playwright install chromium${installWithDeps ? ' --with-deps' : ''}`,
    ].join('\n'),
  );
  return false;
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
  const chromiumReady = ensureChromiumAvailable({
    autoInstall: playwrightAutoInstall,
    installWithDeps: playwrightInstallWithDeps,
    browsersPath: playwrightEnv.PLAYWRIGHT_BROWSERS_PATH,
  });
  if (!chromiumReady) {
    const message =
      'Skipping Playwright e2e tests because Chromium is unavailable and automatic installation failed.';
    if (OPTIONAL_E2E) {
      console.warn(`${message} Set PLAYWRIGHT_OPTIONAL_E2E=0 to make this a hard failure.`);
      return;
    }
    console.error(message);
    process.exit(1);
  }
  runStep('npm', ['run', 'test:e2e'], {
    env: playwrightEnv,
  });
}

module.exports = {
  buildPlaywrightEnv,
  canInstallPlaywrightDeps,
  ensureChromiumAvailable,
  hasWorkingChromium,
  installChromium,
  runStep,
  main,
};

if (require.main === module) {
  main();
}
