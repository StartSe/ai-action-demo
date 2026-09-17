import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Sem infraestrutura de nonce, os scripts/styles inline do Next exigem
// 'unsafe-inline'; 'unsafe-eval' só em dev (React usa eval para debugging).
// Cloudflare Web Analytics: o proxy do Cloudflare injeta o beacon
// (static.cloudflareinsights.com/beacon.min.js) no HTML e ele envia as
// métricas para cloudflareinsights.com — os dois hosts precisam estar
// liberados, senão o navegador bloqueia e loga violação de CSP.
const CLOUDFLARE_INSIGHTS_SCRIPT = "https://static.cloudflareinsights.com";
const CLOUDFLARE_INSIGHTS_API = "https://cloudflareinsights.com";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${CLOUDFLARE_INSIGHTS_SCRIPT}${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  `connect-src 'self' ${CLOUDFLARE_INSIGHTS_API}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // 2 anos; só tem efeito quando servido via HTTPS (TLS no proxy do Coolify)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Build de produção auto-contido (.next/standalone) consumido pelo Dockerfile
  output: "standalone",
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
