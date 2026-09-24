import type { NextConfig } from "next";

// Cabeçalhos de segurança de toda resposta. O app é de uma instância só, servida em endereço
// próprio, e nada aqui precisa ser afrouxado por integração: as chamadas à IA e à busca saem do
// servidor, não do navegador, a fonte Manrope é baixada no build pelo next/font e servida de
// `/_next/static`, e as ilustrações moram em `public/`. Por isso `default-src 'self'` basta.
//
// `'unsafe-inline'` em `script-src` é o preço de não ter nonce: o App Router injeta os dados da
// página em `<script>` inline, e o nonce teria que nascer no `proxy.ts`, que é infraestrutura
// copiada da suíte e não se altera aqui (ver CLAUDE.md). O resto da regra continua valendo para o
// que mais importa: script de outra origem, `eval`, plugin, envio de formulário para fora e a
// moldura que permitiria clickjacking.
function politicaDeConteudo(desenvolvimento: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // `next dev` recompila a página com eval e conversa por websocket; em produção os dois ficam
    // proibidos, que é onde a regra precisa valer.
    `script-src 'self' 'unsafe-inline'${desenvolvimento ? " 'unsafe-eval'" : ""}`,
    `connect-src 'self'${desenvolvimento ? " ws:" : ""}`,
  ].join("; ");
}

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    const desenvolvimento = process.env.NODE_ENV !== "production";
    return [
      {
        source: "/:caminho*",
        headers: [
          { key: "Content-Security-Policy", value: politicaDeConteudo(desenvolvimento) },
          // Redundante com `frame-ancestors`, e de propósito: navegador antigo entende só este.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // O app não usa nenhum destes; desligar evita que uma página injetada peça permissão.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // Sem `includeSubDomains`: o app pode ser publicado em qualquer host, e a instância não
          // tem como saber se os irmãos daquele domínio já falam https.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
