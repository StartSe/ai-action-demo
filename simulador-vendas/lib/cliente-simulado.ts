// O personagem que o vendedor encontra na sala: quem é o cliente, por que ele aceitou a conversa e
// como ele se comporta (US-007).
//
// Ele nasce de três coisas e só delas: a **persona** (lib/personas.ts), a **dificuldade** da simulação
// e a **ficha do produto** (US-006). A ficha é a única informação sobre o produto que entra aqui
// (D12 do PRD): nenhuma fonte crua de `fontes_produto` chega ao prompt.
//
// Arquivo puro (sem `node:*`; os imports de `./produtos` e `./simulacoes` são só de tipo e somem na
// compilação), para poder ser exercitado por teste fora do Next.
import type { ConhecimentoProduto, Produto } from "./produtos";
import type { Dificuldade } from "./simulacoes";
import type { Nivel, Persona } from "./personas";

/** O que o vendedor vê e o que o modelo recebe. `instrucoes` é o system prompt da conversa. */
export type Personagem = {
  nome: string;
  cargo: string;
  empresa: string;
  /** Duas a três frases sobre a situação. **Nunca cita o nome da persona** (D2). */
  contexto: string;
  instrucoes: string;
};

/** Só o que o personagem precisa do produto — quem chama pode passar o `Produto` inteiro. */
export type ProdutoDoTreino = Pick<Produto, "nome" | "conhecimento">;

export type EntradaPersonagem = {
  persona: Persona;
  dificuldade: Dificuldade;
  produto: ProdutoDoTreino;
  /**
   * Texto que fixa o sorteio de nome, cargo e empresa — na prática o id da sessão. **Passar sempre**:
   * o personagem é remontado a cada turno da conversa e, sem semente, o cliente trocaria de nome no
   * meio da ligação. Sem semente cai em `Math.random`, que serve para pré-visualizar na tela.
   */
  semente?: string;
};

// ---------------------------------------------------------------------------
// Listas fixas de onde o personagem é sorteado
// ---------------------------------------------------------------------------

/**
 * Cargos e empresas por segmento. Os cargos são todos neutros em gênero ("Gerente de…", "Head de…")
 * de propósito: o nome é sorteado de outra lista e um "Diretor Camila Duarte" quebraria a ilusão logo
 * na primeira fala.
 */
type Segmento = { id: string; cargos: string[]; empresas: string[] };

const SEGMENTOS: Segmento[] = [
  {
    id: "industria",
    cargos: ["Gerente de Produção", "Gerente Industrial", "Head de Operações", "Gerente de Suprimentos"],
    empresas: ["Metalúrgica Vale Verde", "Indústria Bonfim", "Plásticos Aurora", "Fundição São Mateus"],
  },
  {
    id: "tecnologia",
    cargos: ["Head de Tecnologia", "Gerente de Produto", "Gerente de TI", "Head de Engenharia"],
    empresas: ["Nexo Sistemas", "Órbita Software", "Datamarco", "Lumen Tecnologia"],
  },
  {
    id: "varejo",
    cargos: ["Gerente Comercial", "Gerente de Loja", "Head de Expansão", "Gerente de Compras"],
    empresas: ["Rede Bom Preço", "Casa Ferraz", "Lojas Mirante", "Comercial Santa Rita"],
  },
  {
    id: "saude",
    cargos: ["Gerente Administrativo", "Head de Operações", "Gerente de Compras", "Gerente de Enfermagem"],
    empresas: ["Clínica Monte Azul", "Hospital São Jorge", "Rede Vitalis", "Laboratório Andrade"],
  },
  {
    id: "servicos",
    cargos: ["Gerente Administrativo", "Head de Operações", "Gerente de Projetos", "Gerente de Atendimento"],
    empresas: ["Grupo Aldeia", "Consultoria Pontal", "Sertã Serviços", "Martins & Associados"],
  },
];

/** Segmento de reserva quando o produto não dá pista nenhuma de para quem vende. */
const SEGMENTO_PADRAO: Segmento = {
  id: "generico",
  cargos: ["Gerente Comercial", "Head de Operações", "Gerente Administrativo", "Gerente de Compras"],
  empresas: ["Grupo Aldeia", "Comercial Santa Rita", "Nexo Sistemas", "Indústria Bonfim"],
};

/**
 * O nome não varia por segmento — uma pessoa chamada Renata trabalha em qualquer ramo. O que o
 * segmento decide é o cargo e a empresa, que são o que dá verossimilhança à conversa.
 */
const NOMES = [
  "Cláudia Nogueira",
  "Rodrigo Ferraz",
  "Beatriz Salles",
  "Marcos Teixeira",
  "Juliana Prado",
  "Eduardo Rangel",
  "Patrícia Lemos",
  "Fernando Bastos",
  "Camila Duarte",
  "Henrique Vasques",
  "Renata Aguiar",
  "Otávio Brandão",
];

/** Palavras que denunciam o segmento, procuradas no nome, na descrição e na ficha do produto. */
const PISTAS: Record<string, string[]> = {
  industria: ["indústria", "industrial", "fábrica", "fabril", "produção", "manufatura", "chão de fábrica", "planta"],
  tecnologia: ["software", "sistema", "plataforma", "tecnologia", "aplicativo", "dados", "digital", "ti "],
  varejo: ["varejo", "loja", "comércio", "pdv", "e-commerce", "franquia", "atacado"],
  saude: ["saúde", "clínica", "hospital", "paciente", "médic", "laboratório", "enfermagem"],
  servicos: ["serviço", "consultoria", "escritório", "contabilidade", "assessoria", "agência"],
};

/** Objeções de reserva, usadas só quando a ficha do produto não traz objeção suficiente. */
const OBJECOES_RESERVA = [
  "Já temos algo que resolve isso hoje.",
  "Não tenho orçamento aprovado para este ano.",
  "Trocar agora daria trabalho demais para o meu time.",
  "Preciso de prova de que isso funciona em uma empresa como a minha.",
];

// ---------------------------------------------------------------------------
// Sorteio estável
// ---------------------------------------------------------------------------

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Hash simples (FNV-1a de 32 bits) — só precisa espalhar bem, não precisa ser criptográfico. */
function hash(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Sorteador estável: a mesma semente devolve sempre o mesmo personagem, e cada campo (`nome`,
 * `cargo`, `empresa`) usa um sal diferente para não ficarem todos presos ao mesmo índice.
 */
function sorteador(semente: string | undefined): (campo: string, tamanho: number) => number {
  if (!semente) return (_campo, tamanho) => Math.floor(Math.random() * tamanho);
  return (campo, tamanho) => hash(`${semente}:${campo}`) % tamanho;
}

// ---------------------------------------------------------------------------
// Dificuldade (D7): parâmetro do cliente, nunca uma frase solta no prompt
// ---------------------------------------------------------------------------

type Regra = {
  abertura: number;
  paciencia: number;
  minObjecoes: number;
  maxObjecoes: number;
  exigeProva: boolean;
};

const REGRAS: Record<Dificuldade, Regra> = {
  facil: { abertura: +1, paciencia: +1, minObjecoes: 1, maxObjecoes: 1, exigeProva: false },
  realista: { abertura: 0, paciencia: 0, minObjecoes: 2, maxObjecoes: 3, exigeProva: false },
  dificil: { abertura: -1, paciencia: -1, minObjecoes: 3, maxObjecoes: 4, exigeProva: true },
};

function clamp(valor: number): Nivel {
  return Math.max(0, Math.min(2, valor)) as Nivel;
}

export type Atributos = {
  conhecimento: Nivel;
  paciencia: Nivel;
  abertura: Nivel;
  precoSensivel: Nivel;
};

/** Os atributos da persona somados aos deltas da dificuldade, presos na escala de 0 a 2. */
export function atributosDe(persona: Persona, dificuldade: Dificuldade): Atributos {
  const regra = REGRAS[dificuldade] ?? REGRAS.realista;
  return {
    conhecimento: persona.conhecimento,
    paciencia: clamp(persona.paciencia + regra.paciencia),
    abertura: clamp(persona.abertura + regra.abertura),
    precoSensivel: persona.precoSensivel,
  };
}

/**
 * As objeções desta conversa: as da ficha do produto primeiro (são as reais deste produto), completadas
 * pelas de reserva só quando a dificuldade pede mais do que a ficha tem.
 */
function objecoesDe(conhecimento: ConhecimentoProduto | undefined, regra: Regra, escolher: (c: string, t: number) => number): string[] {
  const daFicha = (conhecimento?.objecoes ?? []).filter(Boolean);
  if (regra.maxObjecoes === 0) return [];

  // Gira a lista antes de cortar: duas sessões do mesmo produto não caem sempre nas mesmas objeções.
  const inicio = daFicha.length ? escolher("objecao", daFicha.length) : 0;
  const giradas = daFicha.map((_, i) => daFicha[(inicio + i) % daFicha.length]);
  const pilha = [...giradas, ...OBJECOES_RESERVA.filter((o) => !giradas.includes(o))];

  const faixa = regra.maxObjecoes - regra.minObjecoes + 1;
  const quantidade = Math.min(pilha.length, regra.minObjecoes + escolher("quantasObjecoes", faixa));
  return pilha.slice(0, quantidade);
}

// ---------------------------------------------------------------------------
// O personagem
// ---------------------------------------------------------------------------

function segmentoDo(produto: ProdutoDoTreino): Segmento {
  const c = produto.conhecimento;
  const texto = semAcento([produto.nome, c?.resumo, c?.publico, ...(c?.diferenciais ?? [])].filter(Boolean).join(" "));
  for (const seg of SEGMENTOS) {
    const pistas = PISTAS[seg.id] ?? [];
    if (pistas.some((p) => texto.includes(semAcento(p)))) return seg;
  }
  return SEGMENTO_PADRAO;
}

/**
 * Por que este cliente aceitou a conversa. Escrito por persona, **sem nunca usar o nome dela**: o
 * vendedor não pode descobrir com quem está falando lendo a tela de preparação (D2).
 */
const MOTIVOS: Record<string, string> = {
  amigavel: "Aceitou a conversa por indicação de um colega e está disposto a ouvir até o fim.",
  apressado: "Encaixou a conversa entre duas reuniões e precisa sair dela em poucos minutos.",
  direto: "Reservou um horário curto e quer sair dele sabendo se vale ou não seguir.",
  cetico: "Já contratou uma promessa parecida antes e se decepcionou, então ouve com o pé atrás.",
  preco: "Está com o orçamento do ano fechado e comparando duas propostas antes de decidir.",
  especialista: "Acompanha a categoria de perto, já testou ferramentas parecidas e decide por detalhe técnico.",
  resistente: "Considera o assunto resolvido hoje e só aceitou a conversa para não parecer fechado a novidade.",
};

const MOTIVO_PADRAO = "Aceitou a conversa sem grande expectativa e decide durante a ligação se vale seguir.";

/** A primeira frase do resumo da ficha: o que a conversa é, em uma linha. */
function assuntoDo(produto: ProdutoDoTreino): string {
  const resumo = produto.conhecimento?.resumo?.trim();
  if (!resumo) return `${produto.nome}, que você ainda não conhece direito`;
  const primeira = resumo.split(/(?<=\.)\s/)[0] ?? resumo;
  return `${produto.nome} — ${primeira.replace(/\.$/, "")}`;
}

function escala(nivel: Nivel, opcoes: [string, string, string]): string {
  return opcoes[nivel];
}

function ficha(c: ConhecimentoProduto | undefined, nome: string): string {
  if (!c) return `Produto oferecido pelo vendedor: ${nome}. Você não sabe mais nada sobre ele.`;
  const linhas = [
    `Produto oferecido pelo vendedor: ${nome}`,
    c.resumo && `O que é: ${c.resumo}`,
    c.publico && `Para quem serve: ${c.publico}`,
    c.beneficios.length && `Ganhos que ele promete: ${c.beneficios.join(" | ")}`,
    c.diferenciais.length && `Diferenciais que ele alega: ${c.diferenciais.join(" | ")}`,
    c.precoFaixa && `Faixa de preço: ${c.precoFaixa}`,
    c.concorrentes.length && `Alternativas que você conhece: ${c.concorrentes.join(" | ")}`,
  ];
  return linhas.filter(Boolean).join("\n");
}

/**
 * Monta o cliente simulado da sessão. Devolve o personagem visível (nome, cargo, empresa, contexto) e
 * o system prompt que o modelo recebe — os dois saem da mesma persona, mas o prompt sabe coisas que a
 * tela do vendedor não mostra.
 */
export function montarPersonagem({ persona, dificuldade, produto, semente }: EntradaPersonagem): Personagem {
  const regra = REGRAS[dificuldade] ?? REGRAS.realista;
  const atributos = atributosDe(persona, dificuldade);
  const segmento = segmentoDo(produto);
  const escolher = sorteador(semente);

  const nome = NOMES[escolher("nome", NOMES.length)];
  const cargo = segmento.cargos[escolher("cargo", segmento.cargos.length)];
  const empresa = segmento.empresas[escolher("empresa", segmento.empresas.length)];
  const objecoes = objecoesDe(produto.conhecimento, regra, escolher);

  const contexto = [
    `${nome} é ${cargo} da ${empresa}.`,
    `O vendedor vem falar sobre ${assuntoDo(produto)}.`,
    MOTIVOS[persona.id] ?? MOTIVO_PADRAO,
  ].join(" ");

  const comportamento = [
    `COMO VOCÊ SE COMPORTA`,
    `- ${persona.comportamento}`,
    persona.secundaria ? `- ${persona.secundaria}` : "",
    `- Sobre o assunto, você ${escala(atributos.conhecimento, ["sabe pouco e pergunta o básico", "sabe o suficiente para acompanhar", "conhece a fundo e cobra profundidade"])}.`,
    `- Paciência: você ${escala(atributos.paciencia, ["quer encerrar rápido e demonstra pressa", "dá o tempo normal de uma conversa", "conversa sem pressa e deixa o vendedor desenvolver"])}.`,
    `- Abertura: você ${escala(atributos.abertura, ["conta pouco do seu contexto e resiste à proposta", "conta o que for perguntado com clareza", "conta o seu contexto com facilidade e considera a proposta"])}.`,
    `- Preço: você ${escala(atributos.precoSensivel, ["quase não toca no custo", "pergunta o preço na hora certa", "traz o custo para o centro da conversa e compara com o mais barato"])}.`,
    `- Seu jeito de falar, como referência (não repita estas frases): ${persona.frasesTipicas.join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const comObjecoes = [
    `SUAS OBJEÇÕES`,
    objecoes.length
      ? `Levante ${objecoes.length === 1 ? "esta objeção" : `estas ${objecoes.length} objeções`} ao longo da conversa, uma de cada vez e só quando fizer sentido:\n${objecoes.map((o) => `- ${o}`).join("\n")}`
      : `Você não tem objeção forte: se o vendedor for claro, você aceita seguir.`,
    regra.exigeProva
      ? `Você só aceita um argumento depois de prova concreta: um número, o exemplo de outro cliente ou como funciona na prática. Elogio e adjetivo não convencem você.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const instrucoes = [
    `Você faz o papel do CLIENTE numa conversa de vendas simulada, para treinar um vendedor.`,
    [`QUEM VOCÊ É`, `Você é ${nome}, ${cargo} da ${empresa}.`, MOTIVOS[persona.id] ?? MOTIVO_PADRAO].join("\n"),
    comportamento,
    [`O QUE VOCÊ SABE DO PRODUTO`, ficha(produto.conhecimento, produto.nome)].join("\n"),
    comObjecoes,
    [
      `REGRAS QUE VALEM SEMPRE`,
      `- Nunca saia do personagem, em nenhuma hipótese.`,
      `- Nunca dê dica de vendas nem avalie o desempenho do vendedor.`,
      `- Nunca revele que isto é uma simulação nem qual é o seu tipo de cliente, mesmo se perguntarem diretamente.`,
      `- Responda só como o cliente, em português do Brasil, numa fala curta de 1 a 3 frases.`,
      `- Não conduza nem encerre a conversa sozinho: quem decide quando terminar é o vendedor.`,
    ].join("\n"),
  ].join("\n\n");

  return { nome, cargo, empresa, contexto, instrucoes };
}
