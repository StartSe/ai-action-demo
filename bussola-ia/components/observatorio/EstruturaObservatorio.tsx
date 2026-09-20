"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { type Status } from "@/components/ui";
import { requisitar } from "@/lib/http-cliente";
import { Icone, type NomeIcone } from "./Icone";
import type { Tela } from "@/lib/navegacao";
export type { Tela } from "@/lib/navegacao";
const nav: { id: Tela; nome: string; icone: NomeIcone }[] = [
  { id: "visao", nome: "Visão geral", icone: "grid" },
  { id: "assessments", nome: "Assessments", icone: "layers" },
  { id: "oficina", nome: "Oficina de criação", icone: "spark" },
  { id: "inteligencia", nome: "Inteligência", icone: "chart" },
];
const utilidades = [
  { id: "historico", nome: "Histórico", url: "/historico", icone: "clock" },
  { id: "setup", nome: "Configurações", url: "/setup", icone: "settings" },
] as const;

export function MarcaBussola() {
  return <Link href="/" className="obs-brand" aria-label="Bússola · início"><span><Icone nome="compass" size={29} /></span><div>bússola<span>INOVAÇÃO + INTELIGÊNCIA</span></div></Link>;
}

export function EstruturaObservatorio({ ativo, status, totalAssessments, aoNavegar, children }: {
  ativo: Tela | "setup" | "historico";
  status: Status | null;
  totalAssessments?: number;
  aoNavegar?: (tela: Tela) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [saindo, setSaindo] = useState(false);
  const nome = status?.usuario?.nome?.split(" ")[0] || "Gestor";
  async function sair() {
    setSaindo(true); setErro("");
    try { await requisitar("/api/conta/sair", { method: "POST" }); router.push("/entrar"); router.refresh(); }
    catch { setErro("Não foi possível sair da conta. Tente novamente."); setSaindo(false); }
  }
  return <div className="observatorio">
    <a href="#conteudo-principal" className="skip-link">Ir para o conteúdo</a>
    <aside className="obs-sidebar">
      <MarcaBussola />
      <div className="workspace-label"><span className="live-dot" /> Espaço do gestor <span>↗</span></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Navegação principal">
        {nav.map((n) => {
          const conteudo = <><Icone nome={n.icone} /><span>{n.nome}</span>{n.id === "assessments" && totalAssessments !== undefined && <small>{totalAssessments}</small>}</>;
          return aoNavegar ? <button key={n.id} aria-current={ativo === n.id ? "page" : undefined} onClick={() => aoNavegar(n.id)}>{conteudo}</button> : <Link key={n.id} href={`/?tela=${n.id}`} aria-current={ativo === n.id ? "page" : undefined}>{conteudo}</Link>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><Icone nome="spark" /><strong>Um novo olhar.<br />Seu próximo movimento.</strong><p>Especialistas de IA, da pergunta à decisão.</p><Link href="/setup">{status?.ai ? "Gerenciar agentes" : "Conectar inteligência"}<Icone nome="arrow" size={15} /></Link></div>
        {utilidades.map((n) => <Link key={n.id} className="sidebar-settings" href={n.url} aria-current={ativo === n.id ? "page" : undefined}><Icone nome={n.icone} />{n.nome}</Link>)}
        <div className="obs-account"><span className="account-avatar">{nome[0]}</span><div><strong>{nome}</strong><small>Gestão de inovação</small></div><button aria-label="Sair da conta" disabled={saindo} onClick={() => void sair()}><Icone nome="logout" size={17} /></button></div>
      </div>
      <div className="mobile-utilities">{utilidades.map((n) => <Link key={n.id} href={n.url} aria-current={ativo === n.id ? "page" : undefined}><Icone nome={n.icone} size={15} />{n.nome}</Link>)}<button onClick={() => void sair()} disabled={saindo} aria-label="Sair da conta"><Icone nome="logout" size={15} />Sair</button></div>
    </aside>
    <div className="obs-body">
      <header className="obs-topbar"><div><span>Workspace</span><span>/</span><strong>{[...nav, ...utilidades].find((n) => n.id === ativo)?.nome}</strong></div><Link href="/setup" className={`connection-pill ${status?.ai ? "connected" : ""}`}><span className="live-dot" />{status === null ? "Verificando conexão" : status.ai ? "IA conectada" : "Modo assistido · sem IA"}</Link></header>
      <main id="conteudo-principal" className="obs-main">
        {erro && <div role="alert" className="obs-alert error">{erro}</div>}
        {children}
        <footer className="obs-footer"><span>BÚSSOLA <i>/</i> clareza para transformar.</span><span>Feito para quem move o futuro <span>↗</span></span></footer>
      </main>
    </div>
  </div>;
}
