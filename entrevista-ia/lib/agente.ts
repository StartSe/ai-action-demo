// As variáveis dinâmicas que o agente conversacional da ElevenLabs recebe no começo de uma entrevista.
//
// Dois caminhos levam ao MESMO agente: a sala do candidato no navegador (US-019, nível 1) e a ligação
// telefônica (`/api/ligar`, US-020). Um agente cujo prompt usa `{{roteiro}}` conversaria sobre nada se
// um dos dois caminhos esquecesse de mandá-lo — e o passo a passo em Configurações promete uma lista
// só de variáveis. Por isso elas são montadas aqui, e não em cada chamador.
//
// O roteiro é planejado (uma chamada de modelo) e GRAVADO: quem liga para o mesmo candidato duas
// vezes lê o plano guardado, e é o mesmo plano que a sala do navegador usaria.
import { montarContexto, roteiroDaEntrevista, roteiroEmTexto } from "./roteiro";

/** O que o agente conversacional precisa saber para conduzir esta entrevista. */
export type VariaveisDoAgente = Record<string, string>;

/**
 * As variáveis desta entrevista, ou `null` quando ela não pode ser conduzida pelo agente.
 *
 * Devolver `null` NÃO é erro: é a entrevista que não tem vaga ou candidato no banco (link antigo), ou
 * o roteiro que não pôde ser planejado. Quem chama decide o que fazer — a sala cai para o nível 2, a
 * ligação avisa quem apertou o botão.
 *
 * `empresa` é o nome público que o candidato lê (o do convite). O app não tem um cadastro de razão
 * social, e inventar um aqui seria dar ao agente um nome que ninguém digitou.
 */
export async function variaveisDaEntrevista(entrevistaId: string, empresa: string): Promise<VariaveisDoAgente | null> {
  const ctx = montarContexto(entrevistaId);
  if (!ctx) return null;

  let roteiro: string;
  try {
    roteiro = roteiroEmTexto(await roteiroDaEntrevista(entrevistaId, ctx));
  } catch (err) {
    console.error("O roteiro do agente conversacional não pôde ser planejado.", err);
    return null;
  }

  return {
    entrevista_id: entrevistaId,
    candidato: ctx.candidato.primeiroNome,
    cargo: ctx.cargo,
    empresa,
    roteiro,
    duracao_minutos: String(ctx.duracaoMin),
  };
}
