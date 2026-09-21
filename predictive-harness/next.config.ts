import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@openai/codex"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@openai/codex/**/*", "./node_modules/@openai/codex-*/**/*"],
  },
};
export default config;
