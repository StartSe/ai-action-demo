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

/** "3 convidados · 1 avaliada": só as etapas que têm gente, para um cartão novo não nascer cheio de zeros. */
function etapas(c: VagaLista["candidatos"]): string {
  if (!c.total) return "Nenhum candidato ainda";
  const partes: string[] = [];
  if (c.convidados) partes.push(`${c.convidados} ${c.convidados === 1 ? "convidado" : "convidados"}`);
  if (c.emAndamento) partes.push(`${c.emAndamento} conversando agora`);
  if (c.concluidas) partes.push(`${c.concluidas} ${c.concluidas === 1 ? "concluída" : "concluídas"}`);
  if (c.avaliadas) partes.push(`${c.avaliadas} ${c.avaliadas === 1 ? "avaliada" : "avaliadas"}`);
  return partes.join(" · ");
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

      <main className="max-w-[980px] mx-auto px-8 pt-7 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10">
        <div className="flex items-start justify-between gap-4 mb-6 max-md:flex-col max-md:gap-3">
          <div>
            <h1 className="titulo-painel mb-1.5">Vagas</h1>
            <p className="apoio">O que a vaga exige, para a entrevista perguntar o que importa.</p>
          </div>
          <Link href="/vagas/nova" className="btn-primary !w-auto shrink-0 max-md:!w-full">Abrir vaga</Link>
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
                {f.rotulo}
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
          <div className="flex flex-col gap-3">
            {visiveis.map((v) => (
              <article key={v.id} className="card px-5 py-4">
                <div className="flex items-start justify-between gap-3 mb-1.5 max-md:flex-col max-md:gap-1.5">
                  <div className="min-w-0">
                    <h2 className="font-bold text-[16px] truncate">
                      <Link href={`/vagas/${v.id}`} className="hover:underline">{v.cargo}</Link>
                    </h2>
                    {contexto(v) && <p className="text-muted text-sm mt-0.5">{contexto(v)}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {v.exemplo && <Chip nivel="neutral">Exemplo</Chip>}
                    <Chip nivel={v.status === "aberta" ? "positivo" : "cinza"}>{v.status === "aberta" ? "Aberta" : "Encerrada"}</Chip>
                  </div>
                </div>

                <p className="text-[13px] font-semibold mb-1">{faixaSalarial(v)}</p>
                <p className="text-[13px] text-muted mb-3">{etapas(v.candidatos)} · atualizada em {data(v.atualizadoEm)}</p>

                <div className="flex items-center gap-4 flex-wrap">
                  <Link href={`/vagas/${v.id}`} className="btn-link">Abrir a vaga</Link>
                  <Link href={`/vagas/${v.id}/editar`} className="btn-link">Editar</Link>
                  <button type="button" className="btn-link !text-danger" onClick={() => apagar(v)}>Apagar</button>
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
