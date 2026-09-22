import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  // 20 MB per file plus multipart overhead; routes enforce the exact file limit.
  experimental: { proxyClientMaxBodySize: "21mb" },
  serverExternalPackages: ["@openai/codex"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@openai/codex/**/*", "./node_modules/@openai/codex-*/**/*"],
  },
};
export default config;
