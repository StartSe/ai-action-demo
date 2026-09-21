// A "receita" de um componente: QUAIS colunas e QUAL agregação, nunca os números.
// É o contrato que separa o que a IA decide do que o servidor calcula — com uma planilha na mão,
// a IA escolhe o recorte e `lib/agregar.ts` faz a conta em cima das linhas reais. Sem isso a IA
// escreveria números parecidos com os seus, que é o pior resultado possível: plausível e errado.
//
// Sem import node:*: app/page.tsx lê os tipos daqui.
import type { ColunaDados, Dados, TipoColuna } from "./planilha";
import type { Posicao } from "./types";

export type Agregacao = "soma" | "media" | "contagem" | "minimo" | "maximo" | "distintos";
export type Periodo = "dia" | "mes" | "trimestre" | "ano";

export const AGREGACOES: Agregacao[] = ["soma", "media", "contagem", "minimo", "maximo", "distintos"];
export const PERIODOS: Periodo[] = ["dia", "mes", "trimestre", "ano"];

interface ReceitaBase {
  id: string;
  titulo: string;
  posicao: Posicao;
}

export interface ReceitaIndicador extends ReceitaBase {
  tipo: "indicador";
  /** Coluna numérica agregada. Dispensável só quando `agregacao` é "contagem". */
  coluna?: string;
  agregacao: Agregacao;
  /** Quando informada, o cartão compara o último período fechado com o anterior. */
  colunaData?: string;
  periodo?: Periodo;
  direcaoBoa?: "aumentar" | "diminuir";
}

export interface ReceitaSerie extends ReceitaBase {
  tipo: "linha" | "area" | "barra";
  /** Coluna do eixo X: uma data (agrupada por `periodo`) ou uma categoria. */
  agruparPor: string;
  periodo?: Periodo;
  coluna?: string;
  agregacao: Agregacao;
  orientacao?: "vertical" | "horizontal";
  limite?: number;
  /** "rotulo" mantém a ordem cronológica/alfabética; "valor" ordena do maior para o menor (ranking). */
  ordenar?: "rotulo" | "valor";
}

export interface ReceitaDistribuicao extends ReceitaBase {
  tipo: "pizza" | "rosca";
  agruparPor: string;
  coluna?: string;
  agregacao: Agregacao;
  limite?: number;
}

export interface ReceitaTabela extends ReceitaBase {
  tipo: "tabela";
  /** Chaves das colunas do arquivo, de 3 a 6. */
  colunas: string[];
  ordenarPor?: string;
  ordem?: "desc" | "asc";
  limite?: number;
}

export type Receita = ReceitaIndicador | ReceitaSerie | ReceitaDistribuicao | ReceitaTabela;

/**
 * `Omit` aplicado direto a uma união colapsa nas chaves comuns. Um condicional sobre um parâmetro
 * genérico nu distribui por membro, preservando `agruparPor`, `colunas` e companhia.
 * Usado por quem monta receitas antes de ter id e posição.
 */
type SemIdentidade<T> = T extends unknown ? Omit<T, "id" | "posicao"> : never;
export type ReceitaSemIdentidade = SemIdentidade<Receita>;

export interface EspecReceitas {
  titulo: string;
  resumo: string;
  setor: string;
  componentes: Receita[];
}

// ---------------------------------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------------------------------

const TIPOS = ["indicador", "linha", "area", "barra", "pizza", "rosca", "tabela"] as const;

function texto(v: unknown, maximo: number): string {
  return typeof v === "string" ? v.trim().slice(0, maximo) : "";
}

function coluna(dados: Dados, chave: unknown, tipo?: TipoColuna): ColunaDados | undefined {
  if (typeof chave !== "string") return undefined;
  const alvo = chave.trim();
  // A IA às vezes devolve o rótulo visível em vez da chave: aceitar os dois evita descartar o componente.
  const achada = dados.colunas.find((c) => c.chave === alvo)
    ?? dados.colunas.find((c) => c.rotulo.toLowerCase() === alvo.toLowerCase());
  if (!achada) return undefined;
  if (tipo && achada.tipo !== tipo) return undefined;
  return achada;
}

function agregacao(v: unknown, padrao: Agregacao = "soma"): Agregacao {
  return AGREGACOES.includes(v as Agregacao) ? (v as Agregacao) : padrao;
}

function periodo(v: unknown): Periodo | undefined {
  return PERIODOS.includes(v as Periodo) ? (v as Periodo) : undefined;
}

function inteiro(v: unknown, minimo: number, maximo: number): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(maximo, Math.max(minimo, Math.round(n)));
}

/**
 * Descarta toda receita que aponte para coluna inexistente ou tipo incompatível — é o que impede
 * a IA de inventar uma coluna que a planilha não tem. O que sobra é garantidamente calculável.
 */
export function validarReceitas(bruto: unknown, dados: Dados): EspecReceitas {
  const obj = (bruto ?? {}) as Record<string, unknown>;
  const numericas = dados.colunas.filter((c) => c.tipo === "numero");
  const lista = Array.isArray(obj.componentes) ? obj.componentes : [];
  const componentes: Receita[] = [];

  for (const cru of lista) {
    const c = (cru ?? {}) as Record<string, unknown>;
    const tipo = TIPOS.find((t) => t === c.tipo);
    if (!tipo) continue;
    const titulo = texto(c.titulo, 40);
    if (!titulo) continue;
    const id = `c${componentes.length + 1}`;
    // A posição real é recalculada por validarPainel() depois; aqui só um lugar válido.
    const base = { id, titulo, posicao: { linha: 0, coluna: 0, largura: 1 as const } };

    if (tipo === "indicador") {
      const agg = agregacao(c.agregacao);
      const alvo = coluna(dados, c.coluna, "numero");
      if (agg !== "contagem" && agg !== "distintos" && !alvo) continue;
      const data = coluna(dados, c.colunaData, "data");
      componentes.push({
        ...base,
        tipo,
        coluna: alvo?.chave,
        agregacao: agg,
        colunaData: data?.chave,
        periodo: periodo(c.periodo) ?? (data ? "mes" : undefined),
        direcaoBoa: c.direcaoBoa === "diminuir" ? "diminuir" : "aumentar",
      });
      continue;
    }

    if (tipo === "tabela") {
      const escolhidas = (Array.isArray(c.colunas) ? c.colunas : [])
        .map((k) => coluna(dados, k))
        .filter((x): x is ColunaDados => Boolean(x))
        .slice(0, 6);
      if (escolhidas.length < 2) continue;
      const ordenarPor = coluna(dados, c.ordenarPor);
      componentes.push({
        ...base,
        tipo,
        colunas: escolhidas.map((x) => x.chave),
        ordenarPor: ordenarPor && escolhidas.some((e) => e.chave === ordenarPor.chave) ? ordenarPor.chave : undefined,
        ordem: c.ordem === "asc" ? "asc" : "desc",
        limite: inteiro(c.limite, 3, 10) ?? 8,
      });
      continue;
    }

    // Série e distribuição compartilham agrupamento e agregação.
    const grupo = coluna(dados, c.agruparPor);
    if (!grupo) continue;
    const agg = agregacao(c.agregacao);
    let alvo = coluna(dados, c.coluna, "numero");
    // Sem coluna numérica indicada e com agregação que exige uma: cair para contagem em vez de descartar.
    const precisaDeNumero = agg !== "contagem" && agg !== "distintos";
    if (precisaDeNumero && !alvo) {
      if (numericas.length === 1) alvo = numericas[0];
      else continue;
    }

    if (tipo === "pizza" || tipo === "rosca") {
      componentes.push({ ...base, tipo, agruparPor: grupo.chave, coluna: alvo?.chave, agregacao: agg, limite: inteiro(c.limite, 3, 6) ?? 6 });
    } else {
      const ehData = grupo.tipo === "data";
      componentes.push({
        ...base,
        tipo,
        agruparPor: grupo.chave,
        periodo: ehData ? (periodo(c.periodo) ?? "mes") : undefined,
        coluna: alvo?.chave,
        agregacao: agg,
        orientacao: c.orientacao === "horizontal" ? "horizontal" : "vertical",
        limite: inteiro(c.limite, 3, 12) ?? 12,
        ordenar: c.ordenar === "valor" || (!ehData && tipo === "barra") ? "valor" : "rotulo",
      });
    }
  }

  return {
    titulo: texto(obj.titulo, 60) || `Painel de ${dados.nome.replace(/\.[^.]+$/, "")}`.slice(0, 60),
    resumo: texto(obj.resumo, 160) || `Painel montado a partir de ${dados.linhas.length} linhas do arquivo enviado.`,
    setor: texto(obj.setor, 40) || "Dados do arquivo",
    componentes: componentes.slice(0, 8),
  };
}
