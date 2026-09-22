// Ajuste de um painel feito de planilha: edita a RECEITA, nunca os números.
//
// O refino comum (lib/painel.ts) pede à IA um painel novo com os valores escritos por ela. Aqui isso
// seria destrutivo: trocaria o dado do arquivo por invenção. Então o pedido em português vira uma
// mudança na receita — trocar o tipo de um gráfico, tirar um componente, mudar a coluna de
// agrupamento, acrescentar um indicador — e `lib/agregar.ts` recalcula tudo das linhas reais.
//
// Há dois caminhos, como na geração: sem chave de IA, um editor por palavra-chave que cobre os
// pedidos mais comuns; com a IA, ela reescreve a lista de receitas. Nos dois, o número vem do arquivo.
// Sem import node:*.
import { IDIOMA } from "./idioma";
import type { ColunaDados, Dados } from "./planilha";
import { validarReceitas, type EspecReceitas, type Periodo, type Receita } from "./receita";

export type EdicaoReceitas =
  | { tipo: "ok"; receitas: EspecReceitas; mensagem: string; alterados: string[] }
  | { tipo: "esclarecimento"; mensagem: string };

// ---------------------------------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------------------------------

export function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Conectivos e verbos de comando. Sem esta lista, "troque o gráfico de barras por rosca" casava com
 * o título "Valor da venda por mês" pela palavra "por" — e o ajuste caía no gráfico errado.
 */
const VAZIAS = new Set([
  "de", "do", "da", "dos", "das", "por", "com", "para", "pra", "em", "no", "na", "nos", "nas",
  "um", "uma", "uns", "umas", "os", "as", "ao", "aos", "que", "quero", "meu", "minha", "mais",
  "menos", "grafico", "graficos", "cartao", "cartoes", "painel", "troque", "trocar", "tire",
  "tirar", "mude", "mudar", "coloque", "acrescente", "adicione", "remova", "quebre", "agrupe",
  "separe", "vira", "virar", "exclua", "apague", "todo", "toda", "tudo", "isso", "esse", "essa",
]);

/**
 * Palavras que valem comparação. Duas letras já contam: existe coluna chamada "UF", e cortá-la
 * fazia "agrupe por UF" não achar nada.
 */
function palavras(t: string): string[] {
  return semAcento(t)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 2 && !VAZIAS.has(p));
}

/** Quantas palavras do rótulo aparecem no pedido, comparando palavra inteira. */
function afinidade(rotulo: string, pedido: string): number {
  const doPedido = new Set(palavras(pedido));
  return palavras(rotulo).filter((p) => doPedido.has(p)).length;
}

// ---------------------------------------------------------------------------------------------------
// Reconhecimento
// ---------------------------------------------------------------------------------------------------

/** Os nomes que uma pessoa usa para cada tipo, para "troque as barras por pizza" funcionar. */
const NOMES_TIPO: Array<{ tipo: Receita["tipo"]; termos: RegExp }> = [
  { tipo: "barra", termos: /\bbarras?\b|\branking\b/ },
  { tipo: "pizza", termos: /\bpizza\b|\bsetores?\b/ },
  { tipo: "rosca", termos: /\brosca\b|\bdonut\b|\banel\b/ },
  { tipo: "linha", termos: /\blinha\b|\btend[eê]ncia\b|\bevolu[cç][aã]o\b/ },
  { tipo: "area", termos: /\b[aá]rea\b/ },
  { tipo: "tabela", termos: /\btabela\b|\blista\b/ },
  { tipo: "indicador", termos: /\bindicador\b|\bcart[aã]o\b|\bn[uú]mero\b/ },
];

function tipoCitado(pedido: string, depoisDe?: RegExp): Receita["tipo"] | null {
  const p = semAcento(pedido);
  const trecho = depoisDe ? (p.split(depoisDe)[1] ?? "") : p;
  for (const { tipo, termos } of NOMES_TIPO) if (termos.test(trecho)) return tipo;
  return null;
}

/** Acha o componente que a pessoa citou: primeiro pelo título, depois pelo nome do tipo. */
function acharComponente(espec: EspecReceitas, pedido: string): Receita | null {
  const porTitulo = espec.componentes
    .map((c) => ({ c, pontos: afinidade(c.titulo, pedido) }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)[0];
  if (porTitulo) return porTitulo.c;
  const tipo = tipoCitado(pedido);
  if (tipo) {
    // "troque a barra por pizza": o tipo citado ANTES do "por" é o alvo.
    const antes = semAcento(pedido).split(/\bpor\b|\bem\b/)[0];
    for (const { tipo: t, termos } of NOMES_TIPO) {
      if (termos.test(antes)) return espec.componentes.find((c) => c.tipo === t) ?? null;
    }
    return espec.componentes.find((c) => c.tipo === tipo) ?? null;
  }
  return null;
}

function acharColuna(dados: Dados, pedido: string, filtro?: (c: ColunaDados) => boolean): ColunaDados | null {
  const candidatas = dados.colunas.filter((c) => (filtro ? filtro(c) : true));
  const melhor = candidatas
    .map((c) => ({ c, pontos: afinidade(c.rotulo, pedido) }))
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)[0];
  return melhor?.c ?? null;
}

const PERIODO_CITADO: Array<{ periodo: Periodo; termos: RegExp }> = [
  { periodo: "dia", termos: /\bdi[aá]ri|\bpor dia\b/ },
  { periodo: "mes", termos: /\bmensal|\bpor m[eê]s\b/ },
  { periodo: "trimestre", termos: /\btrimestr/ },
  { periodo: "ano", termos: /\banual|\bpor ano\b/ },
];

// ---------------------------------------------------------------------------------------------------
// Editor sem IA
// ---------------------------------------------------------------------------------------------------

const renumerar = (cs: Receita[]): Receita[] => cs.map((c, i) => ({ ...c, id: `c${i + 1}` }) as Receita);

/**
 * Cobre os pedidos que aparecem toda hora: trocar o tipo de um gráfico, tirar um componente, mudar a
 * coluna de agrupamento, mudar o período e acrescentar um indicador. O que não reconhece devolve como
 * esclarecimento, em vez de fazer algo aproximado — mexer no painel errado é pior que não mexer.
 */
export function editarReceitasSemIA(espec: EspecReceitas, pedido: string, dados: Dados): EdicaoReceitas {
  const p = semAcento(pedido);
  const componentes = espec.componentes;
  const alvo = acharComponente(espec, pedido);

  // Tirar
  if (/\btir[ae]|\bremov|\bexclu|\bapag|\bsome?\b|\bsai\b/.test(p)) {
    if (!alvo) return { tipo: "esclarecimento", mensagem: "Qual cartão você quer tirar? Diga o título dele, como aparece no painel." };
    if (componentes.length <= 2) return { tipo: "esclarecimento", mensagem: "O painel ficaria pequeno demais. Gere de novo com outra descrição em vez de tirar mais cartões." };
    const restantes = renumerar(componentes.filter((c) => c.id !== alvo.id));
    return { tipo: "ok", receitas: { ...espec, componentes: restantes }, mensagem: `Tirei "${alvo.titulo}".`, alterados: [alvo.id] };
  }

  // Trocar o tipo
  const novoTipo = tipoCitado(pedido, /\bpor\b|\bem\b|\bpara\b/);
  if (novoTipo && /\btroqu|\bmud|\bvira|\btransform|\bcoloc/.test(p)) {
    if (!alvo) return { tipo: "esclarecimento", mensagem: "Qual gráfico você quer trocar? Diga o título dele." };
    if (alvo.tipo === "indicador" || alvo.tipo === "tabela" || novoTipo === "indicador" || novoTipo === "tabela") {
      return { tipo: "esclarecimento", mensagem: "Só dá para trocar entre gráficos (linha, área, barra, pizza e rosca). Para mudar um indicador ou a tabela, gere de novo com outra descrição." };
    }
    const convertido = converterTipo(alvo, novoTipo);
    if (!convertido) return { tipo: "esclarecimento", mensagem: "Não consegui converter esse gráfico. Diga de outro jeito." };
    return {
      tipo: "ok",
      receitas: { ...espec, componentes: componentes.map((c) => (c.id === alvo.id ? convertido : c)) },
      mensagem: `Troquei "${alvo.titulo}" por ${novoTipo}, recalculando do seu arquivo.`,
      alterados: [alvo.id],
    };
  }

  // Acrescentar um indicador de uma coluna numérica
  if (/\bacrescent|\badicion|\binclu|\bp[oõ]e\b|\bquero (um|uma)\b/.test(p)) {
    if (componentes.length >= 8) return { tipo: "esclarecimento", mensagem: "O painel já está com 8 cartões, que é o máximo. Tire um antes de acrescentar outro." };
    const coluna = acharColuna(dados, pedido, (c) => c.tipo === "numero");
    if (!coluna) {
      const numericas = dados.colunas.filter((c) => c.tipo === "numero").map((c) => `"${c.rotulo}"`).join(", ");
      return { tipo: "esclarecimento", mensagem: numericas ? `De qual coluna? As numéricas do seu arquivo são: ${numericas}.` : "O seu arquivo não tem coluna numérica para virar indicador." };
    }
    // Percentual sempre em média: "total de desconto" somando 1.200 linhas daria 550,8%.
    const media = /\bm[eé]di[ao]\b/.test(p) || Boolean(coluna.percentual);
    const data = dados.colunas.find((c) => c.tipo === "data");
    const novo: Receita = {
      id: `c${componentes.length + 1}`,
      titulo: `${media ? `${coluna.rotulo} médio` : coluna.rotulo}${data ? " no mês" : ""}`.slice(0, 40),
      posicao: { linha: 0, coluna: 0, largura: 1 },
      tipo: "indicador",
      coluna: coluna.chave,
      agregacao: media ? "media" : "soma",
      colunaData: data?.chave,
      periodo: data ? "mes" : undefined,
    };
    return { tipo: "ok", receitas: { ...espec, componentes: [...componentes, novo] }, mensagem: `Acrescentei "${novo.titulo}", calculado do seu arquivo.`, alterados: [novo.id] };
  }

  // Mudar o período de uma série temporal
  const periodo = PERIODO_CITADO.find((x) => x.termos.test(p))?.periodo;
  if (periodo) {
    const series = componentes.filter((c) => c.tipo === "linha" || c.tipo === "area" || c.tipo === "barra");
    const serie = (alvo && series.some((c) => c.id === alvo.id) ? alvo : series[0]) as Extract<Receita, { agruparPor: string }> | undefined;
    if (!serie) return { tipo: "esclarecimento", mensagem: "Não há gráfico de tendência neste painel para mudar o período." };
    const coluna = dados.colunas.find((c) => c.chave === serie.agruparPor);
    if (coluna?.tipo !== "data") return { tipo: "esclarecimento", mensagem: "Esse gráfico não é agrupado por data, então não tem período para mudar." };
    return {
      tipo: "ok",
      receitas: { ...espec, componentes: componentes.map((c) => (c.id === serie.id ? { ...c, periodo } : c)) as Receita[] },
      mensagem: `Agrupei "${serie.titulo}" por ${periodo === "mes" ? "mês" : periodo}.`,
      alterados: [serie.id],
    };
  }

  // Mudar a coluna de agrupamento
  if (/\bagrup|\bpor\b|\bquebr|\bsepar/.test(p)) {
    const coluna = acharColuna(dados, pedido, (c) => c.tipo !== "numero");
    const agrupaveis = componentes.filter((c) => "agruparPor" in c);
    const serie = (alvo && agrupaveis.some((c) => c.id === alvo.id) ? alvo : agrupaveis[0]) as Extract<Receita, { agruparPor: string }> | undefined;
    if (coluna && serie) {
      // Linha e área só fazem sentido no tempo: reagrupadas por categoria, viram barra.
      const viraBarra = coluna.tipo !== "data" && (serie.tipo === "linha" || serie.tipo === "area");
      const novo = {
        ...serie,
        tipo: viraBarra ? "barra" : serie.tipo,
        agruparPor: coluna.chave,
        periodo: coluna.tipo === "data" ? ("periodo" in serie ? serie.periodo : "mes") : undefined,
        ordenar: coluna.tipo === "data" ? "rotulo" : "valor",
        titulo: `${serie.titulo.split(" por ")[0]} por ${coluna.rotulo}`.slice(0, 40),
      } as Receita;
      return {
        tipo: "ok",
        receitas: { ...espec, componentes: componentes.map((c) => (c.id === serie.id ? novo : c)) },
        mensagem: `Agrupei "${serie.titulo}" por ${coluna.rotulo}${viraBarra ? ", em barras" : ""}.`,
        alterados: [serie.id],
      };
    }
  }

  const titulos = componentes.map((c) => `"${c.titulo}"`).join(", ");
  return {
    tipo: "esclarecimento",
    mensagem:
      `Sem a IA conectada eu reconheço: trocar o tipo de um gráfico ("troque a barra por rosca"), tirar um cartão ` +
      `("tire a tabela"), acrescentar um indicador ("acrescente o total de desconto"), mudar o período ("por trimestre") ` +
      `e mudar o agrupamento ("agrupe por UF"). Cartões deste painel: ${titulos}.`,
  };
}

/** Converte a receita entre os cinco tipos de gráfico, preservando coluna e agregação. */
function converterTipo(receita: Receita, novo: Receita["tipo"]): Receita | null {
  if (!("agruparPor" in receita)) return null;
  const { id, titulo, posicao, agruparPor, coluna, agregacao } = receita;
  if (novo === "pizza" || novo === "rosca") {
    return { id, titulo, posicao, tipo: novo, agruparPor, coluna, agregacao, limite: 6 };
  }
  if (novo === "linha" || novo === "area" || novo === "barra") {
    const periodo = "periodo" in receita ? receita.periodo : undefined;
    const ordenar = "ordenar" in receita ? receita.ordenar : undefined;
    return { id, titulo, posicao, tipo: novo, agruparPor, coluna, agregacao, periodo, ordenar, orientacao: "vertical", limite: 12 };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Editor com IA
// ---------------------------------------------------------------------------------------------------

export const SYSTEM_EDITAR_RECEITAS = `${IDIOMA}

Você edita a RECEITA de um painel montado a partir da planilha real da pessoa.

REGRA ABSOLUTA: você NUNCA escreve números. Você recebe as colunas do arquivo e a lista de receitas atual, e devolve a lista de receitas ATUALIZADA. Quem calcula os valores é o servidor, em cima das linhas do arquivo. Qualquer número que você escrever é ignorado.

Faça SOMENTE o que a pessoa pediu. Todo componente não citado tem de voltar IDÊNTICO, com o mesmo "id".

FORMATO DE CADA RECEITA (os mesmos da geração):
- indicador: { "id", "tipo": "indicador", "titulo", "coluna", "agregacao", "colunaData", "periodo", "direcaoBoa" }
- linha / area / barra: { "id", "tipo", "titulo", "agruparPor", "periodo", "coluna", "agregacao", "orientacao", "ordenar", "limite" }
- pizza / rosca: { "id", "tipo", "titulo", "agruparPor", "coluna", "agregacao", "limite" }
- tabela: { "id", "tipo": "tabela", "titulo", "colunas": [...], "ordenarPor", "ordem", "limite" }

"agregacao": "soma" | "media" | "contagem" | "minimo" | "maximo" | "distintos".
"periodo": "dia" | "mes" | "trimestre" | "ano".

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código):
{
  "titulo": "...",
  "resumo": "...",
  "setor": "...",
  "componentes": [ /* TODAS as receitas: as inalteradas copiadas EXATAMENTE, e só a(s) citada(s) mudada(s) */ ],
  "mensagem": "Uma frase, em português, dizendo o que você fez",
  "componentesAlterados": ["c3"]
}

Quando o pedido não estiver claro:
{ "esclarecimento": "Uma pergunta curta, em português" }

REGRAS:
- Use SOMENTE chaves de coluna que aparecem na lista do arquivo. Receita com coluna inexistente é DESCARTADA.
- Preserve os "id" existentes. Um componente acrescentado ganha o próximo id livre e entra em "componentesAlterados".
- Entre 3 e 8 componentes.
- NUNCA escreva valores, pontos, fatias ou linhas de tabela.
- NUNCA devolva markdown ou texto fora do JSON.

Responda SOMENTE com o JSON. Nada antes, nada depois.`;

export const PROMPT_EDITAR_RECEITAS = (espec: EspecReceitas, perfil: string, pedido: string) =>
  `${perfil}\n\nReceitas atuais do painel "${espec.titulo}":\n${JSON.stringify(espec.componentes)}\n\n` +
  `Pedido da pessoa: "${pedido}"\n\nDevolva a lista COMPLETA de receitas. Mude só o que foi pedido.`;

/** Saneia a resposta da IA reaproveitando o validador da geração, que já descarta coluna inexistente. */
export function lerEdicaoDaIA(bruto: unknown, espec: EspecReceitas, dados: Dados): EdicaoReceitas {
  const obj = (bruto ?? {}) as Record<string, unknown>;
  if (typeof obj.esclarecimento === "string" && obj.esclarecimento.trim()) {
    return { tipo: "esclarecimento", mensagem: obj.esclarecimento.trim().slice(0, 300) };
  }
  const receitas = validarReceitas({ ...obj, titulo: obj.titulo ?? espec.titulo, resumo: obj.resumo ?? espec.resumo, setor: obj.setor ?? espec.setor }, dados);
  if (receitas.componentes.length < 3) {
    return { tipo: "esclarecimento", mensagem: "Não consegui aplicar esse ajuste sem desmontar o painel. Diga de outro jeito." };
  }
  const alterados = Array.isArray(obj.componentesAlterados) ? obj.componentesAlterados.filter((x): x is string => typeof x === "string") : [];
  const mensagem = typeof obj.mensagem === "string" && obj.mensagem.trim() ? obj.mensagem.trim().slice(0, 300) : "Pronto, ajustei o painel.";
  return { tipo: "ok", receitas, mensagem, alterados };
}
