import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const nextPkg = require('next/package.json');
const nextMajor = Number.parseInt(nextPkg.version.split('.')[0], 10);

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true
};

if (Number.isNaN(nextMajor) || nextMajor < 15) {
  config.experimental = {
    typedRoutes: true,
    outputFileTracingRoot: workspaceRoot
  };
} else {
  config.typedRoutes = true;
  config.outputFileTracingRoot = workspaceRoot;
}

export default config;
