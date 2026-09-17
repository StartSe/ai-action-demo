"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Cabeçalho fixo das telas de deployment (MCP hoje; API depois): link de
 * volta, título e badge de status à esquerda, ação primária e menu "Mais
 * ações" à direita. `sticky` no topo do scroll container da tela; abaixo de
 * `sm` a ação primária desce para uma barra inferior fixa — o conteúdo da
 * página precisa de `pb-24` nesse breakpoint para nada ficar coberto.
 * Só apresentação: o estado e as server actions ficam em cada tela.
 */

const DEPLOYMENT_MORE_ACTIONS_LABEL = "Mais ações";

export type DeploymentPrimaryAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Troca o ícone por um Loader2 e desabilita o botão */
  pending?: boolean;
  /** Vai no `title` do botão desabilitado — explica por que não dá para clicar */
  disabledReason?: string;
};

export type DeploymentMenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export function DeploymentPageHeader({
  backHref,
  backLabel,
  title,
  statusBadge,
  primaryAction,
  menuItems,
}: {
  backHref: string;
  /** Texto do link de volta (ex.: "Publicar" para a aba de deploy) */
  backLabel: string;
  title: string;
  statusBadge: ReactNode;
  primaryAction: DeploymentPrimaryAction;
  menuItems: DeploymentMenuItem[];
}) {
  const disabled =
    Boolean(primaryAction.disabled) || Boolean(primaryAction.pending);
  const primaryButton = (className?: string) => (
    <Button
      type="button"
      onClick={primaryAction.onClick}
      disabled={disabled}
      title={disabled ? primaryAction.disabledReason : undefined}
      className={className}
    >
      {primaryAction.pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <primaryAction.icon className="size-4" aria-hidden />
      )}
      {primaryAction.label}
    </Button>
  );

  return (
    <>
      <header
        data-deployment-header
        className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-ml-2 shrink-0"
            >
              <Link href={backHref}>
                <ArrowLeft className="size-4" aria-hidden />
                {/* Abaixo de sm só a seta: sobra largura para o título e o badge */}
                <span className="sr-only sm:not-sr-only">{backLabel}</span>
              </Link>
            </Button>
            <h1 className="truncate text-lg font-semibold text-foreground sm:text-xl">
              {title}
            </h1>
            <span className="shrink-0">{statusBadge}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Abaixo de sm a ação primária vive na barra inferior */}
            {primaryButton("hidden sm:inline-flex")}
            {menuItems.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={DEPLOYMENT_MORE_ACTIONS_LABEL}
                    title={DEPLOYMENT_MORE_ACTIONS_LABEL}
                  >
                    <MoreHorizontal className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {menuItems.map((item) => (
                    <DropdownMenuItem
                      key={item.label}
                      onSelect={item.onSelect}
                      disabled={item.disabled}
                      variant={item.destructive ? "destructive" : "default"}
                    >
                      {item.icon && (
                        <item.icon className="size-4" aria-hidden />
                      )}
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* Barra inferior fixa (< sm) com a mesma ação primária */}
      <div
        data-deployment-action-bar
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
      >
        {primaryButton("w-full")}
      </div>
    </>
  );
}
