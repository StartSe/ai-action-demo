// Motor de agregação: transforma uma `Receita` (quais colunas, qual conta) nos `dados` de um
// componente do painel, lendo as linhas reais da planilha. Toda conta que aparece na tela nasce aqui.
// Determinístico e sem IA — é o que garante que o número no cartão é o número do seu arquivo.
// Sem import node:*.
import { extremos, type Celula, type ColunaDados, type Dados } from "./planilha";
import type { Agregacao, EspecReceitas, Periodo, Receita } from "./receita";
import type {
  ComponentePainel,
  DadosDistribuicao,
  DadosIndicador,
  DadosSerie,
  DadosTabela,
  EspecPainel,
  Formato,
  Ponto,
} from "./types";

/** "Outros" agrupa o excedente de uma distribuição, como o validador já fazia com a saída da IA. */
const OUTROS = "Outros";
const SEM_VALOR = "(sem valor)";
/** Uma observação de 5 mil caracteres numa célula estoura a linha da tabela; o resto vira reticência. */
const MAXIMO_TEXTO_CELULA = 120;

// ---------------------------------------------------------------------------------------------------
// Formato e rótulos
// ---------------------------------------------------------------------------------------------------

/** O formato de exibição sai da coluna agregada; contagem é sempre número puro. */
function formatoDe(coluna: ColunaDados | undefined, agregacao: Agregacao): Formato {
  if (agregacao === "contagem" || agregacao === "distintos") return "numero";
  if (!coluna) return "numero";
  if (coluna.percentual) return "percentual";
  if (coluna.moeda) return "moeda";
  return "numero";
}

const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * A chave de agrupamento de uma data, já ordenável como texto (AAAA, AAAA-T1, AAAA-MM, AAAA-MM-DD),
 * junto com o rótulo curto que aparece no eixo.
 */
function balde(iso: string, periodo: Periodo): { chave: string; rotulo: string } | null {
  const m = iso.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return null;
  const [, ano, mes, dia] = m;
  if (periodo === "ano" || !mes) return { chave: ano, rotulo: ano };
  const indiceMes = Number(mes) - 1;
  const nomeMes = MES_CURTO[indiceMes] ?? mes;
  if (periodo === "trimestre") {
    const t = Math.floor(indiceMes / 3) + 1;
    return { chave: `${ano}-T${t}`, rotulo: `T${t}/${ano.slice(2)}` };
  }
  if (periodo === "mes" || !dia) return { chave: `${ano}-${mes}`, rotulo: `${nomeMes}/${ano.slice(2)}` };
  return { chave: `${ano}-${mes}-${dia}`, rotulo: `${dia}/${mes}` };
}

/** Primeiro e último dia (AAAA-MM-DD) que o balde cobre. */
function limitesDoBalde(chave: string, periodo: Periodo): { inicio: string; fim: string } {
  const ano = Number(chave.slice(0, 4));
  const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
  const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (periodo === "ano" || chave.length === 4) return { inicio: iso(ano, 1, 1), fim: iso(ano, 12, 31) };
  if (chave.includes("-T")) {
    const t = Number(chave.slice(-1));
    const primeiroMes = (t - 1) * 3 + 1;
    return { inicio: iso(ano, primeiroMes, 1), fim: iso(ano, primeiroMes + 2, ultimoDia(ano, primeiroMes + 2)) };
  }
  const mes = Number(chave.slice(5, 7));
  if (chave.length === 7) return { inicio: iso(ano, mes, 1), fim: iso(ano, mes, ultimoDia(ano, mes)) };
  return { inicio: chave, fim: chave };
}

/** Completa uma data parcial ("2026", "2026-09") para o começo ou o fim do período que ela nomeia. */
const inicioDe = (iso: string) => (iso.length === 4 ? `${iso}-01-01` : iso.length === 7 ? `${iso}-01` : iso);
const fimDe = (iso: string) => (iso.length === 4 ? `${iso}-12-31` : iso.length === 7 ? `${iso}-31` : iso);

/** Menor e maior data presentes numa coluna, já normalizadas para AAAA-MM-DD. */
function intervaloDaColuna(dados: Dados, chave: string): { min: string; max: string } | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const linha of dados.linhas) {
    const v = linha[chave];
    if (typeof v !== "string" || !/^\d{4}/.test(v)) continue;
    const i = inicioDe(v);
    const f = fimDe(v);
    if (min === null || i < min) min = i;
    if (max === null || f > max) max = f;
  }
  return min && max ? { min, max } : null;
}

function comoTexto(v: Celula): string {
  if (v === null || v === undefined || v === "") return SEM_VALOR;
  return String(v);
}

function comoNumero(v: Celula): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------------------------------

/** Aplica a agregação a uma lista de células já filtradas de um grupo. */
function aplicar(valores: Celula[], agregacao: Agregacao, chaveValor?: string): number {
  if (agregacao === "contagem") return valores.length;
  if (agregacao === "distintos") return new Set(valores.map(comoTexto)).size;
  const numeros = valores.map(comoNumero).filter((n): n is number => n !== null);
  if (numeros.length === 0) return 0;
  switch (agregacao) {
    case "soma":
      return numeros.reduce((s, n) => s + n, 0);
    case "media":
      return numeros.reduce((s, n) => s + n, 0) / numeros.length;
    case "minimo":
      return extremos(numeros)?.min ?? 0;
    case "maximo":
      return extremos(numeros)?.max ?? 0;
    default:
      // Exaustivo: `chaveValor` só existe para a mensagem de erro não ficar muda.
      throw new Error(`Agregação desconhecida em ${chaveValor ?? "coluna"}`);
  }
}

/** Arredonda para duas casas: soma de ponto flutuante rende 1234.5600000000002 na tela. */
const duasCasas = (n: number) => Math.round(n * 100) / 100;

/**
 * Agrupa as linhas por uma coluna (data virando balde de período, ou categoria) e agrega a coluna
 * de valor. Devolve os pontos já ordenados: data sempre em ordem cronológica.
 */
function agrupar(
  dados: Dados,
  grupo: ColunaDados,
  chaveValor: string | undefined,
  agregacao: Agregacao,
  periodo: Periodo | undefined,
  ordenar: "rotulo" | "valor",
): Ponto[] {
  const baldes = new Map<string, { rotulo: string; valores: Celula[] }>();
  for (const linha of dados.linhas) {
    const bruto = linha[grupo.chave];
    let chave: string;
    let rotulo: string;
    if (grupo.tipo === "data") {
      const b = typeof bruto === "string" ? balde(bruto, periodo ?? "mes") : null;
      if (!b) continue; // linha sem data válida não entra na série temporal
      chave = b.chave;
      rotulo = b.rotulo;
    } else {
      chave = comoTexto(bruto);
      rotulo = chave;
    }
    const alvo = baldes.get(chave) ?? { rotulo, valores: [] };
    // Sem coluna de valor a agregação é sobre a própria linha (contagem): guarda algo não nulo.
    alvo.valores.push(chaveValor ? linha[chaveValor] : 1);
    baldes.set(chave, alvo);
  }

  const pontos = [...baldes.entries()].map(([chave, b]) => ({
    chave,
    rotulo: b.rotulo,
    valor: duasCasas(aplicar(b.valores, agregacao, chaveValor)),
  }));

  if (grupo.tipo === "data") pontos.sort((a, b) => a.chave.localeCompare(b.chave));
  else if (ordenar === "valor") pontos.sort((a, b) => b.valor - a.valor);
  else pontos.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  return pontos.map(({ rotulo, valor }) => ({ rotulo, valor }));
}

/** Mantém os `limite` maiores e soma o resto em "Outros" — só para distribuição. */
function agruparExcedente(pontos: Ponto[], limite: number): Ponto[] {
  if (pontos.length <= limite) return pontos;
  const ordenados = [...pontos].sort((a, b) => b.valor - a.valor);
  const principais = ordenados.slice(0, limite - 1);
  const resto = ordenados.slice(limite - 1).reduce((s, p) => s + p.valor, 0);
  return [...principais, { rotulo: OUTROS, valor: duasCasas(resto) }];
}

// ---------------------------------------------------------------------------------------------------
// Um componente
// ---------------------------------------------------------------------------------------------------

function acharColuna(dados: Dados, chave: string | undefined): ColunaDados | undefined {
  return chave ? dados.colunas.find((c) => c.chave === chave) : undefined;
}

/** Calcula um componente a partir da receita. Devolve null quando o recorte não produz nada útil. */
export function calcular(receita: Receita, dados: Dados): ComponentePainel | null {
  const base = { id: receita.id, titulo: receita.titulo, posicao: receita.posicao };

  if (receita.tipo === "indicador") {
    const coluna = acharColuna(dados, receita.coluna);
    const formato = formatoDe(coluna, receita.agregacao);
    const colunaData = acharColuna(dados, receita.colunaData);

    let valor: number;
    let anterior: number | undefined;
    if (colunaData && colunaData.tipo === "data") {
      const periodo = receita.periodo ?? "mes";
      const serie = agrupar(dados, colunaData, receita.coluna, receita.agregacao, periodo, "rotulo");
      if (serie.length === 0) return null;

      // O cartão fala do último período FECHADO, não do que está em curso. Um arquivo que termina
      // no meio de um trimestre mostraria um pedaço comparado com um trimestre inteiro — a variação
      // daí mede a janela, não o negócio (num recorte real de 30 dias isso rendeu +2818%).
      // `agrupar` ordena por chave para coluna de data, então `serie` e `chaves` andam juntas.
      const intervalo = intervaloDaColuna(dados, colunaData.chave);
      const chaves = [...new Set(dados.linhas.map((l) => (typeof l[colunaData.chave] === "string" ? balde(l[colunaData.chave] as string, periodo)?.chave : null)).filter((c): c is string => Boolean(c)))].sort();
      const fechado = (i: number) => {
        if (!intervalo || !chaves[i]) return false;
        const { inicio, fim } = limitesDoBalde(chaves[i], periodo);
        return intervalo.min <= inicio && intervalo.max >= fim;
      };
      const indicesFechados = serie.map((_, i) => i).filter(fechado);
      if (indicesFechados.length >= 2) {
        valor = serie[indicesFechados[indicesFechados.length - 1]].valor;
        anterior = serie[indicesFechados[indicesFechados.length - 2]].valor;
      } else if (indicesFechados.length === 1) {
        valor = serie[indicesFechados[0]].valor;
      } else {
        // Nenhum período fechado (arquivo curto demais): mostra o mais recente, sem comparar.
        valor = serie[serie.length - 1].valor;
      }
    } else {
      const valores = dados.linhas.map((l) => (receita.coluna ? l[receita.coluna] : 1));
      valor = duasCasas(aplicar(valores, receita.agregacao, receita.coluna));
    }

    const d: DadosIndicador = { valor, formato, direcaoBoa: receita.direcaoBoa ?? "aumentar" };
    if (formato === "moeda") d.prefixo = "R$";
    if (anterior !== undefined) d.anterior = anterior;
    return { ...base, tipo: "indicador", dados: d };
  }

  const grupo = acharColuna(dados, receita.tipo === "tabela" ? undefined : receita.agruparPor);

  if (receita.tipo === "pizza" || receita.tipo === "rosca") {
    if (!grupo) return null;
    const coluna = acharColuna(dados, receita.coluna);
    const bruto = agrupar(dados, grupo, receita.coluna, receita.agregacao, undefined, "valor");
    // Parte de um todo não existe com sinal trocado: uma fatia negativa não tem como ser desenhada,
    // e filtrá-la em silêncio esconderia a categoria inteira. Melhor não entregar o componente.
    if (bruto.some((p) => p.valor < 0)) return null;
    const fatias = agruparExcedente(bruto.filter((p) => p.valor > 0), receita.limite ?? 6);
    if (fatias.length < 2) return null;
    const d: DadosDistribuicao = { formato: formatoDe(coluna, receita.agregacao), fatias };
    if (d.formato === "moeda") d.prefixo = "R$";
    return { ...base, tipo: receita.tipo, dados: d };
  }

  if (receita.tipo === "tabela") {
    const colunas = receita.colunas.map((c) => acharColuna(dados, c)).filter((c): c is ColunaDados => Boolean(c));
    if (colunas.length < 2) return null;
    const ordenarPor = acharColuna(dados, receita.ordenarPor);
    const linhasOrdenadas = [...dados.linhas];
    if (ordenarPor) {
      const sinal = receita.ordem === "asc" ? 1 : -1;
      linhasOrdenadas.sort((a, b) => {
        const x = a[ordenarPor.chave];
        const y = b[ordenarPor.chave];
        if (typeof x === "number" && typeof y === "number") return (x - y) * sinal;
        return comoTexto(x).localeCompare(comoTexto(y), "pt-BR") * sinal;
      });
    }
    const linhas = linhasOrdenadas.slice(0, receita.limite ?? 8).map((l) => {
      const saida: Record<string, string | number> = {};
      for (const c of colunas) {
        const v = l[c.chave];
        if (v === null || v === undefined) saida[c.chave] = "";
        else if (typeof v === "string" && v.length > MAXIMO_TEXTO_CELULA) saida[c.chave] = `${v.slice(0, MAXIMO_TEXTO_CELULA)}…`;
        else saida[c.chave] = v;
      }
      return saida;
    });
    if (linhas.length === 0) return null;
    const d: DadosTabela = {
      colunas: colunas.map((c) => ({
        chave: c.chave,
        rotulo: c.rotulo,
        tipo: c.tipo === "numero" ? (c.moeda ? "moeda" : c.percentual ? "percentual" : "numero") : c.tipo === "data" ? "data" : "texto",
      })),
      linhas,
    };
    return { ...base, tipo: "tabela", dados: d };
  }

  if (receita.tipo !== "linha" && receita.tipo !== "area" && receita.tipo !== "barra") return null;
  if (!grupo) return null;
  const coluna = acharColuna(dados, receita.coluna);
  let pontos = agrupar(dados, grupo, receita.coluna, receita.agregacao, receita.periodo, receita.ordenar ?? "rotulo");
  const limite = receita.limite ?? 12;
  // Ranking corta os maiores; série temporal corta o começo e mantém o fim (o período mais recente).
  pontos = grupo.tipo === "data" ? pontos.slice(-limite) : pontos.slice(0, limite);
  if (pontos.length < 2) return null;
  const d: DadosSerie = {
    eixoX: grupo.rotulo,
    eixoY: coluna?.rotulo ?? (receita.agregacao === "distintos" ? "Distintos" : "Linhas"),
    formato: formatoDe(coluna, receita.agregacao),
    pontos,
  };
  if (d.formato === "moeda") d.prefixo = "R$";
  if (receita.tipo === "barra") d.orientacao = receita.orientacao ?? "vertical";
  return { ...base, tipo: receita.tipo, dados: d };
}

// ---------------------------------------------------------------------------------------------------
// O painel inteiro
// ---------------------------------------------------------------------------------------------------

/**
 * Calcula todos os componentes e monta a especificação do painel. A posição vem daqui já no padrão
 * do PRD (indicadores na linha 0, gráficos na 1, distribuição e tabela na 2) porque a receita não
 * carrega layout: quem escolhe o recorte não precisa pensar na grade.
 */
export function montarPainel(espec: EspecReceitas, dados: Dados): EspecPainel {
  const calculados = espec.componentes
    .map((r) => calcular(r, dados))
    .filter((c): c is ComponentePainel => c !== null);

  const todosIndicadores = calculados.filter((c) => c.tipo === "indicador");
  const indicadores = todosIndicadores.slice(0, 4);
  // Do 5º em diante o indicador não cabe na linha 0; vai para o fim junto com as séries que sobraram.
  // Descartar em silêncio faria o ajuste dizer "acrescentei" sem nada aparecer na tela.
  const indicadoresExtras = todosIndicadores.slice(4);
  const series = calculados.filter((c) => c.tipo === "linha" || c.tipo === "area" || c.tipo === "barra");
  const distribuicoes = calculados.filter((c) => c.tipo === "pizza" || c.tipo === "rosca");
  const tabelas = calculados.filter((c) => c.tipo === "tabela").slice(0, 1);

  const componentes: ComponentePainel[] = [];
  let id = 1;
  const por = (c: ComponentePainel, linha: number, coluna: number, largura: 1 | 2 | 3 | 4) => {
    componentes.push({ ...c, id: `c${id++}`, posicao: { linha, coluna, largura } });
  };

  indicadores.forEach((c, i) => por(c, 0, i, 1));

  // Linha 1: até dois gráficos de 2 colunas. O que sobrar desce para a linha 3.
  const naLinha1 = series.slice(0, 2);
  naLinha1.forEach((c, i) => por(c, 1, i * 2, 2));

  // Linha 2: distribuição à esquerda e tabela à direita; sozinhas, ocupam a linha inteira.
  const dist = distribuicoes[0];
  const tab = tabelas[0];
  if (dist && tab) {
    por(dist, 2, 0, 2);
    por(tab, 2, 2, 2);
  } else if (dist) por(dist, 2, 0, 4);
  else if (tab) por(tab, 2, 0, 4);

  // Linha 3: o que sobrou — séries extras (largura 2) e indicadores extras (largura 1), empacotados
  // da esquerda para a direita e respeitando o teto de 8 componentes.
  let coluna3 = 0;
  for (const c of [...series.slice(2, 4), ...indicadoresExtras]) {
    const largura: 1 | 2 = c.tipo === "indicador" ? 1 : 2;
    if (componentes.length >= 8 || coluna3 + largura > 4) break;
    por(c, 3, coluna3, largura);
    coluna3 += largura;
  }

  return {
    titulo: espec.titulo,
    resumo: espec.resumo,
    setor: espec.setor,
    componentes: componentes.slice(0, 8),
  };
}
