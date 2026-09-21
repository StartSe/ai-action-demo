"use client";
// "Meus sites": a grade de cartões dos projetos, com miniatura da versão publicada (a página pública /s/<slug>,
// numa moldura reduzida), estado (Rascunho, Gerando com a etapa atual, No ar, Falhou com o motivo) e as ações.
// Atualizada a cada 4 s enquanto algum site estiver gerando. Cada cartão leva ao workspace (/sites/[id]).
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Aviso, Empty, lerErro } from "./ui";
import { Icone } from "./Icones";
import { data } from "@/lib/formato";
import type { EstadoProjeto, Projeto } from "@/lib/types";

export const INTERVALO_ACOMPANHAMENTO_MS = 4000;

export const ROTULO_ESTADO: Record<EstadoProjeto, string> = { rascunho: "Rascunho", gerando: "Gerando", pronto: "No ar", falhou: "Falhou" };
const CLASSE_ESTADO: Record<EstadoProjeto, string> = { rascunho: "chip-cinza", gerando: "chip-media chip-gerando", pronto: "chip-positivo", falhou: "chip-alta" };
const ROTULO_ORIGEM = { referencia: "pela captura", endereco: "pelo endereço", briefing: "pela descrição" } as const;

export function ChipEstado({ estado }: { estado: EstadoProjeto }) {
  return <span className={CLASSE_ESTADO[estado]}>{ROTULO_ESTADO[estado]}</span>;
}

/** "Gerando há 1 min 12 s", a partir de `atualizadoEm`. Contador real, não estimativa. */
export function TempoGerando({ desde }: { desde: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const segundos = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 1000));
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return <span role="status">há {min > 0 ? `${min} min ` : ""}{seg} s</span>;
}

/** Quando a geração começou: a primeira etapa (atualizadoEm é renovado a cada etapa, então não serve de relógio). */
export function inicioDaGeracao(p: Projeto): string {
  return p.progresso?.etapas?.[0]?.iniciadoEm ?? p.atualizadoEm;
}

/** "Etapa 3 de 8 · Escrevendo «Herói»", a partir do andamento gravado no projeto. */
export function resumoDoProgresso(p: Projeto): string | null {
  const etapas = p.progresso?.etapas;
  if (!etapas?.length) return "Preparando...";
  const prontas = etapas.filter((e) => e.estado === "pronta").length;
  const atual = etapas.find((e) => e.estado === "andamento");
  return `Etapa ${Math.min(prontas + 1, etapas.length)} de ${etapas.length}${atual ? ` · ${atual.titulo}` : ""}`;
}

export async function buscarSites(): Promise<Projeto[]> {
  const r = await fetch("/api/sites");
  if (!r.ok) throw new Error((await lerErro(r)).mensagem);
  const corpo = await r.json();
  if (!Array.isArray(corpo.itens)) throw new Error("Não foi possível carregar os sites.");
  return corpo.itens as Projeto[];
}

function IconeSites() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="12" width="48" height="40" rx="4" />
      <path d="M8 22h48" />
      <circle cx="14" cy="17" r="1.2" /><circle cx="19" cy="17" r="1.2" /><circle cx="24" cy="17" r="1.2" />
      <path d="M16 32h20M16 40h14M42 32h6v8h-6z" />
    </svg>
  );
}

/** Miniatura do site publicado: a própria página pública, reduzida a 25%, sem interação. */
function Miniatura({ s }: { s: Projeto }) {
  if (s.estado !== "pronto") {
    return (
      <div className="miniatura-site" style={s.marca?.corPrimaria ? { background: `linear-gradient(135deg, ${s.marca.corPrimaria}22, ${s.marca.corPrimaria}08)` } : undefined}>
        <div className="miniatura-site-vazia">
          {s.estado === "gerando" ? <span className="flex items-center gap-2"><span className="chip-gerando" aria-hidden="true" />{resumoDoProgresso(s)}</span> : s.estado === "falhou" ? "Não ficou pronto" : "Ainda não gerado"}
        </div>
      </div>
    );
  }
  return (
    <div className="miniatura-site">
      <iframe title={`Miniatura de ${s.nome}`} src={`/s/${s.slug}?previa=1&v=${s.versaoPublicada ?? 1}`} sandbox="allow-scripts" loading="lazy" tabIndex={-1} aria-hidden="true" />
    </div>
  );
}

/**
 * Lista controlada de fora: a tela inicial mantém `sites` para colocar o site recém-criado no topo sem esperar
 * a próxima consulta. `aoMudar` recebe a lista atualizada a cada consulta.
 */
export function MeusSites({ sites, aoMudar, aoPreencherExemplo, rodape }: { sites: Projeto[] | null; aoMudar: (lista: Projeto[]) => void; aoPreencherExemplo?: () => void; rodape?: ReactNode }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const gerando = Boolean(sites?.some((s) => s.estado === "gerando"));

  useEffect(() => {
    let ativo = true;
    const carregar = () => buscarSites().then((lista) => { if (ativo) { aoMudar(lista); setErro(null); } }).catch(async (e) => { if (ativo) setErro((await lerErro(e)).mensagem); });
    carregar();
    if (!gerando) return () => { ativo = false; };
    const t = setInterval(carregar, INTERVALO_ACOMPANHAMENTO_MS);
    return () => { ativo = false; clearInterval(t); };
  }, [gerando, aoMudar]);

  async function agir(id: string, caminho: string, metodo: "POST" | "DELETE") {
    setOcupado(id);
    setErro(null);
    try {
      const r = await fetch(`/api/sites/${id}${caminho}`, { method: metodo });
      if (!r.ok && r.status !== 409) { setErro((await lerErro(r)).mensagem); return; }
      aoMudar(await buscarSites());
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setOcupado(null);
    }
  }

  function apagar(s: Projeto) {
    if (!window.confirm(`Apagar o site «${s.nome}»? O link público deixa de funcionar. Essa ação não pode ser desfeita.`)) return;
    agir(s.id, "", "DELETE");
  }

  if (sites === null && !erro) return <div className="card p-7 max-md:p-5"><p className="text-muted text-sm" role="status">Carregando os seus sites...</p></div>;

  if (sites && sites.length === 0) {
    return (
      <Empty
        ilustracao={<IconeSites />}
        titulo="Nenhum site ainda"
        descricao="Cole o endereço de um site, solte uma captura ou descreva a empresa na caixa acima. O agente cuida do resto."
        acao={aoPreencherExemplo ? "Preencher com um exemplo" : undefined}
        onAcao={aoPreencherExemplo}
      />
    );
  }

  return (
    <section aria-label="Meus sites" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-extrabold text-[20px] tracking-[-0.01em]">Meus sites</h2>
        {sites && <span className="text-muted text-[13px]">{sites.length === 1 ? "1 site" : `${sites.length} sites`}</span>}
      </div>
      {erro && <Aviso tom="danger">{erro}</Aviso>}
      <ul className="grade-sites">
        {(sites ?? []).map((s) => (
          <li key={s.id} className="card-site" data-estado={s.estado}>
            <Link href={`/sites/${s.id}`} aria-label={`Abrir ${s.nome}`} className="block"><Miniatura s={s} /></Link>
            <div className="p-4 flex flex-col gap-2 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/sites/${s.id}`} className="font-bold text-[15px] text-ink hover:underline break-words block truncate">{s.nome}</Link>
                  <p className="text-muted text-[12.5px] truncate">{ROTULO_ORIGEM[s.origem]} · {data(s.criadoEm, { comHora: true })}{s.estado === "gerando" ? <> · <TempoGerando desde={inicioDaGeracao(s)} /></> : null}</p>
                </div>
                <ChipEstado estado={s.estado} />
              </div>
              {s.estado === "falhou" && s.erro && <p className="text-danger text-[12.5px] leading-snug">{s.erro.mensagem}</p>}
              <div className="flex items-center gap-3.5 flex-wrap text-[13px] mt-auto pt-1">
                <Link href={`/sites/${s.id}`} className="btn-link inline-flex items-center gap-1">{s.estado === "gerando" ? "Acompanhar" : "Abrir"}</Link>
                {s.estado === "pronto" && <a href={`/s/${s.slug}`} target="_blank" rel="noopener noreferrer" className="btn-link inline-flex items-center gap-1">Ver no ar<Icone nome="externo" tamanho={13} /></a>}
                {(s.estado === "falhou" || s.estado === "rascunho") && (
                  <button type="button" className="btn-link" disabled={ocupado === s.id} onClick={() => agir(s.id, "/gerar", "POST")}>
                    {ocupado === s.id ? "Enviando..." : s.estado === "falhou" ? "Tentar de novo" : "Gerar"}
                  </button>
                )}
                <button type="button" className="btn-link !text-muted ml-auto" disabled={ocupado === s.id} onClick={() => apagar(s)}>Apagar</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {rodape}
    </section>
  );
}
