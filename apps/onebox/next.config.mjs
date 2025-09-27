import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, '..', '..');

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
      zod: path.join(rootNodeModules, 'zod')
    };

    return config;
  }
};

export default nextConfig;
