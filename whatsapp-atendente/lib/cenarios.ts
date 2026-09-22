// Os cenários de teste que o passo "Testar" do Assistente sugere, por objetivo do atendente. Eles
// existem porque a pessoa que acabou de criar o atendente testa o que ela já sabe que funciona ("qual
// o horário?") e nunca o que costuma dar errado: a pergunta fora do escopo, o cliente que pede uma
// pessoa e o dado que quase sempre falta na base (preço, prazo, endereço). Cada objetivo tem seis, e
// os três casos difíceis estão sempre entre eles.
//
// Arquivo folha de propósito (só importa tipos): a tela do Assistente e qualquer teste leem daqui sem
// fechar ciclo de import. As perguntas do dia a dia continuam vindo de `Config.perguntasSugeridas`
// (escritas pela pessoa ou propostas pela IA na US-007); estes cenários são o complemento.
import type { MotivoTransferencia } from "./transferencia";
import type { Objetivo } from "./types";

/** O que cada cenário está testando; é o rótulo que aparece acima da mensagem no cartão "O que testar". */
export type GrupoCenario = "comum" | "fora_do_escopo" | "pedido_de_pessoa" | "dado_que_falta";

const ROTULOS: Record<GrupoCenario, string> = {
  comum: "Pergunta do dia a dia",
  fora_do_escopo: "Fora do que ele faz",
  pedido_de_pessoa: "Cliente quer falar com alguém",
  dado_que_falta: "Dado que costuma faltar",
};

export function rotuloGrupo(grupo: GrupoCenario): string {
  return ROTULOS[grupo];
}

/** A ordem dos grupos no cartão: primeiro o dia a dia, depois os três casos que costumam dar errado. */
export const GRUPOS: GrupoCenario[] = ["comum", "dado_que_falta", "fora_do_escopo", "pedido_de_pessoa"];

export interface Cenario {
  /** Identificador estável, para a tela guardar o resultado do envio sem depender do texto. */
  id: string;
  grupo: GrupoCenario;
  /** O que este cenário testa, em poucas palavras. */
  titulo: string;
  /** A mensagem que o cliente manda, exatamente como ela vai para o atendente. */
  mensagem: string;
}

/**
 * Nos dois grupos abaixo o atendente TEM que pedir ajuda de uma pessoa: um pedido que ele não faz e um
 * cliente pedindo atendimento humano. É por isso que o cartão marca esses cenários com "deve
 * transferir" e, depois do envio, diz se transferiu.
 */
export function deveTransferir(cenario: Cenario): boolean {
  return motivoEsperado(cenario) !== null;
}

/**
 * Com que motivo o atendente deveria pedir ajuda neste cenário (lib/transferencia.ts), ou `null`
 * quando ele deveria responder sozinho. É o que deixa o cartão dizer "pediu ajuda com o motivo certo"
 * em vez de só "pediu ajuda": um pedido fora do escopo respondido como "a base não tinha" é uma
 * transferência pelo motivo errado, e os relatórios vão contá-la no lugar errado.
 */
export function motivoEsperado(cenario: Cenario): MotivoTransferencia | null {
  if (cenario.grupo === "fora_do_escopo") return "fora_do_escopo";
  if (cenario.grupo === "pedido_de_pessoa") return "cliente_pediu";
  return null;
}

/** Os dois cenários que todo atendente precisa passar, independentemente do objetivo. */
const SEMPRE: Omit<Cenario, "id">[] = [
  { grupo: "fora_do_escopo", titulo: "Pedido que ele não faz", mensagem: "Vocês fazem entrega em Manaus?" },
  { grupo: "pedido_de_pessoa", titulo: "Quer falar com a equipe", mensagem: "Quero falar com alguém da equipe, por favor" },
];

const POR_OBJETIVO: Record<Objetivo, Omit<Cenario, "id">[]> = {
  atendimento: [
    { grupo: "comum", titulo: "Horário de funcionamento", mensagem: "Vocês abrem no sábado? Que horas?" },
    { grupo: "comum", titulo: "O que a empresa faz", mensagem: "Me explica o que vocês fazem?" },
    { grupo: "dado_que_falta", titulo: "Preço", mensagem: "Quanto custa?" },
    { grupo: "dado_que_falta", titulo: "Endereço", mensagem: "Qual o endereço de vocês?" },
  ],
  vendas: [
    { grupo: "comum", titulo: "Comparar duas opções", mensagem: "Qual a diferença entre os planos de vocês?" },
    { grupo: "comum", titulo: "Cliente pronto para fechar", mensagem: "Gostei! Como faço para contratar?" },
    { grupo: "dado_que_falta", titulo: "Preço e desconto", mensagem: "Quanto fica se eu pagar à vista?" },
    { grupo: "dado_que_falta", titulo: "Prazo de entrega", mensagem: "Em quantos dias chega aqui?" },
  ],
  agendamentos: [
    { grupo: "comum", titulo: "Pedir um horário", mensagem: "Consigo um horário na quinta à tarde?" },
    { grupo: "comum", titulo: "Desmarcar", mensagem: "Preciso desmarcar meu horário de amanhã" },
    { grupo: "dado_que_falta", titulo: "Preço da consulta", mensagem: "Quanto custa a primeira consulta?" },
    { grupo: "dado_que_falta", titulo: "Onde é o atendimento", mensagem: "O atendimento é presencial ou online?" },
  ],
  outro: [
    { grupo: "comum", titulo: "Pergunta aberta", mensagem: "Oi! Como vocês podem me ajudar?" },
    { grupo: "comum", titulo: "Dúvida sobre o serviço", mensagem: "Como funciona o atendimento de vocês?" },
    { grupo: "dado_que_falta", titulo: "Preço", mensagem: "Quanto custa?" },
    { grupo: "dado_que_falta", titulo: "Prazo", mensagem: "Quanto tempo leva?" },
  ],
};

/** Os seis cenários do objetivo escolhido, na ordem dos grupos (dia a dia primeiro). */
export function cenariosDoObjetivo(objetivo: Objetivo): Cenario[] {
  const lista = [...(POR_OBJETIVO[objetivo] ?? POR_OBJETIVO.atendimento), ...SEMPRE];
  return GRUPOS.flatMap((grupo) =>
    lista
      .filter((c) => c.grupo === grupo)
      .map((c, i) => ({ ...c, id: `${objetivo}-${grupo}-${i + 1}` }))
  );
}
