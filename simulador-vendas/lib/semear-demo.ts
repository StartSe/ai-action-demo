import { getConfig } from "./store";
// A semeadura do modo demonstração (US-030): o app nasce cheio.
//
// Quem abre este app pela primeira vez para decidir se vale a pena é um executivo, não um
// desenvolvedor: ele precisa ver o painel com números, a evolução com forma e um link que abre uma
// conversa de verdade **antes** de conectar qualquer chave de IA. Uma instalação vazia mostra três
// estados vazios e não prova nada.
//
// Por que não em `lib/demo.ts` (onde mora o resto do conteúdo de demonstração): aquele arquivo está no
// fundo do grafo de imports — `lib/analise.ts`, `lib/avaliacao.ts` e `lib/conversa-sessao.ts` o
// importam —, e semear precisa justamente da avaliação e da gravação no histórico. Importar de volta
// fecharia um ciclo. Então `lib/demo.ts` continua sendo o conteúdo e este módulo é a semeadura; quem
// tira o exemplo de cena depois é `lib/exemplos.ts`, que não importa nenhum dos dois.
//
// Três regras que valem para tudo aqui:
//
//  1. **Só semeia em banco virgem e sem IA conectada.** Com a IA ligada, quem instalou já decidiu usar
//     o app de verdade, e número inventado no painel dele seria mentira.
//  2. **Idempotente por construção**, como a migração de `lib/banco.ts`: todo id é fixo e derivado, e
//     a existência de qualquer conversa de exemplo já barra a segunda execução.
//  3. **A avaliação passa pelas mesmas regras de uma de verdade** (`montarAvaliacao`): a nota geral é
//     a média dos critérios calculada no código e cada evidência é um trecho literal da conversa
//     semeada. Um atalho aqui deixaria a tela da demonstração diferente da tela real.
import { aiEnabled, meta, modelName } from "./ai";
import { salvarResultado } from "./analise";
import { contextoDe, montarAvaliacao, type AvaliacaoBruta } from "./avaliacao";
import { agora, banco, PRODUTO_EXEMPLO } from "./banco";
import { temSessoesDeExemplo } from "./exemplos";
import { criteriosDe, type Grupo } from "./metodologias";
import { adjetivosDoCliente, persona as obterPersona, PERSONAS_IDS } from "./personas";
import { atualizar as atualizarProduto, type ConhecimentoProduto } from "./produtos";
import { registrarResultado } from "./sessoes";
import { obter as obterSimulacao, type Dificuldade, type Metodologia } from "./simulacoes";
import type { Conversa, LinhaTranscricao } from "./types";

// ---------------------------------------------------------------------------------------------
// O conteúdo: um produto, dois treinos, três pessoas, duas conversas e seis sessões
// ---------------------------------------------------------------------------------------------

const NOME_PRODUTO = "Atlas Gestão";

/** A ficha pronta do produto de exemplo — o mesmo formato que a IA gera a partir do material (US-006),
 * porque é ela (e só ela) que alimenta o cliente simulado e o avaliador. */
const FICHA: ConhecimentoProduto = {
  resumo:
    "Sistema que reúne pedidos, estoque e financeiro em um lugar só, para empresas de médio porte que hoje controlam isso em planilhas separadas.",
  publico: "Diretor ou gerente de operações de empresa com 50 a 500 pessoas e vários sistemas que não conversam entre si.",
  beneficios: [
    "Fechamento do mês em duas horas, no lugar de dois dias de conferência",
    "Um número só de estoque, igual para quem vende e para quem compra",
    "Relatório pronto para a reunião de diretoria, sem montar planilha",
  ],
  diferenciais: [
    "Implantação acompanhada em 30 dias, junto com o time do cliente",
    "Funciona no celular, para quem passa o dia na rua",
    "Preço por empresa, não por pessoa que usa",
  ],
  objecoes: [
    "Já temos um sistema e trocar no meio do ano dá trabalho",
    "O time não vai usar",
    "Está fora do orçamento deste ano",
    "Precisa conversar com o que a gente já usa",
  ],
  precoFaixa: "A partir de R$ 2.400 por mês, por empresa",
  concorrentes: ["Planilhas e controles próprios", "Sistemas de gestão tradicionais"],
};

type SimulacaoDeExemplo = {
  codigo: string;
  nome: string;
  objetivo: string;
  metodologia: Metodologia;
  dificuldade: Dificuldade;
  duracaoMin: number;
};

/** Os dois treinos: o primeiro contato pelo método de perguntas e a renovação difícil pela consultiva.
 * Dois, e não um, para a aba "Personas" e a lista de Resultados terem com o que comparar. */
const SIMULACOES: SimulacaoDeExemplo[] = [
  {
    codigo: "exemplo-primeiro-contato",
    nome: "Primeiro contato com quem nunca ouviu falar",
    objetivo: "Entender como o cliente resolve isso hoje e sair com uma segunda conversa marcada.",
    metodologia: "spin",
    dificuldade: "realista",
    duracaoMin: 10,
  },
  {
    codigo: "exemplo-renovacao",
    nome: "Renovação em risco com cliente exigente",
    objetivo: "Descobrir por que o uso caiu e propor um plano concreto antes de falar de preço.",
    metodologia: "consultiva",
    dificuldade: "dificil",
    duracaoMin: 12,
  },
];

type PessoaDeExemplo = { id: string; nome: string; email: string };

const PESSOAS: PessoaDeExemplo[] = [
  { id: "exemplo-ana", nome: "Ana Ribeiro", email: "ana.ribeiro@exemplo.com" },
  { id: "exemplo-bruno", nome: "Bruno Tavares", email: "bruno.tavares@exemplo.com" },
  { id: "exemplo-marina", nome: "Marina Lopes", email: "marina.lopes@exemplo.com" },
];

/**
 * As duas conversas semeadas, uma por treino.
 *
 * **Nenhuma fala diz o nome do cliente nem o do vendedor.** O nome do cliente simulado é sorteado a
 * partir do id da sessão (`lib/cliente-simulado.ts`) e o do vendedor muda a cada sessão; uma conversa
 * que chamasse alguém pelo nome contradiria a tela em cinco das seis sessões. É também o que permite
 * reaproveitar a mesma conversa em sessões de pessoas e tipos de cliente diferentes: o que varia entre
 * elas é a avaliação, que é o que o painel compara.
 */
const CONVERSAS: Record<string, LinhaTranscricao[]> = {
  "exemplo-primeiro-contato": [
    { papel: "vendedor", texto: "Obrigado por atender. Antes de eu falar qualquer coisa: como vocês controlam pedidos e estoque hoje?", segundo: 0 },
    { papel: "cliente", texto: "Oi. A gente usa uma planilha compartilhada e o sistema do financeiro, que não conversa com ela.", segundo: 11 },
    { papel: "vendedor", texto: "Entendi. E quando o número da planilha e o do financeiro discordam, o que acontece na prática?", segundo: 24 },
    { papel: "cliente", texto: "Aí alguém para tudo para conferir. No fechamento do mês isso toma uns dois dias do time.", segundo: 38 },
    { papel: "vendedor", texto: "Dois dias por mês. Isso já fez vocês perderem venda ou prometerem um prazo que não deu para cumprir?", segundo: 52 },
    { papel: "cliente", texto: "Já. Vendemos o que não tinha em estoque duas vezes neste ano e tivemos que ligar pedindo desculpa.", segundo: 70 },
    {
      papel: "vendedor",
      texto: "É esse retrabalho que a gente tira da frente: um número só de estoque, que quem vende e quem compra lê junto. Se o fechamento caísse de dois dias para duas horas, o que o seu time faria com esse tempo?",
      segundo: 88,
    },
    { papel: "cliente", texto: "Ajudaria, mas já ouvi promessa parecida antes. Trocar de sistema no meio do ano dá trabalho.", segundo: 112 },
    {
      papel: "vendedor",
      texto: "Faz sentido, e é por isso que a implantação é acompanhada em 30 dias, junto com o seu time, sem parar o que já funciona. Posso te mandar como foi numa distribuidora do seu tamanho e marcar 30 minutos na semana que vem?",
      segundo: 130,
    },
    { papel: "cliente", texto: "Pode mandar. Se fizer sentido no papel, eu marco com você.", segundo: 156 },
  ],
  "exemplo-renovacao": [
    {
      papel: "vendedor",
      texto: "Obrigado pelo tempo. Antes de falar da renovação, queria entender como o time tem usado o sistema nos últimos meses.",
      segundo: 0,
    },
    { papel: "cliente", texto: "Para ser sincero, caiu bastante. Metade do time voltou para a planilha.", segundo: 13 },
    { papel: "vendedor", texto: "Isso é importante. Voltou porque alguma coisa ficou difícil ou porque a rotina de vocês mudou?", segundo: 27 },
    { papel: "cliente", texto: "As duas. A gente configurou do jeito que veio e ninguém teve tempo de ajustar depois.", segundo: 42 },
    { papel: "vendedor", texto: "Entendi. E o que isso custa hoje para vocês, com metade do time trabalhando em dois lugares diferentes?", segundo: 58 },
    { papel: "cliente", texto: "O fechamento voltou a atrasar. E eu preciso justificar esse gasto de novo para a diretoria.", segundo: 76 },
    {
      papel: "vendedor",
      texto: "Justo. Então deixa eu propor o seguinte: quatro encontros de ajuste com o seu time nas próximas seis semanas, focados só no que vocês usam de verdade, sem custo a mais. Se o uso não voltar, a conversa é outra.",
      segundo: 95,
    },
    { papel: "cliente", texto: "Isso ajuda. Mas eu preciso de número, não de promessa: quanto o uso subiu em quem fez isso?", segundo: 124 },
    {
      papel: "vendedor",
      texto: "Em quem fez os quatro encontros, o uso diário dobrou em dois meses. Mando o caso por escrito hoje, com as datas propostas, no formato que você leva para a diretoria. Consigo agendar o primeiro para a semana que vem?",
      segundo: 146,
    },
    { papel: "cliente", texto: "Manda que eu confirmo com o time. Se as datas couberem, começamos.", segundo: 172 },
  ],
};

type SessaoDeExemplo = {
  id: string;
  simulacao: string;
  pessoa: string;
  personaId: string;
  /** Há quantos dias a conversa aconteceu. Quatro meses de distância entre a primeira e a última. */
  diasAtras: number;
  /** A nota geral que a avaliação semeada deve fechar, entre 6,4 e 9,1. */
  nota: number;
  modo: "voz-navegador" | "texto";
  duracaoSeg: number;
};

/**
 * As seis conversas: cinco tipos de cliente, quatro meses e duas pessoas que evoluem.
 *
 * A ordem no tempo importa mais que a variedade: Ana vai de 6,4 a 9,1 e Bruno de 7,0 a 8,6, então a
 * evolução mês a mês (US-025) tem subida de verdade para mostrar.
 *
 * As distâncias (4, 12, 38, 45, 66 e 100 dias) não são redondas de propósito. Elas resolvem três
 * coisas ao mesmo tempo: quatro meses diferentes na linha do tempo, dois ou três meses por pessoa (com
 * menos de dois a evolução não desenha nada) e, no treino mais movimentado, conversa **nos últimos 30
 * dias e nos 30 anteriores** — sem as duas janelas, o quarto número do painel e a variação do Início
 * abrem escrito "sem base para comparar", que é justamente o que a demonstração não pode mostrar.
 */
const SESSOES: SessaoDeExemplo[] = [
  { id: "exemplo-s1", simulacao: "exemplo-primeiro-contato", pessoa: "exemplo-ana", personaId: "apressado", diasAtras: 100, nota: 6.4, modo: "voz-navegador", duracaoSeg: 486 },
  { id: "exemplo-s2", simulacao: "exemplo-primeiro-contato", pessoa: "exemplo-bruno", personaId: "cetico", diasAtras: 45, nota: 7, modo: "voz-navegador", duracaoSeg: 512 },
  { id: "exemplo-s3", simulacao: "exemplo-renovacao", pessoa: "exemplo-marina", personaId: "preco", diasAtras: 66, nota: 7.3, modo: "voz-navegador", duracaoSeg: 604 },
  { id: "exemplo-s4", simulacao: "exemplo-renovacao", pessoa: "exemplo-ana", personaId: "resistente", diasAtras: 38, nota: 8.2, modo: "voz-navegador", duracaoSeg: 651 },
  { id: "exemplo-s5", simulacao: "exemplo-primeiro-contato", pessoa: "exemplo-bruno", personaId: "especialista", diasAtras: 12, nota: 8.6, modo: "texto", duracaoSeg: 448 },
  { id: "exemplo-s6", simulacao: "exemplo-primeiro-contato", pessoa: "exemplo-ana", personaId: "cetico", diasAtras: 4, nota: 9.1, modo: "voz-navegador", duracaoSeg: 573 },
];

// ---------------------------------------------------------------------------------------------
// A avaliação semeada
// ---------------------------------------------------------------------------------------------

/** O que fazer diferente, por momento da conversa. Escrito por grupo (e não por critério) porque é
 * assim que o conselho continua verdadeiro nas duas metodologias, que têm critérios diferentes. */
const COMO_MELHORAR: Record<Grupo, string> = {
  Descoberta:
    "Pergunte quanto o problema custa hoje — em horas, em dinheiro, em retrabalho — antes de falar da solução: quem mede o próprio problema aceita melhor a proposta.",
  "Proposta de valor":
    "Ligue cada ganho ao que o cliente acabou de contar e traga um número de outro cliente parecido, em vez de uma promessa.",
  Objeções: "Antes de responder à objeção, pergunte o que está por trás dela: responder rápido resolve a frase, não a dúvida.",
  Fechamento: "Sugira data e hora no fim da conversa, em vez de deixar o próximo passo no “me manda que eu vejo”.",
};

const OPORTUNIDADES: Record<Grupo, { oQueAconteceu: string; oQueFazer: string; fraseSugerida: string }> = {
  Descoberta: {
    oQueAconteceu: "A proposta apareceu antes de o cliente dizer, com as palavras dele, o tamanho do problema de hoje.",
    oQueFazer: "Segure a proposta até o cliente medir o custo do problema. Quem descreve o prejuízo aceita melhor a solução.",
    fraseSugerida: "Antes de eu te mostrar como resolvemos isso: quanto tempo o seu time perde com isso num mês comum?",
  },
  "Proposta de valor": {
    oQueAconteceu: "O ganho foi apresentado como característica do produto, não como o efeito no dia a dia de quem estava do outro lado.",
    oQueFazer: "Traduza cada ganho no que muda na rotina do cliente e prove com um caso parecido, com número.",
    fraseSugerida: "Numa empresa do seu tamanho, isso cortou o fechamento de dois dias para duas horas. Faria diferença aí?",
  },
  Objeções: {
    oQueAconteceu: "A objeção foi respondida na hora, sem descobrir o que estava por trás dela.",
    oQueFazer: "Devolva uma pergunta antes da resposta: a objeção dita em voz alta quase nunca é a real.",
    fraseSugerida: "Quando você diz que dá trabalho trocar, o que mais te preocupa: o tempo do time ou parar o que já funciona?",
  },
  Fechamento: {
    oQueAconteceu: "A conversa terminou com um “me manda por escrito” em vez de um compromisso com data.",
    oQueFazer: "Proponha o próximo passo com dia e hora, e confirme ali mesmo quem participa.",
    fraseSugerida: "Eu te mando hoje o resumo por escrito. Terça às 10h, 30 minutos, com você e quem cuida do estoque: fecha?",
  },
};

const PONTOS_FORTES: string[][] = [
  [
    "Começou pelo que o cliente vive hoje, sem falar do produto na primeira frase.",
    "Usou as palavras do próprio cliente para aprofundar a pergunta seguinte.",
    "Saiu da conversa com um próximo passo, em vez de deixá-la em aberto.",
  ],
  [
    "Levantou o custo do problema antes de apresentar qualquer solução.",
    "Respondeu à objeção com um plano concreto, não com desconto.",
    "Manteve o ritmo do cliente, sem atropelar a fala dele.",
  ],
];

/** Desvios em torno da nota alvo, para os critérios não ficarem todos com o mesmo número — o painel
 * ordena as competências da mais fraca para a mais forte e precisa de diferença para dizer algo. */
const DESVIOS = [-0.6, 0.5, -0.3, 0.7, -0.5, 0.2, 0.4, -0.7, 0.3];

function umaCasa(n: number): number {
  return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

/**
 * `quantos` notas cujo **média** é a nota alvo: as primeiras saem do padrão de desvios e a última
 * absorve a sobra. A média é calculada por `montarAvaliacao`, nunca escrita à mão — é a mesma conta de
 * uma avaliação de verdade, então o número do painel e o do feedback não podem discordar.
 */
function notasComMedia(alvo: number, quantos: number, giro: number): number[] {
  const notas: number[] = [];
  for (let i = 0; i < quantos - 1; i++) notas.push(umaCasa(alvo + DESVIOS[(i + giro) % DESVIOS.length]));
  const soma = notas.reduce((a, b) => a + b, 0);
  notas.push(umaCasa(alvo * quantos - soma));
  return notas;
}

/** A avaliação crua de uma conversa semeada, no mesmo formato em que a IA responde. */
function avaliacaoSemeada({
  criterios,
  transcricao,
  alvo,
  giro,
}: {
  criterios: { nome: string; grupo: Grupo }[];
  transcricao: LinhaTranscricao[];
  alvo: number;
  giro: number;
}): AvaliacaoBruta {
  const falas = transcricao.filter((l) => l.papel === "vendedor").map((l) => l.texto);
  const notas = notasComMedia(alvo, criterios.length, giro);

  const avaliados = criterios.map((c, i) => ({
    nota: notas[i],
    // Citação literal de uma fala do vendedor: é o que faz a conferência de evidência de
    // `montarAvaliacao` aprovar o trecho, a mesma que uma avaliação de verdade passa.
    evidencia: `"${falas[(i + giro) % falas.length]}"`,
    comoMelhorar: COMO_MELHORAR[c.grupo],
  }));

  const maisFraco = avaliados.reduce((pior, c, i) => (c.nota < avaliados[pior].nota ? i : pior), 0);
  const grupoDoMaisFraco = criterios[maisFraco].grupo;

  return {
    criterios: avaliados,
    pontosFortes: PONTOS_FORTES[giro % PONTOS_FORTES.length],
    oportunidade: { criterio: criterios[maisFraco].nome, ...OPORTUNIDADES[grupoDoMaisFraco] },
    resumo: "",
  };
}

const ONDE_PESOU: Record<Grupo, string> = {
  Descoberta: "faltou medir o problema antes de propor",
  "Proposta de valor": "o ganho ficou em promessa, sem número",
  Objeções: "a objeção foi respondida antes de ser entendida",
  Fechamento: "o próximo passo ficou sem data",
};

/** Como a conversa foi, em uma frase. Três aberturas giradas pela sessão: seis resumos idênticos numa
 * lista de seis conversas fariam a demonstração parecer uma tela de teste, não um painel. */
const ABERTURAS = [
  "Conversa conduzida até o fim, com boa escuta e a objeção enfrentada de frente",
  "Conversa firme, com perguntas encadeadas e um próximo passo combinado",
  "Conversa em ritmo bom, com o problema levantado antes de qualquer proposta",
];

/** O resumo da conversa, em uma frase que diz como ela foi e com que tipo de cliente. */
function resumoDe(personaId: string, dificuldade: Dificuldade, grupoFraco: Grupo, giro: number): string {
  const p = obterPersona(personaId);
  const cliente = p ? adjetivosDoCliente(p, dificuldade) : "comum";
  return `${ABERTURAS[giro % ABERTURAS.length]} com um cliente ${cliente}. O que mais pesou na nota: ${ONDE_PESOU[grupoFraco]}.`;
}

// ---------------------------------------------------------------------------------------------
// A semeadura
// ---------------------------------------------------------------------------------------------

const INSUMO = "a conversa gravada do treino, a ficha do produto e os critérios da metodologia";

function emISO(diasAtras: number, segundosDepois = 0): string {
  return new Date(Date.now() - diasAtras * 86400000 + segundosDepois * 1000).toISOString();
}

/**
 * O banco está virgem?
 *
 * Nenhuma conversa, nenhum produto de verdade, nenhum treino de verdade e nenhum material ensinado ao
 * app. Qualquer um desses significa que alguém já usou a instalação — e dado de exemplo entrando no
 * meio do que a pessoa criou é pior que estado vazio.
 */
function bancoVirgem(): boolean {
  const d = banco();
  const conta = (consulta: string) => Number((d.prepare(consulta).get() as { total: number }).total);
  if (conta("SELECT COUNT(*) AS total FROM sessoes_treino")) return false;
  if (conta("SELECT COUNT(*) AS total FROM produtos WHERE exemplo = 0")) return false;
  if (conta("SELECT COUNT(*) AS total FROM simulacoes WHERE exemplo = 0")) return false;
  if (conta("SELECT COUNT(*) AS total FROM fontes_produto")) return false;
  // Ficha preenchida no produto de exemplo: ou já semeamos, ou alguém a escreveu à mão.
  if (conta("SELECT COUNT(*) AS total FROM produtos WHERE exemplo = 1 AND conhecimento IS NOT NULL")) return false;
  return true;
}

function semearEstrutura(): void {
  const d = banco();
  const momento = agora();

  // O produto de exemplo já existe desde a migração (id fixo em lib/banco.ts); o que a demonstração
  // acrescenta é a ficha pronta, sem a qual o cliente simulado não sabe o que está sendo vendido.
  d.prepare(
    `INSERT OR IGNORE INTO produtos (id, nome, descricao, categoria, conhecimento, status, exemplo, criadoEm, atualizadoEm)
     VALUES (?, ?, NULL, 'Software', NULL, 'rascunho', 1, ?, ?)`,
  ).run(PRODUTO_EXEMPLO, NOME_PRODUTO, emISO(120), momento);
  atualizarProduto(PRODUTO_EXEMPLO, {
    nome: NOME_PRODUTO,
    descricao: "Um produto de mentira, com a ficha já pronta, para você ver o app funcionando antes de cadastrar o seu.",
    categoria: "Software",
    status: "pronto",
    conhecimento: FICHA,
  });

  const inserirSimulacao = d.prepare(
    `INSERT OR IGNORE INTO simulacoes
       (codigo, produtoId, nome, objetivo, metodologia, criteriosPersonalizados, dificuldade, modoPersona,
        personas, maxTentativas, mostrarFeedback, permiteTexto, permiteVoz, duracaoMin, status, exemplo, criadoEm)
     VALUES (?, ?, ?, ?, ?, NULL, ?, 'aleatoria', ?, 3, 1, 1, 1, ?, 'ativa', 1, ?)`,
  );
  for (const s of SIMULACOES) {
    inserirSimulacao.run(s.codigo, PRODUTO_EXEMPLO, s.nome, s.objetivo, s.metodologia, s.dificuldade, JSON.stringify(PERSONAS_IDS), s.duracaoMin, emISO(110));
  }

  const inserirPessoa = d.prepare(
    "INSERT OR IGNORE INTO participantes (id, nome, email, origem, equipe, exemplo, criadoEm) VALUES (?, ?, ?, 'link', NULL, 1, ?)",
  );
  for (const p of PESSOAS) inserirPessoa.run(p.id, p.nome, p.email, emISO(105));

  const inserirSessao = d.prepare(
    `INSERT OR IGNORE INTO sessoes_treino
       (id, simulacaoCodigo, participanteId, personaId, modo, status, iniciadaEm, encerradaEm, duracaoSeg, resultadoId, exemplo, criadoEm)
     VALUES (?, ?, ?, ?, ?, 'encerrada', ?, ?, ?, NULL, 1, ?)`,
  );
  const inserirMensagem = d.prepare(
    "INSERT OR IGNORE INTO mensagens_sessao (id, sessaoId, papel, texto, segundo, criadoEm) VALUES (?, ?, ?, ?, ?, ?)",
  );

  for (const s of SESSOES) {
    const abertura = emISO(s.diasAtras);
    const inicio = emISO(s.diasAtras, 40);
    inserirSessao.run(s.id, s.simulacao, s.pessoa, s.personaId, s.modo, inicio, emISO(s.diasAtras, 40 + s.duracaoSeg), s.duracaoSeg, abertura);
    const falas = CONVERSAS[s.simulacao] ?? [];
    falas.forEach((f, i) => {
      // Id derivado da sessão e da posição, nunca sorteado: rodar de novo cai na mesma linha e é
      // ignorado pelo `INSERT OR IGNORE`, como toda a semeadura daqui.
      inserirMensagem.run(`${s.id}-m${i + 1}`, s.id, f.papel, f.texto, f.segundo ?? null, emISO(s.diasAtras, 40 + (f.segundo ?? 0)));
    });
  }
}

/** Avalia uma conversa semeada e liga a sessão ao resultado, como faz o fim de um treino de verdade. */
function avaliarSessaoSemeada(s: SessaoDeExemplo, giro: number): void {
  const simulacao = obterSimulacao(s.simulacao);
  if (!simulacao) return;
  const pessoa = PESSOAS.find((p) => p.id === s.pessoa);
  const criterios = criteriosDe(simulacao);
  const falas = CONVERSAS[s.simulacao] ?? [];

  const bruta = avaliacaoSemeada({ criterios, transcricao: falas, alvo: s.nota, giro });
  const maisFraco = [...(bruta.criterios ?? [])].map((c, i) => ({ i, nota: c.nota ?? 0 })).sort((a, b) => a.nota - b.nota)[0];
  bruta.resumo = resumoDe(s.personaId, simulacao.dificuldade, criterios[maisFraco?.i ?? 0].grupo, giro);

  const contexto = contextoDe({ simulacao, produtoNome: NOME_PRODUTO, personaId: s.personaId, vendedor: pessoa?.nome ?? "Vendedor" });
  const avaliacao = montarAvaliacao({ criterios, bruta, falas, contexto });

  const quando = emISO(s.diasAtras, 40 + s.duracaoSeg);
  const conversa: Conversa = {
    id: s.id,
    vendedorId: s.pessoa,
    origem: s.modo === "texto" ? "texto" : "voz",
    transcricao: falas,
    duracaoSeg: s.duracaoSeg,
    criadoEm: emISO(s.diasAtras, 40),
  };

  const id = salvarResultado({
    tipo: "sessao",
    titulo: `Conversa de ${contexto.vendedor} · ${simulacao.nome}`,
    resumo: avaliacao.resumo,
    conversa,
    saida: avaliacao,
    // `geradoEm` é o fim da conversa, não o instante da semeadura: a proveniência que a tela mostra
    // tem de bater com a data da conversa que ela está exibindo.
    meta: { ...meta({ demo: true, insumo: INSUMO, model: modelName("avaliacao") }), geradoEm: quando },
  });
  registrarResultado(s.id, id);

  // O histórico grava com a data de hoje e prazo de 90 dias, que é o certo para um resultado de
  // verdade e errado para este: a conversa é de meses atrás e a demonstração não pode vencer sozinha
  // (quem a apaga é o primeiro dado real, em lib/exemplos.ts). Uma linha de correção depois da
  // gravação, para não duplicar a gravação de `salvarResultado` com outro prazo.
  banco().prepare("UPDATE resultados SET criadoEm = ?, expiraEm = NULL WHERE id = ?").run(quando, id);
}

/**
 * Semeia a demonstração, uma vez. Não lança: um app que não sobe porque o exemplo falhou é pior que um
 * app vazio — e é o que aconteceria, já que isto roda na inicialização do servidor.
 */
export function semearDemonstracao(): void {
  try {
    if (aiEnabled() || getConfig("DEMO_REMOVIDA") === "1") return;
    if (temSessoesDeExemplo()) return;
    if (!bancoVirgem()) return;

    // A estrutura vai numa transação só (e a avaliação fica fora): `salvarResultado` escreve pela
    // conexão própria de lib/historico.ts, para o mesmo arquivo, e encontraria o banco ocupado se uma
    // transação nossa estivesse aberta.
    const d = banco();
    try {
      d.exec("BEGIN");
      semearEstrutura();
      d.exec("COMMIT");
    } catch (err) {
      try {
        d.exec("ROLLBACK");
      } catch {
        // nada em curso para desfazer
      }
      throw err;
    }

    SESSOES.forEach((s, i) => avaliarSessaoSemeada(s, i));
  } catch (err) {
    console.error("Não foi possível semear a demonstração; o app segue com as telas vazias.", err);
  }
}
