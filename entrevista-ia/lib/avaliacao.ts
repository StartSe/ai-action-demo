// O parecer de uma entrevista concluída: a leitura da conversa que o gestor abre no lugar da
// transcrição inteira.
//
// **Esta é a costura que a US-022 (o parecer agêntico) substitui por dentro.** Hoje `avaliarEntrevista()`
// chama a avaliação de uma passada que já existia (`gerarScorecard`, lib/entrevista.ts); a história do
// parecer troca o miolo por três chamadas (extração, cruzamento, parecer) sem mexer em quem a chama.
// O que já é definitivo aqui é a borda: quem lê a conversa (o servidor, nunca o navegador), onde o
// resultado é gravado (`lib/historico.ts`, com o id ligado à entrevista) e o que acontece quando
// falha (`parecerStatus = "falhou"`, e a tela do gestor oferece preparar de novo).
//
// Fica acima das entidades, como `lib/painel.ts` e `lib/convite.ts`: junta entrevista, vaga e
// candidato, e nenhuma das três pode importar as outras sem fechar ciclo.
import { obter as obterCandidato } from "./candidatos";
import { gerarScorecard } from "./entrevista";
import { lerRoteiro, obter as obterEntrevista, registrarResultado, transcricao } from "./entrevistas";
import { obter as obterVaga } from "./vagas";
import type { Roteiro, Troca, Vaga as VagaDaSala } from "./types";

/**
 * Menos que isto não é uma entrevista: é alguém que abriu o link, disse uma frase e fechou.
 *
 * Avaliar uma conversa desse tamanho produziria um parecer com cara de parecer e sem nada por trás —
 * e é justamente esse parecer que o gestor levaria para uma decisão sobre uma pessoa.
 */
export const MINIMO_DE_RESPOSTAS = 2;

/** A vaga no formato que a avaliação conhece, montada do banco (e não do que o navegador mandou). */
function vagaDaEntrevista(vagaId: string, candidatoNome: string): VagaDaSala | null {
  const vaga = obterVaga(vagaId);
  if (!vaga) return null;
  return {
    titulo: vaga.cargo,
    requisitos: vaga.requisitos,
    candidato: candidatoNome,
    tom: vaga.tom,
    numero_perguntas: vaga.numeroPerguntas,
  };
}

/**
 * Quantas perguntas esta conversa era para ter — o plano guardado, ou o combinado na vaga.
 *
 * O plano (US-016) já respeita o número de perguntas da vaga e pode ser menor que ele; usar sempre a
 * vaga faria uma entrevista completa de sete perguntas, planejada para oito, parecer interrompida.
 */
function perguntasCombinadas(entrevistaId: string, numeroPerguntas: number): number {
  const bruto = lerRoteiro(entrevistaId);
  if (!bruto) return numeroPerguntas;
  try {
    const plano = JSON.parse(bruto) as Partial<Roteiro>;
    return Array.isArray(plano.perguntas) && plano.perguntas.length > 0 ? plano.perguntas.length : numeroPerguntas;
  } catch (err) {
    console.error("Roteiro gravado ilegível ao medir a entrevista; vale o número combinado na vaga.", err);
    return numeroPerguntas;
  }
}

/**
 * Prepara o parecer de uma entrevista e o liga a ela.
 *
 * **Lê a conversa do servidor.** A transcrição está em `mensagens_entrevista` desde a US-016: o que o
 * navegador do candidato lembrava não entra aqui, e por isso uma entrevista que caiu no meio, foi
 * retomada noutra aba ou aconteceu dentro do agente da ElevenLabs é avaliada do mesmo jeito.
 *
 * **`parcial` é deduzido, nunca recebido.** Quem encerrou a conversa antes do fim respondeu menos do
 * que o combinado, e isso está na transcrição: perguntar ao navegador criaria um segundo estado, que
 * "Preparar o parecer de novo" (dias depois, sem navegador nenhum do outro lado) não teria como
 * repetir. Sem essa marca, uma conversa curta viraria uma nota baixa sem explicação.
 *
 * Levanta erro quando não dá para avaliar — quem chama (`lib/conclusao.ts`) é que sabe se há alguém
 * do outro lado esperando uma resposta.
 */
export async function avaliarEntrevista(entrevistaId: string): Promise<{ resultadoId: string }> {
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) throw new Error(`Entrevista ${entrevistaId} não encontrada.`);

  const candidato = obterCandidato(entrevista.candidatoId);
  if (!candidato) throw new Error(`O candidato da entrevista ${entrevistaId} não existe mais.`);
  const vaga = vagaDaEntrevista(entrevista.vagaId, candidato.nome);
  if (!vaga) throw new Error(`A vaga da entrevista ${entrevistaId} não existe mais.`);

  const falas: Troca[] = transcricao(entrevistaId).map((m) => ({ papel: m.papel, texto: m.texto }));
  const respostas = falas.filter((f) => f.papel === "candidato").length;
  if (respostas < MINIMO_DE_RESPOSTAS) {
    throw new Error(`A entrevista ${entrevistaId} tem ${respostas} resposta(s): pouco para avaliar.`);
  }

  const parcial = respostas < perguntasCombinadas(entrevistaId, vaga.numero_perguntas);
  const { id } = await gerarScorecard(vaga, falas, { tipo: "scorecard", expiraEmDias: 90, parcial });
  registrarResultado(entrevistaId, id);
  return { resultadoId: id };
}
