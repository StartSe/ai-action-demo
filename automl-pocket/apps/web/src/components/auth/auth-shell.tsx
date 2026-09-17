import { BarChart3, Sparkles, TrendingUp } from "lucide-react";

import { Logo } from "@/components/auth/logo";

// Layout split das telas de autenticação: painel esquerdo escuro com branding
// (oculto abaixo de 1024px) e painel direito claro com o formulário + rodapé.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1">
      <aside className="brand-dark-panel hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex">
        <Logo dark />

        <div className="max-w-md space-y-10">
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Da planilha ao modelo preditivo em minutos.
            </h1>
            <p className="text-lg leading-relaxed text-white/70">
              Envie seus dados, explore padrões e treine modelos de machine
              learning — sem escrever uma linha de código.
            </p>
          </div>

          <ul className="space-y-4 text-sm text-white/80">
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10">
                <BarChart3 className="size-4" aria-hidden />
              </span>
              Exploração automática com distribuições e correlações
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10">
                <Sparkles className="size-4" aria-hidden />
              </span>
              Treinamento automático: classificação, regressão e forecasting
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10">
                <TrendingUp className="size-4" aria-hidden />
              </span>
              Relatórios de insights em linguagem de negócio
            </li>
          </ul>
        </div>

        <p className="text-sm text-white/50">
          Feito para aulas executivas — do dado à decisão.
        </p>
      </aside>

      <main className="flex min-h-screen flex-1 flex-col bg-background">
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 pb-8 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} AutoML</span>
        </footer>
      </main>
    </div>
  );
}
