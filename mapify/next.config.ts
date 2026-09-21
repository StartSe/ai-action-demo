import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@openai/codex", "unpdf"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@openai/codex/**/*",
      "./node_modules/@openai/codex-*/**/*",
      "./scripts/transcript.py",
    ],
  },
};
export default config;
