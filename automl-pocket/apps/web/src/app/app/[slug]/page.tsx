import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { findPublishedWebAppBySlug } from "@/lib/deployments";

import { PublicWebApp } from "./public-web-app";

// cache() deduplica a busca entre generateMetadata e a página (mesma request)
const getWebApp = cache(async (slug: string) => {
  // Marca a rota como dinâmica antes de tocar no banco (prerender do build
  // roda sem o arquivo de SQLITE_PATH)
  await headers();
  return findPublishedWebAppBySlug(slug);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const webApp = await getWebApp(slug);
  if (!webApp) return {};
  return {
    title: webApp.deployment.title,
    description: webApp.deployment.description || undefined,
  };
}

/**
 * Página pública do Web App (US-044): acessível sem sessão pelo slug secreto
 * (liberada em src/proxy.ts), sem navbar/sidebar interna. Não expõe nada da
 * org/projeto além do título e da descrição configurados.
 */
export default async function PublicWebAppPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const webApp = await getWebApp(slug);
  if (!webApp) notFound();

  return (
    <main className="flex min-h-svh w-full flex-col items-center bg-background px-4 py-10 sm:py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xs sm:p-8">
        <PublicWebApp
          slug={slug}
          title={webApp.deployment.title}
          description={webApp.deployment.description}
          fields={webApp.formFields}
        />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Criado com AutoML
      </p>
    </main>
  );
}
