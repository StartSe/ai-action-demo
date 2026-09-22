"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, IconButton, Logo } from "./ui";
export type Aba = "conversa" | "conectores" | "premissas" | "configuracoes";
export function AppHeader({ ativa, conversaId, onAba, disabled }: { ativa: Aba; conversaId?: string; onAba?: (aba: Aba) => void; disabled?: boolean }) {
  const router = useRouter();
  const abas = [{ id: "conversa", nome: "Conversa", icone: "chat" }, { id: "conectores", nome: "Conectores", icone: "link" }, { id: "premissas", nome: "Livro de premissas", icone: "book" }, { id: "configuracoes", nome: "Configurações", icone: "settings" }] as const;
  return <header className="topbar app-header">
    <Link href="/" aria-label="Cowork Jev · início"><Logo compact /></Link>
    <nav aria-label="Navegação principal">{abas.map(a => {
      const conteudo = <><Icon name={a.icone} size={17} /><span>{a.nome}</span></>;
      const href = a.id === "configuracoes" ? `/configuracoes${conversaId ? `?conversa=${encodeURIComponent(conversaId)}` : ""}` : `/?aba=${a.id}${conversaId ? `&conversa=${encodeURIComponent(conversaId)}` : ""}`;
      return onAba && a.id !== "configuracoes" ? <button key={a.id} disabled={disabled} onClick={() => onAba(a.id)} aria-current={ativa === a.id ? "page" : undefined}>{conteudo}</button> : <Link key={a.id} aria-current={ativa === a.id ? "page" : undefined} href={href}>{conteudo}</Link>;
    })}</nav>
    <IconButton icon="logout" label="Sair da conta" onClick={() => void fetch("/api/auth", { method: "DELETE" }).then(() => { router.push("/entrar"); router.refresh(); })} />
  </header>;
}
