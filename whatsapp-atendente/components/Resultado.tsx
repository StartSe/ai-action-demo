"use client";
// O que restou da tela única antiga (formulário + celular + conversas recebidas, aposentada na US-011):
// a lista de conversas e o relatório diário de um resultado já salvo. Quem usa: `/r/[id]` (um registro
// do histórico aberto de novo), `/imprimir/[id]` (o mesmo conteúdo sem cabeçalho, para o PDF) e a
// conversa destacada para onde os links "Aprovar"/"Corrigir" do relatório diário levam.
//
// Este arquivo é varrido por `scripts/verificar-jargao.mjs` (varre `components/*.tsx`), então nada aqui
// pode importar de um caminho com "setup" no nome — ver CLAUDE.md.
import { useEffect, useRef } from "react";
import {
  Aviso,
  Chip,
  DataTable,
  Entregar,
  Origem,
  ResultHead,
  SeloIA,
  type Coluna,
} from "./ui";
import { AcoesResposta, type AoSalvarBase } from "./Celular";
import type { Meta } from "@/lib/ai";
import { ACAO_CONECTAR_NUMERO, AVISO_CONVERSAS_EXEMPLO, soConversasDeExemplo } from "@/lib/demo";
import { rotuloContato, rotuloOrigem } from "@/lib/rotulos";
import type { Conversa, ItemRelatorioAtendimento } from "@/lib/types";

/**
 * Destaca uma conversa específica, com as ações Aprovar/Corrigir prontas — para onde os links
 * "Aprovar"/"Corrigir" do relatório diário levam. Desde a US-011 eles chegam por `/conversas?numero=`
 * (o `/?atender=` antigo redireciona para lá); a conversa aberta que vai usar este cartão é a US-013.
 */
export function ConversaSelecionada({
  conversa,
  corrigirFocada,
  onAprovar,
  onCorrigir,
}: {
  conversa: Conversa;
  corrigirFocada: boolean;
  onAprovar: AoSalvarBase;
  onCorrigir: AoSalvarBase;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  return (
    <div ref={ref} className="card p-4 border-accent mb-6">
      <p className="text-[11px] font-bold uppercase tracking-wide text-accent-ink mb-1.5">Conversa selecionada</p>
      <p className="font-semibold mb-1">{rotuloContato(conversa.numero, conversa.nome)}</p>
      <p className="text-sm text-muted mb-2.5">{conversa.ultima_mensagem}</p>
      {conversa.ultima_resposta ? (
        <AcoesResposta
          pergunta={conversa.ultima_mensagem}
          resposta={conversa.ultima_resposta}
          onAprovar={onAprovar}
          onCorrigir={onCorrigir}
          modoInicial={corrigirFocada ? "corrigindo" : "padrao"}
        />
      ) : (
        <p className="text-sm text-muted">Nenhuma resposta registrada ainda para essa conversa.</p>
      )}
    </div>
  );
}

export function Resultado({
  conversas,
  meta,
  id,
  aguardandoAprovacao,
  onLimpar,
  onAprovar,
  onCorrigir,
}: {
  conversas: Conversa[];
  meta: Meta;
  id?: string;
  /** Só a tela principal calcula isso (precisa da base aprovada carregada); /r/[id] não passa nada. */
  aguardandoAprovacao?: number;
  onLimpar?: (numero: string) => void;
  onAprovar?: AoSalvarBase;
  onCorrigir?: AoSalvarBase;
}) {
  return (
    <article className="reveal">
      <ResultHead titulo="Conversas recebidas">
        <Entregar id={id} titulo="Conversas recebidas" texto={() => conversasParaTexto(conversas)} />
      </ResultHead>

      {aguardandoAprovacao ? (
        <div className="mb-3">
          <Chip nivel="media">{aguardandoAprovacao === 1 ? "1 resposta aguardando aprovação" : `${aguardandoAprovacao} respostas aguardando aprovação`}</Chip>
        </div>
      ) : null}

      <Origem meta={meta} />

      {soConversasDeExemplo(conversas) && (
        <div className="mb-4">
          <Aviso acao={ACAO_CONECTAR_NUMERO}>{AVISO_CONVERSAS_EXEMPLO}</Aviso>
        </div>
      )}

      <ConteudoConversas conversas={conversas} onLimpar={onLimpar} onAprovar={onAprovar} onCorrigir={onCorrigir} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/** Corpo da lista de conversas (sem cabeçalho nem Origem), reaproveitado pela página de impressão. */
export function ConteudoConversas({
  conversas,
  onLimpar,
  onAprovar,
  onCorrigir,
}: {
  conversas: Conversa[];
  onLimpar?: (numero: string) => void;
  onAprovar?: AoSalvarBase;
  onCorrigir?: AoSalvarBase;
}) {
  const colunas: Coluna<Conversa>[] = [
    // A hora vive dentro da célula do número: com o palco na metade da tela, uma coluna só para ela
    // espremia a mensagem a ponto de todas as linhas ganharem "Ver mais".
    {
      chave: "numero",
      titulo: "Número",
      papel: "titulo",
      largura: "20%",
      render: (c) => (
        <>
          {/* Nome pode quebrar em duas linhas; número, não — "+55 11 91234-" / "5678" não se lê. */}
          <strong className={c.nome?.trim() ? undefined : "whitespace-nowrap"}>{rotuloContato(c.numero, c.nome)}</strong>
          <span className="block text-[12px] text-muted font-normal">{c.hora}</span>
        </>
      ),
    },
    { chave: "ultima_mensagem", titulo: "Última mensagem", papel: "resumo", largura: "34%", linhas: 3, render: (c) => c.ultima_mensagem },
    {
      chave: "status",
      titulo: "Status",
      papel: "chip",
      largura: "150px",
      render: (c) => (
        <div className="flex gap-1.5 flex-wrap justify-end">
          {c.transferir && <Chip nivel="media">Transferida</Chip>}
          <Chip nivel="neutral">{rotuloOrigem(c.origem)}</Chip>
        </div>
      ),
    },
  ];
  if (onAprovar || onCorrigir)
    colunas.push({
      chave: "aprovacao",
      titulo: "Aprovar resposta",
      papel: "detalhe",
      render: (c) =>
        c.ultima_resposta ? (
          <AcoesResposta pergunta={c.ultima_mensagem} resposta={c.ultima_resposta} onAprovar={onAprovar} onCorrigir={onCorrigir} />
        ) : null,
    });
  if (onLimpar)
    colunas.push({
      chave: "acoes",
      titulo: "",
      render: (c) => (
        // Coluna estreita no palco de meia tela: o rótulo longo quebrava em quatro linhas e esticava
        // a linha inteira. A frase completa fica no aviso de confirmação, que já diz o que será apagado.
        <button type="button" className="btn-link whitespace-nowrap" onClick={() => onLimpar(c.numero)}>
          {c.numero === "simulador" ? "Apagar teste" : "Apagar"}
        </button>
      ),
    });

  return <DataTable colunas={colunas} linhas={conversas} />;
}

export function ResultadoRelatorio({ itens, meta, id }: { itens: ItemRelatorioAtendimento[]; meta: Meta; id?: string }) {
  return (
    <article className="reveal">
      <ResultHead titulo="Relatório diário do atendimento">
        <Entregar id={id} titulo="Relatório diário do atendimento" texto={() => relatorioParaTexto(itens)} />
      </ResultHead>

      <Origem meta={meta} />

      <ConteudoRelatorio itens={itens} />

      <SeloIA demo={meta.demo} />
    </article>
  );
}

/**
 * Corpo do relatório (sem cabeçalho nem Origem), reaproveitado pela página de impressão.
 *
 * Os links levam de volta para as telas de produto: o painel completo em Relatórios e cada pergunta
 * na conversa em que ela foi feita (`?corrigir=1` abre a correção já aberta). Quem lê este relatório
 * costuma estar na caixa de e-mail, longe do app — o caminho de volta faz parte do relatório.
 */
export function ConteudoRelatorio({ itens }: { itens: ItemRelatorioAtendimento[] }) {
  const painel = (
    <p className="mb-4 no-print">
      <a className="btn-link" href="/relatorios?periodo=7d">Ver o painel completo</a>
    </p>
  );
  if (itens.length === 0) {
    return (
      <>
        {painel}
        <p className="text-muted text-sm">Nenhuma pergunta frequente, sem resposta ou transferida para um humano. Base de conhecimento em dia.</p>
      </>
    );
  }
  return (
    <>
    {painel}
    <ul className="flex flex-col gap-4">
      {itens.map((item, i) => (
        <li key={i} className="card p-4">
          <p className="font-semibold mb-1.5">{item.pergunta}</p>
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {item.transferida && <Chip nivel="media">Transferida</Chip>}
            {item.frequencia > 1 && <Chip nivel="neutral">Perguntada {item.frequencia} vezes</Chip>}
          </div>
          <div className="mb-3">
            <p className="text-sm text-muted">Resposta sugerida: {item.respostaSugerida}</p>
            {item.ferramentaUsada && (
              <p className="text-[11px] text-muted mt-0.5" title={`Ferramenta consultada: ${item.ferramentaUsada}`}>
                Consultado em {item.ferramentaUsada}
              </p>
            )}
          </div>
          <div className="flex gap-4">
            <a className="btn-link" href={`/conversas?numero=${encodeURIComponent(item.numero)}`}>Aprovar</a>
            <a className="btn-link" href={`/conversas?numero=${encodeURIComponent(item.numero)}&corrigir=1`}>Corrigir</a>
          </div>
        </li>
      ))}
    </ul>
    </>
  );
}

function relatorioParaTexto(itens: ItemRelatorioAtendimento[]): string {
  const l: string[] = ["Relatório diário do atendimento", ""];
  if (itens.length === 0) {
    l.push("Nenhuma pergunta frequente, sem resposta ou transferida para um humano. Base de conhecimento em dia.");
    return l.join("\n");
  }
  itens.forEach((i) => {
    l.push(`${i.pergunta}${i.transferida ? " (transferida)" : ""}${i.frequencia > 1 ? ` (${i.frequencia}x)` : ""}`);
    l.push(`Resposta sugerida: ${i.respostaSugerida}`);
    if (i.ferramentaUsada) l.push(`Consultado em ${i.ferramentaUsada}`);
    l.push("");
  });
  return l.join("\n").trim();
}

function conversasParaTexto(conversas: Conversa[]): string {
  const l: string[] = ["Conversas recebidas", ""];
  conversas.forEach((c) => l.push(`${rotuloContato(c.numero, c.nome)} (${rotuloOrigem(c.origem)}${c.transferir ? ", transferida" : ""}): ${c.ultima_mensagem} — ${c.hora}`));
  return l.join("\n");
}
