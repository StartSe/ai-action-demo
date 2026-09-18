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

/** Uma barra horizontal em SVG. A `rect` usa largura em porcentagem, então a barra acompanha a
 * coluna em qualquer largura de tela sem nenhuma medição em JavaScript — e a cor vem de
 * `currentColor`, para a paleta do app continuar sendo a única fonte de cor. */
function Barra({ fracao, tom = "text-accent" }: { fracao: number; tom?: string }) {
  const largura = Math.max(0, Math.min(1, fracao)) * 100;
  return (
    <svg width="100%" height="12" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true" className={tom}>
      <rect x="0" y="0" width="100" height="12" rx="3" className="text-line" fill="currentColor" opacity="0.35" />
      {largura > 0 && <rect x="0" y="0" width={largura} height="12" rx="3" fill="currentColor" />}
    </svg>
  );
}

/** Uma lista de barras com rótulo à esquerda e número à direita — o desenho do funil e das duas
 * distribuições. O denominador é sempre o MAIOR valor da lista, e não o total: com o total, um funil
 * em que quase todo mundo concluiu ficaria com cinco barras quase iguais. */
function Barras({ linhas, maximo, sufixo }: { linhas: { rotulo: string; valor: number }[]; maximo: number; sufixo?: (l: { valor: number }) => string }) {
  const teto = Math.max(maximo, 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {linhas.map((l) => (
        <li key={l.rotulo} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center">
          <span className="text-[13px] font-semibold truncate">{l.rotulo}</span>
          <span className="text-[13px] text-muted whitespace-nowrap">
            {numero(l.valor)}
            {sufixo ? ` · ${sufixo(l)}` : ""}
          </span>
          <span className="col-span-2">
            <Barra fracao={l.valor / teto} />
          </span>
        </li>
      ))}
    </ul>
  );
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
  return (
    <section className="card p-5">
      <h3 className="font-bold text-[15px] mb-0.5">{titulo}</h3>
      <p className="text-[12.5px] text-muted mb-4">{apoio}</p>
      {total === 0 ? (
        <p className="text-[13px] text-muted">Nada por aqui neste período.</p>
      ) : (
        <Barras linhas={fatias} maximo={Math.max(...fatias.map((f) => f.valor))} />
      )}
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
          <Indicador rotulo="Convites enviados" valor={numero(convidados)} apoio={periodoEmPalavras(relatorio)} />
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

      <section className="card p-5">
        <h3 className="font-bold text-[15px] mb-0.5">Do convite à decisão</h3>
        <p className="text-[12.5px] text-muted mb-4">Onde o processo para. Cada etapa conta as mesmas pessoas convidadas neste período.</p>
        {convidados === 0 ? (
          <p className="text-[13px] text-muted">Nenhum convite saiu neste período.</p>
        ) : (
          <Barras
            linhas={relatorio.funil}
            maximo={convidados}
            sufixo={(l) => porcentagem(l.valor / convidados)}
          />
        )}
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
