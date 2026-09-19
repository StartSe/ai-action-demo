// Respostas de exemplo usadas quando não há chave de IA configurada.
import type { Cultura } from "./cultura";
import type { ValorDaEmpresa, VagaEstruturada } from "./vagas";
import type { AderenciaRequisito, BlocoRoteiro, ConsolidacaoBruta, ContextoRoteiro, CriterioCultural, CriterioTecnico, FichaBruta, ItemConsistencia, Parecer, PerguntaRoteiro, Recomendacao, Roteiro, Scorecard, SituacaoRequisito, Troca, Vaga } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRequisitos(requisitos: string | undefined) {
  return String(requisitos || "")
    .split(/\n|;/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
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

// ---------------------------------------------------------------------------------------------
// A ficha lida do currículo (US-009)
// ---------------------------------------------------------------------------------------------

/**
 * A ficha que "ler o currículo" devolve enquanto não há chave de IA.
 *
 * Os quatro candidatos da demonstração (lib/semear-demo.ts) têm a ficha escrita à mão, e é ela que
 * volta quando o nome bate: quem cadastra "Bruno Alves" de novo para ver como funciona vê a mesma
 * pessoa que já está na lista. Só a parte de origem `cv` aparece aqui — o que a ficha semeada tem de
 * `web` é obra da pesquisa (US-011/US-012), e fingir que saiu do currículo seria mentir sobre a
 * procedência, justamente o que esta tela existe para mostrar.
 *
 * Para qualquer outro nome não há exemplo escrito, e **nada é inventado**: o que volta sai do próprio
 * texto colado (as primeiras frases, as linhas de "Ferramentas:" e "Idiomas:"). Uma ficha de mentira
 * com o nome de uma pessoa de verdade seria pior que uma ficha vazia.
 */
export function fichaDemo({ nome, cvTexto }: { nome: string; cvTexto: string }): FichaBruta {
  const exemplo = FICHAS_DE_EXEMPLO[semAcento(nome)];
  return exemplo ? { ...exemplo } : fichaDoTexto(cvTexto);
}

function semAcento(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Os mesmos quatro da lista semeada, com o que o currículo deles diz — e só isso. */
const FICHAS_DE_EXEMPLO: Record<string, FichaBruta> = {
  "bruno alves": {
    resumo: "Analista de Customer Success com quatro anos em contas B2B de médio porte, vindo de suporte e implantação.",
    cargoAtual: "Analista de Customer Success",
    empresaAtual: "Órbita Software",
    anosExperiencia: 4,
    experiencias: [
      { empresa: "Órbita Software", cargo: "Analista de Customer Success", inicio: "2021", fim: "atual", descricao: "Carteira de 38 contas B2B, renovação de 92%." },
      { empresa: "Grupo Vela", cargo: "Analista de suporte", inicio: "2019", fim: "2021", descricao: "Suporte e implantação de novos clientes." },
    ],
    formacao: [{ curso: "Administração", instituicao: "Universidade de exemplo", fim: "2019" }],
    competencias: ["HubSpot", "Zendesk", "Metabase"],
    idiomas: ["Inglês intermediário"],
    disponibilidade: "30 dias",
  },
  "camila rocha": {
    resumo: "Sete anos em relacionamento e Customer Success, com passagem por coordenação de time pequeno.",
    cargoAtual: "Coordenadora de Customer Success",
    empresaAtual: "Nexo Serviços",
    cidade: "Campinas (SP)",
    anosExperiencia: 7,
    experiencias: [
      { empresa: "Nexo Serviços", cargo: "Coordenadora de Customer Success", inicio: "2021", fim: "atual", descricao: "Time de três pessoas e carteira de 60 contas." },
      { empresa: "Casa Nove", cargo: "Analista de relacionamento", inicio: "2018", fim: "2021", descricao: "Atendimento e renovação de contratos." },
    ],
    formacao: [{ curso: "Comunicação Social", instituicao: "Universidade de exemplo", fim: "2017" }],
    competencias: ["Salesforce", "Intercom"],
    idiomas: ["Inglês avançado"],
    disponibilidade: "Imediata",
  },
  "diego martins": {
    resumo: "Dois anos em atendimento a consumidor final, buscando a primeira posição em contas B2B.",
    cargoAtual: "Analista de atendimento",
    empresaAtual: "Ponte Digital",
    anosExperiencia: 2,
    experiencias: [
      { empresa: "Ponte Digital", cargo: "Analista de atendimento", inicio: "2023", fim: "atual", descricao: "Chat e telefone para consumidor final." },
    ],
    formacao: [{ curso: "Publicidade", instituicao: "Universidade de exemplo", fim: "2022" }],
    competencias: ["Zendesk"],
    idiomas: ["Inglês básico"],
    disponibilidade: "15 dias",
  },
  "fernanda lima": {
    resumo: "Três anos em Customer Success B2B, com implantação de novos clientes.",
    cargoAtual: "Analista de Customer Success",
    empresaAtual: "Ampla Tecnologia",
    anosExperiencia: 3,
    experiencias: [
      { empresa: "Ampla Tecnologia", cargo: "Analista de Customer Success", inicio: "2022", fim: "atual", descricao: "Carteira de 25 contas B2B e implantação." },
    ],
    formacao: [{ curso: "Sistemas de Informação", instituicao: "Universidade de exemplo", fim: "2021" }],
    competencias: ["HubSpot", "Looker"],
    idiomas: ["Inglês avançado"],
    disponibilidade: "30 dias",
  },
};

/** Uma etiqueta no começo da linha ("Ferramentas: HubSpot, Zendesk") e o que vem depois dela. */
function itensDaEtiqueta(texto: string, etiquetas: string[]): string[] {
  for (const etiqueta of etiquetas) {
    const achado = new RegExp(`${etiqueta}\\s*:\\s*([^\\n.]+)`, "i").exec(texto);
    if (achado) {
      return achado[1]
        .split(/[,;•|]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8);
    }
  }
  return [];
}

/**
 * O pouco que dá para tirar de um currículo sem modelo nenhum: as primeiras frases e as listas que o
 * próprio texto etiqueta. Tudo que não estiver escrito volta em branco — é a mesma regra do prompt.
 */
function fichaDoTexto(cvTexto: string): FichaBruta {
  const texto = cvTexto.replace(/\s+/g, " ").trim();
  const frases = texto.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  return {
    resumo: frases ? frases.slice(0, 400) : null,
    competencias: itensDaEtiqueta(texto, ["ferramentas", "compet[êe]ncias", "habilidades", "tecnologias"]),
    idiomas: itensDaEtiqueta(texto, ["idiomas"]),
    links: (texto.match(/https?:\/\/[^\s,;)]+/g) ?? []).slice(0, 5),
  };
}

// ---------------------------------------------------------------------------------------------
// A consolidação da pesquisa na web (US-012)
// ---------------------------------------------------------------------------------------------

/**
 * A consolidação da pesquisa na web sem IA nenhuma.
 *
 * Duas regras, as mesmas de `fichaDemo()`. Para os quatro candidatos semeados existe um perfil
 * público escrito à mão — e ele é o que torna a demonstração da D6 possível: "Bruno Alves" volta com
 * **duas** pessoas plausíveis (o analista e um advogado homônimo), que é exatamente a tela que o
 * gestor precisa ver antes de confiar numa pesquisa. Para qualquer outro nome **nada é inventado**: o
 * que volta são as páginas que a pesquisa realmente trouxe, com confiança baixa e o resumo dizendo de
 * onde vieram. Um perfil público de mentira com o nome de uma pessoa de verdade é pior que nenhum.
 */
export function fichaWebDemo({ nome, paginas }: { nome: string; paginas: { fonteId: string; url: string; titulo: string }[] }): ConsolidacaoBruta {
  const escrita = WEB_DE_EXEMPLO[semAcento(nome)];
  const fontes = paginas.map((p) => ({ fonteId: p.fonteId, resumo: `Página pública encontrada na pesquisa: ${p.titulo}. O conteúdo dela está guardado nas fontes deste candidato.` }));
  if (!escrita) {
    return {
      ficha: paginas.length ? { links: paginas.map((p) => ({ valor: p.url, confianca: 0.3, fonteId: p.fonteId })) } : {},
      fontes,
      identidadesPossiveis: [],
    };
  }
  // A primeira fonte trazida é quem sustenta os campos do exemplo: sem IA, não há como saber qual
  // página disse o quê, e apontar para a fonte errada é pior que apontar para a mais provável.
  const fonteId = paginas[0]?.fonteId;
  const comFonte = Object.fromEntries(
    Object.entries(escrita.ficha).map(([chave, valor]) => [chave, Array.isArray(valor) ? valor.map((v) => ({ ...v, fonteId })) : { ...(valor as object), fonteId }]),
  );
  return { ficha: comFonte, fontes, identidadesPossiveis: escrita.identidadesPossiveis };
}

type WebDeExemplo = { ficha: Record<string, unknown>; identidadesPossiveis: ConsolidacaoBruta["identidadesPossiveis"] };

/** O perfil público dos quatro candidatos semeados, do jeito que uma consolidação o devolveria. */
const WEB_DE_EXEMPLO: Record<string, WebDeExemplo> = {
  "bruno alves": {
    ficha: {
      cidade: { valor: "São Paulo (SP)", confianca: 0.85 },
      cargoAtual: { valor: "Analista de Customer Success", confianca: 0.9 },
      empresaAtual: { valor: "Órbita Software", confianca: 0.9 },
      competencias: [{ valor: "Acompanhamento de carteira", confianca: 0.6 }],
      links: [{ valor: "https://exemplo.com/perfil/bruno-alves", confianca: 0.8 }],
    },
    // O caso da D6: dois perfis públicos com o mesmo nome. A ficha não é mesclada até o gestor dizer
    // qual é a pessoa dele.
    identidadesPossiveis: [
      {
        nome: "Bruno Alves",
        descricao: "Analista de Customer Success na Órbita Software, em São Paulo.",
        url: "https://exemplo.com/perfil/bruno-alves",
        bate: ["Mesma empresa do currículo", "Mesmo cargo do currículo"],
        naoBate: [],
      },
      {
        nome: "Bruno Alves",
        descricao: "Advogado com escritório próprio no Recife.",
        url: "https://exemplo.com/perfil/bruno-alves-advogado",
        bate: ["Mesmo nome completo"],
        naoBate: ["Outra área de atuação", "Outra cidade", "Nenhuma empresa do currículo aparece"],
      },
    ],
  },
  "camila rocha": {
    ficha: {
      cidade: { valor: "Campinas (SP)", confianca: 0.8 },
      cargoAtual: { valor: "Analista sênior de Customer Success", confianca: 0.75 },
      empresaAtual: { valor: "Nexo Serviços", confianca: 0.85 },
      idiomas: [{ valor: "Espanhol básico", confianca: 0.6 }],
      links: [{ valor: "https://exemplo.com/perfil/camila-rocha", confianca: 0.8 }],
    },
    identidadesPossiveis: [],
  },
  "diego martins": {
    ficha: {
      cidade: { valor: "Rio de Janeiro (RJ)", confianca: 0.8 },
      cargoAtual: { valor: "Analista de atendimento", confianca: 0.85 },
      empresaAtual: { valor: "Ponte Digital", confianca: 0.85 },
      links: [{ valor: "https://exemplo.com/perfil/diego-martins", confianca: 0.75 }],
    },
    identidadesPossiveis: [],
  },
  "fernanda lima": {
    ficha: {
      cidade: { valor: "São Paulo (SP)", confianca: 0.85 },
      cargoAtual: { valor: "Analista de Customer Success", confianca: 0.9 },
      empresaAtual: { valor: "Ampla Tecnologia", confianca: 0.9 },
      links: [{ valor: "https://exemplo.com/perfil/fernanda-lima", confianca: 0.8 }],
    },
    identidadesPossiveis: [],
  },
};

// ---------------------------------------------------------------------------------------------
// O roteiro da entrevista (US-016)
// ---------------------------------------------------------------------------------------------

/**
 * Perguntas de cultura do modo demonstração.
 *
 * São situacionais e **nenhuma cita o nome do valor** que quer observar — essa é a regra inteira do
 * bloco de cultura: quem ouve "fale sobre colaboração" responde a palavra, não a própria história.
 * O nome da competência viaja em `foco`, que só o parecer lê.
 */
const CULTURAIS_DEMO = [
  "Me conta uma situação recente em que você discordou de uma decisão do time. O que você fez?",
  "Descreva um momento em que uma entrega sua dependia de outra área e as coisas não andaram. Como você conduziu?",
  "Conte sobre uma vez em que algo deu errado por uma decisão sua. O que aconteceu depois?",
];

const MODELOS_REQUISITO: ((item: string) => string)[] = [
  (item) => `Sobre ${item}: me dá um exemplo concreto de quando isso apareceu no seu trabalho?`,
  (item) => `Qual foi o desafio mais difícil que você enfrentou envolvendo ${item}, e como resolveu?`,
  (item) => `Como você avalia o seu nível hoje em ${item}? Me conta uma situação que sustente isso.`,
  (item) => `Fale sobre um resultado do qual você se orgulha relacionado a ${item}.`,
];

/** Quantas perguntas cada bloco quer, na ordem em que o orçamento é distribuído. */
type Cota = { bloco: BlocoRoteiro; minimo: number; teto: number; itens: string[] };

/**
 * Distribui o total de perguntas entre os blocos opcionais: primeiro o mínimo de cada um, na ordem;
 * depois de um em um, em rodadas, até o orçamento acabar. É o que faz uma vaga com oito perguntas e
 * outra com doze usarem o mesmo roteiro, só com mais fôlego em requisitos e cultura.
 */
function distribuir(cotas: Cota[], orcamento: number): Map<BlocoRoteiro, number> {
  const quantidade = new Map<BlocoRoteiro, number>(cotas.map((c) => [c.bloco, 0]));
  let sobra = orcamento;
  for (const cota of cotas) {
    const teto = Math.min(cota.teto, cota.itens.length);
    const quer = Math.min(cota.minimo, teto, sobra);
    quantidade.set(cota.bloco, quer);
    sobra -= quer;
  }
  let mudou = true;
  while (sobra > 0 && mudou) {
    mudou = false;
    for (const cota of cotas) {
      if (sobra <= 0) break;
      const teto = Math.min(cota.teto, cota.itens.length);
      const atual = quantidade.get(cota.bloco) as number;
      if (atual >= teto) continue;
      quantidade.set(cota.bloco, atual + 1);
      sobra--;
      mudou = true;
    }
  }
  return quantidade;
}

/**
 * O roteiro do modo demonstração: fixo, derivado da vaga, sem nenhuma chamada de modelo.
 *
 * Ele não é um enchimento — é o que a pessoa que está avaliando o app vê antes de conectar a IA, e
 * por isso traz uma pergunta de **desafio** e uma de **cultura** reconhecíveis: são as duas que
 * distinguem esta entrevistadora de um formulário de requisitos.
 */
export function roteiroDemo(ctx: ContextoRoteiro): Roteiro {
  const nome = ctx.candidato.primeiroNome;
  const perguntas: PerguntaRoteiro[] = [];

  perguntas.push({
    bloco: "abertura",
    pergunta: `${nome ? `Oi, ${nome}! ` : ""}Para começar, me conta rapidamente sobre a sua trajetória e o que te chamou atenção na vaga de ${ctx.cargo}.`,
  });

  // Abertura e encerramento são intocáveis; a pretensão só existe se a vaga pedir. O que sobra é o
  // que os blocos opcionais disputam.
  const reservadas = 2 + (ctx.perguntaPretensao ? 1 : 0);
  const orcamento = Math.max(0, ctx.numeroPerguntas - reservadas);

  const doCurriculo = ctx.candidato.aEsclarecer.length
    ? ctx.candidato.aEsclarecer
    : ctx.candidato.ficha.length
      ? ["a sua experiência mais recente"]
      : [];
  const quantidade = distribuir(
    [
      { bloco: "requisitos", minimo: 2, teto: 4, itens: ctx.requisitos },
      { bloco: "curriculo", minimo: 1, teto: 2, itens: doCurriculo },
      { bloco: "desafios", minimo: 1, teto: 2, itens: ctx.desafios },
      { bloco: "cultura", minimo: 1, teto: 2, itens: ctx.competencias.map((c) => c.nome) },
    ],
    orcamento,
  );

  for (let i = 0; i < (quantidade.get("curriculo") as number); i++) {
    const item = doCurriculo[i];
    perguntas.push({
      bloco: "curriculo",
      // "Você comentou no currículo" é permitido; citar um perfil público, nunca (D12).
      pergunta: `Você comentou no currículo sobre ${item}. Pode me contar um pouco mais sobre isso?`,
      foco: item,
    });
  }

  for (let i = 0; i < (quantidade.get("requisitos") as number); i++) {
    const item = ctx.requisitos[i];
    perguntas.push({ bloco: "requisitos", pergunta: MODELOS_REQUISITO[i % MODELOS_REQUISITO.length](item), foco: item });
  }

  for (let i = 0; i < (quantidade.get("desafios") as number); i++) {
    const item = ctx.desafios[i];
    perguntas.push({
      bloco: "desafios",
      pergunta: `Um dos desafios dos primeiros meses é ${item}. Como você atacaria isso nas primeiras semanas?`,
      foco: item,
    });
  }

  for (let i = 0; i < (quantidade.get("cultura") as number); i++) {
    perguntas.push({ bloco: "cultura", pergunta: CULTURAIS_DEMO[i % CULTURAIS_DEMO.length], foco: ctx.competencias[i]?.nome });
  }

  if (ctx.perguntaPretensao) {
    perguntas.push({
      bloco: "pretensao",
      pergunta: "Para fechar a parte prática: qual é a sua pretensão salarial e a partir de quando você poderia começar?",
    });
  }

  perguntas.push({ bloco: "encerramento", pergunta: "Antes de terminarmos, você tem alguma pergunta sobre a vaga ou sobre o processo?" });

  return { perguntas, despedida: despedidaDemo(nome), demo: true, em: new Date().toISOString() };
}

function despedidaDemo(primeiroNome: string): string {
  const saudacao = primeiroNome ? `Muito obrigada, ${primeiroNome}!` : "Muito obrigada pelo seu tempo!";
  return `${saudacao} Foi ótimo te conhecer melhor. Vou repassar essa conversa para o gestor da vaga, que entra em contato em breve com os próximos passos.`;
}

/** O pedido de exemplo concreto, quando a resposta anterior foi curta demais para sustentar nada. */
export function followUpDemo(): string {
  return "Pode detalhar com um exemplo concreto? Uma situação real ajuda bastante a entender melhor.";
}
