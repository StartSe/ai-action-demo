// O painel de uma simulação (US-022): como o time está indo naquele treino.
//
// Tudo aqui é **cálculo puro sobre as sessões já avaliadas**, no molde de `lib/painel-equipe.ts` (que
// continua servindo a análise de conversa real colada pelo gestor). Nenhuma nota é pedida à IA: a nota
// de cada conversa já foi calculada como média dos critérios em `lib/avaliacao.ts`, e aqui ela só é
// somada. É o que permite comparar dois vendedores e dois meses — duas conversas avaliadas em dias
// diferentes continuam somando do mesmo jeito.
//
// A única coisa que a IA escreve é a **frase** da principal oportunidade do time, e ela é escrita a
// partir dos números já calculados, nunca das conversas. Sem IA (ou quando ela falha) a frase sai do
// código: o painel nunca fica sem a linha que diz o que fazer.
import { aiEnabled, askJSON, modelName } from "./ai";
import { GRUPOS, criteriosDe, metodologia, type Grupo } from "./metodologias";
import { obter as obterParticipante } from "./participantes";
import { persona, rotulo } from "./personas";
import { obter as obterProduto } from "./produtos";
import { avaliacoesDaSimulacao, listarPorSimulacao, treinosPorParticipante, type ModoSessao, type Sessao, type StatusSessao } from "./sessoes";
import { obter as obterSimulacao, type Dificuldade, type StatusSimulacao } from "./simulacoes";

const DIA_MS = 24 * 60 * 60 * 1000;
/** A mesma régua de `lib/painel-equipe.ts`: abaixo de 0,3 de diferença entre as duas janelas, a nota
 * de alguém não subiu nem caiu — variou. Uma seta para cada oscilação de uma conversa faria a coluna
 * inteira piscar e deixaria de significar coisa alguma. */
const LIMIAR_TENDENCIA = 0.3;
/** A frase da IA vale uma hora — ou até uma conversa nova chegar, o que vier primeiro. */
const VALIDADE_FRASE_MS = 60 * 60 * 1000;

/** O formato gravado por `lib/avaliacao.ts`, lido aqui sem importar aquele módulo (ele lê as sessões,
 * e o caminho de volta seria circular). Só os campos que o painel soma. */
type AvaliacaoGravada = {
  notaGeral?: unknown;
  criterios?: { id?: unknown; nome?: unknown; grupo?: unknown; nota?: unknown }[];
  oportunidade?: { criterio?: unknown } | null;
};

/** Uma competência do time: a mesma rubrica que avaliou cada conversa, agora com a média de todas. */
export type CompetenciaAgregada = { id: string; nome: string; grupo: Grupo; nota: number; avaliacoes: number };

export type Tendencia = "subindo" | "estavel" | "caindo";

/** Uma conversa de um vendedor neste treino: a linha que o gestor abre no detalhe e a linha da
 * planilha exportada. Entram todas as sessões, inclusive as que não viraram nota — uma pessoa que
 * abriu o link três vezes e nunca terminou uma conversa é exatamente o tipo de coisa que o gestor
 * precisa enxergar. */
export type ConversaDoVendedor = {
  sessaoId: string;
  personaId: string;
  /** Emoji + nome (D2): a única forma de mostrar uma persona na tela. */
  persona: string;
  modo: ModoSessao;
  status: StatusSessao;
  nota: number | null;
  duracaoSeg: number | null;
  /** Quando a conversa terminou — ou quando ela começou, se ainda não terminou. */
  quando: string;
  resultadoId: string | null;
};

/** Uma pessoa do time dentro deste treino (US-023). */
export type VendedorNaSimulacao = {
  participanteId: string;
  nome: string;
  email: string;
  /** Todas as sessões da pessoa neste treino — somadas, dão o total do cabeçalho. */
  sessoes: number;
  avaliadas: number;
  /** Média de todas as conversas avaliadas da pessoa neste treino, sem recorte de período. */
  nota: number | null;
  tendencia: Tendencia;
  variacao: number | null;
  /** Quantos treinos diferentes ela já fez no app inteiro. */
  treinos: number;
  /** O tipo de cliente com quem ela vai melhor e o com quem ela mais trava. */
  melhor: { persona: string; nota: number; conversas: number } | null;
  desafio: { persona: string; nota: number; conversas: number } | null;
  ultima: string | null;
  /** O resultado da conversa mais recente que chegou a ser avaliada (o link /r/<id>). */
  ultimoResultadoId: string | null;
  conversas: ConversaDoVendedor[];
};

export type PainelSimulacao = {
  codigo: string;
  nome: string;
  objetivo?: string;
  produto: string;
  status: StatusSimulacao;
  metodologia: string;
  dificuldade: Dificuldade;
  exemplo: boolean;
  /** O tamanho da janela comparada, em dias. */
  dias: number;
  /** Conversas abertas no treino, em qualquer estado (é o mesmo número da lista de simulações). */
  sessoes: number;
  /** Pessoas distintas que abriram o link. */
  participantes: number;
  /** Conversas com avaliação pronta — a base de toda média desta tela. */
  avaliadas: number;
  /** Média de todas as conversas avaliadas, sem recorte de período. */
  notaMedia: number | null;
  /** Média da janela atual e da imediatamente anterior, não sobrepostas. */
  notaJanela: number | null;
  notaAnterior: number | null;
  avaliadasJanela: number;
  avaliadasAnterior: number;
  /** A diferença entre as duas janelas; `null` quando falta base de comparação. */
  variacao: number | null;
  competencias: CompetenciaAgregada[];
  grupos: { grupo: Grupo; nota: number; criterios: number }[];
  /** Pessoa por pessoa, da maior nota para a menor (US-023). */
  equipe: VendedorNaSimulacao[];
  ultimaSessao: string | null;
};

export type OportunidadeDoTime = { frase: string; daIA: boolean };

function media(notas: number[]): number | null {
  if (!notas.length) return null;
  return Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10;
}

function numero(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** A avaliação gravada, ou `null` quando o registro é de outro tipo (conversa real, painel da equipe)
 * ou o JSON está torto. Um resultado ilegível sai da conta em vez de derrubar a tela. */
function lerAvaliacao(saida: string): AvaliacaoGravada | null {
  try {
    const lido = JSON.parse(saida) as AvaliacaoGravada | null;
    return lido && typeof lido === "object" && numero(lido.notaGeral) !== null ? lido : null;
  } catch (err) {
    console.error("Avaliação com saída mal formada; fora do painel.", err);
    return null;
  }
}

function grupoValido(valor: unknown): Grupo {
  return (GRUPOS as readonly string[]).includes(String(valor)) ? (valor as Grupo) : "Descoberta";
}

/**
 * Monta o painel de uma simulação. Devolve `null` quando o treino não existe mais.
 *
 * `dias` é a janela comparada (padrão 30): a média dos últimos 30 dias contra a dos 30 anteriores,
 * sem sobreposição — a mesma regra que `lib/painel-equipe.ts` já usa no painel da equipe.
 */
export function montarPainelSimulacao(codigo: string, dias = 30): PainelSimulacao | null {
  const simulacao = obterSimulacao(codigo);
  if (!simulacao) return null;

  const sessoes = listarPorSimulacao(codigo);
  const participantes = new Set(sessoes.map((s) => s.participanteId)).size;
  const ultimaSessao = sessoes.map((s) => s.criadoEm).sort().at(-1) ?? null;

  const agora = Date.now();
  const inicioJanela = agora - dias * DIA_MS;
  const inicioAnterior = agora - 2 * dias * DIA_MS;

  const avaliadas: { sessaoId: string; quando: number; nota: number; avaliacao: AvaliacaoGravada }[] = [];
  for (const { sessao, saida } of avaliacoesDaSimulacao(codigo)) {
    const avaliacao = lerAvaliacao(saida);
    const nota = avaliacao && numero(avaliacao.notaGeral);
    if (!avaliacao || nota === null) continue;
    avaliadas.push({ sessaoId: sessao.id, quando: new Date(sessao.encerradaEm ?? sessao.criadoEm).getTime(), nota, avaliacao });
  }

  const daJanela = avaliadas.filter((a) => a.quando >= inicioJanela);
  const daAnterior = avaliadas.filter((a) => a.quando >= inicioAnterior && a.quando < inicioJanela);
  const notaJanela = media(daJanela.map((a) => a.nota));
  const notaAnterior = media(daAnterior.map((a) => a.nota));

  // As competências somam **todas** as conversas avaliadas, não só a janela: o gestor abre esta tela
  // para saber onde o time trava, e um treino parado há cinco semanas ficaria com todas as barras em
  // zero se o recorte de período valesse aqui. O recorte existe só para a comparação de evolução.
  const porCriterio = new Map<string, { nome: string; grupo: Grupo; notas: number[] }>();
  for (const { avaliacao } of avaliadas) {
    for (const c of avaliacao.criterios ?? []) {
      const nota = numero(c?.nota);
      const nome = String(c?.nome ?? "").trim();
      if (nota === null || !nome) continue;
      const chave = String(c?.id ?? "") || nome.toLowerCase();
      const atual = porCriterio.get(chave) ?? { nome, grupo: grupoValido(c?.grupo), notas: [] };
      atual.notas.push(nota);
      porCriterio.set(chave, atual);
    }
  }

  const competencias: CompetenciaAgregada[] = Array.from(porCriterio.entries())
    .map(([id, c]) => ({ id, nome: c.nome, grupo: c.grupo, nota: media(c.notas) ?? 0, avaliacoes: c.notas.length }))
    .sort((a, b) => a.nota - b.nota);

  const grupos = GRUPOS.map((grupo) => {
    const doGrupo = competencias.filter((c) => c.grupo === grupo);
    return { grupo, nota: media(doGrupo.map((c) => c.nota)) ?? 0, criterios: doGrupo.length };
  }).filter((g) => g.criterios > 0);

  return {
    codigo: simulacao.codigo,
    nome: simulacao.nome,
    objetivo: simulacao.objetivo,
    produto: obterProduto(simulacao.produtoId)?.nome ?? "Produto apagado",
    status: simulacao.status,
    metodologia: metodologia(simulacao.metodologia).nome,
    dificuldade: simulacao.dificuldade,
    exemplo: simulacao.exemplo,
    dias,
    sessoes: sessoes.length,
    participantes,
    avaliadas: avaliadas.length,
    notaMedia: media(avaliadas.map((a) => a.nota)),
    notaJanela,
    notaAnterior,
    avaliadasJanela: daJanela.length,
    avaliadasAnterior: daAnterior.length,
    variacao: notaJanela === null || notaAnterior === null ? null : Math.round((notaJanela - notaAnterior) * 10) / 10,
    competencias,
    grupos,
    equipe: montarEquipe(sessoes, new Map(avaliadas.map((a) => [a.sessaoId, a.nota])), inicioJanela, inicioAnterior),
    ultimaSessao,
  };
}

// ---------------------------------------------------------------------------
// A aba Equipe: pessoa por pessoa (US-023)
// ---------------------------------------------------------------------------

function tendenciaDe(atual: number | null, anterior: number | null): Tendencia {
  if (atual === null || anterior === null) return "estavel";
  const diferenca = atual - anterior;
  if (diferenca > LIMIAR_TENDENCIA) return "subindo";
  if (diferenca < -LIMIAR_TENDENCIA) return "caindo";
  return "estavel";
}

/** Emoji + nome do tipo de cliente. Id que saiu do catálogo vira um rótulo genérico em vez de sumir:
 * a conversa aconteceu e continua contando. */
function rotuloDaPersona(id: string): string {
  const p = persona(id);
  return p ? rotulo(p) : "Cliente";
}

/** A melhor e a pior média por tipo de cliente desta pessoa. O desafio só existe quando ele é de fato
 * **pior** que o melhor: com um tipo de cliente só — ou com todos empatados — apontar um "maior
 * desafio" com a mesma nota do "vai melhor com" seria inventar uma diferença que não houve. */
function melhorEDesafio(conversas: ConversaDoVendedor[]) {
  const porPersona = new Map<string, { persona: string; notas: number[] }>();
  for (const c of conversas) {
    if (c.nota === null) continue;
    const atual = porPersona.get(c.personaId) ?? { persona: c.persona, notas: [] };
    atual.notas.push(c.nota);
    porPersona.set(c.personaId, atual);
  }
  const ordenadas = Array.from(porPersona.values())
    .map((p) => ({ persona: p.persona, nota: media(p.notas) ?? 0, conversas: p.notas.length }))
    .sort((a, b) => b.nota - a.nota);
  const melhor = ordenadas[0] ?? null;
  const pior = ordenadas[ordenadas.length - 1] ?? null;
  return { melhor, desafio: melhor && pior && pior.nota < melhor.nota ? pior : null };
}

/**
 * O time deste treino, pessoa por pessoa.
 *
 * Entram **todas** as sessões de cada um, não só as avaliadas: a soma das linhas tem de bater com o
 * "N sessões" do cabeçalho, e uma pessoa que abriu o link duas vezes sem terminar nenhuma conversa
 * precisa aparecer na lista — é justamente com ela que o gestor vai querer falar.
 *
 * A tendência compara as duas janelas do painel (a atual contra a imediatamente anterior, não
 * sobrepostas), com o mesmo limiar de 0,3 de `lib/painel-equipe.ts`. A **nota**, como as competências
 * da visão geral, soma tudo: sem recorte de período, senão quem treinou mês passado apareceria sem
 * nota nenhuma.
 */
function montarEquipe(
  sessoes: Sessao[],
  notaPorSessao: Map<string, number>,
  inicioJanela: number,
  inicioAnterior: number,
): VendedorNaSimulacao[] {
  const treinos = treinosPorParticipante();
  const porParticipante = new Map<string, ConversaDoVendedor[]>();

  for (const s of sessoes) {
    const lista = porParticipante.get(s.participanteId) ?? [];
    lista.push({
      sessaoId: s.id,
      personaId: s.personaId,
      persona: rotuloDaPersona(s.personaId),
      modo: s.modo,
      status: s.status,
      nota: notaPorSessao.get(s.id) ?? null,
      duracaoSeg: s.duracaoSeg ?? null,
      quando: s.encerradaEm ?? s.criadoEm,
      resultadoId: s.resultadoId ?? null,
    });
    porParticipante.set(s.participanteId, lista);
  }

  const equipe: VendedorNaSimulacao[] = [];
  for (const [participanteId, lista] of porParticipante) {
    const conversas = [...lista].sort((a, b) => b.quando.localeCompare(a.quando));
    const pessoa = obterParticipante(participanteId);
    const comNota = conversas.filter((c) => c.nota !== null);
    const daJanela = comNota.filter((c) => new Date(c.quando).getTime() >= inicioJanela);
    const daAnterior = comNota.filter((c) => {
      const quando = new Date(c.quando).getTime();
      return quando >= inicioAnterior && quando < inicioJanela;
    });
    const notaJanela = media(daJanela.map((c) => c.nota as number));
    const notaAnterior = media(daAnterior.map((c) => c.nota as number));
    const { melhor, desafio } = melhorEDesafio(conversas);

    equipe.push({
      participanteId,
      nome: pessoa?.nome?.trim() || "Sem nome",
      email: pessoa?.email ?? "",
      sessoes: conversas.length,
      avaliadas: comNota.length,
      nota: media(comNota.map((c) => c.nota as number)),
      tendencia: tendenciaDe(notaJanela, notaAnterior),
      variacao: notaJanela === null || notaAnterior === null ? null : Math.round((notaJanela - notaAnterior) * 10) / 10,
      treinos: treinos[participanteId] ?? 1,
      melhor,
      desafio,
      ultima: conversas[0]?.quando ?? null,
      ultimoResultadoId: conversas.find((c) => c.resultadoId)?.resultadoId ?? null,
      conversas,
    });
  }

  // Quem ainda não tem nota vai para o fim: a lista responde "com quem eu falo esta semana?", e a
  // primeira resposta é sempre alguém que já treinou.
  return equipe.sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------------------------------------------------------------------------
// A frase da principal oportunidade do time
// ---------------------------------------------------------------------------

const SYSTEM_OPORTUNIDADE = `Você é um gerente de vendas experiente lendo o resumo de um treino do seu time.
Escreva UMA recomendação acionável, em português do Brasil, sobre o ponto em que o time mais perde hoje.
Regras:
- Duas ou três frases, no máximo 45 palavras no total.
- Comece pelo que os números mostram e termine com o que o gestor deve fazer nesta semana, concreto o bastante para caber numa reunião de quinze minutos.
- Fale do time, nunca de uma pessoa específica; você não recebeu nome de ninguém.
- Não invente número nenhum: use só os que estão no resumo, e não repita todos eles.
- Sem jargão de consultoria e sem termo técnico de inteligência artificial.
Formato de saída (JSON): {"frase": ""}`;

/** O texto de reserva, calculado no código: é o que o painel mostra sem IA conectada ou quando ela falha. */
export function oportunidadeCalculada(painel: PainelSimulacao): string {
  if (painel.avaliadas === 0) {
    return "Ainda não há conversa avaliada neste treino. Mande o link para o time e volte aqui quando as primeiras conversas terminarem.";
  }
  const maisFraca = painel.competencias[0];
  if (!maisFraca) {
    return `O time já tem ${painel.avaliadas === 1 ? "uma conversa avaliada" : `${painel.avaliadas} conversas avaliadas`}, mas nenhuma delas chegou com nota por competência. Abra uma conversa para ver o que foi avaliado.`;
  }
  const nota = maisFraca.nota.toFixed(1).replace(".", ",");
  const descricao = criteriosDe(obterSimulacao(painel.codigo) ?? { metodologia: "consultiva" }).find((c) => c.id === maisFraca.id)?.descricao;
  const oQueFazer = descricao ? ` O que se espera aqui: ${descricao.charAt(0).toLowerCase()}${descricao.slice(1)}` : "";
  return `Onde o time mais perde hoje é em "${maisFraca.nome}": média ${nota} em ${maisFraca.avaliacoes === 1 ? "uma conversa" : `${maisFraca.avaliacoes} conversas`}.${oQueFazer} Escolha uma conversa recente com essa nota e refaça esse trecho junto com a pessoa.`;
}

function resumoParaPrompt(painel: PainelSimulacao): string {
  const n = (v: number | null) => (v === null ? "sem base" : v.toFixed(1).replace(".", ","));
  return [
    `Treino: ${painel.nome}`,
    `Produto: ${painel.produto}`,
    `Método de avaliação: ${painel.metodologia}`,
    `Conversas avaliadas: ${painel.avaliadas}, de ${painel.participantes} pessoas`,
    `Nota média do time: ${n(painel.notaMedia)}`,
    `Nota nos últimos ${painel.dias} dias: ${n(painel.notaJanela)} (nos ${painel.dias} dias anteriores: ${n(painel.notaAnterior)})`,
    "Média por competência, da mais fraca para a mais forte:",
    ...painel.competencias.map((c) => `- ${c.nome} (${c.grupo}): ${n(c.nota)}`),
  ].join("\n");
}

/** A frase já escrita, por simulação. A chave inclui o estado do treino: conversa nova invalida. */
const cache = new Map<string, { chave: string; expiraEm: number; valor: OportunidadeDoTime }>();

function chaveDe(painel: PainelSimulacao): string {
  return `${painel.avaliadas}|${painel.sessoes}|${painel.ultimaSessao ?? ""}`;
}

/**
 * A frase de "Principal oportunidade do time".
 *
 * Uma chamada de IA por treino, guardada por uma hora **ou até chegar sessão nova** — sem isso, cada
 * carregamento da tela do gestor gastaria uma chamada para reescrever a mesma conclusão sobre os mesmos
 * números. Quando a IA não está conectada, falha ou devolve vazio, vale o texto calculado no código:
 * esta linha é a que diz ao gestor o que fazer, e ficar sem ela é pior que tê-la sem IA.
 */
export async function oportunidadeDoTime(painel: PainelSimulacao): Promise<OportunidadeDoTime> {
  const chave = chaveDe(painel);
  const guardada = cache.get(painel.codigo);
  if (guardada && guardada.chave === chave && guardada.expiraEm > Date.now()) return guardada.valor;

  const reserva: OportunidadeDoTime = { frase: oportunidadeCalculada(painel), daIA: false };
  let valor = reserva;

  if (aiEnabled() && painel.avaliadas > 0 && painel.competencias.length > 0) {
    try {
      const resposta = await askJSON<{ frase?: unknown }>({
        system: SYSTEM_OPORTUNIDADE,
        prompt: resumoParaPrompt(painel),
        maxTokens: 400,
        model: modelName("avaliacao"),
      });
      const frase = String(resposta?.frase ?? "").trim();
      if (frase) valor = { frase, daIA: true };
    } catch (err) {
      // A tela do gestor não quebra porque a IA falhou: ela mostra a conclusão calculada no código.
      console.error("Não foi possível escrever a oportunidade do time; usando o texto calculado.", err);
    }
  }

  cache.set(painel.codigo, { chave, expiraEm: Date.now() + VALIDADE_FRASE_MS, valor });
  return valor;
}
