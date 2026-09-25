// A entrevista de configuração: a assistente conversa com quem acabou de
// conectar os provedores e pergunta o que precisa para sugerir a configuração
// inteira.
//
// Não é ligação de venda. Quem está do outro lado é o dono da conta, e o
// registro é o conversacional da seção 4 de docs/padrao-de-interface.md, como
// toda fala da assistente: frase curta, uma pergunta por vez, a razão dita em
// voz alta. A instrução ao modelo fica em `instrucao`, e o que ela fala em
// `falas`, para as duas se varrerem separadas.
//
// **O NOME É O DA CONTA.** A primeira pergunta do tutorial é o nome da
// assistente, e a entrevista vem depois: ela abre dizendo esse nome e a
// instrução o usa. `NOME_SEM_ESCOLHA` só vale para a conta que chegou aqui sem
// nome gravado (a que pulou a pergunta); é o único lugar do produto em que a
// assistente ainda se chama Sarah, porque uma fala precisa de um nome para
// soar como gente, e "Oi! Aqui é a assistente" não soa.

/** O nome da entrevista quando a conta ainda não escolheu o da assistente. */
export const NOME_SEM_ESCOLHA = 'Sarah'

/** O nome que a fala usa: o gravado, aparado, ou o padrão sem escolha. */
export function nomeNaEntrevista(nome: string | null | undefined): string {
  const aparado = nome?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? ''
  return aparado === '' ? NOME_SEM_ESCOLHA : aparado
}

export function falasDaEntrevista(nome: string | null) {
  return {
    abertura: `Oi! Aqui é a ${nomeNaEntrevista(nome)}. Antes de eu começar a ligar pros seus leads, quero entender o seu negócio. São umas perguntas rápidas, uns três minutos. Pode ser?`,
    encerramento:
      'Pronto, já tenho o que preciso. Vou preparar as sugestões agora. Pode clicar em encerrar.',
  } as const
}

/** As falas da conta sem nome escolhido. */
export const falas = falasDaEntrevista(null)

/**
 * O que a assistente precisa saber, na ordem em que pergunta. É o mesmo que a
 * etapa escrita pede, e um pouco mais: a conversa deixa perguntar o que um
 * formulário curto não pede sem cansar. O nome só entra na lista quando a
 * conta ainda não o escolheu: com ele gravado, perguntar de novo desfaria a
 * primeira resposta do tutorial.
 */
export function assuntosDaEntrevista(nome: string | null): readonly string[] {
  const temNome = (nome?.trim() ?? '') !== ''
  return [
    'o nome da empresa, como o cliente a conhece',
    'o que a empresa vende e para quem',
    'o que você precisa descobrir na ligação para saber se o lead está pronto para a reunião',
    'as objeções mais comuns que o cliente levanta',
    'o que você nunca pode prometer, como preço fechado ou prazo',
    'como é a reunião com o especialista: duração, e se é por vídeo, telefone ou presencial',
    ...(temNome ? [] : ['se prefere que você se apresente com outro nome']),
  ]
}

export const ASSUNTOS_DA_ENTREVISTA = assuntosDaEntrevista(null)

export function instrucaoDaEntrevista(nome: string | null): string {
  const assuntos = assuntosDaEntrevista(nome)
  return [
    `Você é a ${nomeNaEntrevista(nome)}, uma assistente virtual com IA que vai trabalhar como SDR para esta empresa: ligar para leads, qualificar e marcar reunião com um especialista.`,
    'Agora você está conversando com a pessoa que está configurando você. O objetivo é entender o negócio para sugerir a sua configuração.',
    'Fale em português do Brasil, de um jeito simpático e direto. Faça uma pergunta por vez, espere a resposta e siga. Se a resposta vier vaga, peça um exemplo uma vez só e siga em frente.',
    'A pessoa pode responder falando ou digitando. Se ela ficar em silêncio, não cobre resposta: ela pode estar pensando ou escrevendo. Espere.',
    `Cubra estes assuntos, nesta ordem:\n${assuntos.map((assunto, indice) => `${indice + 1}. ${assunto}`).join('\n')}`,
    'Não ofereça nem combine horário de reunião: você ainda não tem acesso à agenda.',
    'A lista de leads é da empresa: ela entrega os contatos já escolhidos, e você só liga para eles. Não pergunte que tipo de empresa ou de pessoa evitar, como escolher para quem ligar, nem de onde vêm os contatos.',
    'Não invente nada sobre a empresa. Não dê opinião sobre o negócio. Não passe de cinco minutos.',
    `Quando tiver coberto os assuntos, faça um resumo de duas frases do que entendeu, pergunte se está certo e, confirmado, diga exatamente: "${falasDaEntrevista(nome).encerramento}"`,
  ].join('\n\n')
}

/** A instrução da conta sem nome escolhido. */
export const instrucao = instrucaoDaEntrevista(null)
