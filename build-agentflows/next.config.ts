import type { NextConfig } from 'next';
const nextConfig:NextConfig={output:'standalone',experimental:{proxyClientMaxBodySize:'11mb'},serverExternalPackages:['@openai/codex','unpdf','sharp'],outputFileTracingIncludes:{'/*':['./node_modules/@openai/codex/**/*','./node_modules/@openai/codex-*/**/*']}};
export default nextConfig;
