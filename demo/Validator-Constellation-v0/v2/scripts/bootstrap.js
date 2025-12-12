import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(moduleRoot, '..');
const nodeModulesPath = join(projectRoot, 'node_modules');

if (!existsSync(nodeModulesPath)) {
  console.log('🔧 Installing local dependencies for Validator Constellation v2 demo...');
  execSync('npm ci', { cwd: projectRoot, stdio: 'inherit' });
} else {
  console.log('✅ Local dependencies already installed; skipping bootstrap.');
}
