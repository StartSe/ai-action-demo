"use client";
// "Meus sites": a lista de projetos com estado (Rascunho, Gerando, No ar, Falhou), atualizada a cada 5 s
// enquanto algum site estiver gerando. Cada cartão leva ao workspace do site (/sites/[id]); o que falhou mostra
// o motivo, a ação que resolve e "Tentar de novo" (nada é reenviado: a captura ficou guardada no servidor).
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Aviso, Empty, lerErro } from "./ui";
import { data } from "@/lib/formato";
import type { EstadoProjeto, Projeto } from "@/lib/types";

export const INTERVALO_ACOMPANHAMENTO_MS = 5000;

export const ROTULO_ESTADO: Record<EstadoProjeto, string> = { rascunho: "Rascunho", gerando: "Gerando", pronto: "No ar", falhou: "Falhou" };
const CLASSE_ESTADO: Record<EstadoProjeto, string> = { rascunho: "chip-cinza", gerando: "chip-media chip-gerando", pronto: "chip-positivo", falhou: "chip-alta" };

export function ChipEstado({ estado }: { estado: EstadoProjeto }) {
  return <span className={CLASSE_ESTADO[estado]}>{ROTULO_ESTADO[estado]}</span>;
}

/** "Gerando há 1 min 12 s", a partir de `atualizadoEm` (marcado ao iniciar a geração). Contador real, não estimativa. */
export function TempoGerando({ desde }: { desde: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const segundos = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 1000));
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return <span role="status">Gerando há {min > 0 ? `${min} min ` : ""}{seg} s</span>;
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

/**
 * Lista controlada de fora: a tela inicial mantém `sites` para colocar o site recém-criado no topo sem esperar
 * a próxima consulta. `aoMudar` recebe a lista atualizada a cada consulta (a cada 5 s enquanto houver "gerando").
 */
export function MeusSites({ sites, aoMudar, aoPreencherExemplo, rodape }: { sites: Projeto[] | null; aoMudar: (lista: Projeto[]) => void; aoPreencherExemplo?: () => void; rodape?: ReactNode }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const gerando = Boolean(sites?.some((s) => s.estado === "gerando"));

  // `aoMudar` é o setState da tela inicial (identidade estável): entra nas dependências sem re-disparar a consulta.
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
        descricao="Envie a captura de uma referência, cole o endereço de um site ou descreva a empresa. O agente cuida do resto."
        acao={aoPreencherExemplo ? "Preencher com um exemplo" : undefined}
        onAcao={aoPreencherExemplo}
      />
    );
  }

  return (
    <section aria-label="Meus sites" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold text-[15px]">Meus sites</h2>
        {sites && <span className="text-muted text-[13px]">{sites.length === 1 ? "1 site" : `${sites.length} sites`}</span>}
      </div>
      {erro && <Aviso tom="danger">{erro}</Aviso>}
      <ul className="flex flex-col gap-3">
        {(sites ?? []).map((s) => (
          <li key={s.id} className="card p-4 flex flex-col gap-2.5" data-estado={s.estado}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <Link href={`/sites/${s.id}`} className="font-bold text-[15px] text-ink hover:underline break-words">{s.nome}</Link>
                <p className="text-muted text-[13px]">
                  {s.marca?.nome ? `${s.marca.nome} · ` : ""}{s.origem === "briefing" ? "pelo briefing" : "pela referência"} · {data(s.criadoEm, { comHora: true })}
                </p>
              </div>
              <ChipEstado estado={s.estado} />
            </div>

            {s.estado === "gerando" && (
              <p className="text-muted text-[13px]"><TempoGerando desde={s.atualizadoEm} /> · Pode sair desta tela: avisamos no sino quando terminar.</p>
            )}

            {s.estado === "falhou" && s.erro && (
              <Aviso tom="danger" acao={s.erro.acao}>{s.erro.mensagem}</Aviso>
            )}

            <div className="flex items-center gap-4 flex-wrap text-[13.5px]">
              <Link href={`/sites/${s.id}`} className="btn-link">Abrir o site</Link>
              {s.estado === "pronto" && <a href={`/s/${s.slug}`} target="_blank" rel="noopener noreferrer" className="btn-link">Abrir o link</a>}
              {(s.estado === "falhou" || s.estado === "rascunho") && (
                <button type="button" className="btn-link" disabled={ocupado === s.id} onClick={() => agir(s.id, "/gerar", "POST")}>
                  {ocupado === s.id ? "Enviando..." : s.estado === "falhou" ? "Tentar de novo" : "Gerar o site"}
                </button>
              )}
              <button type="button" className="btn-link !text-muted" disabled={ocupado === s.id} onClick={() => apagar(s)}>Apagar</button>
            </div>
          </li>
        ))}
      </ul>
      {rodape}
    </section>
  );
}
