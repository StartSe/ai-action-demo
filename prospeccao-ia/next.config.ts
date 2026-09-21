import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Conector oficial do ChatGPT (lib/chatgpt.ts): o pacote e o binário da plataforma precisam ir inteiros
  // para a saída standalone, senão o subprocesso não sobe dentro da imagem publicada.
  serverExternalPackages: ["@openai/codex"],
  outputFileTracingIncludes: { "/*": ["./node_modules/@openai/codex/**/*", "./node_modules/@openai/codex-*/**/*"] },
};

export default nextConfig;
