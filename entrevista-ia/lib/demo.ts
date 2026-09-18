// Respostas de exemplo usadas quando não há chave de IA configurada.
import type { Cultura } from "./cultura";
import type { ValorDaEmpresa, VagaEstruturada } from "./vagas";
import type { AderenciaRequisito, CriterioCultural, CriterioTecnico, ItemConsistencia, Parecer, Recomendacao, Scorecard, SituacaoRequisito, Troca, Vaga } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRequisitos(requisitos: string | undefined) {
  return String(requisitos || "")
    .split(/\n|;/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

const MODELOS: ((item: string) => string)[] = [
  (item) => `Me conta sobre uma experiência real em que você usou ${item}.`,
  (item) => `Qual foi um desafio que você enfrentou envolvendo ${item} e como você resolveu?`,
  (item) => `Como você avalia o seu nível hoje em ${item}? Me dê um exemplo concreto que sustente isso.`,
  (item) => `Fale sobre um resultado do qual você se orgulha relacionado a ${item}.`,
  (item) => `O que costuma ser mais difícil, na prática, quando o assunto é ${item}?`,
  (item) => `Me dá um exemplo de como ${item} apareceu no seu dia a dia recentemente?`,
];

// Roteiro fixo: uma pergunta de abertura, perguntas cicladas pelos requisitos informados
// (um requisito por vez, com um modelo diferente a cada volta pela lista, para não repetir a mesma
// frase para requisitos diferentes) e um follow-up simples quando a última resposta foi muito curta.
export function proximaPerguntaDemo({ vaga, historico, perguntasFeitas }: { vaga: Vaga; historico: Troca[]; perguntasFeitas: number }): string {
  if (perguntasFeitas === 0) {
    return `Para começar, me conta rapidamente sobre sua trajetória e o que te chamou atenção na vaga de ${vaga.titulo}.`;
  }
  const ultimaResposta = [...historico].reverse().find((h) => h.papel === "candidato")?.texto || "";
  const palavras = ultimaResposta.trim().split(/\s+/).filter(Boolean).length;
  if (palavras > 0 && palavras < 8) {
    return "Pode detalhar com um exemplo concreto? Uma situação real ajuda bastante a entender melhor.";
  }
  const itens = parseRequisitos(vaga.requisitos);
  const item = itens.length ? itens[(perguntasFeitas - 1) % itens.length] : "os requisitos da vaga";
  const modelo = MODELOS[(perguntasFeitas - 1) % MODELOS.length];
  return modelo(item);
}

export function mensagemEncerramento({ vaga }: { vaga?: Vaga } = {}): string {
  const nome = vaga?.candidato ? vaga.candidato.split(" ")[0] : "";
  const saudacao = nome ? `Muito obrigada, ${nome}!` : "Muito obrigada pelo seu tempo!";
  return `${saudacao} Foi ótimo te conhecer melhor. Vou repassar essa conversa para o gestor da vaga, que entra em contato em breve com os próximos passos.`;
}

/** Para cada pergunta da entrevistadora (numerada na ordem em que aparece), a resposta do candidato que a sucede. */
function paresPerguntaResposta(historico: Troca[]): { pergunta: number; resposta: string }[] {
  const pares: { pergunta: number; resposta: string }[] = [];
  let n = 0;
  historico.forEach((h, i) => {
    if (h.papel !== "entrevistadora") return;
    n++;
    const resposta = historico.slice(i + 1).find((h2) => h2.papel === "candidato");
    if (resposta) pares.push({ pergunta: n, resposta: resposta.texto });
  });
  return pares;
}

function trecho(texto: string, max = 130) {
  const limpo = texto.trim();
  return limpo.length > max ? `${limpo.slice(0, max).trim()}...` : limpo;
}

// Evidências distintas por critério: cada uma cita a resposta real do candidato à pergunta correspondente
// (a primeira pergunta, de abertura, não conta — as seguintes seguem a ordem dos requisitos da vaga).
export function scorecardDemo({ vaga, historico = [] }: { vaga?: Vaga; historico?: Troca[] } = {}): Scorecard {
  const nome = vaga?.candidato || "Candidato(a)";
  const titulo = vaga?.titulo || "a vaga";
  const itens = parseRequisitos(vaga?.requisitos);
  const base = itens.length >= 3 ? itens.slice(0, 4) : ["Comunicação", "Experiência técnica", "Adequação cultural", "Motivação"];
  const notas = [8, 7, 6.5, 8];
  const paresPorRequisito = paresPerguntaResposta(historico).slice(1);
  return {
    nota_geral: 7.4,
    resumo: `${nome} demonstrou boa aderência aos requisitos de ${titulo}, com respostas objetivas e exemplos concretos na maior parte das perguntas. Recomenda-se uma conversa com o gestor para aprofundar dois pontos específicos antes de avançar.`,
    criterios: base.map((c, i) => {
      const par = paresPorRequisito[i];
      return {
        criterio: c,
        nota: notas[i % notas.length],
        evidencia: par
          ? `Ao ser perguntado(a) sobre ${c}, respondeu: "${trecho(par.resposta)}"`
          : `Não trouxe um exemplo direto sobre ${c} durante a conversa.`,
        pergunta: par?.pergunta,
      };
    }),
    pontos_fortes: [
      "Comunicação clara e direta nas respostas.",
      "Exemplos concretos ligados aos requisitos da vaga.",
      "Demonstrou motivação genuína para a posição.",
    ],
    pontos_atencao: [
      "Pouca profundidade ao falar de resultados quantitativos.",
      "Não abordou experiência com um dos requisitos priorizados.",
    ],
    recomendacao: "avaliar com o gestor",
    proximos_passos: [
      "Aprofundar, em entrevista técnica, a experiência com o requisito menos explorado.",
      "Validar pretensão salarial e disponibilidade de início.",
      "Confirmar referências com o último gestor direto.",
    ],
  };
}

/**
 * A cultura de uma empresa de serviços B2B qualquer, usada enquanto ninguém cadastrou a da própria
 * empresa (lib/cultura.ts) e como resposta de "Gerar a partir de um texto" no modo demonstração.
 * Existe para que a entrevistadora tenha sempre o que avaliar em cultura — quem vê a tela precisa
 * entender o que esse cadastro faz antes de decidir preenchê-lo.
 *
 * `atualizadoEm` vazio de propósito: nada disso foi salvo por ninguém, e a tela não pode dizer
 * "atualizado em" sobre um exemplo.
 */
export function culturaDemo(): Cultura {
  return {
    valores: [
      { id: "cliente-no-centro", nome: "Cliente no centro", descricao: "Toda decisão começa pela pergunta do que muda para quem contrata a gente." },
      { id: "dono-do-resultado", nome: "Dono do resultado", descricao: "Quem pega um problema leva até o fim, mesmo quando depende de outra área." },
      { id: "clareza-antes-da-pressa", nome: "Clareza antes da pressa", descricao: "Combinar por escrito o que se espera antes de sair executando." },
      { id: "melhora-continua", nome: "Melhora contínua", descricao: "Cada entrega deixa um aprendizado registrado para a próxima sair melhor." },
    ],
    comportamentos:
      "As pessoas aqui trazem o problema junto com uma proposta, avisam cedo quando um prazo vai escorregar e escrevem o que combinaram. Discordar em reunião é esperado; sair da reunião sem uma decisão, não. Quem atende cliente tem autonomia para resolver na hora e responder depois pelo que decidiu.",
    naoCombina:
      "Não funciona aqui quem precisa de aprovação para cada passo, quem entrega no prazo escondendo um problema conhecido ou quem trata o time de entrega como fornecedor interno. Também não combina disputar crédito por resultado que foi de várias pessoas.",
    atualizadoEm: "",
  };
}

// ---------------------------------------------------------------------------------------------
// O parecer de exemplo (US-004, formato da US-019 da PRD)
// ---------------------------------------------------------------------------------------------

/**
 * O que o parecer de exemplo precisa saber para ser sobre ESTA conversa.
 *
 * Quem chama informa a vaga, a pessoa e a conversa; o texto é derivado daí, como `scorecardDemo` já
 * faz hoje. As poucas coisas que a conversa não revela — a nota alvo, a pretensão dita, o que bate e
 * o que não bate com o currículo — entram como parâmetro, porque é justamente o que a IA de verdade
 * traria de fora da transcrição.
 */
export type ContextoParecer = {
  cargo: string;
  candidato: string;
  /** Um requisito por linha, como está gravado na vaga. */
  requisitos: string;
  /** As competências culturais avaliadas nesta vaga, na ordem em que a vaga as lista. */
  competencias: string[];
  transcricao: Troca[];
  /** Nota alvo de 0 a 10; a média dos critérios técnicos fecha nela. */
  notaGeral: number;
  /** Quando ausente, sai da nota: a partir de 8 avança, a partir de 6,5 vai ao gestor. */
  recomendacao?: Recomendacao;
  /** Competências que a conversa não chegou a tocar: entram sem nota, como "não abordado". */
  semEvidenciaCultural?: string[];
  /** Requisitos que a conversa não sustentou, pelo texto do requisito. */
  requisitosFracos?: string[];
  consistencia?: ItemConsistencia[];
  pretensao?: { valor?: number; dentroDaFaixa?: boolean };
  parcial?: boolean;
};

/** Desvios em torno da nota alvo, para os critérios não saírem todos com o mesmo número — a tela
 * ordena do mais fraco ao mais forte e precisa de diferença para dizer alguma coisa. */
const DESVIOS_PARECER = [-0.6, 0.5, -0.3, 0.7, -0.4];

function umaCasa(n: number): number {
  return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

/** `quantos` notas cuja média é exatamente a nota alvo: a última absorve a sobra. A nota geral do
 * parecer e a média da tabela não podem discordar, nem no exemplo. */
function notasComMedia(alvo: number, quantos: number): number[] {
  const notas: number[] = [];
  for (let i = 0; i < quantos - 1; i++) notas.push(umaCasa(alvo + DESVIOS_PARECER[i % DESVIOS_PARECER.length]));
  const soma = notas.reduce((a, b) => a + b, 0);
  notas.push(umaCasa(alvo * quantos - soma));
  return notas;
}

function recomendacaoPorNota(nota: number): Recomendacao {
  if (nota >= 8) return "avançar";
  if (nota >= 6.5) return "avaliar com o gestor";
  return "não avançar";
}

const CRITERIOS_TECNICOS = [
  "Experiência na função",
  "Clareza na comunicação",
  "Resolução de problemas",
  "Resultado com números",
];

/**
 * Um parecer plausível a partir da conversa: cada evidência é um trecho literal do que o candidato
 * respondeu, e o número da pergunta de origem acompanha, como no parecer de verdade. Nada aqui é
 * inventado sobre a pessoa — o que a conversa não disser vira "não abordado".
 */
export function parecerDemo(ctx: ContextoParecer): Parecer {
  const pares = paresPerguntaResposta(ctx.transcricao);
  const daAbertura = pares.slice(1).length ? pares.slice(1) : pares;
  const citar = (i: number) => daAbertura[i % Math.max(1, daAbertura.length)];

  const itens = parseRequisitos(ctx.requisitos);
  const fracos = new Set(ctx.requisitosFracos ?? []);
  const semEvidencia = new Set(ctx.semEvidenciaCultural ?? []);
  const recomendacao = ctx.recomendacao ?? recomendacaoPorNota(ctx.notaGeral);
  const primeiroNome = ctx.candidato.split(" ")[0] || ctx.candidato;

  const aderencia: AderenciaRequisito[] = itens.map((requisito, i) => {
    const par = citar(i);
    // "Parcial" é o que sobra de uma conversa mediana; quem fechou a entrevista com nota alta não
    // ganha um requisito meio atendido só para a tela ficar variada.
    const situacao: SituacaoRequisito = !par
      ? "nao_abordado"
      : fracos.has(requisito)
        ? "nao_atende"
        : ctx.notaGeral < 8 && i % 3 === 1
          ? "parcial"
          : "atende";
    return {
      requisito,
      situacao,
      evidencia: par
        ? `Sobre ${minuscula(requisito)}, respondeu: "${trecho(par.resposta)}"`
        : "A conversa terminou antes de chegar neste ponto.",
      pergunta: par?.pergunta,
    };
  });

  const notas = notasComMedia(ctx.notaGeral, CRITERIOS_TECNICOS.length);
  const tecnico: CriterioTecnico[] = CRITERIOS_TECNICOS.map((criterio, i) => {
    const par = citar(i);
    return {
      criterio,
      nota: notas[i],
      evidencia: par ? `"${trecho(par.resposta)}"` : "Sem trecho da conversa que sustente este critério.",
      pergunta: par?.pergunta,
    };
  });

  // Nota cultural só com evidência comportamental: sem ela, `nota: null` e a frase que diz por quê.
  const cultura: CriterioCultural[] = ctx.competencias.map((competencia, i) => {
    if (semEvidencia.has(competencia)) {
      return { competencia, nota: null, evidencia: "Não apareceu nenhuma situação concreta na conversa que permitisse avaliar isto." };
    }
    const par = citar(i + 1);
    return {
      competencia,
      nota: umaCasa(ctx.notaGeral + DESVIOS_PARECER[(i + 2) % DESVIOS_PARECER.length]),
      evidencia: par ? `"${trecho(par.resposta)}"` : "Sem trecho da conversa que sustente esta competência.",
      pergunta: par?.pergunta,
    };
  });

  const maisFraco = tecnico.reduce((pior, c) => (c.nota < pior.nota ? c : pior), tecnico[0]);
  // O ponto que o gestor precisa perguntar na próxima etapa é o mais grave, não o primeiro da lista.
  const requisitoAberto =
    aderencia.find((a) => a.situacao === "nao_atende") ??
    aderencia.find((a) => a.situacao === "nao_abordado") ??
    aderencia.find((a) => a.situacao === "parcial");
  const divergente = (ctx.consistencia ?? []).find((c) => c.situacao === "divergente");

  const resumo = [
    `${primeiroNome} conversou sobre a vaga de ${ctx.cargo} e sustentou a maior parte das respostas com exemplos do próprio dia a dia.`,
    requisitoAberto
      ? `O ponto que ficou aberto foi ${minuscula(requisitoAberto.requisito)}, onde a resposta não chegou ao detalhe que a vaga pede.`
      : `Todos os requisitos apareceram na conversa com um exemplo concreto por trás.`,
    divergente
      ? `Há uma divergência entre o que foi dito e o que está registrado: ${divergente.detalhe}`
      : `Nada do que foi dito contradiz o currículo ou o perfil público.`,
  ].join(" ");

  return {
    notaGeral: umaCasa(ctx.notaGeral),
    recomendacao,
    resumo,
    aderencia,
    tecnico,
    cultura,
    consistencia: ctx.consistencia ?? [],
    pontosFortes: [
      "Respondeu com situações reais, e não com descrição de função.",
      "Comunicação direta, sem rodeio para chegar ao ponto.",
      `Demonstrou entender o que a área de ${ctx.cargo.split(" ").slice(-1)[0] || "destino"} precisa resolver no dia a dia.`,
    ],
    pontosAtencao: [
      `${maisFraco.criterio.toLowerCase()} foi o critério mais fraco da conversa.`,
      requisitoAberto ? `Falta confirmar ${minuscula(requisitoAberto.requisito)} com uma pergunta direta.` : "Vale confirmar disponibilidade de início.",
    ],
    proximaEtapa: {
      perguntas: [
        `Me conta um caso em que ${minuscula(requisitoAberto?.requisito ?? itens[0] ?? "o dia a dia da vaga")} deu errado e o que você fez.`,
        "Que número você acompanhava toda semana e o que fazia quando ele caía?",
        "Como você lidou com a última vez em que discordou do seu gestor?",
      ],
      foco: requisitoAberto
        ? `Aprofundar ${minuscula(requisitoAberto.requisito)} com o gestor da área, antes de qualquer proposta.`
        : "Confirmar pretensão, disponibilidade e referências do último gestor direto.",
    },
    pretensao: ctx.pretensao ?? {},
    parcial: ctx.parcial ?? false,
  };
}

/** Primeira letra em minúscula, para o requisito caber no meio de uma frase. */
function minuscula(texto: string): string {
  return texto ? texto.charAt(0).toLowerCase() + texto.slice(1) : texto;
}

// ---------------------------------------------------------------------------------------------
// A vaga lida de uma descrição colada (US-006)
// ---------------------------------------------------------------------------------------------

/**
 * O que "Preencher a vaga" devolve enquanto não há chave de IA: a mesma vaga de Customer Success da
 * demonstração e do "Preencher com um exemplo" da lista — quem já viu uma das duas reconhece esta.
 *
 * As competências sugeridas saem da cultura que está valendo (a da empresa, ou a de exemplo), porque
 * é exatamente isso que a versão com IA faz: cruzar a descrição com o que a empresa valoriza. Ficam
 * de fora as duas últimas, e entra uma própria da vaga — uma sugestão que marca tudo não mostraria
 * que houve escolha nenhuma.
 */
export function vagaEstruturadaDemo(daEmpresa: ValorDaEmpresa[] = []): VagaEstruturada {
  return {
    cargo: "Analista de Customer Success",
    area: "Customer Success",
    senioridade: "pleno",
    modelo: "hibrido",
    local: "São Paulo (SP)",
    salarioMin: 5500,
    salarioMax: 7000,
    salarioACombinar: false,
    desafios:
      "Assumir uma carteira de 40 contas de médio porte que hoje está sem dono fixo. Reduzir o cancelamento no primeiro ano, que fechou o último trimestre em 14%. Deixar registrado no sistema de atendimento o que hoje só existe na cabeça de quem atende.",
    requisitos: [
      "2 anos de experiência em atendimento B2B",
      "Comunicação escrita clara e objetiva",
      "Experiência com sistema de atendimento (HubSpot ou similar)",
      "Disponibilidade para viagens ocasionais a clientes",
    ].join("\n"),
    competenciasCulturais: [
      ...daEmpresa.slice(0, 2).map((v) => ({ id: v.id, nome: v.nome, descricao: v.descricao, origem: "empresa" as const })),
      { id: "firmeza-em-conversa-dificil", nome: "Firmeza em conversa difícil", descricao: "Dar uma notícia ruim ao cliente na hora certa, sem rodeio e sem prometer o que não dá.", origem: "vaga" as const },
    ],
  };
}
