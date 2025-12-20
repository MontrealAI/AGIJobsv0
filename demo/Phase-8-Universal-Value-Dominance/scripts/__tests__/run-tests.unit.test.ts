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
});

describe('canInstallPlaywrightDeps', () => {
  const platform = process.platform;

  beforeEach(() => {
    jest.resetModules();
    spawnSync.mockReset();
    spawnSync.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform });
  });

  test('returns true on linux when apt-get is available even for non-root users', () => {
    const { canInstallPlaywrightDeps } = require('../run-tests.js');
    spawnSync.mockReturnValue({ status: 0 });
    Object.defineProperty(process, 'platform', { value: 'linux' });

    expect(canInstallPlaywrightDeps()).toBe(true);
    expect(spawnSync).toHaveBeenCalledWith('which', ['apt-get'], { stdio: 'ignore' });
  });

  test('returns false when apt-get is unavailable', () => {
    const { canInstallPlaywrightDeps } = require('../run-tests.js');
    spawnSync.mockReturnValue({ status: 1 });
    Object.defineProperty(process, 'platform', { value: 'linux' });

    expect(canInstallPlaywrightDeps()).toBe(false);
    expect(spawnSync).toHaveBeenCalledWith('which', ['apt-get'], { stdio: 'ignore' });
  });

  test('returns false on non-linux platforms', () => {
    const { canInstallPlaywrightDeps } = require('../run-tests.js');
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    expect(canInstallPlaywrightDeps()).toBe(false);
    expect(spawnSync).not.toHaveBeenCalledWith('which', ['apt-get'], expect.anything());
  });
});
