"use client";
// Componentes visuais compartilhados pela suíte. Copie este arquivo para cada app sem alterar.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Meta } from "@/lib/ai";
import { numero, data } from "@/lib/formato";

export type Status = { ai: boolean; demo: boolean; model: string; integrations?: Record<string, boolean>; setup?: { pronto: boolean; url: string } };

export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setErro(true));
  }, []);
  return { status, erro };
}

/** Chip de status; quando em modo demonstração vira botão que abre um popover com o contexto do app. */
export function Topbar({ marca, nome, area, status, erro, resumo }: { marca: string; nome: string; area: string; status: Status | null; erro?: boolean; resumo?: string }) {
  const [aberto, setAberto] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const texto = erro ? "Servidor indisponível" : !status ? "Verificando IA" : status.ai ? "IA conectada" : "Modo demonstração";
  const demo = status ? !status.ai : false;

  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    function onClickFora(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickFora);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickFora);
    };
  }, [aberto]);

  const badge = (
    <span className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-[13px] max-md:text-xs font-semibold whitespace-nowrap min-w-[142px] max-md:min-w-[110px] ${demo ? "bg-[#fff4e0] text-[#7a4d00]" : "bg-accent-soft text-accent-ink"}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${demo ? "bg-warn" : "bg-accent"}`} />
      {texto}
    </span>
  );

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
        {demo && resumo ? (
          <div className="relative" ref={popoverRef}>
            <button type="button" className="cursor-pointer" aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
              {badge}
            </button>
            {aberto && (
              <div role="dialog" className="absolute right-0 top-[calc(100%+8px)] z-20 w-72 max-md:w-64 card p-4 text-[13.5px] text-ink">
                <p className="mb-3">{resumo}</p>
                <Link href="/setup" className="font-bold text-accent underline underline-offset-2" onClick={() => setAberto(false)}>Conectar a IA em 1 minuto</Link>
              </div>
            )}
          </div>
        ) : badge}
        <Link href="/setup" className="text-[13px] font-semibold text-muted hover:text-ink max-md:hidden">Configurações</Link>
      </div>
    </header>
  );
}

export function Workspace({ children }: { children: ReactNode }) {
  return <main className="grid grid-cols-[minmax(320px,420px)_1fr] max-md:grid-cols-1 gap-7 px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">{children}</main>;
}

export function Panel({ titulo, lead, children }: { titulo: string; lead: string; children: ReactNode }) {
  return (
    <section className="no-print card p-7 max-md:p-[22px] self-start md:sticky md:top-6 md:max-h-[calc(100vh-48px)] md:overflow-y-auto">
      <h1 className="text-[26px] max-md:text-[24px] leading-[1.15] font-extrabold tracking-[-0.025em] mb-2.5">{titulo}</h1>
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

/** <details> com o mesmo espaçamento vertical dos Field; agrupa campos secundários fora do fluxo principal do painel. */
export function MaisDetalhes({ titulo = "Mais detalhes", children }: { titulo?: string; children: ReactNode }) {
  return (
    <details className="group mb-4">
      <summary className="text-[13px] font-semibold cursor-pointer select-none marker:content-none flex items-center gap-1.5">
        <span className="text-muted transition-transform group-open:rotate-90">›</span>
        {titulo}
      </summary>
      <div className="mt-3.5 [&>*:last-child]:mb-0">{children}</div>
    </details>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3 [&>*]:min-w-0">{children}</div>;
}

export function Stage({ children }: { children: ReactNode }) {
  return <section id="stage" className="min-h-[520px] max-md:min-h-0">{children}</section>;
}

/** Ilustração (SVG inline, 64 px, traço 1,5 px) no lugar de um glifo genérico; cada app entrega a sua. */
export function Empty({ ilustracao, titulo, descricao, acao, onAcao }: { ilustracao: ReactNode; titulo: string; descricao: string; acao?: string; onAcao?: () => void }) {
  return (
    <div className="h-full min-h-[520px] max-md:min-h-[320px] flex flex-col items-center justify-center text-center text-muted p-10 max-md:px-4 max-md:py-7 border border-dashed border-line rounded-card">
      <div className="text-accent mb-[18px]">{ilustracao}</div>
      <h2 className="text-ink text-lg font-bold mb-1.5">{titulo}</h2>
      <p className="max-w-[380px]">{descricao}</p>
      {acao && onAcao && <button type="button" className="btn-link mt-1" onClick={onAcao}>{acao}</button>}
    </div>
  );
}

/** Com `etapas`, troca a frase a cada 1,2 s parando na última; `texto` continua aceito para uma frase fixa. */
export function Loading({ texto, etapas }: { texto?: string; etapas?: string[] }) {
  const [indice, setIndice] = useState(0);
  useEffect(() => {
    if (!etapas || etapas.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setIndice((i) => {
        if (i >= etapas.length - 1) {
          clearInterval(id);
          return i;
        }
        return i + 1;
      });
    }, 1200);
    return () => clearInterval(id);
  }, [etapas]);

  const frase = etapas && etapas.length > 0 ? etapas[indice] : texto ?? "";
  return (
    <div className="flex flex-col gap-3.5 py-2" aria-live="polite">
      <p className="text-muted text-sm">{frase}</p>
      <div className="skeleton h-11 w-4/5" />
      <div className="skeleton w-3/5" />
      <div className="skeleton w-[70%]" />
      <div className="skeleton h-11 w-[90%]" />
      <div className="skeleton w-1/2" />
    </div>
  );
}

/** Rola até si mesma no celular ao aparecer (mesmo critério de useScrollToResult); onTentarNovamente exibe o botão "Tentar de novo". */
export function ErrorBox({ mensagem, onTentarNovamente }: { mensagem: string; onTentarNovamente?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (podeRolarAutomaticamente()) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  return (
    <div ref={ref} className="bg-[#fde8e6] border border-[#f5c2bd] text-danger px-4 py-3.5 rounded-[10px]">
      <strong>Não deu certo.</strong> {mensagem}
      {onTentarNovamente && <div className="mt-3"><button type="button" className="btn-ghost" onClick={onTentarNovamente}>Tentar de novo</button></div>}
    </div>
  );
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
  const texto = meta.demo
    ? `Exemplo ilustrativo a partir de ${meta.insumo}. Conecte a IA para analisar seus dados`
    : `Gerado com IA a partir de ${meta.insumo}, em ${data(meta.geradoEm, { comHora: true })}`;
  return <p className="text-muted text-[13px] mb-4" title={meta.model}>{texto}</p>;
}

const CORES_TOM: Record<string, string> = { ok: "text-ok", warn: "text-warn", danger: "text-danger", neutro: "text-accent-ink" };

/** Dado que decide, exibido antes do resumo: um número grande com rótulo e interpretação. */
export function Destaque({ valor, rotulo, interpretacao, tom = "neutro" }: { valor: string; rotulo: string; interpretacao?: string; tom?: "ok" | "warn" | "danger" | "neutro" }) {
  return (
    <div className="mb-6">
      <div className={`text-[40px] leading-none font-extrabold tracking-[-0.02em] ${CORES_TOM[tom]}`}>{valor}</div>
      <div className="text-[13px] font-semibold text-muted mt-2">{rotulo}</div>
      {interpretacao && <div className="text-sm text-muted mt-1">{interpretacao}</div>}
    </div>
  );
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

const ROTULOS_NIVEL: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa", positivo: "Positivo", neutro: "Neutro", negativo: "Negativo" };

function sentenceCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Sem children, mostra o rótulo humano do nível (ex.: "alta" → "Alta"); níveis fora do mapa padrão caem no sentence case do próprio texto. */
export function Chip({ nivel, children }: { nivel: string; children?: ReactNode }) {
  const classe = nivel.toLowerCase().replace("é", "e");
  return <span className={`chip-${classe}`}>{children ?? ROTULOS_NIVEL[classe] ?? sentenceCase(nivel)}</span>;
}

export type Coluna<T> = {
  chave: string;
  titulo: string;
  render: (linha: T) => ReactNode;
  classe?: string;
  /** No celular: "titulo" (negrito, cabeçalho do cartão), "resumo" (uma linha, logo abaixo), "chip" (à direita do título) ou "detalhe" (dentro de "Ver mais"). Sem papel, mantém o rótulo acima do valor. */
  papel?: "titulo" | "resumo" | "chip" | "detalhe";
  /** No desktop, aplica width fixa à coluna (ex.: "20%", "120px"). */
  largura?: string;
};

/** Tabela responsiva: linhas no desktop, cartões no celular (título + resumo + chip visíveis, detalhes atrás de "Ver mais"). */
export function DataTable<T>({ colunas, linhas }: { colunas: Coluna<T>[]; linhas: T[] }) {
  const titulo = colunas.find((c) => c.papel === "titulo");
  const resumo = colunas.find((c) => c.papel === "resumo");
  const chip = colunas.find((c) => c.papel === "chip");
  const detalhes = colunas.filter((c) => c.papel === "detalhe");
  const semPapel = colunas.filter((c) => !c.papel);

  return (
    <>
      <table className="max-md:hidden w-full border-collapse text-sm card shadow-none overflow-hidden">
        <thead>
          <tr>{colunas.map((c) => <th key={c.chave} style={c.largura ? { width: c.largura } : undefined} className="text-left px-3.5 py-[11px] border-b border-line font-bold text-[13px] text-muted bg-[#fafbfc]">{c.titulo}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="[&:last-child>td]:border-b-0">
              {colunas.map((c) => <td key={c.chave} style={c.largura ? { width: c.largura } : undefined} className={`px-3.5 py-[11px] border-b border-line align-top ${c.classe ?? ""}`}>{c.render(l)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="md:hidden card shadow-none divide-y divide-line text-sm">
        {linhas.map((l, i) => (
          <div key={i} className="px-3.5 py-2.5 flex flex-col gap-1.5">
            {(titulo || chip) && (
              <div className="flex items-start justify-between gap-2">
                {titulo && <div className="font-bold">{titulo.render(l)}</div>}
                {chip && <div className="shrink-0">{chip.render(l)}</div>}
              </div>
            )}
            {resumo && <div className="truncate text-muted">{resumo.render(l)}</div>}
            {semPapel.map((c) => (
              <div key={c.chave}>
                <div className="text-[11.5px] font-bold text-muted">{c.titulo}</div>
                <div>{c.render(l)}</div>
              </div>
            ))}
            {detalhes.length > 0 && (
              <details className="group mt-1">
                <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none">Ver mais</summary>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {detalhes.map((c) => (
                    <div key={c.chave}>
                      <div className="text-[11.5px] font-bold text-muted">{c.titulo}</div>
                      <div>{c.render(l)}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** Área de upload tracejada compartilhada: arrastar e soltar ou clicar para selecionar; nome do arquivo escolhido fica visível. */
export function Dropzone({ id = "dropzone-arquivo", accept, tiposLabel, maxSizeMB, arquivo, onArquivo }: { id?: string; accept: string; tiposLabel: string; maxSizeMB: number; arquivo: File | null; onArquivo: (file: File | null) => void }) {
  const [arrastando, setArrastando] = useState(false);
  const ativo = arrastando || !!arquivo;

  return (
    <label
      htmlFor={id}
      onDragEnter={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={(e) => { e.preventDefault(); setArrastando(false); }}
      onDrop={(e) => { e.preventDefault(); setArrastando(false); onArquivo(e.dataTransfer.files?.[0] ?? null); }}
      className={`flex flex-col items-center justify-center gap-1.5 text-center py-9 px-4 rounded-card border-[1.5px] border-dashed cursor-pointer transition-colors ${ativo ? "border-accent bg-accent-soft" : "border-line text-muted"}`}
    >
      <input id={id} type="file" accept={accept} hidden onChange={(e) => onArquivo(e.target.files?.[0] ?? null)} />
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={ativo ? "text-accent" : "text-muted"}>
        <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <strong className="text-ink text-[14.5px] font-bold">Arraste o arquivo aqui ou selecione</strong>
      <span className="text-[12.5px]">{tiposLabel}, até {maxSizeMB} MB</span>
      {arquivo && <span className="mt-1 text-[13px] font-bold text-accent-ink">{arquivo.name}</span>}
    </label>
  );
}

/** Frase padrão de privacidade do rodapé; `detalhe` acrescenta contexto específico do app só no title. */
export function Privacidade({ detalhe }: { detalhe?: string }) {
  return (
    <p className="mt-3.5 text-muted text-[12.5px]" title={detalhe}>Seus dados ficam só neste app e você pode apagar quando quiser.</p>
  );
}

/** Opt-in de guarda temporária, exibido só nos apps com lib/historico.ts SENSIVEL = true (dados sensíveis não ficam salvos por padrão). */
export function OptInGuardar({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] mb-4 cursor-pointer">
      <input type="checkbox" className="w-4 h-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Guardar este resultado por 30 dias
    </label>
  );
}

/** Bloco de entrega padrão: baixar PDF (abre /imprimir/<id>; sem id imprime a própria tela) e um menu "Mais" com copiar texto, e-mail, link e extras do app. */
export function Entregar({ id, titulo, texto, extras }: { id?: string; titulo: string; texto: () => string; extras?: { rotulo: string; onClick: () => void }[] }) {
  const [aberto, setAberto] = useState(false);
  const [copiadoTexto, setCopiadoTexto] = useState(false);
  const [copiadoLink, setCopiadoLink] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    function onClickFora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickFora);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickFora);
    };
  }, [aberto]);

  async function copiar(t: string, marcar: (v: boolean) => void) {
    try { await navigator.clipboard.writeText(t); marcar(true); } catch { alert(t); }
    setTimeout(() => marcar(false), 1800);
    setAberto(false);
  }

  const link = id ? `${location.origin}/r/${id}` : undefined;
  const itemClasse = "w-full text-left px-3 py-2 rounded-md hover:bg-accent-soft cursor-pointer";

  return (
    <div className="flex gap-2.5 max-md:w-full">
      <button type="button" className="btn-primary !w-auto max-md:flex-1" onClick={() => (id ? window.open(`/imprimir/${id}`, "_blank") : window.print())}>Baixar PDF</button>
      <div className="relative shrink-0" ref={menuRef}>
        <button type="button" className="btn-ghost" aria-haspopup="menu" aria-expanded={aberto} aria-label="Mais opções para entregar este resultado" onClick={() => setAberto((v) => !v)}>
          <span className="max-md:hidden">Mais</span>
          <svg className="md:hidden" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        </button>
        {aberto && (
          <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 card p-1.5 text-[13.5px]">
            <button type="button" role="menuitem" className={itemClasse} onClick={() => copiar(texto(), setCopiadoTexto)}>{copiadoTexto ? "Copiado" : "Copiar texto"}</button>
            <a role="menuitem" className={`${itemClasse} block`} href={`mailto:?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(texto())}`} onClick={() => setAberto(false)}>Enviar por e-mail</a>
            {link && <button type="button" role="menuitem" className={itemClasse} onClick={() => copiar(link, setCopiadoLink)}>{copiadoLink ? "Copiado" : "Copiar link"}</button>}
            {extras?.map((ex) => (
              <button key={ex.rotulo} type="button" role="menuitem" className={itemClasse} onClick={() => { ex.onClick(); setAberto(false); }}>{ex.rotulo}</button>
            ))}
          </div>
        )}
      </div>
    </div>
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

function podeRolarAutomaticamente() {
  return window.innerWidth <= 768 && !location.search.includes("captura");
}

/** No celular, rola até o resultado quando ele aparece (desligado com ?captura=1). */
export function useScrollToResult(pronto: boolean) {
  useEffect(() => {
    if (!pronto || !podeRolarAutomaticamente()) return;
    document.getElementById("stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pronto]);
}

export function esc(s: unknown) { return String(s ?? ""); }

/** Reexportados para não quebrar quem já importa esses helpers de "@/components/ui"; definidos em lib/formato.ts (sem "use client") para poderem ser chamados também de Server Components. */
export { numero, data };
