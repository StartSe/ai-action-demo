// Lógica de negócio da classificação, usada tanto pela rota HTTP (app/api/classificar/route.ts) quanto
// pela ferramenta MCP (lib/ferramentas.ts) — nenhuma das duas duplica o prompt ou a validação.
//
// Regra central do produto (anti-alucinação): o vocabulário de categorias vem 100% do CSV de histórico
// enviado, nunca de uma lista fixa do app; toda classificação cita o(s) lançamento(s) do histórico que a
// sustentam; sem citação válida ou sem categoria dentro do vocabulário do histórico, o lançamento vira
// "revisar" em vez de forçado numa categoria — essas três garantias são conferidas aqui no código, não só
// pedidas ao modelo por instrução.
import { aiEnabled, askJSON, meta as metaIA, type Meta } from "./ai";
import { mapearColunasHistorico, mapearColunasNovos, parseCSV, parseNumero } from "./csv";
import { DEMO_HISTORICO_CSV, DEMO_NOVOS_CSV, esperar, resultadoDemo } from "./demo";
import { salvar } from "./historico";
import { formatarMoeda } from "./moeda";
import type { LancamentoClassificado, LancamentoHistorico, LancamentoNovo, NivelConfianca, ResultadoClassificacao } from "./types";

/** Entrada inválida (CSV sem as colunas certas, arquivo vazio etc.) — sempre vira 400 na rota HTTP. */
export class ErroEntrada extends Error {}

const LIMITE_HISTORICO = 220; // linhas do histórico enviadas à IA por chamada (mantém o prompt num tamanho razoável)
const TAMANHO_LOTE = 18; // lançamentos novos classificados por chamada de IA

export function lerHistorico(texto: string): LancamentoHistorico[] {
  const { cabecalho, linhas } = parseCSV(texto);
  if (!cabecalho.length) throw new ErroEntrada("O arquivo de histórico está vazio ou não é um CSV válido.");
  const m = mapearColunasHistorico(cabecalho);
  if (m.descricao < 0 || m.valor < 0 || m.categoria < 0) {
    throw new ErroEntrada('O histórico precisa de colunas de descrição, valor e categoria (ex.: "Descrição", "Valor" e "Categoria" ou "Conta"). Confira o cabeçalho do CSV.');
  }
  const registros: LancamentoHistorico[] = [];
  for (const linha of linhas) {
    const valor = parseNumero(linha[m.valor]);
    const descricao = (linha[m.descricao] || "").trim();
    const categoria = (linha[m.categoria] || "").trim();
    if (valor === null || !descricao || !categoria) continue;
    registros.push({ data: m.data >= 0 ? (linha[m.data] || "").trim() : "", descricao, valor: Math.abs(valor), categoria });
  }
  if (!registros.length) throw new ErroEntrada("Não encontramos nenhum lançamento válido no histórico (descrição, valor e categoria preenchidos). Confira o arquivo CSV.");
  return registros;
}

export function lerNovos(texto: string): LancamentoNovo[] {
  const { cabecalho, linhas } = parseCSV(texto);
  if (!cabecalho.length) throw new ErroEntrada("O arquivo de lançamentos novos está vazio ou não é um CSV válido.");
  const m = mapearColunasNovos(cabecalho);
  if (m.descricao < 0 || m.valor < 0) {
    throw new ErroEntrada('Os lançamentos novos precisam de colunas de descrição e valor (ex.: "Descrição" e "Valor"). Confira o cabeçalho do CSV.');
  }
  const registros: LancamentoNovo[] = [];
  let i = 0;
  for (const linha of linhas) {
    const valor = parseNumero(linha[m.valor]);
    const descricao = (linha[m.descricao] || "").trim();
    if (valor === null || !descricao) continue;
    i++;
    registros.push({ id: `l${i}`, data: m.data >= 0 ? (linha[m.data] || "").trim() : "", descricao, valor: Math.abs(valor) });
  }
  if (!registros.length) throw new ErroEntrada("Não encontramos nenhum lançamento válido nos lançamentos novos (descrição e valor preenchidos). Confira o arquivo CSV.");
  return registros;
}

type ItemBrutoIA = {
  id?: string;
  categoriaSugerida?: string | null;
  confianca?: string;
  revisar?: boolean;
  citacoes?: string[];
  justificativa?: string;
};

const CONFIANCAS_VALIDAS: NivelConfianca[] = ["alta", "media", "baixa"];

/** Confere se `citacao` corresponde de fato a uma descrição do histórico (casamento por substring nos
 * dois sentidos, tolerante a paráfrase curta do modelo) — nunca aceita uma citação inventada. */
function citacaoValida(citacao: string, historico: LancamentoHistorico[]): string | null {
  const alvo = citacao.trim().toLowerCase();
  if (!alvo) return null;
  const achado = historico.find((h) => {
    const desc = h.descricao.toLowerCase();
    return desc === alvo || desc.includes(alvo) || alvo.includes(desc);
  });
  return achado ? achado.descricao : null;
}

/** Aplica as garantias anti-alucinação linha a linha: categoria fora do vocabulário do histórico vira
 * revisar; categoria sem nenhuma citação que resista à checagem também vira revisar. */
function validarItem(bruto: ItemBrutoIA, original: LancamentoNovo, historico: LancamentoHistorico[], vocabulario: Set<string>): LancamentoClassificado {
  let categoria = typeof bruto.categoriaSugerida === "string" ? bruto.categoriaSugerida.trim() : null;
  let revisar = Boolean(bruto.revisar) || !categoria;

  const citacoesValidas = Array.from(new Set((bruto.citacoes ?? []).map((c) => citacaoValida(String(c ?? ""), historico)).filter((c): c is string => Boolean(c))));

  if (categoria && !vocabulario.has(categoria)) {
    // Nunca inventa categoria que não existe no histórico enviado.
    categoria = null;
    revisar = true;
  }
  if (categoria && citacoesValidas.length === 0) {
    // Toda classificação precisa citar um lançamento real do histórico; sem isso, vira revisar.
    categoria = null;
    revisar = true;
  }
  if (revisar) categoria = null;

  const confiancaBruta = String(bruto.confianca ?? "").toLowerCase() as NivelConfianca;
  const confianca: NivelConfianca = revisar ? "baixa" : CONFIANCAS_VALIDAS.includes(confiancaBruta) ? confiancaBruta : "media";

  return {
    id: original.id,
    data: original.data,
    descricao: original.descricao,
    valor: original.valor,
    categoriaSugerida: categoria,
    confianca,
    revisar,
    citacoes: revisar ? [] : citacoesValidas,
    justificativa: (bruto.justificativa ?? "").trim() || (revisar ? "Nenhum lançamento parecido o bastante foi encontrado no histórico." : ""),
  };
}

async function classificarLote(historico: LancamentoHistorico[], lote: LancamentoNovo[], vocabulario: Set<string>): Promise<LancamentoClassificado[]> {
  const linhasHistorico = historico.map((h) => `- ${h.descricao} | ${formatarMoeda(h.valor)} | categoria: ${h.categoria}`).join("\n");
  const linhasNovos = lote.map((l) => `- id ${l.id}: ${l.descricao} | ${formatarMoeda(l.valor)}${l.data ? ` | data ${l.data}` : ""}`).join("\n");

  const system = `Você classifica lançamentos financeiros para o fechamento contábil de uma empresa, seguindo o padrão real dela — nunca um plano de contas genérico.
Regras que você DEVE seguir sempre, sem exceção:
1. Use somente categorias que aparecem literalmente na lista HISTÓRICO abaixo. Nunca invente uma categoria nova nem generalize.
2. Toda classificação precisa citar, em "citacoes", a descrição literal de um ou mais lançamentos do HISTÓRICO que sustentam a escolha.
3. Quando não houver, no HISTÓRICO, um lançamento parecido o suficiente para sustentar uma categoria com segurança, devolva "revisar": true, "categoriaSugerida": null e "confianca": "baixa" — nunca force uma categoria só porque é a mais comum do histórico.
4. A citação precisa ser específica ao padrão do lançamento novo (mesmo tipo de gasto/fornecedor), nunca "porque é a categoria mais frequente".
Responda somente com JSON.`;

  const prompt = `HISTÓRICO (lançamentos já classificados pela empresa; é daqui que vem todo o vocabulário de categorias):
${linhasHistorico}

LANÇAMENTOS NOVOS para classificar:
${linhasNovos}

Devolva um JSON no formato exato:
{"classificacoes":[{"id":"l1","categoriaSugerida":"..."|null,"confianca":"alta"|"media"|"baixa","revisar":true|false,"citacoes":["descrição literal de um lançamento do histórico"],"justificativa":"uma frase curta"}]}`;

  const resposta = await askJSON<{ classificacoes: ItemBrutoIA[] }>({ system, prompt, maxTokens: 3500 });
  const porId = new Map((resposta.classificacoes ?? []).filter((c) => c.id).map((c) => [String(c.id), c]));

  return lote.map((original) => {
    const bruto = porId.get(original.id);
    if (!bruto) {
      return {
        id: original.id,
        data: original.data,
        descricao: original.descricao,
        valor: original.valor,
        categoriaSugerida: null,
        confianca: "baixa" as NivelConfianca,
        revisar: true,
        citacoes: [],
        justificativa: "A IA não retornou uma classificação para este lançamento; revise manualmente.",
      };
    }
    return validarItem(bruto, original, historico, vocabulario);
  });
}

/** SENSIVEL = true (lib/sensivel.ts): só salva no histórico com opt-in explícito (guardar: true), inclusive
 * no ramo de demonstração — mesmo desenho de `idSalvo` em pdi-time/lib/pdi.ts. */
function idSalvo({
  resultado,
  meta,
  nomeHistorico,
  nomeNovos,
  guardar,
}: {
  resultado: ResultadoClassificacao;
  meta: Meta;
  nomeHistorico: string;
  nomeNovos: string;
  guardar?: boolean;
}): string | undefined {
  if (!guardar) return undefined;
  return salvar({
    tipo: "classificacao-lancamentos",
    titulo: `Classificação de ${resultado.totalNovos} lançamentos`,
    resumo: `${resultado.totalNovos - resultado.totalRevisar} classificados, ${resultado.totalRevisar} para revisar`,
    entrada: { nomeHistorico, nomeNovos, totalHistorico: resultado.totalHistorico },
    saida: resultado,
    meta,
    expiraEmDias: 30,
  });
}

export async function classificarLancamentos({
  historicoTexto,
  novosTexto,
  guardar = false,
  nomeHistorico = "historico.csv",
  nomeNovos = "novos.csv",
}: {
  historicoTexto: string;
  novosTexto: string;
  guardar?: boolean;
  nomeHistorico?: string;
  nomeNovos?: string;
}): Promise<{ resultado: ResultadoClassificacao; meta: Meta; id?: string }> {
  if (!aiEnabled()) {
    await esperar();
    const resultado = resultadoDemo();
    const meta = metaIA({ demo: true, insumo: "exemplo" });
    const id = idSalvo({ resultado, meta, nomeHistorico, nomeNovos, guardar });
    return { resultado, meta, id };
  }

  const historicoCompleto = lerHistorico(historicoTexto || DEMO_HISTORICO_CSV);
  const novos = lerNovos(novosTexto || DEMO_NOVOS_CSV);

  const vocabulario = new Set(historicoCompleto.map((h) => h.categoria));
  const historico = historicoCompleto.length > LIMITE_HISTORICO ? historicoCompleto.slice(-LIMITE_HISTORICO) : historicoCompleto;

  const classificados: LancamentoClassificado[] = [];
  for (let i = 0; i < novos.length; i += TAMANHO_LOTE) {
    const lote = novos.slice(i, i + TAMANHO_LOTE);
    const respostas = await classificarLote(historico, lote, vocabulario);
    classificados.push(...respostas);
  }

  const totalRevisar = classificados.filter((c) => c.revisar).length;
  const resultado: ResultadoClassificacao = {
    lancamentos: classificados,
    totalNovos: classificados.length,
    totalRevisar,
    categoriasEncontradas: Array.from(vocabulario).sort((a, b) => a.localeCompare(b, "pt-BR")),
    totalHistorico: historicoCompleto.length,
  };

  const meta = metaIA({ demo: false, insumo: `${classificados.length} lançamentos novos contra ${historicoCompleto.length} do histórico` });
  const id = idSalvo({ resultado, meta, nomeHistorico, nomeNovos, guardar });

  return { resultado, meta, id };
}
