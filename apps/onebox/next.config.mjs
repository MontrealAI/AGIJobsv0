import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, '..', '..');
const require = createRequire(import.meta.url);
const zodEntryPoint = require.resolve('zod');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    forceSwcTransforms: true,
    externalDir: true
  },
  webpack: (config) => {
    const moduleDirs = config.resolve.modules ?? [];
    const rootNodeModules = path.join(workspaceRoot, 'node_modules');

    if (!moduleDirs.includes(rootNodeModules)) {
      moduleDirs.push(rootNodeModules);
    }

    const appNodeModules = path.join(appDir, 'node_modules');
    if (!moduleDirs.includes(appNodeModules)) {
      moduleDirs.push(appNodeModules);
    }

    config.resolve.modules = moduleDirs;

    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      zod: path.dirname(zodEntryPoint),
      'zod$': zodEntryPoint
    };

    return config;
  }
};

export default nextConfig;
