import { jest } from '@jest/globals';
import type { SpyInstance } from 'jest-mock';

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
}));

jest.mock('@playwright/test', () => ({
  chromium: {
    executablePath: jest.fn(),
  },
}));

const spawnSync = jest.fn();

jest.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => spawnSync(...args),
}));

const fs = require('node:fs') as { existsSync: jest.Mock };
const { chromium } = require('@playwright/test') as {
  chromium: { executablePath: jest.Mock };
};

describe('ensureChromiumAvailable', () => {
  let exitSpy: SpyInstance;
  let consoleErrorSpy: SpyInstance;
  let canInstallDeps: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    spawnSync.mockReset();
    fs.existsSync.mockReset();
    chromium.executablePath.mockReset();
    chromium.executablePath.mockReturnValue('/tmp/chromium');
    spawnSync.mockReturnValue({ status: 0 });
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    canInstallDeps = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('skips installation when a working chromium is already present', () => {
    const { ensureChromiumAvailable } = require('../run-tests.js');
    const installer = jest.fn();
    const prober = jest.fn().mockReturnValue(true);

    const ready = ensureChromiumAvailable({
      autoInstall: true,
      installWithDeps: true,
      browsersPath: '.local-browsers',
      installer,
      prober,
      canInstallDeps,
    });

    expect(ready).toBe(true);
    expect(installer).not.toHaveBeenCalled();
    expect(prober).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('installs chromium once when the binary becomes available without deps', () => {
    const { ensureChromiumAvailable } = require('../run-tests.js');
    const installer = jest.fn().mockReturnValue(true);
    const prober = jest
      .fn()
      .mockImplementationOnce(() => false)
      .mockImplementation(() => true);

    const ready = ensureChromiumAvailable({
      autoInstall: true,
      installWithDeps: true,
      browsersPath: '.local-browsers',
      installer,
      prober,
      canInstallDeps,
    });

    expect(ready).toBe(true);
    expect(installer).toHaveBeenCalledTimes(1);
    expect(installer).toHaveBeenCalledWith(
      expect.objectContaining({ withDeps: false, browsersPath: '.local-browsers' }),
    );
    expect(prober).toHaveBeenCalledTimes(2);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('falls back to installing chromium with deps when the first probe fails', () => {
    const { ensureChromiumAvailable } = require('../run-tests.js');
    const installer = jest.fn().mockReturnValue(true);
    const prober = jest
      .fn()
      .mockImplementationOnce(() => false)
      .mockImplementationOnce(() => false)
      .mockImplementation(() => true);

    const ready = ensureChromiumAvailable({
      autoInstall: true,
      installWithDeps: true,
      browsersPath: '.local-browsers',
      installer,
      prober,
      canInstallDeps,
    });

    expect(ready).toBe(true);
    expect(installer).toHaveBeenCalledTimes(2);
    expect(installer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ withDeps: false, browsersPath: '.local-browsers' }),
    );
    expect(installer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ withDeps: true, browsersPath: '.local-browsers' }),
    );
    expect(prober).toHaveBeenCalledTimes(3);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('returns false without exiting when installation is disabled', () => {
    const { ensureChromiumAvailable } = require('../run-tests.js');
    const installer = jest.fn();
    const prober = jest.fn().mockReturnValue(false);

    const ready = ensureChromiumAvailable({
      autoInstall: false,
      installWithDeps: false,
      browsersPath: '.local-browsers',
      installer,
      prober,
      canInstallDeps,
    });

    expect(ready).toBe(false);
    expect(installer).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test('avoids with-deps fallback when dependencies are already present', () => {
    const { ensureChromiumAvailable } = require('../run-tests.js');
    const installer = jest.fn().mockReturnValue(true);
    const prober = jest
      .fn()
      .mockImplementationOnce(() => false)
      .mockImplementation(() => true);
    const depsProbe = jest.fn().mockReturnValue(true);

    const ready = ensureChromiumAvailable({
      autoInstall: true,
      installWithDeps: true,
      browsersPath: '.local-browsers',
      installer,
      prober,
      canInstallDeps,
      depsProbe,
    });

    expect(ready).toBe(true);
    expect(installer).toHaveBeenCalledTimes(1);
    expect(installer).toHaveBeenCalledWith(
      expect.objectContaining({ withDeps: false, browsersPath: '.local-browsers' }),
    );
    expect(depsProbe).toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe('canInstallPlaywrightDeps', () => {
  const platform = process.platform;
  const originalGetUid = process.getuid;

  beforeEach(() => {
    jest.resetModules();
    spawnSync.mockReset();
    spawnSync.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    Object.defineProperty(process, 'getuid', { value: originalGetUid, configurable: true });
  });

  test('returns true on linux when apt-get is available for root users', () => {
    const { canInstallPlaywrightDeps } = require('../run-tests.js');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    Object.defineProperty(process, 'getuid', { value: () => 0, configurable: true });

    expect(canInstallPlaywrightDeps()).toBe(true);
    expect(spawnSync).toHaveBeenCalledWith('which', ['apt-get'], { stdio: 'ignore' });
  });

  test('returns true on linux when apt-get and sudo are available for non-root users', () => {
    const { canInstallPlaywrightDeps } = require('../run-tests.js');
    spawnSync.mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 0 });
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    Object.defineProperty(process, 'getuid', { value: () => 1000, configurable: true });

    expect(canInstallPlaywrightDeps()).toBe(true);
    expect(spawnSync).toHaveBeenNthCalledWith(1, 'which', ['apt-get'], { stdio: 'ignore' });
    expect(spawnSync).toHaveBeenNthCalledWith(2, 'which', ['sudo'], { stdio: 'ignore' });
  });

  test('returns false when apt-get is unavailable', () => {
    const { canInstallPlaywrightDeps } = require('../run-tests.js');
    spawnSync.mockReturnValue({ status: 1 });
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    Object.defineProperty(process, 'getuid', { value: () => 0, configurable: true });

    expect(canInstallPlaywrightDeps()).toBe(false);
    expect(spawnSync).toHaveBeenCalledWith('which', ['apt-get'], { stdio: 'ignore' });
  });

  test('returns false when sudo is unavailable for non-root users', () => {
    const { canInstallPlaywrightDeps } = require('../run-tests.js');
    spawnSync.mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 1 });
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    Object.defineProperty(process, 'getuid', { value: () => 1000, configurable: true });

    expect(canInstallPlaywrightDeps()).toBe(false);
    expect(spawnSync).toHaveBeenCalledWith('which', ['sudo'], { stdio: 'ignore' });
  });

  test('returns false on non-linux platforms', () => {
    const { canInstallPlaywrightDeps } = require('../run-tests.js');
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    expect(canInstallPlaywrightDeps()).toBe(false);
    expect(spawnSync).not.toHaveBeenCalledWith('which', ['apt-get'], expect.anything());
  });
});

describe('isOptionalE2E', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.PLAYWRIGHT_OPTIONAL_E2E;
    delete process.env.PLAYWRIGHT_INSTALL_WITH_DEPS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('defaults to required in CI', () => {
    process.env.CI = '1';
    const { isOptionalE2E } = require('../run-tests.js');

    expect(isOptionalE2E()).toBe(false);
  });

  test('defaults to optional outside CI', () => {
    delete process.env.CI;
    const { isOptionalE2E } = require('../run-tests.js');

    expect(isOptionalE2E()).toBe(true);
  });

  test('respects explicit opt-out flag', () => {
    process.env.CI = '1';
    process.env.PLAYWRIGHT_OPTIONAL_E2E = '1';
    const { isOptionalE2E } = require('../run-tests.js');

    expect(isOptionalE2E()).toBe(true);
  });

  test('respects explicit hard-fail flag', () => {
    process.env.CI = '0';
    process.env.PLAYWRIGHT_OPTIONAL_E2E = '0';
    const { isOptionalE2E } = require('../run-tests.js');

    expect(isOptionalE2E()).toBe(false);
  });
});

describe('shouldInstallPlaywrightDeps', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.PLAYWRIGHT_OPTIONAL_E2E;
    delete process.env.PLAYWRIGHT_INSTALL_WITH_DEPS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('defaults to installing deps in CI environments', () => {
    process.env.CI = 'true';
    const { shouldInstallPlaywrightDeps } = require('../run-tests.js');

    expect(shouldInstallPlaywrightDeps()).toBe(true);
  });

  test('defaults to skipping system deps locally to avoid unexpected apt installs', () => {
    delete process.env.CI;
    const { shouldInstallPlaywrightDeps } = require('../run-tests.js');

    expect(shouldInstallPlaywrightDeps()).toBe(false);
  });

  test('respects explicit opt-in flag even outside CI', () => {
    delete process.env.CI;
    process.env.PLAYWRIGHT_INSTALL_WITH_DEPS = '1';
    const { shouldInstallPlaywrightDeps } = require('../run-tests.js');

    expect(shouldInstallPlaywrightDeps()).toBe(true);
  });

  test('respects explicit opt-out flag even in CI', () => {
    process.env.CI = '1';
    process.env.PLAYWRIGHT_INSTALL_WITH_DEPS = '0';
    const { shouldInstallPlaywrightDeps } = require('../run-tests.js');

    expect(shouldInstallPlaywrightDeps()).toBe(false);
  });
});

describe('isDepsInstallExplicitlyDisabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.PLAYWRIGHT_INSTALL_WITH_DEPS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('returns false when the flag is unset', () => {
    const { isDepsInstallExplicitlyDisabled } = require('../run-tests.js');

    expect(isDepsInstallExplicitlyDisabled()).toBe(false);
  });

  test('detects explicit opt-out aliases', () => {
    const { isDepsInstallExplicitlyDisabled } = require('../run-tests.js');
    process.env.PLAYWRIGHT_INSTALL_WITH_DEPS = '0';
    expect(isDepsInstallExplicitlyDisabled()).toBe(true);

    process.env.PLAYWRIGHT_INSTALL_WITH_DEPS = 'false';
    expect(isDepsInstallExplicitlyDisabled()).toBe(true);
  });

  test('returns false when the flag is enabled', () => {
    const { isDepsInstallExplicitlyDisabled } = require('../run-tests.js');
    process.env.PLAYWRIGHT_INSTALL_WITH_DEPS = '1';

    expect(isDepsInstallExplicitlyDisabled()).toBe(false);
  });
});

describe('main', () => {
  beforeEach(() => {
    jest.resetModules();
    spawnSync.mockReset();
  });

  test('retries with dependency installation when it becomes available after the first probe', () => {
    const ensureChromiumAvailable = jest.fn().mockImplementation(({ installWithDeps, canInstallDeps }) => {
      if (installWithDeps) {
        return canInstallDeps();
      }
      return false;
    });
    const runStep = jest.fn();
    const buildPlaywrightEnv = jest.fn().mockReturnValue({
      PLAYWRIGHT_BROWSERS_PATH: '/tmp/pw',
      PLAYWRIGHT_AUTO_INSTALL: '1',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    });
    const canInstallDeps = jest.fn().mockReturnValue(true);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { main } = require('../run-tests.js');

    main({
      argv: ['--runInBand'],
      env: { PLAYWRIGHT_OPTIONAL_E2E: '0' },
      ensureChromiumAvailable,
      buildPlaywrightEnv,
      runStep,
      canInstallDeps,
    });

    expect(runStep).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('npm'),
      ['run', 'test:unit', '--', '--runInBand'],
    );
    expect(canInstallDeps).toHaveBeenCalledTimes(2);
    expect(ensureChromiumAvailable).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        installWithDeps: false,
      }),
    );
    expect(ensureChromiumAvailable).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        installWithDeps: true,
      }),
    );
    expect(runStep).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('npm'),
      ['run', 'test:e2e'],
      { env: buildPlaywrightEnv.mock.results[0].value },
    );

    warnSpy.mockRestore();
  });

  test('skips e2e setup when marked optional and no cached browser is available', () => {
    const ensureChromiumAvailable = jest.fn();
    const runStep = jest.fn();
    const buildPlaywrightEnv = jest.fn().mockReturnValue({
      PLAYWRIGHT_BROWSERS_PATH: '/tmp/pw',
      PLAYWRIGHT_AUTO_INSTALL: '1',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    });
    const canInstallDeps = jest.fn().mockReturnValue(true);
    fs.existsSync.mockReturnValue(false);
    spawnSync.mockReturnValue({ status: 1 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { main } = require('../run-tests.js');

    main({
      argv: [],
      env: { PLAYWRIGHT_OPTIONAL_E2E: '1' },
      ensureChromiumAvailable,
      buildPlaywrightEnv,
      runStep,
      canInstallDeps,
    });

    expect(runStep).toHaveBeenCalledTimes(1);
    expect(runStep).toHaveBeenCalledWith(expect.stringContaining('npm'), ['run', 'test:unit', '--']);
    expect(ensureChromiumAvailable).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe('arePlaywrightDepsReady', () => {
  const platform = process.platform;

  beforeEach(() => {
    jest.resetModules();
    spawnSync.mockReset();
    fs.existsSync.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  });

  test('returns false on non-linux hosts', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const { arePlaywrightDepsReady } = require('../run-tests.js');

    expect(arePlaywrightDepsReady()).toBe(false);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test('verifies common X and GTK dependencies on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const { arePlaywrightDepsReady } = require('../run-tests.js');
    const binaryCheck = jest.fn().mockImplementationOnce(() => false).mockReturnValue(true);
    const fsProbe = jest.fn().mockReturnValue(true);

    expect(arePlaywrightDepsReady({ binaryCheck, fsProbe })).toBe(true);
    expect(process.platform).toBe('linux');
    expect(binaryCheck).toHaveBeenCalledWith('xvfb');
    expect(binaryCheck).toHaveBeenCalledWith('Xvfb');
    expect(fsProbe).toHaveBeenCalledTimes(3);
  });

  test('fails fast when expected libraries are missing', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const { arePlaywrightDepsReady } = require('../run-tests.js');
    const binaryCheck = jest.fn().mockReturnValue(true);
    const fsProbe = jest
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    expect(arePlaywrightDepsReady({ binaryCheck, fsProbe })).toBe(false);
    expect(fsProbe).toHaveBeenCalledTimes(3);
  });
});
