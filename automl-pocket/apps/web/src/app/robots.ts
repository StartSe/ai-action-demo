import type { MetadataRoute } from "next";

import { appOrigin } from "@/lib/app-origin";

/**
 * `/robots.txt` (PRD US-021): a home precisa ser indexável e o arquivo precisa
 * existir de verdade — sem ele o proxy responde o HTML de /login e o
 * Lighthouse reprova a auditoria de SEO. As rotas atrás de sessão e os Web
 * Apps publicados dos clientes ficam fora do índice.
 *
 * `/robots.txt` e `/sitemap.xml` também estão em PUBLIC_PATHS (src/proxy.ts).
 */
const DISALLOWED = ["/api/", "/app/", "/projects", "/datasets", "/settings"];

// `appOrigin()` vem de BETTER_AUTH_URL, que só existe em RUNTIME (o build do
// Docker não a tem): sem `force-dynamic` o Next prerenderiza este arquivo no
// build e a origem sairia nula para sempre.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = appOrigin();

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOWED }],
    ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
  };
}
