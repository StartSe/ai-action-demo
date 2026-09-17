import { SearchX } from "lucide-react";

/** 404 amigável da página pública: slug inválido ou Web App despublicado. */
export default function PublicWebAppNotFound() {
  return (
    <main className="flex min-h-svh w-full flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <SearchX className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-foreground">
        Formulário não encontrado
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Este link não existe ou o formulário foi despublicado. Confira o
        endereço com quem compartilhou com você.
      </p>
    </main>
  );
}
