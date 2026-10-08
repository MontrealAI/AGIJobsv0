/** @type {import('next').NextConfig} */
const nextConfig = {
  // Reuse the same protocol implementation as the gateway and orchestrator.
  experimental: { externalDir: true },
};
module.exports = nextConfig;
