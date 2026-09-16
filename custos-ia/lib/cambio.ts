// Cotações de dólar e euro em reais, usadas para converter faturas em moeda estrangeira.
//
// A fonte é a PTAX do Banco Central (olinda.bcb.gov.br), API pública e sem chave: o executivo não
// precisa contratar serviço de câmbio nem digitar cotação nenhuma. O valor buscado fica guardado em
// lib/store.ts (CAMBIO_AUTO_USD_BRL / CAMBIO_AUTO_EUR_BRL) junto do dia da última busca
// (CAMBIO_AUTO_DIA), e só é buscado de novo quando esse dia não é o de hoje — uma chamada por dia,
// nunca uma por fatura.
//
// Ordem de prioridade de uma cotação (converterParaBRL, em lib/integracoes.ts):
//   1. valor digitado à mão em /setup ("Opções avançadas" do cartão Câmbio), quando existir;
//   2. última cotação PTAX guardada;
//   3. o padrão de referência (CAMBIO_USD_BRL_PADRAO / CAMBIO_EUR_BRL_PADRAO).
//
// atualizarCambio() nunca lança: câmbio fora do ar não pode impedir a leitura do gasto. Quando falha,
// a cotação anterior continua valendo e o motivo vai só para console.error (a tela mostra a data da
// última cotação, que denuncia sozinha um valor velho).
import { getConfig, setConfig } from "./store";

export type MoedaEstrangeira = "USD" | "EUR";

/** Endereço da série de fechamento da PTAX; a resposta é OData ({ value: [...] }). */
const PTAX_URL = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo";

/** Quantos dias para trás pedir: cobre feriado prolongado sem trazer série longa demais. */
const DIAS_DE_BUSCA = 12;

/** Prazo da chamada ao Banco Central; passando disso, a cotação anterior continua valendo. */
const TEMPO_LIMITE_MS = 6000;

export const CHAVE_COTACAO: Record<MoedaEstrangeira, string> = { USD: "CAMBIO_AUTO_USD_BRL", EUR: "CAMBIO_AUTO_EUR_BRL" };
/** Dia (AAAA-MM-DD) da última busca bem-sucedida, para não chamar o Banco Central mais de uma vez por dia. */
const CHAVE_DIA = "CAMBIO_AUTO_DIA";
/** Data da cotação em si (pode ser anterior ao dia da busca: fim de semana e feriado não têm PTAX). */
const CHAVE_DATA_COTACAO = "CAMBIO_AUTO_COTADO_EM";

function hoje(referencia = new Date()): string {
  return referencia.toISOString().slice(0, 10);
}

/** MM-DD-AAAA, o formato que a API do Banco Central espera nos parâmetros de data. */
function dataPtax(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}

type CotacaoPtax = { cotacaoCompra?: number; cotacaoVenda?: number; dataHoraCotacao?: string };

/** Última cotação de fechamento de uma moeda, ou null quando o Banco Central não devolve nenhuma. */
async function buscarPtax(moeda: MoedaEstrangeira, referencia: Date): Promise<{ valor: number; cotadoEm: string } | null> {
  const inicio = new Date(referencia);
  inicio.setDate(inicio.getDate() - DIAS_DE_BUSCA);
  const url =
    `${PTAX_URL}(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${moeda}'&@dataInicial='${dataPtax(inicio)}'&@dataFinalCotacao='${dataPtax(referencia)}'` +
    `&$top=200&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao`;

  const resposta = await fetch(url, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS), headers: { Accept: "application/json" } });
  if (!resposta.ok) {
    console.error("PTAX respondeu", resposta.status, (await resposta.text().catch(() => "")).slice(0, 200));
    return null;
  }
  const corpo = (await resposta.json()) as { value?: CotacaoPtax[] };
  const linhas = (corpo.value ?? []).filter((l) => Number(l.cotacaoVenda) > 0 && typeof l.dataHoraCotacao === "string");
  if (linhas.length === 0) return null;
  const ultima = linhas[linhas.length - 1];
  // Fatura em moeda estrangeira é paga na venda + spread; a venda sozinha já é a referência conservadora.
  const valor = Math.round(Number(ultima.cotacaoVenda) * 10000) / 10000;
  return { valor, cotadoEm: String(ultima.dataHoraCotacao).slice(0, 10) };
}

/** Busca a PTAX do dia (no máximo uma vez por dia) e guarda o resultado. Nunca lança. */
export async function atualizarCambio(referencia = new Date()): Promise<void> {
  if (getConfig(CHAVE_DIA) === hoje(referencia)) return;
  try {
    const [usd, eur] = await Promise.all([buscarPtax("USD", referencia), buscarPtax("EUR", referencia)]);
    if (!usd && !eur) return;
    if (usd) setConfig(CHAVE_COTACAO.USD, String(usd.valor));
    if (eur) setConfig(CHAVE_COTACAO.EUR, String(eur.valor));
    setConfig(CHAVE_DATA_COTACAO, (usd ?? eur)!.cotadoEm);
    setConfig(CHAVE_DIA, hoje(referencia));
  } catch (err) {
    console.error("Falha ao buscar a cotação do Banco Central", err);
  }
}

/** Última cotação PTAX guardada de uma moeda, ou undefined enquanto nenhuma foi buscada. */
export function cotacaoAutomatica(moeda: MoedaEstrangeira): number | undefined {
  const bruto = getConfig(CHAVE_COTACAO[moeda]);
  const valor = Number(bruto);
  return bruto && Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

/** Data (AAAA-MM-DD) da cotação guardada, para a tela dizer de quando é o número. */
export function dataDaCotacao(): string | undefined {
  return getConfig(CHAVE_DATA_COTACAO);
}

export type EstadoCambio = {
  /** Cotações em vigor agora, já considerando um valor digitado à mão. */
  usd: number;
  eur: number;
  /** "automatica" = PTAX do Banco Central; "manual" = valor digitado em /setup; "padrao" = referência embutida. */
  fonte: "automatica" | "manual" | "padrao";
  cotadoEm?: string;
};
