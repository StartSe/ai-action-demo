// O agente avaliador de uma sessão de treino (US-018).
//
// Substitui `lib/avaliacao-sessao.ts`, que avaliava a conversa do treino com o mesmo prompt da conversa
// **real** colada no painel. Duas coisas mudam aqui, e as duas vêm de o treino saber coisas que uma
// conversa colada nunca sabe:
//
// 1. **O avaliador recebe o contexto inteiro** — a ficha do produto (US-006), a rubrica da metodologia
//    que o gestor escolheu (US-010), o tipo de cliente e a dificuldade (US-007) e a transcrição
//    gravada. Sem isso ele cobraria "apresentação de valor" sem saber que valor o produto tem, e
//    cobraria paciência de um vendedor que falou com um cliente com pressa de propósito.
// 2. **A nota é aritmética, a evidência é citação.** A nota geral e a média por grupo são calculadas
//    aqui, nunca pedidas ao modelo; e toda evidência é conferida contra a transcrição — o que não
//    aparece na conversa é descartado, com a nota mantida e um aviso no lugar do trecho.
//
// Duas portas chegam até aqui e as duas têm de produzir o mesmo resultado: a conversa que termina na
// própria tela (US-015, nível 2) e a que chega de fora pelo aviso de pós-conversa do agente
// conversacional (US-016, nível 1). A terceira é o "Tentar de novo" do gestor, quando a IA falhou.
import { planejarTreino } from "./coaching";
import type { PlanoTreino } from "./coaching-comum";
import { aiEnabled, askJSON, meta, modelName, type Meta } from "./ai";
import { salvarResultado } from "./analise";
import { avaliacaoDemo, esperar } from "./demo";
import { agruparCriterios, criteriosDe, GRUPOS, metodologia, type Criterio, type Grupo } from "./metodologias";
import { obter as obterParticipante } from "./participantes";
import { persona as obterPersona, rotulo } from "./personas";
import { obter as obterProduto, type ConhecimentoProduto } from "./produtos";
import { obter as obterSessao, registrarResultado, transcricao, type MensagemSessao } from "./sessoes";
import { obter as obterSimulacao, type Dificuldade, type Simulacao } from "./simulacoes";
import type { Conversa, LinhaTranscricao } from "./types";

// ---------------------------------------------------------------------------
// O que a avaliação devolve
// ---------------------------------------------------------------------------

export type CriterioAvaliado = {
  /** O `id` do critério em lib/metodologias.ts — é o que fica gravado e o que a US-025 compara no tempo. */
  id: string;
  nome: string;
  grupo: Grupo;
  nota: number;
  /** Trecho da própria conversa. Vazio quando o que veio não apareceu na transcrição. */
  evidencia: string;
  comoMelhorar: string;
  /** true quando a evidência foi descartada por não estar na conversa — a tela avisa em vez de citar. */
  semEvidencia: boolean;
};

/** A média de um dos quatro momentos da conversa. São os quatro números que o vendedor vê (US-019). */
export type NotaGrupo = { grupo: Grupo; nota: number; criterios: number };

/** O único ponto que mais mudaria o resultado da próxima conversa — e a frase para experimentar. */
export type Oportunidade = { criterio: string; oQueAconteceu: string; oQueFazer: string; fraseSugerida: string };

/**
 * O que a conversa foi, guardado junto da avaliação porque a avaliação sem ele não se lê: uma nota 6
 * com um cliente difícil não é a mesma coisa que uma nota 6 com um cliente amigável.
 *
 * `tipoDeCliente` mora aqui de propósito — este registro só existe **depois** da conversa, que é
 * quando a persona pode ser revelada (D2).
 */
export type ContextoAvaliacao = {
  simulacao: string;
  produto: string;
  metodologia: string;
  dificuldade: Dificuldade;
  vendedor: string;
  tipoDeCliente?: { nome: string; comportamento: string };
};

export type AvaliacaoSessao = {
  /** Média dos critérios, com uma casa decimal. **Nunca vem da IA.** */
  planoAcao?: PlanoTreino;
  notaGeral: number;
  criterios: CriterioAvaliado[];
  grupos: NotaGrupo[];
  pontosFortes: string[];
  oportunidade: Oportunidade | null;
  resumo: string;
  contexto: ContextoAvaliacao;
};

export type SessaoAvaliada = {
  demo: boolean;
  conversa: Conversa;
  avaliacao: AvaliacaoSessao;
  meta: Meta;
  id?: string;
  titulo: string;
};

/** O formato cru que o modelo (ou a demonstração) devolve, antes de a aritmética e a conferência de
 * evidência acontecerem. É o mesmo nos dois caminhos, para os dois passarem pelas mesmas regras. */
export type AvaliacaoBruta = {
  criterios?: { nota?: number; evidencia?: string; comoMelhorar?: string }[];
  pontosFortes?: string[];
  oportunidade?: { criterio?: string; oQueAconteceu?: string; oQueFazer?: string; fraseSugerida?: string };
  resumo?: string;
};

// ---------------------------------------------------------------------------
// O prompt
// ---------------------------------------------------------------------------

export const SYSTEM_AVALIACAO = `Você é um avaliador de conversas de venda que lê a transcrição de um treino e julga o desempenho do VENDEDOR (nunca o do cliente), critério por critério, na mesma ordem em que os critérios foram informados.
Regras:
- Escreva em português do Brasil, direto e específico a esta conversa, nunca genérico.
- Uma entrada por critério informado, na mesma ordem, sem acrescentar nem pular nenhum.
- Cada nota vai de 0 a 10, com uma casa decimal, e mede só aquele critério.
- A "evidencia" é uma CITAÇÃO LITERAL da transcrição, copiada palavra por palavra entre aspas duplas, seguida de uma frase curta sua explicando o que ela mostra. Copie exatamente o que está escrito: não corrija, não resuma e não invente uma fala que não está lá.
- Quando o vendedor não fez nada relacionado ao critério, devolva a "evidencia" vazia e a nota baixa que isso merece. Inventar um trecho é pior que não citar.
- "comoMelhorar" é o que fazer diferente na próxima conversa, aplicado a este caso, nunca um conselho de manual.
- "pontosFortes": até 3, o que o vendedor fez bem, cada um em uma frase.
- "oportunidade" é o ÚNICO ponto que mais mudaria o resultado da próxima conversa: "criterio" é o nome de um dos critérios informados, "oQueAconteceu" descreve o momento em que ele apareceu, "oQueFazer" diz o que fazer no lugar e "fraseSugerida" é uma frase pronta, na voz do vendedor, que ele poderia dizer numa situação assim.
- "resumo": 2 a 3 frases, no máximo 45 palavras, sobre como foi a conversa.
- NÃO devolva nota geral: ela é calculada fora, como média dos critérios.
Formato de saída (JSON):
{
  "criterios": [{"nota": 0, "evidencia": "", "comoMelhorar": ""}],
  "pontosFortes": ["..."],
  "oportunidade": {"criterio": "", "oQueAconteceu": "", "oQueFazer": "", "fraseSugerida": ""},
  "resumo": ""
}`;

const DIFICULDADES: Record<Dificuldade, string> = {
  facil: "fácil (o cliente foi paciente e aberto, com no máximo uma objeção)",
  realista: "realista (o cliente se comportou como um cliente comum do dia a dia)",
  dificil: "difícil (o cliente foi fechado, impaciente e exigiu prova antes de aceitar qualquer argumento)",
};

/** A ficha do produto, e só ela: nenhuma fonte crua de `fontes_produto` entra em prompt (D12). */
function fichaDoProduto(nome: string, c: ConhecimentoProduto | undefined): string {
  if (!c) return `Produto vendido na conversa: ${nome}. A ficha dele ainda não foi preenchida, então julgue só o que a conversa mostra.`;
  return [
    `Produto vendido na conversa: ${nome}`,
    c.resumo && `O que é: ${c.resumo}`,
    c.publico && `Para quem serve: ${c.publico}`,
    c.beneficios.length && `Benefícios: ${c.beneficios.join(" | ")}`,
    c.diferenciais.length && `Diferenciais: ${c.diferenciais.join(" | ")}`,
    c.objecoes.length && `Objeções prováveis: ${c.objecoes.join(" | ")}`,
    c.precoFaixa && `Faixa de preço: ${c.precoFaixa}`,
    c.concorrentes.length && `Concorrentes: ${c.concorrentes.join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function rubrica(criterios: Criterio[]): string {
  return agruparCriterios(criterios)
    .map((g) => `${g.grupo}:\n${g.criterios.map((c) => `- ${c.nome}: ${c.descricao}`).join("\n")}`)
    .join("\n");
}

export function transcricaoParaTexto(falas: LinhaTranscricao[]): string {
  return falas.map((f) => `${f.papel === "vendedor" ? "Vendedor" : "Cliente"}: ${f.texto}`).join("\n");
}

function montarPrompt({
  criterios,
  contexto,
  ficha,
  falas,
}: {
  criterios: Criterio[];
  contexto: ContextoAvaliacao;
  ficha: string;
  falas: LinhaTranscricao[];
}): string {
  const cliente = contexto.tipoDeCliente
    ? `O cliente desta conversa foi simulado com este comportamento: ${contexto.tipoDeCliente.comportamento} Dificuldade do treino: ${DIFICULDADES[contexto.dificuldade] ?? DIFICULDADES.realista}.`
    : `Dificuldade do treino: ${DIFICULDADES[contexto.dificuldade] ?? DIFICULDADES.realista}.`;

  return [
    ficha,
    "",
    `Método de avaliação: ${contexto.metodologia}.`,
    "Critérios, agrupados pelo momento da conversa:",
    rubrica(criterios),
    "",
    `Critérios na ordem exata em que você deve devolvê-los: ${criterios.map((c) => c.nome).join(" | ")}`,
    "",
    cliente,
    "",
    "Transcrição da conversa:",
    transcricaoParaTexto(falas),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// A aritmética e a conferência de evidência — sempre no código, nunca na IA
// ---------------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Trechos entre aspas na evidência — é o que o prompt pede que o modelo copie da conversa. */
function citacoes(evidencia: string): string[] {
  const achados = [...evidencia.matchAll(/["“”«»]([^"“”«»]+)["“”«»]/g), ...evidencia.matchAll(/['‘’]([^'‘’]{12,})['‘’]/g)];
  return achados.map((m) => m[1].trim()).filter((t) => normalizar(t).length >= 12);
}

/**
 * Um trecho está na conversa? A comparação é sobre o texto normalizado (sem acento, sem pontuação,
 * sem caixa): o modelo copia a fala e troca uma vírgula, e recusar por causa disso jogaria fora uma
 * citação boa. Trecho longo vale pelas oito primeiras palavras — quem citou duas linhas inteiras e
 * pulou uma no meio citou a conversa, não inventou uma fala.
 */
function contido(trecho: string, transcricaoNormalizada: string): boolean {
  const n = normalizar(trecho);
  if (n.length < 12) return false;
  if (transcricaoNormalizada.includes(n)) return true;
  const palavras = n.split(" ");
  if (palavras.length <= 8) return false;
  return transcricaoNormalizada.includes(palavras.slice(0, 8).join(" "));
}

/**
 * A evidência vale? Ela precisa citar a conversa: ou entre aspas (o que o prompt pede) ou sendo ela
 * própria um trecho da transcrição. Uma evidência sem nenhuma citação é opinião do modelo sobre uma
 * conversa que ele pode ter lido torto — e é exatamente o que esta história manda descartar.
 */
export function evidenciaValida(evidencia: string, transcricaoNormalizada: string): boolean {
  const texto = evidencia.trim();
  if (!texto) return false;
  const trechos = citacoes(texto);
  if (trechos.length) return trechos.every((t) => contido(t, transcricaoNormalizada));
  return contido(texto, transcricaoNormalizada);
}

function nota0a10(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

function media(notas: number[]): number {
  if (!notas.length) return 0;
  return Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10;
}

/** As médias dos quatro momentos da conversa, na ordem de `GRUPOS`, sem os que a rubrica não cobre. */
export function mediasPorGrupo(criterios: CriterioAvaliado[]): NotaGrupo[] {
  return GRUPOS.map((grupo) => {
    const doGrupo = criterios.filter((c) => c.grupo === grupo);
    return { grupo, nota: media(doGrupo.map((c) => c.nota)), criterios: doGrupo.length };
  }).filter((g) => g.criterios > 0);
}

function oportunidadeDe(bruta: AvaliacaoBruta, criterios: CriterioAvaliado[]): Oportunidade | null {
  const o = bruta.oportunidade;
  const oQueAconteceu = String(o?.oQueAconteceu ?? "").trim();
  const oQueFazer = String(o?.oQueFazer ?? "").trim();
  if (!oQueAconteceu || !oQueFazer) return null;

  // O nome do critério é conferido contra a rubrica: o modelo às vezes devolve um critério que não
  // existe, e a tela do vendedor mostra esse nome como se fosse um dos quatro momentos dele. Quando
  // não bate, vale o critério de menor nota — que é onde a oportunidade quase sempre está.
  const pedido = normalizar(String(o?.criterio ?? ""));
  const casado = criterios.find((c) => normalizar(c.nome) === pedido);
  const maisFraco = [...criterios].sort((a, b) => a.nota - b.nota)[0];
  const criterio = casado?.nome ?? maisFraco?.nome ?? "";
  if (!criterio) return null;

  return { criterio, oQueAconteceu, oQueFazer, fraseSugerida: String(o?.fraseSugerida ?? "").trim() };
}

/**
 * Transforma o que o modelo devolveu na avaliação que fica gravada: notas presas na escala, evidências
 * conferidas contra a conversa, nota geral e médias por grupo calculadas aqui.
 *
 * Exportada porque é o coração desta história e o que o teste exercita sem gastar uma chamada de IA —
 * os dois caminhos (IA e demonstração) passam por ela.
 */
export function montarAvaliacao({
  criterios,
  bruta,
  falas,
  contexto,
}: {
  criterios: Criterio[];
  bruta: AvaliacaoBruta;
  falas: LinhaTranscricao[];
  contexto: ContextoAvaliacao;
}): AvaliacaoSessao {
  const transcricaoNormalizada = normalizar(transcricaoParaTexto(falas));

  const avaliados: CriterioAvaliado[] = criterios.map((c, i) => {
    const devolvido = bruta.criterios?.[i];
    const evidencia = String(devolvido?.evidencia ?? "").trim();
    const vale = evidencia ? evidenciaValida(evidencia, transcricaoNormalizada) : false;
    return {
      id: c.id,
      nome: c.nome,
      grupo: c.grupo,
      nota: nota0a10(devolvido?.nota),
      evidencia: vale ? evidencia : "",
      comoMelhorar: String(devolvido?.comoMelhorar ?? "").trim(),
      semEvidencia: !vale,
    };
  });

  return {
    notaGeral: media(avaliados.map((c) => c.nota)),
    criterios: avaliados,
    grupos: mediasPorGrupo(avaliados),
    pontosFortes: (bruta.pontosFortes ?? []).map((p) => String(p).trim()).filter(Boolean).slice(0, 3),
    oportunidade: oportunidadeDe(bruta, avaliados),
    resumo: String(bruta.resumo ?? "").trim(),
    contexto,
  };
}

// ---------------------------------------------------------------------------
// A avaliação de uma sessão
// ---------------------------------------------------------------------------

const INSUMO = "a conversa gravada do treino, a ficha do produto e os critérios da metodologia";

function conversaDaSessao(sessao: { id: string; participanteId: string; modo: string; duracaoSeg?: number; iniciadaEm?: string; criadoEm: string }, falas: MensagemSessao[]): Conversa {
  return {
    id: sessao.id,
    vendedorId: sessao.participanteId,
    origem: sessao.modo === "texto" ? "texto" : "voz",
    transcricao: falas.map((f) => ({ papel: f.papel, texto: f.texto, segundo: f.segundo })),
    duracaoSeg: sessao.duracaoSeg,
    criadoEm: sessao.iniciadaEm ?? sessao.criadoEm,
  };
}

/** Exportada para a semeadura da demonstração (`lib/semear-demo.ts`) montar o mesmo contexto que uma
 * avaliação de verdade grava: dois formatos de contexto seriam dois jeitos de ler a mesma tela. */
export function contextoDe({ simulacao, produtoNome, personaId, vendedor }: { simulacao: Simulacao; produtoNome: string; personaId: string; vendedor: string }): ContextoAvaliacao {
  const p = obterPersona(personaId);
  return {
    simulacao: simulacao.nome,
    produto: produtoNome,
    metodologia: metodologia(simulacao.metodologia).nome,
    dificuldade: simulacao.dificuldade,
    vendedor,
    tipoDeCliente: p ? { nome: rotulo(p), comportamento: p.comportamento } : undefined,
  };
}

/**
 * Avalia a conversa gravada da sessão, grava o resultado no histórico (`tipo: "sessao"`) e liga os dois
 * — é isso que põe a sessão em `avaliada` e cria o link do feedback.
 *
 * Devolve `null` quando não há o que avaliar: sessão que já não existe, simulação apagada, ou conversa
 * sem nenhuma fala do vendedor. Dar nota a um silêncio seria inventar um resultado.
 *
 * Quando a IA falha, a exceção sobe: a sessão fica em `encerrada` sem `resultadoId`, que é como o
 * gestor a encontra em "Avaliação pendente" e pede "Tentar de novo".
 */
export async function avaliarSessao(sessaoId: string): Promise<SessaoAvaliada | null> {
  const sessao = obterSessao(sessaoId);
  if (!sessao) return null;
  const simulacao = obterSimulacao(sessao.simulacaoCodigo);
  if (!simulacao) return null;

  const falas = transcricao(sessao.id);
  if (!falas.some((f) => f.papel === "vendedor")) return null;

  const produto = obterProduto(simulacao.produtoId);
  const participante = obterParticipante(sessao.participanteId);
  const criterios = criteriosDe(simulacao);
  const conversa = conversaDaSessao(sessao, falas);
  const contexto = contextoDe({
    simulacao,
    produtoNome: produto?.nome ?? "o produto do treino",
    personaId: sessao.personaId,
    vendedor: participante?.nome ?? "Vendedor",
  });

  let bruta: AvaliacaoBruta;
  let demo: boolean;
  /** O modelo que de fato respondeu, para a proveniência mostrada na tela não mentir. */
  let modelo: string | undefined;
  if (!aiEnabled()) {
    await esperar(1200);
    bruta = avaliacaoDemo(criterios.map((c) => c.nome), conversa.transcricao);
    demo = true;
  } else {
    // A avaliação é a tarefa que vira nota: usa o modelo que o gestor escolheu para avaliar em
    // /setup, que pode ser mais capaz (e mais caro) que o do cliente simulado, porque acontece uma
    // vez por conversa e não a cada fala. Em "Automático" é o mesmo modelo da simulação.
    modelo = modelName("avaliacao");
    bruta = await askJSON<AvaliacaoBruta>({
      system: SYSTEM_AVALIACAO,
      prompt: montarPrompt({ criterios, contexto, ficha: fichaDoProduto(produto?.nome ?? "o produto do treino", produto?.conhecimento), falas: conversa.transcricao }),
      model: modelo,
    });
    demo = false;
  }

  const avaliacao = montarAvaliacao({ criterios, bruta, falas: conversa.transcricao, contexto });
  avaliacao.planoAcao = await planejarTreino(avaliacao, conversa.transcricao, demo);
  const metaGerada = meta({ demo, insumo: INSUMO, model: modelo });
  const titulo = `Conversa de ${contexto.vendedor} · ${simulacao.nome}`;

  const id = salvarResultado({ tipo: "sessao", titulo, resumo: avaliacao.resumo, conversa, saida: avaliacao, meta: metaGerada });
  registrarResultado(sessao.id, id);

  return { demo, conversa, avaliacao, meta: metaGerada, id, titulo };
}
