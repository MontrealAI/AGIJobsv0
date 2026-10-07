const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

module.exports = function isolatedValidationStore() {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'validation-store-'))
  );
  const root = path.join(directory, 'state');
  const modulePath = require.resolve('../../agent-gateway/validationStore');
  const priorModule = require.cache[modulePath];
  const priorDirectory = process.env.VALIDATION_STORAGE_DIR;
  try {
    process.env.VALIDATION_STORAGE_DIR = root;
    delete require.cache[modulePath];
    const store = require(modulePath);
    return {
      store,
      root,
      directory,
      cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
    };
  } finally {
    if (priorModule) require.cache[modulePath] = priorModule;
    else delete require.cache[modulePath];
    if (priorDirectory === undefined) delete process.env.VALIDATION_STORAGE_DIR;
    else process.env.VALIDATION_STORAGE_DIR = priorDirectory;
  }
};
