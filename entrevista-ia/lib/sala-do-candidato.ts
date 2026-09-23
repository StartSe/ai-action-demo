// A conferência única das quatro rotas públicas do candidato (US-016 da PRD): a página do link, a
// próxima fala, a voz e a conclusão.
//
// `lib/convite.ts` responde "este link existe, venceu, foi cancelado ou já foi usado?". Aqui entra a
// camada que falta: **qual aparelho está fazendo esta entrevista**. Um convite é de uma pessoa e de
// uma conversa só; quando a conversa já começou, abrir o mesmo link noutro aparelho não pode entrar
// no meio dela — a transcrição viraria duas conversas embaralhadas numa linha só, e o parecer sairia
// de cima disso.
//
// Fica acima de `lib/convite.ts` e de `lib/entrevistas.ts` pela mesma razão de `lib/painel.ts`: junta
// entidades, e nenhuma delas pode importar as outras sem fechar ciclo.
import { variaveisDaEntrevista } from "./agente";
import { FECHADO, type MotivoFechado, type SalaPublica, resolverConvite } from "./convite";
import { type Entrevista, mudarStatus, obter as obterEntrevista } from "./entrevistas";
import { cookieSessaoCandidato, lerSessaoCandidato } from "./sessao-candidato";
import { dataDoPrazo } from "./prazo-convite";
import { agenteConfigurado, agenteEnabled } from "./voz";
import type { NivelVoz } from "./entrevistas";

/** Por que a sala não abre. Aos motivos do link soma-se o aparelho que chegou depois. */
export type MotivoBloqueio = MotivoFechado | "outro_aparelho";

/** As frases de cada bloqueio, iguais na página e nas rotas — quem lê as duas lê a mesma coisa. */
export const BLOQUEIOS: Record<MotivoBloqueio, { titulo: string; descricao: string; status: number }> = {
  ...FECHADO,
  outro_aparelho: {
    titulo: "Esta entrevista está em andamento em outro aparelho",
    descricao:
      "Volte para a aba ou o aparelho em que você começou a conversa e continue de lá. Se você fechou aquela página, espere alguns minutos e abra este link de novo.",
    status: 409,
  },
};

export type SalaAberta = {
  ok: true;
  sala: SalaPublica;
  /** Ausente nos links antigos (`scorecard`), que não têm entrevista no banco. */
  entrevista: Entrevista | null;
  /** Este aparelho é o que está conduzindo a conversa (ou ainda não há nenhum). */
  mesmoAparelho: boolean;
};

export type SalaBloqueada = {
  ok: false;
  motivo: MotivoBloqueio;
  titulo: string;
  descricao: string;
  status: number;
  /** Só com `motivo: "concluida"`: o nome de quem conversou, para o agradecimento da página (US-021). */
  nome?: string;
};

export type ResultadoSala = SalaAberta | SalaBloqueada;

function bloquear(motivo: MotivoBloqueio, nome?: string): SalaBloqueada {
  return { ok: false, motivo, ...BLOQUEIOS[motivo], nome };
}

/**
 * Confere um código de link e diz se esta requisição pode entrar na sala. **Não escreve nada.**
 *
 * `cabecalhoCookie` é o `Cookie` cru: a página do candidato é um Server Component, onde ele vem de
 * `headers()` e não existe `Request` nenhum para passar adiante.
 */
export function conferirSala(codigo: string, cabecalhoCookie: string | null): ResultadoSala {
  const resolucao = resolverConvite(codigo);
  if (!resolucao.ok) {
    const bloqueio = bloquear(resolucao.motivo, resolucao.nome);
    if (resolucao.motivo === "agendada" && resolucao.iniciaEm) bloqueio.descricao = `Você poderá começar em ${dataDoPrazo(resolucao.iniciaEm)} (horário de Brasília). Volte a este link a partir desse horário.`;
    return bloqueio;
  }

  const { entrevistaId } = resolucao.sala;
  const entrevista = entrevistaId ? obterEntrevista(entrevistaId) : null;
  if (entrevistaId && !entrevista) return bloquear("invalido");

  const sessao = lerSessaoCandidato(cabecalhoCookie);
  // Sem entrevista no banco (link antigo) não há o que disputar: aquele link carrega a conversa
  // consigo, no próprio navegador.
  const mesmoAparelho = !entrevista || (sessao?.entrevistaId === entrevista.id && sessao.codigo === codigo && sessao.tentativa === entrevista.tentativa);
  if (entrevista?.status === "em_andamento" && !mesmoAparelho) return bloquear("outro_aparelho");

  return { ok: true, sala: resolucao.sala, entrevista, mesmoAparelho };
}

/**
 * O candidato abriu o link: além de conferir, marca a entrevista como `aberta`.
 *
 * Quem acompanha o processo passa a ver "Link aberto" em vez de continuar esperando. Só na primeira
 * vez — recarregar a página não reescreve a linha do tempo.
 */
export function abrirSala(codigo: string, cabecalhoCookie: string | null): ResultadoSala {
  const resultado = conferirSala(codigo, cabecalhoCookie);
  if (!resultado.ok) return resultado;
  if (resultado.entrevista?.status === "convidada") {
    const atualizada = mudarStatus(resultado.entrevista.id, "aberta");
    return { ...resultado, entrevista: atualizada ?? resultado.entrevista };
  }
  return resultado;
}

/** O `Set-Cookie` que marca este aparelho como o dono da conversa. Nulo nos links antigos. */
export function cookieDaSala(sala: SalaAberta, codigo: string, seguro: boolean): string | null {
  if (!sala.entrevista) return null;
  return cookieSessaoCandidato({ entrevistaId: sala.entrevista.id, codigo, expiraEm: sala.entrevista.expiraEm, tentativa: sala.entrevista.tentativa, seguro });
}

/**
 * Qual dos três níveis da conversa (D3) esta entrevista usa, decidido no SERVIDOR.
 *
 * O nível 3 (texto) não é escolhido aqui: ele é a queda do navegador que não escuta ou do microfone
 * negado, e só o próprio navegador sabe disso. Aqui se decide entre o agente conversacional (nível 1,
 * quando a empresa o conectou) e a voz do navegador (nível 2), que é o padrão.
 */
export function nivelDeVoz(): NivelVoz {
  return agenteEnabled() ? "agente" : "navegador";
}

/** O que o widget do agente conversacional precisa para abrir a conversa desta entrevista. */
export type AgenteDaSala = {
  /** O identificador do agente escolhido em Configurações. */
  id: string;
  /** As variáveis desta entrevista, entregues ao agente no começo da conversa. */
  variaveis: Record<string, string>;
};

/**
 * O agente conversacional desta entrevista, ou `null` quando ele não serve a ela.
 *
 * Devolver `null` NÃO é erro: é a sala caindo para o nível 2, que funciona sem nada configurado. Isso
 * acontece quando o agente não está conectado, quando o link é antigo (sem entrevista no banco) e
 * também quando o roteiro não pôde ser planejado (`lib/agente.ts`) — sem roteiro o agente conversaria
 * sobre nada, e a sala do navegador sabe planejar no primeiro turno e explicar a falha dentro da tela.
 *
 * As variáveis são as mesmas da ligação telefônica, por isso vêm de `lib/agente.ts`: o passo a passo
 * em Configurações promete uma lista só, e o agente é um só.
 */
export async function agenteDaSala(sala: SalaAberta): Promise<AgenteDaSala | null> {
  const id = agenteConfigurado();
  if (!id || !sala.entrevista) return null;

  const variaveis = await variaveisDaEntrevista(sala.entrevista.id, sala.sala.nome);
  if (!variaveis) return null;

  return { id, variaveis };
}
