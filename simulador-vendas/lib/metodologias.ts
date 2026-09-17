// As três metodologias de venda que o gestor pode escolher ao criar um treino, e os critérios que cada
// uma manda para o agente avaliador (US-010). **A metodologia decide a régua** (D6 do PRD): o avaliador
// recebe os critérios daqui, e o vendedor vê no máximo os quatro grupos (US-020), nunca a lista inteira.
//
// Arquivo **puro** (sem `node:*`, sem import de banco ou IA), como `lib/personas.ts`: é lido pelo
// servidor ao montar o prompt de avaliação e pela tela do gestor, que mostra uma linha por metodologia.
// É catálogo em código, não CRUD — o que uma simulação grava é só `metodologia` (e, na personalizada,
// os textos escritos pelo gestor), então acrescentar descrição a um critério nunca exige migração.
//
// **O `id` de cada critério é o que uma avaliação grava** (US-018), então renomear um `id` quebraria a
// leitura dos resultados já salvos: dá para mudar `nome`, `descricao` e `grupo`, nunca o `id`.

/** Os quatro grupos que o vendedor vê, na ordem em que a conversa acontece. */
export const GRUPOS = ["Descoberta", "Proposta de valor", "Objeções", "Fechamento"] as const;

export type Grupo = (typeof GRUPOS)[number];

export type Criterio = {
  id: string;
  /** O nome que o gestor vê na tela e que vai para o prompt de avaliação. */
  nome: string;
  /** O que conta como "bem feito" neste critério, em uma frase — é o que o avaliador usa como régua. */
  descricao: string;
  grupo: Grupo;
};

export type Metodologia = "spin" | "consultiva" | "personalizada";

export type MetodologiaDef = {
  id: Metodologia;
  nome: string;
  /** A linha que explica o método para o gestor, sem jargão de vendas. */
  linha: string;
  /** Vazio na personalizada: os critérios dela são escritos pelo gestor, por simulação. */
  criterios: Criterio[];
};

/** Quantos critérios a metodologia personalizada aceita. */
export const CRITERIOS_MIN = 3;
export const CRITERIOS_MAX = 10;

const SPIN: Criterio[] = [
  {
    id: "spin-situacao",
    nome: "Perguntas de situação",
    descricao: "Levantou o cenário de hoje — o que o cliente usa, como funciona, quem decide — sem virar interrogatório.",
    grupo: "Descoberta",
  },
  {
    id: "spin-problema",
    nome: "Perguntas de problema",
    descricao: "Fez o cliente dizer, com as palavras dele, o que hoje não funciona.",
    grupo: "Descoberta",
  },
  {
    id: "spin-implicacao",
    nome: "Perguntas de implicação",
    descricao: "Explorou o efeito do problema (tempo, dinheiro, risco, equipe) até o cliente medir o tamanho dele.",
    grupo: "Descoberta",
  },
  {
    id: "spin-need-payoff",
    nome: "Need-payoff",
    descricao: "Perguntou o que mudaria se o problema fosse resolvido, para o próprio cliente descrever o ganho.",
    grupo: "Proposta de valor",
  },
  {
    id: "spin-escuta",
    nome: "Escuta ativa",
    descricao: "Falou menos que o cliente, retomou as palavras dele e não atropelou a fala.",
    grupo: "Descoberta",
  },
  {
    id: "spin-valor",
    nome: "Proposta de valor",
    descricao: "Ligou o que o produto faz ao ganho que o cliente acabou de descrever, em benefício e não em lista de recursos.",
    grupo: "Proposta de valor",
  },
  {
    id: "spin-objecoes",
    nome: "Tratamento de objeções",
    descricao: "Escutou a objeção inteira, respondeu com fato ou exemplo e confirmou se a dúvida caiu.",
    grupo: "Objeções",
  },
  {
    id: "spin-descoberta",
    nome: "Descoberta",
    descricao: "Fechou a investigação com um diagnóstico: resumiu o problema do cliente e confirmou com ele antes de propor.",
    grupo: "Descoberta",
  },
  {
    id: "spin-proximo-passo",
    nome: "Próximo passo",
    descricao: "Saiu da conversa com um compromisso combinado: o que acontece, quando e com quem.",
    grupo: "Fechamento",
  },
];

// Os sete critérios que o app já usava antes deste ciclo. **Os nomes são a chave de compatibilidade**:
// `lib/demo.ts` casa o texto de exemplo pelo nome normalizado e o histórico já tem análises gravadas
// com eles, então nome e ordem não mudam — o que a US-010 acrescenta é `id`, `descricao` e `grupo`.
const CONSULTIVA: Criterio[] = [
  {
    id: "consultiva-abertura",
    nome: "Abertura e rapport",
    descricao: "Apresentou-se com clareza, disse por que procurou o cliente e criou um clima em que ele quis falar.",
    grupo: "Descoberta",
  },
  {
    id: "consultiva-descoberta",
    nome: "Descoberta de necessidades",
    descricao: "Entendeu o problema, o contexto e o impacto com perguntas abertas, antes de propor qualquer coisa.",
    grupo: "Descoberta",
  },
  {
    id: "consultiva-valor",
    nome: "Apresentação de valor",
    descricao: "Ligou o que o produto faz ao que o cliente contou, em benefício e não em lista de recursos.",
    grupo: "Proposta de valor",
  },
  {
    id: "consultiva-objecoes",
    nome: "Tratamento de objeções",
    descricao: "Escutou a objeção inteira, respondeu com fato ou exemplo e confirmou se a dúvida caiu.",
    grupo: "Objeções",
  },
  {
    id: "consultiva-urgencia",
    nome: "Geração de urgência",
    descricao: "Deixou claro o custo de não resolver agora, sem inventar prazo nem pressionar o cliente.",
    grupo: "Fechamento",
  },
  {
    id: "consultiva-escuta",
    nome: "Escuta ativa",
    descricao: "Falou menos que o cliente, retomou as palavras dele e não atropelou a fala.",
    grupo: "Descoberta",
  },
  {
    id: "consultiva-fechamento",
    nome: "Fechamento e próximos passos",
    descricao: "Pediu um compromisso concreto e saiu com data, responsável e próximo passo combinado.",
    grupo: "Fechamento",
  },
];

export const METODOLOGIAS: Record<Metodologia, MetodologiaDef> = {
  spin: {
    id: "spin",
    nome: "SPIN Selling",
    linha: "Perguntas de situação, problema, implicação e ganho, até o cliente enxergar o valor sozinho.",
    criterios: SPIN,
  },
  consultiva: {
    id: "consultiva",
    nome: "Venda consultiva",
    linha: "Escutar, entender o problema e ligar a proposta ao que o cliente contou.",
    criterios: CONSULTIVA,
  },
  personalizada: {
    id: "personalizada",
    nome: "Personalizada",
    linha: "Você escreve os critérios que o seu time usa para avaliar uma boa conversa.",
    criterios: [],
  },
};

/** Na ordem em que as três opções aparecem na tela. */
export const METODOLOGIAS_LISTA: MetodologiaDef[] = [METODOLOGIAS.spin, METODOLOGIAS.consultiva, METODOLOGIAS.personalizada];

export const METODOLOGIAS_IDS: Metodologia[] = METODOLOGIAS_LISTA.map((m) => m.id);

export function metodologia(id: string): MetodologiaDef {
  return METODOLOGIAS[id as Metodologia] ?? METODOLOGIAS.consultiva;
}

function sem(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Palavras que revelam em que momento da conversa um critério escrito à mão é cobrado. O gestor não
// escolhe grupo (seria mais uma pergunta num passo que já tem cinco), mas o vendedor vê quatro números
// (US-020) e todo critério precisa cair em um deles. Quando nada casa, "Descoberta" é o começo da
// conversa e o palpite menos arriscado.
const PISTAS: { grupo: Grupo; palavras: string[] }[] = [
  { grupo: "Objeções", palavras: ["objec", "objet", "contorn", "resist", "desconto", "concorren", "caro", "duvida"] },
  { grupo: "Fechamento", palavras: ["fecha", "proximo passo", "compromisso", "urgenc", "assinar", "proposta comercial", "agendar", "follow"] },
  { grupo: "Proposta de valor", palavras: ["valor", "beneficio", "demonstr", "apresent", "solucao", "ganho", "resultado", "diferencial"] },
  { grupo: "Descoberta", palavras: ["pergunt", "escut", "ouvir", "descobr", "entend", "diagnost", "problema", "necessidade", "contexto", "rapport", "abertura"] },
];

/** O grupo de um critério escrito pelo gestor, deduzido do texto dele. */
export function grupoDeTexto(texto: string): Grupo {
  const limpo = sem(texto);
  for (const { grupo, palavras } of PISTAS) {
    if (palavras.some((p) => limpo.includes(p))) return grupo;
  }
  return "Descoberta";
}

/** Os textos escritos pelo gestor, prontos para gravar: sem espaço sobrando, sem vazios, sem repetidos
 * e no máximo `CRITERIOS_MAX`. Quem chama confere se sobraram `CRITERIOS_MIN`. */
export function limparCriteriosPersonalizados(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const limpos = valor.map((c) => String(c ?? "").trim()).filter(Boolean);
  const vistos = new Set<string>();
  const unicos: string[] = [];
  for (const texto of limpos) {
    const chave = sem(texto);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(texto);
  }
  return unicos.slice(0, CRITERIOS_MAX);
}

/** A régua de uma simulação: os critérios da metodologia dela, ou os do gestor na personalizada.
 * Personalizada sem critério nenhum (JSON gravado torto) cai na venda consultiva — o avaliador precisa
 * de alguma régua, e ficar sem nota é pior para o vendedor que ser avaliado pela régua padrão. */
export function criteriosDe(simulacao: { metodologia: Metodologia; criteriosPersonalizados?: string[] }): Criterio[] {
  if (simulacao.metodologia !== "personalizada") return metodologia(simulacao.metodologia).criterios;
  const textos = limparCriteriosPersonalizados(simulacao.criteriosPersonalizados);
  if (!textos.length) return CONSULTIVA;
  return textos.map((nome, i) => ({
    id: `personalizada-${i + 1}`,
    nome,
    descricao: nome,
    grupo: grupoDeTexto(nome),
  }));
}

/** Os critérios distribuídos nos quatro grupos, na ordem de `GRUPOS`, sem os grupos que ficaram vazios
 * — é o agrupamento que o vendedor vê (US-020) e o resumo que a tela do gestor mostra. */
export function agruparCriterios(criterios: Criterio[]): { grupo: Grupo; criterios: Criterio[] }[] {
  return GRUPOS.map((grupo) => ({ grupo, criterios: criterios.filter((c) => c.grupo === grupo) })).filter((g) => g.criterios.length > 0);
}
