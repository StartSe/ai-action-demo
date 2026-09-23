/**
 * Eventos do servidor para as telas (0.3.0, US-004): um emissor em memória por processo. Quem escreve
 * no banco publica aqui (lib/conversas.ts nos pontos de escrita, lib/zapi.ts:gravarConexao quando a
 * conexão muda), `GET /api/eventos` entrega tudo às telas abertas por `text/event-stream`, e nenhuma
 * tela publica nada — a tela só lê e recarrega.
 *
 * Por que eventos do servidor (SSE) e não WebSocket: uma direção basta (o servidor avisa, a tela
 * consulta a rota que já existia), não há dependência nova (`ReadableStream` na rota, `EventSource` no
 * navegador), e a conexão é um GET comum, que atravessa o proxy do Render e passa pela sessão como
 * qualquer rota privada.
 *
 * Premissa P8 da PRD: este app roda num processo só por instância. O emissor é da memória desse
 * processo, sem fila externa; com mais de um processo, um evento publicado num não chegaria às telas
 * ligadas no outro — e é por isso que as telas mantêm o polling de reserva (30 s) mesmo com o fluxo
 * de pé (ver components/useEventos.ts). O emissor mora em `globalThis` para ser UM por processo mesmo
 * que o Next carregue este módulo em mais de um pacote (rota, webhook, instrumentação).
 */
import { EventEmitter } from "node:events";

export type Evento =
  /** Algo mudou nesta conversa: mensagem nova, status, entrega, assunto, nota, etiqueta, ou ela foi apagada. */
  | { tipo: "conversa"; numero: string }
  /** O número da empresa conectou ou caiu. */
  | { tipo: "conexao" }
  /** Esta conversa acabou de passar a precisar de uma pessoa. */
  | { tipo: "atencao"; numero: string };

export type TipoEvento = Evento["tipo"];

const NOME = "evento";

type Compartilhado = {
  emissor: EventEmitter;
  /** As conexões abertas em `GET /api/eventos`, para fechar todas num desligamento do processo. */
  conexoes: Map<number, () => void>;
  proximaConexao: number;
  sigtermRegistrado: boolean;
};

const chave = "__whatsappAtendenteEventos" as const;

function compartilhado(): Compartilhado {
  const g = globalThis as typeof globalThis & { [chave]?: Compartilhado };
  if (!g[chave]) {
    const emissor = new EventEmitter();
    // Uma conexão por aba aberta: o limite padrão de 10 ouvintes só geraria um aviso falso no log.
    emissor.setMaxListeners(0);
    g[chave] = { emissor, conexoes: new Map(), proximaConexao: 1, sigtermRegistrado: false };
  }
  return g[chave];
}

/** Publica um evento para todas as telas ligadas. Nunca lança: quem escreve no banco não pode falhar por causa da tela. */
export function publicar(evento: Evento): void {
  try {
    compartilhado().emissor.emit(NOME, evento);
  } catch (err) {
    console.error("Falha ao publicar evento para as telas:", err);
  }
}

/** Assina os eventos; devolve a função que cancela a assinatura. */
export function assinar(fn: (evento: Evento) => void): () => void {
  const { emissor } = compartilhado();
  emissor.on(NOME, fn);
  return () => {
    emissor.off(NOME, fn);
  };
}

/** Quantas assinaturas estão de pé (exportado para os testes). */
export function assinantes(): number {
  return compartilhado().emissor.listenerCount(NOME);
}

/**
 * Registra uma conexão aberta de `GET /api/eventos` e devolve a função que a tira do registro. Na
 * primeira chamada, o processo passa a fechar todas as conexões no `SIGTERM`: sem isso, um fluxo
 * aberto seguraria o desligamento do servidor até o proxy desistir.
 */
export function registrarConexao(fechar: () => void): () => void {
  const c = compartilhado();
  const id = c.proximaConexao++;
  c.conexoes.set(id, fechar);
  if (!c.sigtermRegistrado) {
    c.sigtermRegistrado = true;
    process.once("SIGTERM", fecharTodasAsConexoes);
  }
  return () => {
    c.conexoes.delete(id);
  };
}

/** Fecha todas as conexões abertas (o desligamento do processo, e os testes). */
export function fecharTodasAsConexoes(): void {
  const c = compartilhado();
  for (const fechar of c.conexoes.values()) {
    try {
      fechar();
    } catch {
      /* a conexão já tinha caído */
    }
  }
  c.conexoes.clear();
}

/** Quantas conexões de `GET /api/eventos` estão abertas (exportado para os testes). */
export function conexoesAbertas(): number {
  return compartilhado().conexoes.size;
}
