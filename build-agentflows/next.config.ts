import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingExcludes: { '/*': ['./data/**/*', './.env*'] },
  experimental: { proxyClientMaxBodySize: '11mb' },
  serverExternalPackages: ['@openai/codex', 'unpdf', 'officeparser', 'sharp', '@brave/brave-search-mcp-server', '@modelcontextprotocol/server-postgres'],
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/@brave/brave-search-mcp-server/**/*',
      './node_modules/@modelcontextprotocol/server-postgres/**/*',
      './node_modules/pg*/**/*',
      './node_modules/postgres*/**/*',
      './node_modules/@openai/codex/**/*',
      './node_modules/@openai/codex-*/**/*',
    ],
  },
};
export default nextConfig;
