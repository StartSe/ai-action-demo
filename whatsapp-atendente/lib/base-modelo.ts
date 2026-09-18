// Modelo da base de conhecimento, um por objetivo do atendente. É o que o passo 1 do Assistente mostra
// quando ainda não há nada salvo: em vez de um campo vazio (ou do exemplo da clínica, que é de outro
// negócio), a pessoa recebe a estrutura pronta e troca os marcadores entre colchetes pelos dados dela.
//
// Os marcadores são escritos em MAIÚSCULAS entre colchetes ([NOME_DA_EMPRESA]) justamente para saltarem
// aos olhos e não serem confundidos com texto de verdade. O atendente nunca inventa nada fora deste
// campo, então um marcador esquecido aparece na resposta ao cliente — é deliberado que ele incomode.
import type { Objetivo } from "./types";

const COMUM = `Sobre a empresa
[NOME_DA_EMPRESA] é [O QUE A EMPRESA FAZ, EM UMA FRASE].
Endereço: [RUA, NÚMERO, BAIRRO, CIDADE]
Horário de funcionamento: [DIAS E HORÁRIOS]
Telefone: [TELEFONE] | Site: [SITE]`;

const NAO_FAZER = `O que o atendente não deve fazer
- Não prometer preço, prazo, desconto ou condição que não esteja escrito aqui.
- [OUTRA REGRA DA SUA EMPRESA]`;

/** O modelo de cada objetivo. Record completo: somar um objetivo ao tipo faz o compilador cobrar o texto. */
export const MODELOS_DE_BASE: Record<Objetivo, string> = {
  atendimento: `${COMUM}

O que oferecemos
- [PRODUTO OU SERVIÇO 1]: [descrição em uma linha]
- [PRODUTO OU SERVIÇO 2]: [descrição em uma linha]
- [PRODUTO OU SERVIÇO 3]: [descrição em uma linha]

Perguntas que os clientes mais fazem
Quais são as formas de pagamento? [RESPOSTA]
Vocês atendem em quais regiões? [RESPOSTA]
Como faço para [O QUE O CLIENTE MAIS PEDE]? [RESPOSTA]

${NAO_FAZER}`,

  vendas: `${COMUM}

O que vendemos e quanto custa
- [PRODUTO OU SERVIÇO 1]: [preço ou faixa de preço] — [para quem serve]
- [PRODUTO OU SERVIÇO 2]: [preço ou faixa de preço] — [para quem serve]
- [PRODUTO OU SERVIÇO 3]: [preço ou faixa de preço] — [para quem serve]

Condições de pagamento
[FORMAS DE PAGAMENTO ACEITAS, PARCELAMENTO E DESCONTOS QUE PODEM SER OFERECIDOS]

Promoção do momento
[PROMOÇÃO E ATÉ QUANDO VALE, OU "sem promoção no momento"]

Por que comprar com a gente
- [DIFERENCIAL 1]
- [DIFERENCIAL 2]

Quando o cliente tem dúvida
"Está caro": [COMO RESPONDER]
"Vou pensar": [COMO RESPONDER]

${NAO_FAZER}`,

  agendamentos: `${COMUM}

O que pode ser agendado
- [SERVIÇO 1]: dura [TEMPO] — [preço, se puder informar]
- [SERVIÇO 2]: dura [TEMPO] — [preço, se puder informar]

Horários disponíveis
[DIAS E FAIXAS DE HORÁRIO EM QUE A AGENDA ABRE]

O que perguntar ao cliente antes de confirmar
- Dia e horário de preferência
- [NOME COMPLETO, CONVÊNIO, ENDEREÇO OU O QUE MAIS SUA EQUIPE PRECISA SABER]

Remarcação e cancelamento
[COM QUANTAS HORAS DE ANTECEDÊNCIA, E O QUE ACONTECE QUANDO O CLIENTE NÃO AVISA]

${NAO_FAZER}`,

  outro: `${COMUM}

O que o cliente precisa saber
- [INFORMAÇÃO 1]
- [INFORMAÇÃO 2]
- [INFORMAÇÃO 3]

Perguntas que os clientes mais fazem
[PERGUNTA]? [RESPOSTA]
[PERGUNTA]? [RESPOSTA]

${NAO_FAZER}`,
};

export function modeloDeBase(objetivo: Objetivo): string {
  return MODELOS_DE_BASE[objetivo];
}

/**
 * O texto ainda é um modelo intocado? É o que permite trocar o modelo quando a pessoa muda de objetivo
 * sem nunca apagar o que ela escreveu: um campo vazio ou igual a um dos modelos pode ser substituído;
 * qualquer edição, por menor que seja, congela o texto onde está.
 */
export function ehModeloDeBase(texto: string): boolean {
  const limpo = texto.trim();
  if (!limpo) return true;
  return Object.values(MODELOS_DE_BASE).some((m) => m.trim() === limpo);
}
