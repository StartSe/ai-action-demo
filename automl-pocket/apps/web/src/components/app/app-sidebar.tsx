"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Database,
  FolderKanban,
  LogOut,
  PanelLeft,
  Settings,
} from "lucide-react";

import { Logo } from "@/components/auth/logo";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/projects", label: "Projetos", icon: FolderKanban },
  { href: "/datasets", label: "Datasets", icon: Database },
] as const;

type AppSidebarProps = {
  user: { name: string; email: string };
};

export function AppSidebar({ user }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const initial = (user.name || user.email).charAt(0).toUpperCase();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Conta no topo */}
      <div
        className={cn(
          "flex shrink-0 border-b border-border",
          collapsed
            ? "h-16 items-center justify-center px-2"
            : "min-h-16 items-start justify-between px-4 py-2",
        )}
      >
        {collapsed ? (
          <Link
            href="/projects"
            aria-label="Ir para projetos"
            title="Ir para projetos"
          >
            <Logo iconOnly />
          </Link>
        ) : (
          <div className="flex min-w-0 flex-col items-end">
            <Link href="/projects" aria-label="Ir para projetos">
              <Logo />
            </Link>
            <Badge
              variant="outline"
              className="-mt-1 px-1.5 py-0 text-[10px] text-muted-foreground"
            >
              Beta
            </Badge>
          </div>
        )}
        {/* h-9 = altura do ícone da logo, para o botão centralizar com ela */}
        {!collapsed && (
          <div className="flex h-9 shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Recolher menu lateral"
            >
              <PanelLeft className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Expandir menu lateral"
        >
          <PanelLeft className="size-4 rotate-180" aria-hidden />
        </button>
      )}

      {/* Navegação principal */}
      {/* min-h-0 + overflow-y-auto: em janela baixa (720px) é a lista que
          rola — o rodapé fica sempre visível */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-2",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Rodapé: configurações e usuário logado (sempre visíveis) */}
      <div className="flex shrink-0 flex-col gap-1 border-t border-border p-2">
        <Link
          href="/settings"
          title={collapsed ? "Configurações" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            collapsed && "justify-center px-2",
            pathname === "/settings"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Settings className="size-4 shrink-0" aria-hidden />
          {!collapsed && "Configurações"}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent",
              collapsed && "justify-center",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initial}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {user.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel className="truncate">
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="size-4" aria-hidden />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
