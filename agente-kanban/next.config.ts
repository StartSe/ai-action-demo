import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@openai/codex-sdk", "@openai/codex"],
  outputFileTracingIncludes: { "/*": ["./node_modules/@openai/codex*/**/*"] },
  // Proxy and instrumentation entries have no leading slash in this Next version.
  outputFileTracingExcludes: { "**": ["./data/**/*"] },
};

export default nextConfig;
