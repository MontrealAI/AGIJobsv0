import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(moduleRoot, '..');
const nodeModulesPath = join(projectRoot, 'node_modules');
const bootstrapMarkerPath = join(projectRoot, '.bootstrap-complete');

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const installWithRetries = (maxAttempts = 3) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (existsSync(nodeModulesPath)) {
      rmSync(nodeModulesPath, { recursive: true, force: true });
    }

    try {
      execSync('npm ci --prefer-offline --no-progress', { cwd: projectRoot, stdio: 'inherit' });
      writeFileSync(bootstrapMarkerPath, `installed_at=${new Date().toISOString()}\n`);
      console.log('✅ Local dependencies installed.');
      return;
    } catch (error) {
      console.error(`❌ Install attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxAttempts) {
        throw error;
      }

      const backoffMs = 1000 * 2 ** (attempt - 1);
      console.log(`↻ Retrying in ${backoffMs}ms to mitigate transient network issues...`);
      sleep(backoffMs);
    }
  }
};

if (!existsSync(nodeModulesPath) || !existsSync(bootstrapMarkerPath)) {
  console.log('🔧 Installing local dependencies for Validator Constellation v2 demo...');
  installWithRetries();
} else {
  console.log('✅ Local dependencies already installed; skipping bootstrap.');
}
