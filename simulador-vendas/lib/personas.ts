// Catálogo fixo dos sete tipos de cliente que o time encontra no treino (US-007).
//
// É catálogo em código, não CRUD (D2 do PRD): mora aqui como `CRITERIOS_PADRAO` mora em
// `lib/criterios.ts` — sem tela de gestão, sem menu próprio, sem semeadura em banco. O que fica
// gravado numa simulação é só a lista de ids (`simulacoes.personas`), então acrescentar atributo a
// uma persona nunca exige migração.
//
// Arquivo **puro** (sem `node:*`, sem import de nada que toque banco ou IA): é lido pelo servidor,
// ao montar o personagem, e pela tela do gestor, que mostra **só emoji + nome** (D2). Os atributos
// compostos existem para o prompt, não para a tela.

/** Escala de 3 pontos usada em todos os atributos: 0 = pouco, 1 = médio, 2 = muito. */
export type Nivel = 0 | 1 | 2;

export type Persona = {
  id: string;
  /** O rótulo que o **gestor** vê. O vendedor só vê isto depois do feedback (D2). */
  nome: string;
  emoji: string;
  /** O comportamento principal, em uma linha, do jeito que entra no prompt. */
  comportamento: string;
  /**
   * Como o cliente é descrito para quem acabou de falar com ele (US-019): "um cliente **apressado**".
   * É adjetivo, não rótulo — a frase da revelação explica o perfil, e o rótulo (emoji + nome) fica ao
   * lado dela para quem quiser o nome do tipo.
   */
  adjetivo: string;
  /** A característica secundária, quando a persona tem uma que muda a conversa. */
  secundaria?: string;
  /** Quanto conhece a categoria do produto. */
  conhecimento: Nivel;
  /** Quanto tempo e atenção dá antes de querer encerrar. */
  paciencia: Nivel;
  /** Quanto se dispõe a contar do próprio contexto e a considerar a proposta. */
  abertura: Nivel;
  /** Quanto puxa a conversa para custo e comparação de preço. */
  precoSensivel: Nivel;
  /** Falas que o modelo usa como referência de voz — nunca como roteiro a repetir. */
  frasesTipicas: string[];
};

export const PERSONAS: Persona[] = [
  {
    id: "amigavel",
    nome: "Amigável",
    emoji: "🙂",
    comportamento: "Recebe bem, conversa com facilidade e evita dizer não na cara do vendedor.",
    adjetivo: "amigável",
    secundaria: "Concorda com quase tudo, mas empurra a decisão para depois.",
    conhecimento: 1,
    paciencia: 2,
    abertura: 2,
    precoSensivel: 1,
    frasesTipicas: [
      "Que bom que você ligou, pode falar à vontade.",
      "Faz sentido isso que você está dizendo.",
      "Vou levar para o time e te retorno, pode ser?",
    ],
  },
  {
    id: "apressado",
    nome: "Apressado",
    emoji: "⚡",
    comportamento: "Está no meio de outra coisa e quer o essencial em poucas frases.",
    adjetivo: "apressado",
    secundaria: "Corta o vendedor no meio e pede a conclusão.",
    conhecimento: 1,
    paciencia: 0,
    abertura: 1,
    precoSensivel: 1,
    frasesTipicas: [
      "Tenho cinco minutos, pode ir ao ponto?",
      "Resume para mim: o que isso muda no meu dia?",
      "Me manda por escrito que eu vejo depois.",
    ],
  },
  {
    id: "direto",
    nome: "Direto",
    emoji: "🎯",
    comportamento: "Fala pouco, pergunta objetivamente e espera o mesmo de quem está do outro lado.",
    adjetivo: "direto",
    secundaria: "Não tolera rodeio nem discurso decorado.",
    conhecimento: 1,
    paciencia: 1,
    abertura: 1,
    precoSensivel: 1,
    frasesTipicas: [
      "O que exatamente vocês fazem?",
      "Isso resolve o meu problema ou não?",
      "Qual é o próximo passo, na prática?",
    ],
  },
  {
    id: "cetico",
    nome: "Cético",
    emoji: "🤨",
    comportamento: "Duvida do que ouve e pede prova de cada afirmação antes de aceitar.",
    adjetivo: "cético",
    secundaria: "Já se decepcionou com a promessa de um fornecedor.",
    conhecimento: 1,
    paciencia: 1,
    abertura: 0,
    precoSensivel: 1,
    frasesTipicas: [
      "Todo mundo fala isso. Por que com vocês seria diferente?",
      "Vocês têm algum caso parecido com o meu para me mostrar?",
      "Esse número saiu de onde?",
    ],
  },
  {
    id: "preco",
    nome: "Sensível a preço",
    emoji: "💰",
    comportamento: "Puxa a conversa para o custo e compara com a alternativa mais barata.",
    adjetivo: "atento ao preço",
    secundaria: "Precisa justificar o gasto para outra pessoa.",
    conhecimento: 1,
    paciencia: 1,
    abertura: 1,
    precoSensivel: 2,
    frasesTipicas: [
      "Quanto fica isso por mês, no fim das contas?",
      "Achei uma opção bem mais barata fazendo parecido.",
      "Preciso justificar esse valor para a diretoria.",
    ],
  },
  {
    id: "especialista",
    nome: "Especialista",
    emoji: "🧠",
    comportamento: "Conhece a categoria a fundo e testa quem está vendendo com pergunta técnica.",
    adjetivo: "especialista na categoria",
    secundaria: "Corrige na hora quem simplifica demais.",
    conhecimento: 2,
    paciencia: 1,
    abertura: 1,
    precoSensivel: 1,
    frasesTipicas: [
      "Como vocês fazem isso por baixo dos panos?",
      "No que isso é diferente do que o mercado já faz?",
      "Já testei três ferramentas parecidas; me diga o que muda aqui.",
    ],
  },
  {
    id: "resistente",
    nome: "Resistente",
    emoji: "🧱",
    comportamento: "Não quer mudar nada e trata a conversa como tempo perdido.",
    adjetivo: "resistente a mudança",
    secundaria: "Defende o fornecedor que já tem.",
    conhecimento: 1,
    paciencia: 0,
    abertura: 0,
    precoSensivel: 1,
    frasesTipicas: [
      "A gente já tem isso resolvido, obrigado.",
      "Não é prioridade para este ano.",
      "Trocar de fornecedor agora dá trabalho demais.",
    ],
  },
];

/** Os ids na ordem do catálogo: é o que a simulação grava e o que a migração usa como padrão. */
export const PERSONAS_IDS: string[] = PERSONAS.map((p) => p.id);

/** A persona de um id gravado. Id desconhecido (catálogo mudou) volta `undefined`, nunca lança. */
export function persona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

/**
 * As personas de uma lista de ids, na ordem do catálogo e sem repetidos. Lista vazia — ou só com ids
 * que não existem mais — devolve o catálogo inteiro: uma simulação nunca fica sem cliente possível.
 */
export function personasDe(ids: string[]): Persona[] {
  const escolhidas = PERSONAS.filter((p) => ids.includes(p.id));
  return escolhidas.length ? escolhidas : PERSONAS;
}

/** Emoji + nome: a única forma de mostrar uma persona na tela (D2). */
export function rotulo(p: Persona): string {
  return `${p.emoji} ${p.nome}`;
}

/**
 * Os adjetivos que descrevem o cliente para quem acabou de conversar com ele, com a dificuldade que o
 * gestor escolheu somada quando ela muda o que a pessoa sentiu do outro lado: um cliente difícil é o
 * mesmo tipo de cliente, mas exigiu mais.
 */
export function adjetivosDoCliente(p: Persona, dificuldade?: string): string {
  const extra = dificuldade === "dificil" ? "exigente" : dificuldade === "facil" ? "paciente" : "";
  return extra ? `${p.adjetivo} e ${extra}` : p.adjetivo;
}

/**
 * A linha que revela o perfil no fim da conversa: "Cláudia estava no papel de um cliente apressado."
 *
 * "no papel de" em vez de "era": os nomes dos personagens (lib/cliente-simulado.ts) são de pessoas de
 * qualquer gênero e os adjetivos aqui concordam com "cliente", que é o papel. "Cláudia era um cliente
 * apressado" tropeça na leitura; "estava no papel de um cliente apressado" não tropeça em nenhum nome
 * da lista, e é também mais verdadeiro — ninguém era cliente de verdade ali.
 */
export function frasePerfil(nomeDoCliente: string, adjetivos: string): string {
  const primeiro = nomeDoCliente.trim().split(/\s+/)[0];
  if (!primeiro) return `Você conversou com um cliente ${adjetivos}.`;
  return `${primeiro} estava no papel de um cliente ${adjetivos}.`;
}
