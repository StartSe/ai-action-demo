// Geração de painel a partir de uma planilha enviada (dados externos reais).
//
// A diferença para lib/painel.ts é o que se pede à IA: lá ela escreve os NÚMEROS; aqui ela escreve
// só a RECEITA (quais colunas, qual agregação) e quem calcula é lib/agregar.ts, em cima das linhas
// do arquivo. Número inventado que se parece com o seu é pior que número nenhum.
//
// Sem chave de IA o app não cai em demonstração: `receitasAutomaticas()` monta um painel decente
// só pela tipagem das colunas. É o caminho que faz a planilha valer alguma coisa já no primeiro uso.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { montarPainel } from "./agregar";
import { guardarReceitas } from "./dados-store";
import { atualizarSaida, salvar } from "./historico";
import { IDIOMA } from "./idioma";
import { INSUMO_PLANILHA, perfilDeDados, type ColunaDados, type Dados } from "./planilha";
import {
  editarReceitasSemIA,
  lerEdicaoDaIA,
  PROMPT_EDITAR_RECEITAS,
  SYSTEM_EDITAR_RECEITAS,
  type EdicaoReceitas,
} from "./refinar-receitas";
import { validarReceitas, type EspecReceitas, type Periodo, type Receita, type ReceitaSemIdentidade } from "./receita";
import type { EspecPainel } from "./types";

/**
 * O que fica gravado como `entrada` do painel de planilha. As receitas NÃO moram aqui: `entrada` é
 * escrita uma vez por `salvar()` e `lib/historico.ts` é arquivo INFRA, sem gravador de entrada. Elas
 * ficam em `receitas_painel` (lib/dados-store.ts), que o ajuste conversando lê e regrava.
 */
export type EntradaDados = {
  descricao: string;
  dadosId?: string;
  arquivo: string;
  linhas: number;
};



export const SYSTEM_RECEITAS = `${IDIOMA}

Você é um analista de dados que monta painéis de indicadores a partir de uma planilha REAL da pessoa.

REGRA ABSOLUTA: você NUNCA escreve números. Você recebe a lista de colunas do arquivo e devolve apenas a RECEITA de cada componente — qual coluna agrupar, qual coluna agregar e qual conta fazer. Quem calcula é o servidor, em cima das linhas reais. Um número escrito por você seria descartado.

Você recebe o nome do arquivo, a quantidade de linhas e, para cada coluna: a chave (é ela que você usa), o rótulo, o tipo ("texto", "numero" ou "data"), e estatísticas.

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código):
{
  "titulo": "Título do painel em português, até 60 caracteres",
  "resumo": "Uma frase, até 25 palavras, sobre o que este painel acompanha",
  "setor": "O assunto que você reconheceu nos dados (ex.: Vendas, Financeiro, Logística)",
  "componentes": [ /* 5 a 8 componentes */ ]
}

TIPOS DE COMPONENTE E SUAS RECEITAS:

1. indicador — um número grande. Use 3 ou 4, sempre primeiro.
{ "tipo": "indicador", "titulo": "Receita total", "coluna": "valor_venda", "agregacao": "soma", "colunaData": "data_pedido", "periodo": "mes", "direcaoBoa": "aumentar" }
- "agregacao": "soma" | "media" | "contagem" | "minimo" | "maximo" | "distintos".
- "coluna" é obrigatória, EXCETO quando a agregação é "contagem" (conta linhas) ou "distintos".
- "colunaData" é opcional e precisa ser uma coluna do tipo "data": com ela o cartão compara o último período com o anterior. Sem ela, o cartão mostra o total do arquivo inteiro, sem variação.
- "direcaoBoa": "diminuir" quando cair for bom (custo, cancelamento, devolução, tempo, inadimplência).

2. linha / area — evolução no tempo. Exige uma coluna "data" em "agruparPor".
{ "tipo": "linha", "titulo": "Receita por mês", "agruparPor": "data_pedido", "periodo": "mes", "coluna": "valor_venda", "agregacao": "soma" }
- "periodo": "dia" | "mes" | "trimestre" | "ano".

3. barra — comparação ou ranking por categoria.
{ "tipo": "barra", "titulo": "Top vendedores", "agruparPor": "vendedor", "coluna": "valor_venda", "agregacao": "soma", "orientacao": "horizontal", "ordenar": "valor", "limite": 8 }
- "orientacao": "horizontal" quando os rótulos são nomes de pessoa, cliente ou produto; "vertical" para categorias curtas, meses ou dias.
- "ordenar": "valor" para ranking (do maior para o menor), "rotulo" para ordem alfabética ou cronológica.

4. pizza / rosca — distribuição em partes de um todo.
{ "tipo": "rosca", "titulo": "Receita por canal", "agruparPor": "canal", "coluna": "valor_venda", "agregacao": "soma", "limite": 6 }
- Escolha uma coluna de texto com POUCOS valores distintos (de 2 a 12). O servidor agrupa o excedente em "Outros".

5. tabela — o detalhe linha a linha.
{ "tipo": "tabela", "titulo": "Maiores pedidos", "colunas": ["cliente", "valor_venda", "data_pedido"], "ordenarPor": "valor_venda", "ordem": "desc", "limite": 8 }
- De 3 a 6 colunas, todas existentes no arquivo.

REGRAS DE ESCOLHA (é aqui que você agrega valor):
- Use SOMENTE chaves de coluna que aparecem na lista. Um componente que cite coluna inexistente é DESCARTADO inteiro.
- Escolha o que um analista escolheria: o dinheiro antes da contagem, a tendência antes do detalhe.
- Para "agruparPor" de barra, pizza e rosca, prefira colunas de texto com poucos valores distintos. Uma coluna com valor distinto em quase toda linha (um id, um nome de pedido) NÃO serve para agrupar — serve para a tabela.
- Só use "linha" ou "area" se existir coluna do tipo "data". Se não existir nenhuma, não gere série temporal e não use "colunaData" nos indicadores.
- Não repita o mesmo par coluna+agregação em dois componentes.
- Títulos em português, até 40 caracteres, falando do negócio e não da coluna ("Receita por canal", não "soma de valor_venda por canal").
- Entre 5 e 8 componentes: 3 ou 4 indicadores, 1 ou 2 gráficos, 1 distribuição e 1 tabela é a composição que costuma funcionar.

ANTI-PADRÕES (NUNCA FAÇA):
- NUNCA escreva um número de dado (valor, ponto, fatia, linha de tabela). Só receita.
- NUNCA invente uma coluna que não está na lista.
- NUNCA use "agruparPor" numa coluna do tipo "numero".
- NUNCA devolva markdown, cercas de código ou texto fora do JSON.
- NUNCA escreva em inglês nem sem acentuação.

Responda SOMENTE com o JSON. Nada antes, nada depois.`;

export const PROMPT_RECEITAS = (dados: Dados, descricao: string) =>
  `${perfilDeDados(dados)}\n\n` +
  (descricao.trim()
    ? `O que a pessoa quer acompanhar: "${descricao.trim()}"\n\nMonte o painel atendendo a esse pedido com as colunas que existem.`
    : `A pessoa não descreveu o que quer: monte o painel mais útil possível com estas colunas.`);

// ---------------------------------------------------------------------------------------------------
// Caminho sem IA: receitas pela tipagem das colunas
// ---------------------------------------------------------------------------------------------------

/**
 * Quantas palavras do pedido aparecem no rótulo da coluna. Sem IA é o único jeito de o pedido
 * ("por vendedor e por canal") influenciar a escolha — uma coluna citada vai para a frente da fila.
 */
function afinidade(coluna: ColunaDados, descricao: string): number {
  const alvo = descricao
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!alvo.trim()) return 0;
  const palavras = coluna.rotulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3);
  return palavras.filter((p) => alvo.includes(p)).length;
}

/** Uma coluna de texto serve de categoria quando repete o bastante para agrupar. */
function categorias(dados: Dados, descricao = ""): ColunaDados[] {
  const candidatas = dados.colunas
    .filter((c) => c.tipo === "texto" && c.distintos >= 2 && c.distintos <= 20 && c.distintos < dados.linhas.length)
    // Depois da afinidade vem o preenchimento: uma coluna com 40% das células vazias rende um
    // gráfico dominado por "(sem valor)". Ela só é escolhida quando a pessoa pediu pelo nome.
    .sort((a, b) => afinidade(b, descricao) - afinidade(a, descricao) || b.preenchidos - a.preenchidos || a.distintos - b.distintos);
  return semRepetidas(dados, candidatas);
}

/**
 * O período que faz a série render: 30 dias agrupados por mês viram dois pontos e nenhum gráfico.
 * A escolha sai da distância entre a primeira e a última data do arquivo.
 */
function periodoDaJanela(dados: Dados, coluna: ColunaDados): Periodo {
  let min: string | null = null;
  let max: string | null = null;
  for (const linha of dados.linhas) {
    const v = linha[coluna.chave];
    if (typeof v !== "string" || !/^\d{4}/.test(v)) continue;
    if (min === null || v < min) min = v;
    if (max === null || v > max) max = v;
  }
  if (!min || !max) return "mes";
  const dias = (Date.parse(`${max.slice(0, 10)}T00:00:00Z`) - Date.parse(`${min.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(dias)) return "mes";
  if (dias <= 62) return "dia";
  if (dias <= 730) return "mes";
  if (dias <= 1825) return "trimestre";
  return "ano";
}

/**
 * Duas colunas com exatamente as mesmas células não rendem dois gráficos diferentes. Acontece de
 * verdade: uma exportação com o cabeçalho "Turma" repetido gerou barra e rosca idênticas, e empurrou
 * para fora a coluna que a pessoa tinha pedido no texto.
 */
function mesmasCelulas(dados: Dados, a: ColunaDados, b: ColunaDados): boolean {
  if (a.preenchidos !== b.preenchidos || a.distintos !== b.distintos) return false;
  return dados.linhas.every((l) => l[a.chave] === l[b.chave]);
}

/** Tira da lista as colunas que repetem o conteúdo de uma anterior. */
function semRepetidas(dados: Dados, colunas: ColunaDados[]): ColunaDados[] {
  const saida: ColunaDados[] = [];
  for (const c of colunas) if (!saida.some((j) => mesmasCelulas(dados, j, c))) saida.push(c);
  return saida;
}

/** Colunas numéricas que valem um indicador: citada no pedido primeiro, depois dinheiro. */
function medidas(dados: Dados, descricao = ""): ColunaDados[] {
  const candidatas = dados.colunas
    .filter((c) => c.tipo === "numero" && c.preenchidos > 0)
    .sort((a, b) => afinidade(b, descricao) - afinidade(a, descricao) || Number(Boolean(b.moeda)) - Number(Boolean(a.moeda)));
  return semRepetidas(dados, candidatas);
}

/**
 * Monta as receitas sem nenhuma IA, só pela forma da planilha. Não é tão boa quanto a escolha de um
 * analista, mas é honesta: todo número sai das linhas do arquivo.
 */
export function receitasAutomaticas(dados: Dados, descricao: string): EspecReceitas {
  const datas = dados.colunas.filter((c) => c.tipo === "data" && c.preenchidos > 0);
  const cats = categorias(dados, descricao);
  const nums = medidas(dados, descricao);
  const principal = nums[0];
  const data = datas[0];
  const periodo: Periodo | undefined = data ? periodoDaJanela(dados, data) : undefined;
  const rotuloPeriodo = periodo === "dia" ? " no dia" : periodo === "trimestre" ? " no trimestre" : periodo === "ano" ? " no ano" : " no mês";
  const componentes: ReceitaSemIdentidade[] = [];
  const nomeArquivo = dados.nome.replace(/\.[^.]+$/, "");

  // Indicadores. Com coluna de data o cartão mostra o ÚLTIMO mês (e compara com o anterior), então o
  // título precisa dizer "no mês" — chamar de "Total" o recorte de um mês seria errado na tela.
  const sufixo = data ? rotuloPeriodo : "";
  if (principal) {
    componentes.push({ tipo: "indicador", titulo: `${principal.rotulo}${sufixo}`.slice(0, 40), coluna: principal.chave, agregacao: principal.percentual ? "media" : "soma", colunaData: data?.chave, periodo });
  }
  componentes.push({ tipo: "indicador", titulo: `Registros${sufixo}`.slice(0, 40), agregacao: "contagem", colunaData: data?.chave, periodo });
  if (principal) {
    componentes.push({ tipo: "indicador", titulo: `${principal.rotulo} médio${sufixo}`.slice(0, 40), coluna: principal.chave, agregacao: "media", colunaData: data?.chave, periodo });
  }
  if (cats[0]) {
    componentes.push({ tipo: "indicador", titulo: `${cats[0].rotulo} distintos`.slice(0, 40), coluna: cats[0].chave, agregacao: "distintos" });
  } else if (nums[1]) {
    componentes.push({ tipo: "indicador", titulo: `${nums[1].percentual ? `${nums[1].rotulo} médio` : `Total de ${nums[1].rotulo}`}`.slice(0, 40), coluna: nums[1].chave, agregacao: nums[1].percentual ? "media" : "soma" });
  }

  // Tendência, quando há data.
  if (data) {
    componentes.push({
      tipo: "linha",
      titulo: (principal ? `${principal.rotulo} por ${periodo === "dia" ? "dia" : periodo === "ano" ? "ano" : periodo === "trimestre" ? "trimestre" : "mês"}` : `Registros por ${periodo === "dia" ? "dia" : "mês"}`).slice(0, 40),
      agruparPor: data.chave,
      periodo,
      coluna: principal?.chave,
      agregacao: principal ? "soma" : "contagem",
      limite: periodo === "dia" ? 31 : 12,
    });
  }

  // Ranking pela primeira categoria.
  if (cats[0]) {
    componentes.push({
      tipo: "barra",
      titulo: principal ? `${principal.rotulo} por ${cats[0].rotulo}`.slice(0, 40) : `Registros por ${cats[0].rotulo}`.slice(0, 40),
      agruparPor: cats[0].chave,
      coluna: principal?.chave,
      agregacao: principal ? "soma" : "contagem",
      orientacao: "horizontal",
      ordenar: "valor",
      limite: 8,
    });
  }

  // Distribuição pela segunda categoria (ou pela primeira, se ela for a única).
  const paraDistribuir = cats[1] ?? (data || !cats[0] ? undefined : cats[0]);
  if (paraDistribuir) {
    componentes.push({
      tipo: "rosca",
      titulo: principal ? `${principal.rotulo} por ${paraDistribuir.rotulo}`.slice(0, 40) : `Registros por ${paraDistribuir.rotulo}`.slice(0, 40),
      agruparPor: paraDistribuir.chave,
      coluna: principal?.chave,
      agregacao: principal ? "soma" : "contagem",
      limite: 6,
    });
  }

  // Tabela com as colunas mais informativas.
  const paraTabela = [...cats.slice(0, 2), ...(data ? [data] : []), ...nums.slice(0, 2)]
    .filter((c, i, lista) => lista.findIndex((x) => x.chave === c.chave) === i)
    .slice(0, 5);
  if (paraTabela.length >= 2) {
    componentes.push({
      tipo: "tabela",
      titulo: principal ? `Maiores por ${principal.rotulo}`.slice(0, 40) : "Detalhe do arquivo",
      colunas: paraTabela.map((c) => c.chave),
      ordenarPor: principal?.chave,
      ordem: "desc",
      limite: 8,
    });
  }

  const comIdentidade = componentes.map((c, i) => ({ ...c, id: `c${i + 1}`, posicao: { linha: 0, coluna: 0, largura: 1 as const } })) as Receita[];
  return {
    titulo: `Painel de ${nomeArquivo}`.slice(0, 60),
    resumo: descricao.trim()
      ? `${descricao.trim().slice(0, 100)} — a partir das ${dados.linhas.length.toLocaleString("pt-BR")} linhas de ${dados.nome}.`
      : `Painel montado a partir das ${dados.linhas.length.toLocaleString("pt-BR")} linhas de ${dados.nome}.`,
    setor: "Dados do arquivo",
    componentes: comIdentidade,
  };
}

// ---------------------------------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------------------------------

export type ResultadoPainelDados = {
  /** true quando o recorte foi escolhido sem IA (automático). Os NÚMEROS são reais nos dois casos. */
  automatico: boolean;
  painel: EspecPainel;
  meta: Meta;
  id?: string;
};

export type ResultadoRefinoDados =
  | { tipo: "esclarecimento"; mensagem: string }
  | { tipo: "ok"; painel: EspecPainel; mensagem: string; componentesAlterados: string[]; meta: Meta };

const MINIMO_ACEITAVEL = 3;

/**
 * Gera o painel a partir dos dados. Sem chave de IA (ou quando a resposta dela não rende componentes
 * suficientes) cai nas receitas automáticas — nunca em números de demonstração, que aqui seriam uma
 * mentira: a pessoa mandou o arquivo dela justamente para ver o dado dela.
 */
export async function gerarPainelDeDados(
  dados: Dados,
  descricao: string,
  opts: { guardar?: boolean; dadosId?: string } = {},
): Promise<ResultadoPainelDados> {
  const guardar = opts.guardar ?? true;
  let painel: EspecPainel | null = null;
  let receitas: EspecReceitas | null = null;
  let automatico = true;

  if (aiEnabled()) {
    try {
      const bruto = await askJSON<unknown>({ system: SYSTEM_RECEITAS, prompt: PROMPT_RECEITAS(dados, descricao), maxTokens: 3000 });
      const espec = validarReceitas(bruto, dados);
      const candidato = montarPainel(espec, dados);
      if (candidato.componentes.length >= MINIMO_ACEITAVEL) {
        painel = candidato;
        receitas = espec;
        automatico = false;
      } else {
        console.warn(`[painel-dados] a IA rendeu ${candidato.componentes.length} componentes válidos; caindo no automático.`);
      }
    } catch (err) {
      // Falha de IA não pode impedir o painel: os dados são reais e o automático dá conta.
      console.warn("[painel-dados] IA falhou; caindo no automático:", err instanceof Error ? err.message : err);
    }
  }

  if (!painel) {
    receitas = receitasAutomaticas(dados, descricao);
    painel = montarPainel(receitas, dados);
  }

  const metaGerada = meta({
    demo: false,
    insumo: `${INSUMO_PLANILHA}${dados.nome}${automatico ? " (recorte automático)" : ""}`,
  });
  const entrada: EntradaDados = { descricao, dadosId: opts.dadosId, arquivo: dados.nome, linhas: dados.linhas.length };
  const id = guardar
    ? salvar({ tipo: "painel", titulo: painel.titulo, resumo: painel.resumo, entrada, saida: painel, meta: metaGerada })
    : undefined;
  // As receitas ficam em tabela própria, ligadas ao id do painel: é delas que o ajuste parte depois.
  if (id && receitas && opts.dadosId) guardarReceitas(id, opts.dadosId, receitas);
  return { automatico, painel, meta: metaGerada, id };
}

// ---------------------------------------------------------------------------------------------------
// Ajuste
// ---------------------------------------------------------------------------------------------------

/**
 * Ajusta um painel de planilha editando a RECEITA e recalculando das linhas do arquivo. Nunca chama o
 * refino de lib/painel.ts, que pede números à IA: aqui os valores são do usuário e não se reescrevem.
 */
export async function refinarPainelDeDados(
  dados: Dados,
  receitas: EspecReceitas,
  pedido: string,
  id?: string,
  dadosId?: string,
): Promise<ResultadoRefinoDados> {
  let edicao: EdicaoReceitas;
  if (aiEnabled()) {
    try {
      const bruto = await askJSON<unknown>({
        system: SYSTEM_EDITAR_RECEITAS,
        prompt: PROMPT_EDITAR_RECEITAS(receitas, perfilDeDados(dados), pedido),
        maxTokens: 3000,
      });
      edicao = lerEdicaoDaIA(bruto, receitas, dados);
    } catch (err) {
      // Falha de IA cai no editor por palavra-chave: pior um ajuste simples que ajuste nenhum.
      console.warn("[refinar-dados] IA falhou; usando o editor sem IA:", err instanceof Error ? err.message : err);
      edicao = editarReceitasSemIA(receitas, pedido, dados);
    }
  } else {
    edicao = editarReceitasSemIA(receitas, pedido, dados);
  }

  if (edicao.tipo === "esclarecimento") return edicao;

  const painel = montarPainel(edicao.receitas, dados);
  if (painel.componentes.length < MINIMO_ACEITAVEL) {
    return { tipo: "esclarecimento", mensagem: "Esse ajuste deixaria o painel sem cartões suficientes. Diga de outro jeito." };
  }
  painel.refinadoEm = new Date().toISOString();
  if (id) {
    if (!atualizarSaida(id, painel)) console.warn(`[refinar-dados] painel ${id} não existe mais; resultado não gravado.`);
    else if (dadosId) guardarReceitas(id, dadosId, edicao.receitas);
  }
  return { tipo: "ok", painel, mensagem: edicao.mensagem, componentesAlterados: edicao.alterados, meta: meta({ demo: false, insumo: `${INSUMO_PLANILHA}${dados.nome} (ajustado)` }) };
}
