"use client";
// Coluna da direita de Conversas: quem está do outro lado e o resumo da relação dele com a empresa,
// para ninguém precisar abrir outra tela (nem outro sistema) durante o atendimento.
//
// Ele não consulta nada sozinho: a conversa chega pronta de `components/ConversaAberta.tsx`, que já a
// mantém atualizada, e as duas ações ("Marcar como resolvida" e "Apagar conversa") são as mesmas de lá
// — assim existe um só lugar no app que sabe agir sobre uma conversa.
//
// O mesmo conteúdo é desenhado de dois jeitos: cartão na terceira coluna a partir de 1100 px
// (`PainelContato`) e bloco recolhido acima das bolhas abaixo disso (`ContatoRecolhido`). Duas
// aparências, um conteúdo só.
import type { ReactNode } from "react";
import { Avatar, DesenhoOrigem } from "./ContatoVisual";
import { MaisDetalhes } from "./ui";
import { data, numero as formatarNumero } from "@/lib/formato";
import { classeStatus, numeroInterno, rotuloContato, rotuloNumero, rotuloOrigem, rotuloStatus } from "@/lib/rotulos";
import { PAPEIS_DE_CONVERSA, type ConversaCompleta } from "@/lib/types";

export interface DadosDoContato {
  conversa: ConversaCompleta;
  /** Uma ação da conversa já está em andamento: os botões deste painel esperam a vez. */
  agindo: boolean;
  onResolver: () => void;
  onApagar: () => void;
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-line last:border-b-0">
      <dt className="shrink-0 text-[12.5px] text-muted">{rotulo}</dt>
      <dd className="min-w-0 text-[13px] text-right font-semibold break-words">{children}</dd>
    </div>
  );
}

/** O conteúdo em si; as duas aparências abaixo só o embrulham. */
function Conteudo({ conversa, agindo, onResolver, onApagar }: DadosDoContato) {
  const nome = rotuloContato(conversa.numero, conversa.nome);
  const numeroFormatado = rotuloNumero(conversa.numero);
  // Só o que é conversa de verdade: eventos da linha do tempo e notas internas não são mensagens.
  const mensagens = conversa.mensagens.filter((m) => PAPEIS_DE_CONVERSA.includes(m.papel));
  const ultima = mensagens[mensagens.length - 1];
  const deTeste = conversa.origem === "simulador";

  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar nome={conversa.nome} tamanho={48} />
        <div className="min-w-0">
          <p className="font-bold truncate">{nome}</p>
          {numeroFormatado !== nome && <p className="text-[13px] text-muted truncate">{numeroFormatado}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-3">
        <span className={classeStatus(conversa.status)}>{rotuloStatus(conversa.status)}</span>
        <span className="chip-cinza inline-flex items-center gap-1.5">
          <DesenhoOrigem origem={conversa.origem} />
          {rotuloOrigem(conversa.origem)}
        </span>
      </div>

      <dl className="mt-4">
        <Linha rotulo="Nome">{nome}</Linha>
        {/* Conversa do celular de teste não tem telefone: o número dela é um nome fixo interno, e a
            linha "Origem" logo abaixo já diz de onde ela veio. */}
        {!numeroInterno(conversa.numero) && <Linha rotulo="Telefone">{numeroFormatado}</Linha>}
        <Linha rotulo="Origem">{rotuloOrigem(conversa.origem)}</Linha>
        {/* Sobre o que é a conversa (lib/assuntos.ts). Fica em branco enquanto o atendente não
            respondeu nenhuma vez — a classificação acontece depois da primeira resposta. */}
        <Linha rotulo="Assunto">{conversa.assunto ?? "Sem classificação ainda"}</Linha>
        <Linha rotulo="Primeiro contato">{data(conversa.criadoEm, { comHora: true })}</Linha>
        <Linha rotulo="Última mensagem">{ultima ? data(ultima.criadoEm, { comHora: true }) : "Nenhuma ainda"}</Linha>
        <Linha rotulo="Total de mensagens">{formatarNumero(mensagens.length)}</Linha>
      </dl>

      {/* O que o atendente lembra do começo de uma conversa longa (lib/memoria.ts). Recolhido porque é
          um parágrafo, e só aparece quando existe — conversa curta não tem começo esquecido. Aqui é só
          leitura: corrigir o que ele lembra é assunto da memória do contato, não deste resumo. */}
      {conversa.resumo && (
        <div className="mt-4">
          <MaisDetalhes titulo="Resumo da conversa">
            <p className="text-[13px] leading-relaxed text-ink">{conversa.resumo}</p>
            <p className="text-[12px] text-muted mt-2">
              O atendente escreve este resumo sozinho quando a conversa fica longa, e o usa para não perder o que foi combinado no começo.
            </p>
          </MaisDetalhes>
        </div>
      )}

      <div className="flex flex-col items-start gap-3 mt-4">
        {conversa.status !== "resolvida" && (
          <button type="button" className="btn-ghost" onClick={onResolver} disabled={agindo}>
            Marcar como resolvida
          </button>
        )}
        <button type="button" className="btn-link text-danger px-1" onClick={onApagar} disabled={agindo}>
          {deTeste ? "Apagar conversa de teste" : "Apagar conversa"}
        </button>
      </div>
    </>
  );
}

/** Cartão da terceira coluna (desktop). */
export function PainelContato(props: DadosDoContato) {
  return (
    <section className="card p-4" aria-label="Informações do contato">
      <h2 className="text-[15px] font-bold mb-3">Informações do contato</h2>
      <Conteudo {...props} />
    </section>
  );
}

/** Bloco recolhido acima das bolhas (abaixo de 1100 px e no celular). */
export function ContatoRecolhido(props: DadosDoContato) {
  return (
    <MaisDetalhes titulo="Sobre o contato">
      <Conteudo {...props} />
    </MaisDetalhes>
  );
}
