"use client";
// A lista de vagas (US-005). Nasceu na US-001 como destino do cabeçalho com um estado vazio; agora é
// a lista de verdade — o título e o texto de apoio são os mesmos de lá, de propósito.
//
// Cartões, e não tabela: uma vaga tem cargo, faixa, modelo, local e a contagem de quem está em cada
// etapa; numa tabela isso vira dez colunas estreitas que ninguém lê no celular.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AvisoExemplo } from "@/components/AvisoExemplo";
import { faixaSalarial, rotuloModelo, rotuloSenioridade } from "@/components/FormularioVaga";
import { Chip, Empty, ErrorBox, Topbar, data, lerErro, useConfirmacao, useStatus, type ErroLido } from "@/components/ui";

type VagaLista = {
  id: string;
  cargo: string;
  area?: string;
  senioridade?: string;
  modelo?: string;
  local?: string;
  salarioMin?: number;
  salarioMax?: number;
  salarioACombinar: boolean;
  status: "aberta" | "encerrada";
  exemplo: boolean;
  atualizadoEm: string;
  candidatos: { total: number; convidados: number; emAndamento: number; concluidas: number; avaliadas: number };
};

type Filtro = "aberta" | "encerrada" | "todas";

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "aberta", rotulo: "Abertas" },
  { valor: "encerrada", rotulo: "Encerradas" },
  { valor: "todas", rotulo: "Todas" },
];

function IconeVagas() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="20" width="46" height="30" rx="4" />
      <path d="M24 20v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5" />
      <path d="M9 33h46M28 33v5h8v-5" />
    </svg>
  );
}

/** A linha de contexto do cartão: só o que a vaga realmente informou. */
function contexto(v: VagaLista): string {
  return [v.area, rotuloSenioridade(v.senioridade), rotuloModelo(v.modelo), v.local].filter(Boolean).join(" · ");
}

export default function Page() {
  const { status, erro } = useStatus();
  const { confirmar, Dialogo } = useConfirmacao();
  const router = useRouter();

  const [itens, setItens] = useState<VagaLista[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("aberta");
  const [erroTela, setErroTela] = useState<ErroLido | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/vagas");
      if (!r.ok) throw r;
      setItens((await r.json()).itens);
    } catch (e) {
      setErroTela(await lerErro(e));
      setItens([]);
    }
  }, []);

  // A busca inicial vai em forma de corrente, e não `await carregar()`: a regra
  // `react-hooks/set-state-in-effect` acusa qualquer chamada a uma função que mexe em estado dentro
  // do corpo de um efeito, mesmo assíncrona (mesmo padrão de app/historico/page.tsx).
  useEffect(() => {
    fetch("/api/vagas")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((corpo) => setItens(corpo.itens))
      .catch(async (e) => {
        setErroTela(await lerErro(e));
        setItens([]);
      });
  }, []);

  async function apagar(v: VagaLista) {
    const aviso = v.candidatos.total
      ? `Apagar "${v.cargo}"? ${v.candidatos.total === 1 ? "1 entrevista sai" : `${v.candidatos.total} entrevistas saem`} junto; os pareceres já gerados continuam no histórico.`
      : `Apagar "${v.cargo}"?`;
    if (!(await confirmar(aviso, { confirmarRotulo: "Apagar" }))) return;
    setErroTela(null);
    try {
      const r = await fetch(`/api/vagas/${v.id}`, { method: "DELETE" });
      if (!r.ok) throw r;
      await carregar();
    } catch (e) {
      setErroTela(await lerErro(e));
    }
  }

  const visiveis = itens?.filter((v) => filtro === "todas" || v.status === filtro) ?? [];
  const soExemplo = Boolean(itens?.length) && itens?.every((v) => v.exemplo);

  return (
    <>
      <Topbar marca="E" nome="Entrevistadora IA" area="Recursos Humanos" status={status} erro={erro} usuario={status?.usuario} />

      <main className="max-w-[1180px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-start justify-between gap-4 mb-6 max-md:flex-col max-md:gap-3">
          <div>
            <h1 className="titulo-painel mb-1.5">Vagas</h1>
            <p className="apoio">Organize seus processos, convide candidatos e acompanhe cada etapa.</p>
          </div>
          <Link href="/vagas/nova" className="btn-primary !w-auto shrink-0 max-md:!w-full">+ Nova vaga</Link>
        </div>

        {erroTela && <div className="mb-5"><ErrorBox mensagem={erroTela.mensagem} acao={erroTela.acao} /></div>}

        {Boolean(itens?.length) && (
          <div className="flex items-center gap-1.5 mb-5 flex-wrap" role="group" aria-label="Filtrar vagas">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                type="button"
                aria-pressed={filtro === f.valor}
                className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
                  filtro === f.valor ? "bg-accent-soft border-accent text-accent-ink" : "bg-surface border-line text-muted hover:bg-bg"
                }`}
                onClick={() => setFiltro(f.valor)}
              >
                {f.rotulo} <span className="ml-1 opacity-70">{itens?.filter((v) => f.valor === "todas" || v.status === f.valor).length}</span>
              </button>
            ))}
          </div>
        )}

        {soExemplo && (
          <AvisoExemplo>
            A vaga abaixo é um exemplo, com candidatos e pareceres prontos; ela some quando você abrir a primeira vaga de verdade.
          </AvisoExemplo>
        )}

        {itens === null ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : itens.length === 0 ? (
          <Empty
            ilustracao={<IconeVagas />}
            titulo="Nenhuma vaga aberta"
            descricao="Abra uma vaga com cargo, salário, desafios e requisitos: a entrevistadora usa tudo isso para saber o que perguntar a cada candidato."
            acao="Preencher com um exemplo"
            acaoSecundaria={{ rotulo: "Abrir vaga do zero", url: "/vagas/nova" }}
            onAcao={() => router.push("/vagas/nova?exemplo=1")}
          />
        ) : visiveis.length === 0 ? (
          <p className="text-muted text-sm border border-dashed border-line rounded-card p-8 text-center">
            {filtro === "encerrada" ? "Nenhuma vaga encerrada ainda." : "Nenhuma vaga aberta agora."}
          </p>
        ) : (
          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-5">
            {visiveis.map((v) => (
              <article key={v.id} className="card p-6 max-md:p-5 flex flex-col hover:border-accent/30 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-1.5 max-md:flex-col max-md:gap-1.5">
                  <div className="min-w-0">
                    <h2 className="font-bold text-xl leading-snug break-words">
                      <Link href={`/vagas/${v.id}`} className="hover:underline">{v.cargo}</Link>
                    </h2>
                    {contexto(v) && <p className="text-muted text-sm mt-0.5">{contexto(v)}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {v.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
                    <Chip nivel={v.status === "aberta" ? "positivo" : "cinza"}>{v.status === "aberta" ? "Aberta" : "Encerrada"}</Chip>
                  </div>
                </div>

                <p className="text-sm font-semibold mt-3">{faixaSalarial(v)}</p>
                <dl className="grid grid-cols-3 gap-3 rounded-field bg-bg p-4 mt-5 mb-5">
                  {[{ rotulo: "Candidatos", valor: v.candidatos.total }, { rotulo: "Em entrevista", valor: v.candidatos.emAndamento }, { rotulo: "Pareceres", valor: v.candidatos.avaliadas }].map((m) => <div key={m.rotulo}><dd className="text-2xl font-extrabold tabular-nums">{m.valor}</dd><dt className="text-xs text-muted mt-1">{m.rotulo}</dt></div>)}
                </dl>
                <p className="text-xs text-muted mb-4">Atualizada em {data(v.atualizadoEm)}</p>
                <div className="flex flex-wrap items-center justify-between gap-3 mt-auto border-t border-line pt-4">
                  <Link href={`/vagas/${v.id}`} className="btn-primary !w-auto">{v.status === "encerrada" || v.candidatos.total ? "Acompanhar vaga →" : "Convidar candidato →"}</Link>
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <Link href={`/vagas/${v.id}/editar`} className="btn-ghost !w-auto !p-3" aria-label={`Editar vaga ${v.cargo}`} title="Editar vaga">
                      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>
                    </Link>
                    <button type="button" className="btn-ghost !w-auto !p-3 !text-danger" aria-label={`Excluir vaga ${v.cargo}`} title="Excluir vaga" onClick={() => apagar(v)}>
                      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      {Dialogo}
    </>
  );
}
