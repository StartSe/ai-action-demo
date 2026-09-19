"use client";
// O relatório desenhado: os quatro números, o funil, as distribuições e a tabela das entrevistas
// (US-026).
//
// É `"use client"` pelo mesmo motivo de `components/ConteudoParecer.tsx`: as colunas do `DataTable`
// levam função `render`, e função não atravessa a fronteira de um Server Component (o sintoma é um
// 500 no servidor e o React error #441 no navegador, sem apontar o arquivo). Por isso este mesmo
// componente serve às três telas que mostram um relatório — `/relatorios`, `/imprimir/relatorio` e
// `/r/<id>` de um relatório salvo —, e nenhuma delas redesenha nada por conta própria.
import Link from "next/link";
import { NotaDaEntrevista, ROTULO_DECISAO, ROTULO_NIVEL_VOZ } from "@/components/RotulosEntrevista";
import { Chip, DataTable, Item, data, numero, type Coluna } from "@/components/ui";
import { horas, periodoEmPalavras, porcentagem } from "@/lib/relatorio-texto";
import type { Fatia, LinhaRelatorio, Relatorio } from "@/lib/relatorios";

const CORES = ["#74349b", "#9760b3", "#397f91", "#328566", "#b27730"];

/** Dimensões em CSS mantêm as pontas arredondadas sem distorcer o gráfico. */
function Barras({ linhas, maximo, sufixo }: { linhas: { rotulo: string; valor: number }[]; maximo: number; sufixo?: (l: { valor: number }) => string }) {
  const teto = Math.max(maximo, 1);
  return <ol className="space-y-5">
    {linhas.map((l, i) => <li key={l.rotulo} className="grid grid-cols-[28px_minmax(0,1fr)_80px] max-sm:grid-cols-[24px_minmax(0,1fr)_64px] gap-x-3 items-center">
      <span className="row-span-2 flex items-center justify-center w-7 h-7 rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
      <span className="text-sm font-semibold mb-2">{l.rotulo}</span>
      <span className="row-span-2 text-right"><strong className="block text-xl tabular-nums">{numero(l.valor)}</strong>{sufixo && <span className="text-xs text-muted">{sufixo(l)}</span>}</span>
      <div className="h-3 rounded-full bg-line/60 overflow-hidden" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, l.valor / teto * 100))}%`, backgroundColor: CORES[i % CORES.length], printColorAdjust: "exact" }} /></div>
    </li>)}
  </ol>;
}

function Indicador({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio: string }) {
  return (
    <Item>
      <div className="text-[12.5px] font-semibold text-muted">{rotulo}</div>
      <div className="text-[26px] leading-none font-extrabold tracking-[-0.02em] mt-1.5">{valor}</div>
      <div className="text-[12.5px] text-muted mt-1.5">{apoio}</div>
    </Item>
  );
}

function Distribuicao({ titulo, apoio, fatias }: { titulo: string; apoio: string; fatias: Fatia[] }) {
  const total = fatias.reduce((soma, f) => soma + f.valor, 0);
  const segmentos = fatias.map((f, i) => ({ ...f, inicio: fatias.slice(0, i).reduce((soma, anterior) => soma + anterior.valor, 0) }));
  return (
    <section className="card p-6">
      <h3 className="font-bold text-base mb-1">{titulo}</h3>
      <p className="text-sm text-muted mb-5">{apoio}</p>
      <div className="flex items-center gap-6 flex-wrap">
        <div className="relative w-32 h-32 shrink-0 mx-auto">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" className="text-line" strokeWidth="13" />
            {total > 0 && segmentos.map((f, i) => f.valor > 0 && <circle key={f.rotulo} cx="60" cy="60" r="48" fill="none" stroke={CORES[i % CORES.length]} strokeWidth="13" pathLength="100" strokeDasharray={`${f.valor / total * 100} ${100 - f.valor / total * 100}`} strokeDashoffset={-f.inicio / total * 100} />)}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl tabular-nums">{numero(total)}</strong><span className="text-xs text-muted">{total === 1 ? "registro" : "registros"}</span></div>
        </div>
        {total === 0 ? <p className="flex-1 min-w-[140px] text-sm text-muted">Os resultados aparecerão aqui assim que houver registros neste período.</p> : <ul className="flex-1 min-w-[150px] space-y-3">
          {fatias.map((f, i) => <li key={f.rotulo} className="flex items-center gap-2 text-sm"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CORES[i % CORES.length], printColorAdjust: "exact" }} /><span className="flex-1">{f.rotulo}</span><strong className="tabular-nums">{numero(f.valor)}</strong><span className="text-muted text-xs w-10 text-right">{porcentagem(f.valor / total)}</span></li>)}
        </ul>}
      </div>
    </section>
  );
}

export function ConteudoRelatorio({ relatorio, comLinks = true }: { relatorio: Relatorio; comLinks?: boolean }) {
  const convidados = relatorio.funil[0]?.valor ?? 0;
  const concluidas = relatorio.funil[2]?.valor ?? 0;

  const colunas: Coluna<LinhaRelatorio>[] = [
    {
      chave: "candidato",
      titulo: "Candidato",
      papel: "titulo",
      render: (l) => (
        <span className="flex items-center gap-2 flex-wrap">
          {comLinks ? (
            <Link href={`/candidatos/${l.candidatoId}`} className="btn-link">{l.candidatoNome}</Link>
          ) : (
            l.candidatoNome
          )}
          {l.exemplo && <Chip nivel="cinza">Exemplo</Chip>}
        </span>
      ),
    },
    {
      chave: "vaga",
      titulo: "Vaga",
      render: (l) =>
        comLinks ? <Link href={`/vagas/${l.vagaId}`} className="btn-link">{l.vagaCargo}</Link> : <span>{l.vagaCargo}</span>,
    },
    { chave: "situacao", titulo: "Situação", papel: "detalhe", render: (l) => l.situacao },
    {
      chave: "convite",
      titulo: "Convite",
      papel: "detalhe",
      render: (l) => <span className="whitespace-nowrap">{data(l.convidadaEm, { comAno: true })}</span>,
    },
    {
      chave: "conclusao",
      titulo: "Conclusão",
      papel: "detalhe",
      render: (l) => (l.concluidaEm ? <span className="whitespace-nowrap">{data(l.concluidaEm, { comAno: true })}</span> : <span className="text-muted">—</span>),
    },
    {
      chave: "tempo",
      titulo: "Tempo",
      papel: "detalhe",
      render: (l) => (typeof l.horas === "number" ? horas(l.horas) : <span className="text-muted">—</span>),
    },
    {
      chave: "comofoi",
      titulo: "Como foi",
      papel: "detalhe",
      render: (l) => (l.nivelVoz ? ROTULO_NIVEL_VOZ[l.nivelVoz] : <span className="text-muted">—</span>),
    },
    // A nota com a recomendação ao lado, do mesmo jeito que as outras tabelas a mostram
    // (`components/RotulosEntrevista.tsx`): `flex-nowrap` porque dois chips numa coluna de
    // `DataTable` empilham quando a tabela aperta a largura.
    { chave: "nota", titulo: "Nota", largura: "150px", render: (l) => <NotaDaEntrevista entrevista={l} /> },
    {
      chave: "decisao",
      titulo: "Decisão",
      render: (l) => (l.decisao ? ROTULO_DECISAO[l.decisao] : <span className="text-muted">—</span>),
    },
  ];

  if (comLinks) {
    colunas.push({
      chave: "acoes",
      titulo: "Ações",
      render: (l) =>
        l.resultadoId ? (
          <Link href={`/entrevistas/${l.entrevistaId}`} className="btn-link">Abrir parecer</Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="section-title">O período em números</h2>
        <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3 [&>*]:min-w-0">
          <Indicador rotulo="Convites gerados" valor={numero(convidados)} apoio={periodoEmPalavras(relatorio)} />
          <Indicador
            rotulo="Taxa de conclusão"
            valor={relatorio.taxaConclusao === null ? "—" : porcentagem(relatorio.taxaConclusao)}
            apoio={`${numero(concluidas)} de ${numero(convidados)} conversaram`}
          />
          <Indicador
            rotulo="Do convite à conversa"
            valor={horas(relatorio.tempoMedioHoras)}
            apoio={relatorio.tempoMedianoHoras === null ? "Ninguém concluiu ainda" : `Metade em até ${horas(relatorio.tempoMedianoHoras)}`}
          />
          <Indicador
            rotulo="Nota média"
            valor={relatorio.notaMedia === null ? "—" : `${numero(relatorio.notaMedia, 1)}/10`}
            apoio="Dos pareceres já prontos"
          />
        </div>
      </section>

      <section className="card p-6">
        <div className="flex justify-between items-start gap-4 flex-wrap mb-6">
          <div><h3 className="font-bold text-lg mb-1">Do convite à decisão</h3><p className="text-sm text-muted">Veja quantas entrevistas chegaram a cada etapa.</p></div>
          <span className="text-xs text-muted rounded-full border border-line px-3 py-1.5">Percentuais sobre os convites gerados</span>
        </div>
        {convidados === 0 ? (
          <p className="text-[13px] text-muted">Nenhum convite foi gerado neste período.</p>
        ) : (
          <Barras
            linhas={relatorio.funil}
            maximo={convidados}
            sufixo={(l) => porcentagem(l.valor / convidados)}
          />
        )}
        <p className="text-xs text-muted mt-6 pt-4 border-t border-line">Gerar um link não confirma o envio ao candidato. As etapas consideram os convites criados no período selecionado.</p>
      </section>

      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
        <Distribuicao
          titulo="Recomendação da entrevistadora"
          apoio="O que a análise sugeriu, em cima da conversa."
          fatias={relatorio.recomendacoes}
        />
        <Distribuicao titulo="Sua decisão" apoio="O que você registrou depois de ler o parecer." fatias={relatorio.decisoes} />
      </div>

      {relatorio.comoFoi.some((f) => f.valor > 0) && (
        <Distribuicao titulo="Como as conversas aconteceram" apoio="Voz natural, voz do navegador ou texto — quem escolhe é o aparelho do candidato." fatias={relatorio.comoFoi} />
      )}

      <section>
        <h2 className="section-title">Entrevistas do período</h2>
        {relatorio.itens.length === 0 ? (
          <Item>
            <p className="text-[13px] text-muted">Nenhuma entrevista neste período. Mude o período ou a vaga para ver outro recorte.</p>
          </Item>
        ) : (
          <DataTable colunas={colunas} linhas={relatorio.itens} />
        )}
      </section>
    </div>
  );
}
