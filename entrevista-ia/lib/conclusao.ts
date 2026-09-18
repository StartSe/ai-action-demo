// O fim de uma entrevista (US-021): a porta única por onde uma conversa acaba, venha ela da sala do
// navegador (níveis 2 e 3) ou do aviso de pós-conversa da ElevenLabs (nível 1).
//
// Três coisas acontecem no mesmo instante e não podem ficar espalhadas por quem chama, senão o
// caminho do agente e o do navegador terminariam a mesma entrevista de dois jeitos diferentes:
//
//  1. A entrevista vira `concluida` (é o carimbo de `concluidaEm` e o que a tela do gestor lê).
//  2. O tamanho da conversa é medido: menos de duas respostas não é entrevista, é alguém que abriu o
//     link e fechou — e um parecer sobre isso teria cara de parecer sem nada por trás.
//  3. O parecer começa a ser preparado **em segundo plano**. Quem está do outro lado é o candidato,
//     que já disse tudo o que tinha a dizer: fazê-lo esperar meio minuto por uma análise que ele
//     nunca vai ler é cobrar dele o tempo do gestor.
//
// Fica acima das entidades, como `lib/painel.ts` e `lib/convite.ts`.
import { avaliarEntrevista, MINIMO_DE_RESPOSTAS } from "./avaliacao";
import {
  contarRespostasDoCandidato,
  marcarParecer,
  mudarStatus,
  obter as obterEntrevista,
  type Entrevista,
  type NivelVoz,
} from "./entrevistas";

/** Por que não há parecer a preparar. `null` quando há. */
export type SemParecer = "sem_material" | "ja_avaliada";

export type ResultadoConclusao = {
  entrevista: Entrevista;
  /** Quantas vezes o candidato falou — é o que separa uma conversa curta de uma conversa nenhuma. */
  respostas: number;
  /** O parecer está sendo preparado agora. Falso quando a conversa foi curta demais ou já havia um. */
  preparando: boolean;
};

/**
 * Dispara o preparo do parecer sem esperar por ele.
 *
 * **O estado é gravado ANTES de a promessa começar** (`parecerStatus = "em_andamento"`): a tela do
 * gestor sonda a lista e, sem isso, a primeira sondagem mostraria o estado velho. E o `.catch` é
 * obrigatório: esta promessa não tem dono, e uma rejeição sem dono derruba o processo Node inteiro.
 *
 * Falhar deixa a entrevista `concluida` com `parecerStatus = "falhou"` — nunca meio avaliada. É esse
 * campo que faz a tela do gestor oferecer "Preparar o parecer de novo" em vez de esperar para sempre
 * por um parecer que não vem.
 */
export function prepararParecer(entrevistaId: string): void {
  marcarParecer(entrevistaId, "em_andamento");
  avaliarEntrevista(entrevistaId).catch((err) => {
    console.error(`O parecer da entrevista ${entrevistaId} não pôde ser preparado.`, err);
    marcarParecer(entrevistaId, "falhou");
  });
}

/**
 * A conversa acabou: marca a entrevista e põe o parecer a caminho.
 *
 * **É idempotente.** A sala pode concluir duas vezes (um toque duplo, um reenvio depois de a resposta
 * se perder) e o aviso de pós-conversa da ElevenLabs é reentregue por projeto: uma entrevista já
 * concluída ou avaliada não volta atrás e não dispara um segundo parecer.
 *
 * Devolve `null` só quando a entrevista não existe mais ou já não vale (cancelada, expirada): nesses
 * casos não há nada a concluir, e quem chamou decide o que dizer a quem está do outro lado.
 */
export function concluirEntrevista(entrevistaId: string, { nivelVoz }: { nivelVoz?: NivelVoz } = {}): ResultadoConclusao | null {
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) return null;
  if (entrevista.status === "cancelada" || entrevista.status === "expirada") return null;

  const respostas = contarRespostasDoCandidato(entrevistaId);
  if (entrevista.status === "concluida" || entrevista.status === "avaliada") {
    return { entrevista, respostas, preparando: entrevista.parecerStatus === "em_andamento" };
  }

  const atualizada = mudarStatus(entrevistaId, "concluida", { nivelVoz }) ?? entrevista;

  // Conversa curta demais: fica `concluida` sem parecer, e a lista de entrevistas diz isso em vez de
  // prometer um parecer que nunca vai chegar.
  if (respostas < MINIMO_DE_RESPOSTAS) {
    const marcada = marcarParecer(entrevistaId, "sem_material") ?? atualizada;
    return { entrevista: marcada, respostas, preparando: false };
  }

  prepararParecer(entrevistaId);
  return { entrevista: obterEntrevista(entrevistaId) ?? atualizada, respostas, preparando: true };
}
