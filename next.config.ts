import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['@electric-sql/pglite', '@electric-sql/pglite-tools'],
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, module: false };
    }
    return config;
  },
};

export default nextConfig;
