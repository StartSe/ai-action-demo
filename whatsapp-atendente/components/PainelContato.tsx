"use client";
// Coluna da direita de Conversas: quem está do outro lado e o resumo da relação dele com a empresa,
// para ninguém precisar abrir outra tela (nem outro sistema) durante o atendimento.
//
// Ele não consulta nada sozinho: a conversa chega pronta de `components/ConversaAberta.tsx`, que já a
// mantém atualizada, e as duas ações ("Marcar como resolvida" e "Apagar conversa") são as mesmas de lá
// — assim existe um só lugar no app que sabe agir sobre uma conversa.
//
// A ordem dos blocos é a ordem em que se lê uma conversa nova: quem é (sempre à vista), como a equipe
// já separou este cliente (etiquetas), o que o atendente lembra dele, os dados, o resumo do começo da
// conversa e, por último, as ações. Cada bloco é um `MaisDetalhes` que lembra em `localStorage` o que
// a pessoa abriu ou fechou: no desktop eles nascem abertos (há uma coluna inteira para eles) e no
// celular, recolhidos (cada bloco aberto empurra a conversa para baixo).
//
// O mesmo conteúdo é desenhado de dois jeitos: cartão na terceira coluna a partir de 1100 px
// (`PainelContato`) e, abaixo disso, um cartão curto acima das bolhas com identidade, etiquetas e a
// primeira linha da memória, e um "Ver tudo" que abre o resto (`ContatoRecolhido`).
//
// O bloco "O que o atendente lembra" (lib/memoria.ts) é editável aqui, e é de propósito que ele venha
// antes dos dados: o que o atendente guarda de um cliente tem que ser corrigível por quem atende, sem
// abrir outra tela. Quem grava é `onSalvarMemoria`, que vem de `ConversaAberta` — o diálogo de
// confirmação e a atualização da conversa moram lá, num lugar só.
//
// Editável aqui só existem três coisas: a memória, os dados que o cliente informou e as etiquetas. Não
// há observação livre nem campo personalizado de contato de propósito: um campo de texto solto vira o
// lugar onde a informação importante some, e o que precisa ficar registrado na conversa é nota interna
// (US-014), que fica na linha do tempo junto com o resto.
import { useState, type ReactNode } from "react";
import { Avatar, DesenhoOrigem } from "./ContatoVisual";
import { BlocoEtiquetas, ChipsEtiqueta } from "./Etiquetas";
import { MaisDetalhes } from "./ui";
import { data, numero as formatarNumero } from "@/lib/formato";
import { classeStatus, haQuantoTempo, numeroInterno, rotuloContato, rotuloNumero, rotuloOrigem, rotuloStatus } from "@/lib/rotulos";
import { rotuloMotivo } from "@/lib/transferencia";
import { LIMITE_MEMORIA, PAPEIS_DE_CONVERSA, type ContatoLembrado, type ConversaCompleta, type Etiqueta } from "@/lib/types";

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
  /** As etiquetas que a conta já tem (com a cor de cada uma), para os chips e para as sugestões. */
  etiquetasDaEmpresa: Etiqueta[];
  /** Grava a lista inteira de etiquetas desta conversa (a rota devolve a conversa já atualizada). */
  onSalvarEtiquetas: (etiquetas: string[]) => Promise<void>;
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

  if (editando) {
    return (
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
    );
  }

  return (
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
  );
}

/** Quem está do outro lado: o que fica à vista nas duas aparências, sem precisar abrir nada. */
function Identidade({ conversa, nome, numeroFormatado, tamanho }: { conversa: ConversaCompleta; nome: string; numeroFormatado: string; tamanho: number }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar nome={conversa.nome} tamanho={tamanho} />
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
    </>
  );
}

/**
 * Os blocos que vêm depois da identidade, na ordem de leitura. `padraoAberto` é só o estado inicial de
 * cada um: o que a pessoa abrir ou fechar vale a partir daí, e continua valendo na próxima conversa.
 */
function Blocos({
  conversa,
  agindo,
  onResolver,
  onApagar,
  onSalvarMemoria,
  onApagarMemoria,
  etiquetasDaEmpresa,
  onSalvarEtiquetas,
  padraoAberto,
}: DadosDoContato & { padraoAberto: boolean }) {
  const contato = conversa.contato;
  const numeroFormatado = rotuloNumero(conversa.numero);
  // Só o que é conversa de verdade: eventos da linha do tempo e notas internas não são mensagens.
  const mensagens = conversa.mensagens.filter((m) => PAPEIS_DE_CONVERSA.includes(m.papel));
  const ultima = mensagens[mensagens.length - 1];
  const deTeste = conversa.origem === "simulador";

  return (
    <>
      {/* As etiquetas vêm logo abaixo de quem é o contato: elas são o que a equipe escreveu sobre esta
          conversa, e é por elas que ela vai procurá-la depois na lista. */}
      <MaisDetalhes titulo="Etiquetas" aberto={padraoAberto} lembrarComo="painel-etiquetas">
        <BlocoEtiquetas etiquetas={conversa.etiquetas} daEmpresa={etiquetasDaEmpresa} agindo={agindo} onSalvar={onSalvarEtiquetas} />
      </MaisDetalhes>

      <MaisDetalhes titulo="O que o atendente lembra" aberto={padraoAberto} lembrarComo="painel-memoria">
        <Memoria contato={contato} agindo={agindo} onSalvarMemoria={onSalvarMemoria} onApagarMemoria={onApagarMemoria} />
      </MaisDetalhes>

      <MaisDetalhes titulo="Dados do contato" aberto={padraoAberto} lembrarComo="painel-dados">
        <dl>
          {/* O nome, o e-mail e o telefone de retorno que o próprio cliente informou na conversa; só
              aparecem quando existem, para as linhas não virarem uma lista de traços. */}
          {contato?.nomeInformado?.trim() && <Linha rotulo="Nome informado">{contato.nomeInformado.trim()}</Linha>}
          {contato?.email && <Linha rotulo="E-mail">{contato.email}</Linha>}
          {contato?.telefoneRetorno && <Linha rotulo="Telefone de retorno">{contato.telefoneRetorno}</Linha>}
          {/* Conversa do celular de teste não tem telefone: o número dela é um nome fixo interno, e a
              linha "Origem" logo abaixo já diz de onde ela veio. */}
          {!numeroInterno(conversa.numero) && <Linha rotulo="Telefone">{numeroFormatado}</Linha>}
          <Linha rotulo="Origem">{rotuloOrigem(conversa.origem)}</Linha>
          {/* Sobre o que é a conversa (lib/assuntos.ts). Fica em branco enquanto o atendente não
              respondeu nenhuma vez — a classificação acontece depois da primeira resposta. */}
          <Linha rotulo="Assunto">{conversa.assunto ?? "Sem classificação ainda"}</Linha>
          {/* Por que o atendente pediu ajuda de uma pessoa (lib/transferencia.ts); some quando a IA
              volta a responder sozinha, que é quando o motivo deixa de valer. */}
          {conversa.motivoTransferencia && <Linha rotulo="Motivo da transferência">{rotuloMotivo(conversa.motivoTransferencia)}</Linha>}
          <Linha rotulo="Primeiro contato">{data(conversa.criadoEm, { comHora: true })}</Linha>
          <Linha rotulo="Última mensagem">{ultima ? data(ultima.criadoEm, { comHora: true }) : "Nenhuma ainda"}</Linha>
          <Linha rotulo="Total de mensagens">{formatarNumero(mensagens.length)}</Linha>
        </dl>
      </MaisDetalhes>

      {/* O que o atendente lembra do começo de uma conversa longa (lib/memoria.ts). Recolhido mesmo no
          desktop porque é um parágrafo que repete o que está logo ao lado, e só aparece quando existe —
          conversa curta não tem começo esquecido. Aqui é só leitura: corrigir o que ele lembra é
          assunto da memória do contato, não deste resumo. */}
      {conversa.resumo && (
        <MaisDetalhes titulo="Resumo da conversa" lembrarComo="painel-resumo">
          <p className="text-[13px] leading-relaxed text-ink">{conversa.resumo}</p>
          <p className="text-[12px] text-muted mt-2">
            O atendente escreve este resumo sozinho quando a conversa fica longa, e o usa para não perder o que foi combinado no começo.
          </p>
        </MaisDetalhes>
      )}

      <div className="flex flex-col items-start gap-3">
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

/** Cartão da terceira coluna (desktop): identidade à vista e os blocos abertos por padrão. */
export function PainelContato(props: DadosDoContato) {
  const contato = props.conversa.contato;
  const nome = contato?.nomeInformado?.trim() || rotuloContato(props.conversa.numero, props.conversa.nome);
  return (
    <section className="card p-4" aria-label="Informações do contato">
      <h2 className="text-[15px] font-bold mb-3">Informações do contato</h2>
      <Identidade conversa={props.conversa} nome={nome} numeroFormatado={rotuloNumero(props.conversa.numero)} tamanho={48} />
      <div className="mt-4 pt-4 border-t border-line">
        <Blocos {...props} padraoAberto />
      </div>
    </section>
  );
}

/**
 * Cartão curto acima das bolhas (abaixo de 1100 px). Ele mostra o que dá para ler de relance — quem é,
 * como a equipe etiquetou a conversa e a primeira linha do que o atendente lembra — e guarda o resto
 * atrás de "Ver tudo": no celular, o painel inteiro aberto empurraria a conversa para fora da tela.
 */
export function ContatoRecolhido(props: DadosDoContato) {
  const [verTudo, setVerTudo] = useState(false);
  const { conversa, etiquetasDaEmpresa } = props;
  const contato = conversa.contato;
  const nome = contato?.nomeInformado?.trim() || rotuloContato(conversa.numero, conversa.nome);
  // Só a primeira linha do parágrafo: o resto está a um "Ver tudo" de distância.
  const primeiraLinha = contato?.memoria.trim().split("\n")[0] ?? "";

  return (
    <section className="card p-4 mb-4" aria-label="Informações do contato">
      <Identidade conversa={conversa} nome={nome} numeroFormatado={rotuloNumero(conversa.numero)} tamanho={40} />

      {conversa.etiquetas.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          <ChipsEtiqueta nomes={conversa.etiquetas} daEmpresa={etiquetasDaEmpresa} max={3} />
        </div>
      )}

      {primeiraLinha && <p className="text-[13px] text-muted mt-3 line-clamp-1">{primeiraLinha}</p>}

      {verTudo ? (
        <>
          <div className="mt-4 pt-4 border-t border-line">
            <Blocos {...props} padraoAberto={false} />
          </div>
          <button type="button" className="btn-link px-1 mt-4 pt-3 border-t border-line w-full text-left" onClick={() => setVerTudo(false)}>
            Ver menos
          </button>
        </>
      ) : (
        <button type="button" className="btn-link px-1 mt-2" onClick={() => setVerTudo(true)}>
          Ver tudo
        </button>
      )}
    </section>
  );
}
