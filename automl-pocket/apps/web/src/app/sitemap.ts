import type { MetadataRoute } from "next";

import { appOrigin } from "@/lib/app-origin";

/**
 * `/sitemap.xml` com as rotas públicas indexáveis (PRD US-021). Sem
 * BETTER_AUTH_URL (dev/CI) não há origem canônica e o sitemap sai vazio —
 * URLs relativas não são válidas no formato.
 */
const PUBLIC_ROUTES = [{ path: "/", priority: 1 }] as const;

// `appOrigin()` vem de BETTER_AUTH_URL, que só existe em RUNTIME (o build do
// Docker não a tem): sem `force-dynamic` o Next prerenderiza este arquivo no
// build e a origem sairia nula para sempre.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appOrigin();
  if (!origin) return [];

  return PUBLIC_ROUTES.map(({ path, priority }) => ({
    url: `${origin}${path}`,
    changeFrequency: "monthly" as const,
    priority,
  }));
}
