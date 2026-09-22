// Leitura de planilha em texto separado (CSV, TSV, ponto e vírgula) e perfilamento das colunas.
// Sem nenhum import node:* e sem dependência nova — este arquivo é lido também pelo Client Component
// app/page.tsx, que mostra o resumo do arquivo antes de gerar o painel. Mesma filosofia de
// lib/store.ts (SQLite sem ORM) e lib/mcp.ts (JSON-RPC à mão).
//
// O que ele NÃO faz: ler .xlsx. O formato é um zip de XML e um leitor próprio seria grande demais
// para o ganho; `detectarFormato()` reconhece o arquivo e devolve a frase que manda salvar como CSV.

/** Os três tipos que o agregador sabe tratar. "data" é sempre normalizada para AAAA-MM-DD. */
export type TipoColuna = "texto" | "numero" | "data";

export interface ColunaDados {
  /** Identificador sem acento nem espaço, usado nas receitas e nas chaves da tabela. */
  chave: string;
  /** O cabeçalho como veio no arquivo, mostrado na tela. */
  rotulo: string;
  tipo: TipoColuna;
  /**
   * Quantas células viraram valor USÁVEL. Numa coluna numérica, conta só o que converteu: um
   * "N/A" no meio de mil números não é um preenchimento, é um buraco. Contar antes da conversão
   * fazia a tela prometer 525 valores numa coluna com 44 nulos.
   */
  preenchidos: number;
  /** Células não vazias que NÃO converteram para o tipo da coluna, e por isso viraram nulo. */
  descartados: number;
  /** Valores distintos, até o teto de CARDINALIDADE_MAXIMA. Define se a coluna serve de categoria. */
  distintos: number;
  /** Só para tipo "numero". */
  min?: number;
  max?: number;
  soma?: number;
  /** Até 5 valores reais, para o perfil que vai à IA e para a prévia na tela. */
  amostra: Array<string | number>;
  /** Heurística de cabeçalho: a coluna parece dinheiro. Vira formato "moeda" com prefixo "R$". */
  moeda?: boolean;
  /** Heurística de cabeçalho ou de valores com "%": vira formato "percentual". */
  percentual?: boolean;
}

/** Uma célula já convertida: número para colunas numéricas, string para o resto, null quando vazia. */
export type Celula = string | number | null;

export interface Dados {
  /** Nome do arquivo enviado, mostrado na tela e no rodapé do painel. */
  nome: string;
  colunas: ColunaDados[];
  linhas: Array<Record<string, Celula>>;
  /** Linhas lidas do arquivo (pode ser maior que `linhas.length` quando bate o teto). */
  totalLinhas: number;
  /** true quando o arquivo foi cortado em LINHAS_MAXIMAS. */
  truncado: boolean;
}

/**
 * Prefixo do `insumo` que marca um painel vindo de planilha. Mora aqui (arquivo sem node:*) porque
 * quem lê é o Client Component ResultadoPainel, para escolher entre "números de exemplo" e "números
 * do seu arquivo". Como o insumo é gravado junto com o painel, /r/[id] e /imprimir/[id] acertam o
 * aviso sem reabrir o arquivo.
 */
export const INSUMO_PLANILHA = "planilha ";

export const LINHAS_MAXIMAS = 50_000;
export const COLUNAS_MAXIMAS = 60;
export const TAMANHO_MAXIMO = 8 * 1024 * 1024; // 8 MB
const CARDINALIDADE_MAXIMA = 1000;
const AMOSTRA = 5;

export class ErroPlanilha extends Error {}

// ---------------------------------------------------------------------------------------------------
// Formato do arquivo
// ---------------------------------------------------------------------------------------------------

/** Reconhece pelos bytes iniciais o que não dá para ler, para explicar em vez de falhar no parser. */
export function detectarFormato(nome: string, bytes: Uint8Array): string | null {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK": xlsx, ods, numbers
  if (zip || ext === "xlsx" || ext === "xls" || ext === "ods" || ext === "numbers") {
    return "Este formato de planilha ainda não é lido. Abra o arquivo, use \"Salvar como\" (ou \"Exportar\") e escolha CSV.";
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50) return "Isto é um PDF. Envie a planilha em CSV."; // "%P"
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Separador e leitura bruta
// ---------------------------------------------------------------------------------------------------

const SEPARADORES = [",", ";", "\t", "|"] as const;

/**
 * Escolhe o separador pela primeira linha não vazia: vence o que produzir mais campos.
 * Empate fica com o primeiro da lista, que é a ordem de frequência no mundo real.
 */
function acharSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim()) ?? "";
  let melhor = ",";
  let maisCampos = 0;
  for (const sep of SEPARADORES) {
    const campos = dividirLinha(primeira, sep).length;
    if (campos > maisCampos) {
      maisCampos = campos;
      melhor = sep;
    }
  }
  return melhor;
}

/** Divide uma linha respeitando aspas duplas no padrão RFC 4180 (`""` é uma aspa literal). */
function dividirLinha(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else dentroDeAspas = false;
      } else atual += c;
    } else if (c === '"') dentroDeAspas = true;
    else if (c === sep) {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  return campos;
}

/**
 * Quebra o texto em linhas lógicas: um "\n" dentro de aspas pertence ao campo, não separa a linha.
 * Percorre caractere a caractere porque um split por "\n" quebraria endereços e observações com quebra.
 */
function quebrarLinhas(texto: string): string[] {
  const linhas: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      dentroDeAspas = !dentroDeAspas;
      atual += c;
    } else if (c === "\n" && !dentroDeAspas) {
      linhas.push(atual.endsWith("\r") ? atual.slice(0, -1) : atual);
      atual = "";
    } else atual += c;
  }
  if (atual.trim()) linhas.push(atual.endsWith("\r") ? atual.slice(0, -1) : atual);
  return linhas;
}

// ---------------------------------------------------------------------------------------------------
// Conversão de valores
// ---------------------------------------------------------------------------------------------------

const SO_NUMERO = /^[-+]?[\d.,\s]*\d[\d.,\s]*$/;

/**
 * Converte um texto em número aceitando os dois mundos: "1.234,56" (pt-BR) e "1,234.56" (en-US).
 * A regra é o ÚLTIMO separador presente decidir quem é a vírgula decimal; com um separador só,
 * ele é decimal quando sobram 1 ou 2 dígitos à direita (12,5) e milhar quando sobram 3 (1.234).
 */
export function lerNumero(bruto: string): number | null {
  let texto = bruto.trim();
  if (!texto) return null;
  const negativoEntreParenteses = /^\(.*\)$/.test(texto);
  if (negativoEntreParenteses) texto = texto.slice(1, -1);
  texto = texto.replace(/R\$|US\$|€|%/gi, "").replace(/\s/g, "").trim();
  if (!texto || !SO_NUMERO.test(texto)) return null;

  const ultimoPonto = texto.lastIndexOf(".");
  const ultimaVirgula = texto.lastIndexOf(",");
  let normalizado: string;
  if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
    // Os dois presentes: o que vier depois é o decimal, o outro é separador de milhar.
    normalizado = ultimaVirgula > ultimoPonto
      ? texto.replace(/\./g, "").replace(",", ".")
      : texto.replace(/,/g, "");
  } else if (ultimaVirgula >= 0) {
    const casas = texto.length - ultimaVirgula - 1;
    normalizado = casas === 3 ? texto.replace(/,/g, "") : texto.replace(",", ".");
  } else if (ultimoPonto >= 0) {
    const casas = texto.length - ultimoPonto - 1;
    // "1.234" com 3 casas e mais de um ponto é milhar; "1.234" sozinho também costuma ser.
    const pontos = (texto.match(/\./g) ?? []).length;
    normalizado = casas === 3 && (pontos > 1 || texto.replace(/[^\d]/g, "").length > 3) ? texto.replace(/\./g, "") : texto;
  } else normalizado = texto;

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;
  // "12,5%" vira 12.5: o "%" é sinal de formato (a coluna vira percentual), não de escala.
  return negativoEntreParenteses ? -n : n;
}

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  feb: "02", apr: "04", may: "05", aug: "08", sep: "09", oct: "10", dec: "12",
};

/** Converte uma data em AAAA-MM-DD (ou AAAA-MM quando o dia não existe). Devolve null se não for data. */
export function lerData(bruto: string): string | null {
  const texto = bruto.trim();
  if (!texto || texto.length > 32) return null;

  const iso = texto.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (iso) return iso[3] ? `${iso[1]}-${iso[2]}-${iso[3]}` : `${iso[1]}-${iso[2]}`;

  const barra = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (barra) {
    const [, a, b, c] = barra;
    const ano = c.length === 2 ? `20${c}` : c;
    // Padrão brasileiro dia/mês; se o primeiro campo passar de 12, só pode ser dia mesmo.
    const dia = a.padStart(2, "0");
    const mes = b.padStart(2, "0");
    if (Number(mes) >= 1 && Number(mes) <= 12 && Number(dia) >= 1 && Number(dia) <= 31) return `${ano}-${mes}-${dia}`;
    return null;
  }

  const mesAno = texto.match(/^(\d{1,2})[/\-](\d{4})$/);
  if (mesAno) return `${mesAno[2]}-${mesAno[1].padStart(2, "0")}`;

  const nomeMes = texto.match(/^([a-zA-ZçÇ]{3,})[/\-\s]+(\d{2,4})$/);
  if (nomeMes) {
    const mes = MESES[nomeMes[1].slice(0, 3).toLowerCase()];
    if (mes) {
      const ano = nomeMes[2].length === 2 ? `20${nomeMes[2]}` : nomeMes[2];
      return `${ano}-${mes}`;
    }
  }
  return null;
}

/** Normaliza um cabeçalho em chave: sem acento, sem espaço, minúscula. */
export function chaveDe(rotulo: string, jaUsadas: Set<string>): string {
  const base = rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "coluna";
  let chave = base;
  let n = 2;
  while (jaUsadas.has(chave)) chave = `${base}_${n++}`;
  jaUsadas.add(chave);
  return chave;
}

const PALAVRAS_MOEDA = /receita|valor|pre[cç]o|custo|faturamento|venda|ticket|sal[aá]rio|gasto|despesa|lucro|margem|r\$|total|montante|pagamento|investimento/i;
const PALAVRAS_PERCENTUAL = /%|percent|taxa|convers[aã]o|propor[cç][aã]o/i;

// ---------------------------------------------------------------------------------------------------
// Leitura completa
// ---------------------------------------------------------------------------------------------------

/**
 * Lê o conteúdo de um CSV/TSV e devolve os dados já tipados por coluna.
 * O tipo de cada coluna sai por maioria: 80% das células não vazias precisam converter para o tipo.
 */
export function lerPlanilha(texto: string, nome: string): Dados {
  const semBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const cruas = quebrarLinhas(semBom);
  if (cruas.length === 0) throw new ErroPlanilha("O arquivo está vazio.");

  const sep = acharSeparador(semBom);
  const cabecalho = dividirLinha(cruas[0], sep).map((c) => c.trim());
  if (cabecalho.length < 2) {
    throw new ErroPlanilha("Não encontrei colunas separadas. Confira se o arquivo é um CSV com cabeçalho na primeira linha.");
  }
  if (cabecalho.filter(Boolean).length === 0) throw new ErroPlanilha("A primeira linha precisa ter os nomes das colunas.");

  const usadas = new Set<string>();
  const cabecalhos = cabecalho.slice(0, COLUNAS_MAXIMAS).map((rotulo, i) => {
    const visivel = rotulo || `Coluna ${i + 1}`;
    return { rotulo: visivel, chave: chaveDe(visivel, usadas) };
  });

  // Passo 1: recolher os valores brutos, já cortados no teto de linhas.
  const brutas: string[][] = [];
  for (let i = 1; i < cruas.length && brutas.length < LINHAS_MAXIMAS; i++) {
    const campos = dividirLinha(cruas[i], sep);
    if (campos.every((c) => !c.trim())) continue;
    brutas.push(campos);
  }
  if (brutas.length === 0) throw new ErroPlanilha("O arquivo só tem o cabeçalho: não há linhas de dados.");

  // Passo 2: decidir o tipo de cada coluna olhando todos os valores não vazios.
  const colunas: ColunaDados[] = cabecalhos.map((c, indice) => {
    const valores = brutas.map((linha) => (linha[indice] ?? "").trim()).filter(Boolean);
    const numeros = valores.filter((v) => lerNumero(v) !== null).length;
    const datas = valores.filter((v) => lerData(v) !== null).length;
    const total = valores.length || 1;
    // Data vem antes de número: "2026" e "09/2026" convertem para os dois, e data é a leitura útil.
    const tipo: TipoColuna = datas / total >= 0.8 ? "data" : numeros / total >= 0.8 ? "numero" : "texto";

    const distintos = new Set<string>();
    for (const v of valores) {
      if (distintos.size >= CARDINALIDADE_MAXIMA) break;
      distintos.add(v);
    }

    // O que de fato converte para o tipo da coluna; o resto é buraco, não preenchimento.
    const uteis =
      tipo === "numero" ? valores.filter((v) => lerNumero(v) !== null)
      : tipo === "data" ? valores.filter((v) => lerData(v) !== null)
      : valores;
    const distintosUteis = new Set<string>();
    for (const v of uteis) {
      if (distintosUteis.size >= CARDINALIDADE_MAXIMA) break;
      distintosUteis.add(v);
    }

    const coluna: ColunaDados = {
      chave: c.chave,
      rotulo: c.rotulo,
      tipo,
      preenchidos: uteis.length,
      descartados: valores.length - uteis.length,
      distintos: tipo === "texto" ? distintos.size : distintosUteis.size,
      amostra: uteis.slice(0, AMOSTRA),
    };
    if (tipo === "numero") {
      const nums = valores.map(lerNumero).filter((n): n is number => n !== null);
      coluna.min = nums.length ? Math.min(...nums) : undefined;
      coluna.max = nums.length ? Math.max(...nums) : undefined;
      coluna.soma = nums.reduce((s, n) => s + n, 0);
      coluna.amostra = nums.slice(0, AMOSTRA);
      const pareceMoeda = PALAVRAS_MOEDA.test(c.rotulo) || valores.some((v) => /R\$/i.test(v));
      const parecePercentual = PALAVRAS_PERCENTUAL.test(c.rotulo) || valores.some((v) => v.includes("%"));
      // Percentual ganha de moeda: "taxa de conversão" casa com as duas listas por causa de "taxa".
      if (parecePercentual) coluna.percentual = true;
      else if (pareceMoeda) coluna.moeda = true;
    }
    return coluna;
  });

  // Passo 3: converter as células conforme o tipo decidido.
  const linhas = brutas.map((campos) => {
    const linha: Record<string, Celula> = {};
    colunas.forEach((coluna, indice) => {
      const bruto = (campos[indice] ?? "").trim();
      if (!bruto) {
        linha[coluna.chave] = null;
        return;
      }
      if (coluna.tipo === "numero") linha[coluna.chave] = lerNumero(bruto);
      else if (coluna.tipo === "data") linha[coluna.chave] = lerData(bruto) ?? bruto;
      else linha[coluna.chave] = bruto;
    });
    return linha;
  });

  return {
    nome,
    colunas,
    linhas,
    totalLinhas: cruas.length - 1,
    truncado: cruas.length - 1 > brutas.length,
  };
}

// ---------------------------------------------------------------------------------------------------
// Perfil para a IA
// ---------------------------------------------------------------------------------------------------

/**
 * Descrição compacta do arquivo, em texto, para caber no prompt sem levar os dados junto.
 * A IA escolhe colunas e agregações a partir daqui; os números quem calcula é o servidor.
 */
export function perfilDeDados(dados: Dados): string {
  const linhas = dados.colunas.map((c) => {
    const partes = [`- "${c.chave}" (${c.rotulo}) — ${c.tipo}`];
    if (c.tipo === "numero") {
      partes.push(`mínimo ${c.min}, máximo ${c.max}, soma ${c.soma}`);
      if (c.moeda) partes.push("parece dinheiro");
      if (c.percentual) partes.push("parece percentual");
    } else {
      partes.push(`${c.distintos} valores distintos`);
      if (c.amostra.length) partes.push(`exemplos: ${c.amostra.slice(0, 3).map((v) => `"${v}"`).join(", ")}`);
    }
    partes.push(`${c.preenchidos} de ${dados.linhas.length} preenchidos`);
    if (c.descartados > 0) partes.push(`${c.descartados} valores não convertidos e ignorados`);
    return partes.join("; ");
  });
  return `Arquivo "${dados.nome}" com ${dados.linhas.length} linhas e ${dados.colunas.length} colunas.\n\nColunas:\n${linhas.join("\n")}`;
}

/** Resumo curto para a tela e para o rodapé do painel. */
export function resumoDeDados(dados: Dados): string {
  const n = dados.linhas.length.toLocaleString("pt-BR");
  return `${dados.nome} · ${n} ${dados.linhas.length === 1 ? "linha" : "linhas"} · ${dados.colunas.length} colunas`;
}
