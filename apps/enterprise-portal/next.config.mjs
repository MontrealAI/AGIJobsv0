import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  outputFileTracingRoot: workspaceRoot
};

export default nextConfig;
