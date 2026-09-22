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
//
// O bloco "O que o atendente lembra" (lib/memoria.ts) é editável aqui, e é de propósito que ele fique
// à vista em vez de escondido atrás de um "ver mais": o que o atendente guarda de um cliente tem que
// ser corrigível por quem atende, sem abrir outra tela. Quem grava é `onSalvarMemoria`, que vem de
// `ConversaAberta` — o diálogo de confirmação e a atualização da conversa moram lá, num lugar só.
import { useState, type ReactNode } from "react";
import { Avatar, DesenhoOrigem } from "./ContatoVisual";
import { MaisDetalhes } from "./ui";
import { data, numero as formatarNumero } from "@/lib/formato";
import { classeStatus, haQuantoTempo, numeroInterno, rotuloContato, rotuloNumero, rotuloOrigem, rotuloStatus } from "@/lib/rotulos";
import { LIMITE_MEMORIA, PAPEIS_DE_CONVERSA, type ContatoLembrado, type ConversaCompleta } from "@/lib/types";

export interface DadosDoContato {
  conversa: ConversaCompleta;
  /** Uma ação da conversa já está em andamento: os botões deste painel esperam a vez. */
  agindo: boolean;
  onResolver: () => void;
  onApagar: () => void;
  /** "Salvar" do bloco da memória: grava o texto corrigido como escrito por uma pessoa. */
  onSalvarMemoria: (memoria: string) => Promise<void>;
  /** "Apagar memória": pergunta antes (o diálogo vive em ConversaAberta) e esquece este cliente. */
  onApagarMemoria: () => void;
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-line last:border-b-0">
      <dt className="shrink-0 text-[12.5px] text-muted">{rotulo}</dt>
      <dd className="min-w-0 text-[13px] text-right font-semibold break-words">{children}</dd>
    </div>
  );
}


/** A frase do bloco vazio: ela conta o que vai acontecer, em vez de só dizer que não há nada. */
const NADA_LEMBRADO = "Nada ainda. O atendente vai anotar o que for útil para o próximo atendimento.";

/**
 * "O que o atendente lembra": o parágrafo que atravessa as conversas deste cliente (lib/memoria.ts),
 * com o caminho para corrigir e para apagar. O estado de edição é local porque o conteúdo é desenhado
 * duas vezes no DOM (cartão e bloco recolhido) e só uma delas está visível de cada vez.
 */
function Memoria({ contato, agindo, onSalvarMemoria, onApagarMemoria }: Pick<DadosDoContato, "agindo" | "onSalvarMemoria" | "onApagarMemoria"> & { contato: ContatoLembrado | null }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const memoria = contato?.memoria.trim() ?? "";

  async function salvar() {
    setSalvando(true);
    try {
      await onSalvarMemoria(texto);
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="mt-4 pt-4 border-t border-line" aria-label="O que o atendente lembra">
      <h3 className="text-[13px] font-bold mb-2">O que o atendente lembra</h3>
      {editando ? (
        <>
          <textarea
            className="input min-h-[120px] resize-y text-[13px]"
            aria-label="O que o atendente lembra deste cliente"
            maxLength={LIMITE_MEMORIA}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="mt-1 text-right text-muted text-[12px]" aria-live="polite">
            {texto.length.toLocaleString("pt-BR")}/{LIMITE_MEMORIA.toLocaleString("pt-BR")}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" className="btn-ghost !w-auto" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={`text-[13px] leading-relaxed ${memoria ? "text-ink" : "text-muted"}`}>{memoria || NADA_LEMBRADO}</p>
          {contato && (
            <p className="text-[12px] text-muted mt-2">
              Atualizado {haQuantoTempo(contato.atualizadoEm).toLowerCase()} {contato.atualizadoPor === "pessoa" ? "por você" : "pela IA"}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              className="btn-link px-1"
              onClick={() => {
                setTexto(memoria);
                setEditando(true);
              }}
              disabled={agindo}
            >
              Editar
            </button>
            {(memoria || contato) && (
              <button type="button" className="btn-link text-danger px-1" onClick={onApagarMemoria} disabled={agindo}>
                Apagar memória
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** O conteúdo em si; as duas aparências abaixo só o embrulham. */
function Conteudo({ conversa, agindo, onResolver, onApagar, onSalvarMemoria, onApagarMemoria }: DadosDoContato) {
  const contato = conversa.contato;
  // O nome que o cliente deu ao atendente vale mais que o do canal: o WhatsApp mostra o que a pessoa
  // escreveu no perfil dela ("Casa", "Jr"), e quem se apresentou como "Paulo Andrade" é o Paulo.
  const nome = contato?.nomeInformado?.trim() || rotuloContato(conversa.numero, conversa.nome);
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
        {/* O e-mail e o telefone de retorno que o próprio cliente informou na conversa; só aparecem
            quando existem, para as linhas não virarem uma lista de traços. */}
        {contato?.email && <Linha rotulo="E-mail">{contato.email}</Linha>}
        {contato?.telefoneRetorno && <Linha rotulo="Telefone de retorno">{contato.telefoneRetorno}</Linha>}
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

      <Memoria contato={contato} agindo={agindo} onSalvarMemoria={onSalvarMemoria} onApagarMemoria={onApagarMemoria} />

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
