"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { renameProject } from "@/app/(app)/projects/actions";
import { Logo } from "@/components/auth/logo";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ProjectTab = {
  key: string;
  label: string;
  /** Ícone 16px renderizado à esquerda do label (herda a cor via currentColor) */
  icon?: React.ReactNode;
  href: string;
  enabled: boolean;
  /** Motivo exibido em tooltip quando a aba está desabilitada */
  disabledReason?: string;
};

type ProjectNavbarProps = {
  projectId: string;
  name: string;
  tabs: ProjectTab[];
};

/**
 * Navbar preta do projeto: voltar para projetos, nome editável inline e
 * abas Prepare/Predict/Reports (desabilitadas quando indisponíveis).
 */
export function ProjectNavbar({ projectId, name, tabs }: ProjectNavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(name);

  async function commitRename() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === saved) {
      setValue(saved);
      return;
    }
    const result = await renameProject(projectId, trimmed);
    if (result?.error) {
      setValue(saved);
      return;
    }
    setValue(trimmed);
    setSaved(trimmed);
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 bg-[#0a0f1e] px-4 text-white">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          href="/projects"
          aria-label="Voltar para projetos"
          className="flex items-center gap-1.5 rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <Logo iconOnly className="size-6" />
        </Link>
        <Badge variant="outline" className="border-white/20 text-white/60">
          Beta
        </Badge>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setValue(saved);
              event.currentTarget.blur();
            }
          }}
          aria-label="Nome do projeto"
          className="min-w-24 max-w-72 truncate rounded-md bg-transparent px-2 py-1 text-sm font-medium outline-none transition-colors [field-sizing:content] hover:bg-white/10 focus:bg-white/10 focus:ring-1 focus:ring-white/30"
        />
      </div>

      <TooltipProvider>
        <nav className="flex items-center gap-1" aria-label="Etapas do projeto">
          {tabs.map((tab) => {
            if (!tab.enabled) {
              const reason = tab.disabledReason ?? "Disponível em breve";
              return (
                <Tooltip key={tab.key}>
                  <TooltipTrigger asChild>
                    {/* span focável: elemento aria-disabled não recebe hover/focus nativos */}
                    <span
                      tabIndex={0}
                      aria-disabled
                      aria-label={`${tab.label} — ${reason}`}
                      className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                    >
                      {tab.icon}
                      {tab.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{reason}</TooltipContent>
                </Tooltip>
              );
            }
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:bg-white/10 hover:text-white",
                )}
              >
                {tab.icon}
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </TooltipProvider>

      {/* flex-1 espelha o lado esquerdo para as abas ficarem centralizadas */}
      <div className="flex-1" />
    </header>
  );
}
