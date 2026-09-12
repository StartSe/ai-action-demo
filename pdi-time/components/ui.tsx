"use client";
// Componentes visuais compartilhados pela suíte. Copie este arquivo para cada app sem alterar.
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Meta } from "@/lib/ai";

export type Status = { ai: boolean; demo: boolean; model: string; integrations?: Record<string, boolean>; setup?: { pronto: boolean; url: string } };

export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setErro(true));
  }, []);
  return { status, erro };
}

export function Topbar({ marca, nome, area, status, erro }: { marca: string; nome: string; area: string; status: Status | null; erro?: boolean }) {
  const texto = erro ? "Servidor indisponível" : !status ? "Verificando IA" : status.ai ? "IA conectada" : "Modo demonstração";
  const demo = status ? !status.ai : false;
  return (
    <header className="no-print flex items-center justify-between gap-4 px-8 py-3.5 max-md:px-4 max-md:py-3 bg-surface border-b border-line">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 w-[34px] h-[34px] max-md:w-[30px] max-md:h-[30px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] max-md:text-[13px] tracking-tight">{marca}</div>
        <div className="min-w-0">
          <div className="font-bold text-[15px] max-md:text-sm max-md:leading-tight">{nome}</div>
          <div className="text-muted text-[13px] max-md:hidden">{area}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] max-md:text-xs font-semibold whitespace-nowrap ${demo ? "bg-[#fff4e0] text-[#7a4d00]" : "bg-accent-soft text-accent-ink"}`}>
          <span className={`w-2 h-2 rounded-full ${demo ? "bg-warn" : "bg-accent"}`} />
          {texto}
        </span>
        <Link href="/setup" className="text-[13px] font-semibold text-muted hover:text-ink max-md:hidden">Configurações</Link>
      </div>
    </header>
  );
}

/** Aviso de modo demonstração com atalho para a configuração inicial (/setup). */
export function DemoNotice({ visivel, resumo, children }: { visivel: boolean; resumo: string; children?: ReactNode }) {
  if (!visivel) return null;
  return (
    <div className="no-print mx-8 mt-5 max-md:mx-4 px-4 py-2.5 rounded-[10px] text-[13.5px] bg-[#fff8ea] border border-[#f3dfb3] text-[#6b4300] flex items-center justify-between gap-3 flex-wrap">
      <span>{resumo}{children ? <> {children}</> : null}</span>
      <Link href="/setup" className="shrink-0 font-bold underline underline-offset-2">Conectar a IA em 1 minuto</Link>
    </div>
  );
}

export function Workspace({ children }: { children: ReactNode }) {
  return <main className="grid grid-cols-[minmax(320px,420px)_1fr] max-md:grid-cols-1 gap-7 px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">{children}</main>;
}

export function Panel({ titulo, lead, children }: { titulo: string; lead: string; children: ReactNode }) {
  return (
    <section className="no-print card p-7 max-md:p-[22px] self-start md:sticky md:top-6 md:max-h-[calc(100vh-48px)] md:overflow-y-auto">
      <h1 className="text-[30px] max-md:text-[26px] leading-[1.15] font-extrabold tracking-[-0.025em] mb-2.5">{titulo}</h1>
      <p className="text-muted mb-6">{lead}</p>
      {children}
    </section>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 mb-4 min-w-0 [&>*]:min-w-0">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold">{label}</label>
      {children}
      {hint && <span className="text-[12.5px] text-muted">{hint}</span>}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 [&>*]:min-w-0">{children}</div>;
}

export function Stage({ children }: { children: ReactNode }) {
  return <section id="stage" className="min-h-[520px] max-md:min-h-0">{children}</section>;
}

export function Empty({ glifo, titulo, descricao, acao, onAcao }: { glifo: string; titulo: string; descricao: string; acao?: string; onAcao?: () => void }) {
  return (
    <div className="h-full min-h-[520px] max-md:min-h-[320px] flex flex-col items-center justify-center text-center text-muted p-10 max-md:px-4 max-md:py-7 border border-dashed border-line rounded-card">
      <div className="w-16 h-16 rounded-[18px] bg-accent-soft text-accent grid place-items-center text-[26px] font-extrabold mb-[18px]">{glifo}</div>
      <h2 className="text-ink text-lg font-bold mb-1.5">{titulo}</h2>
      <p className="max-w-[380px]">{descricao}</p>
      {acao && onAcao && <button type="button" className="btn-link mt-1" onClick={onAcao}>{acao}</button>}
    </div>
  );
}

export function Loading({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-3.5 py-2" aria-live="polite">
      <p className="text-muted text-sm">{texto}</p>
      <div className="skeleton h-11 w-4/5" />
      <div className="skeleton w-3/5" />
      <div className="skeleton w-[70%]" />
      <div className="skeleton h-11 w-[90%]" />
      <div className="skeleton w-1/2" />
    </div>
  );
}

export function ErrorBox({ mensagem }: { mensagem: string }) {
  return <div className="bg-[#fde8e6] border border-[#f5c2bd] text-danger px-4 py-3.5 rounded-[10px]"><strong>Não deu certo.</strong> {mensagem}</div>;
}

export function ResultHead({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 mb-5 max-md:flex-wrap">
      <div>
        <h2 className="text-xl font-extrabold tracking-[-0.01em]">{titulo}</h2>
        {subtitulo && <div className="text-muted text-sm">{subtitulo}</div>}
      </div>
      {children && <div className="no-print flex gap-2.5 shrink-0 max-md:flex-wrap max-md:w-full [&>*]:max-md:flex-1">{children}</div>}
    </div>
  );
}

/** Linha de proveniência do resultado: de onde veio e quando. O nome do modelo só aparece no title. */
export function Origem({ meta }: { meta: Meta }) {
  const data = new Date(meta.geradoEm);
  const quando = `${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(data)} às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(data)}`;
  const texto = meta.demo
    ? `Exemplo ilustrativo a partir de ${meta.insumo}. Conecte a IA para analisar seus dados`
    : `Gerado com IA a partir de ${meta.insumo}, em ${quando}`;
  return <p className="text-muted text-[13px] mb-4" title={meta.model}>{texto}</p>;
}

export function Section({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="section-title">{titulo}</h2>
      {children}
    </div>
  );
}

export function Item({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card shadow-none px-5 py-[18px] ${className}`}>{children}</div>;
}

export function Chip({ nivel, children }: { nivel: string; children: ReactNode }) {
  const classe = nivel.toLowerCase().replace("é", "e");
  return <span className={`chip-${classe}`}>{children}</span>;
}

export type Coluna<T> = { chave: string; titulo: string; render: (linha: T) => ReactNode; classe?: string };

/** Tabela responsiva: linhas no desktop, blocos rotulados no celular. */
export function DataTable<T>({ colunas, linhas }: { colunas: Coluna<T>[]; linhas: T[] }) {
  return (
    <>
      <table className="max-md:hidden w-full border-collapse text-sm card shadow-none overflow-hidden">
        <thead>
          <tr>{colunas.map((c) => <th key={c.chave} className="text-left px-3.5 py-[11px] border-b border-line font-bold text-[13px] text-muted bg-[#fafbfc]">{c.titulo}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="[&:last-child>td]:border-b-0">
              {colunas.map((c) => <td key={c.chave} className={`px-3.5 py-[11px] border-b border-line align-top ${c.classe ?? ""}`}>{c.render(l)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="md:hidden card shadow-none divide-y divide-line text-sm">
        {linhas.map((l, i) => (
          <div key={i} className="px-3.5 py-2.5 flex flex-col gap-1.5">
            {colunas.map((c) => (
              <div key={c.chave}>
                <div className="text-[11.5px] font-bold text-muted">{c.titulo}</div>
                <div>{c.render(l)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function CopyButton({ texto, rotulo = "Copiar texto" }: { texto: () => string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn-ghost" onClick={async () => {
      const t = texto();
      try { await navigator.clipboard.writeText(t); setOk(true); } catch { alert(t); }
      setTimeout(() => setOk(false), 1800);
    }}>{ok ? "Copiado" : rotulo}</button>
  );
}

/** No celular, rola até o resultado quando ele aparece (desligado com ?captura=1). */
export function useScrollToResult(pronto: boolean) {
  useEffect(() => {
    if (!pronto || window.innerWidth > 768 || location.search.includes("captura")) return;
    document.getElementById("stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pronto]);
}

export function esc(s: unknown) { return String(s ?? ""); }
