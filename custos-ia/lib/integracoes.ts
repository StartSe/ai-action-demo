// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { OPENROUTER, NOTIFICACOES, type Integracao } from "./setup-comum";
import { getConfig } from "./store";

/** Padrões de 2026-09-14: cotações plausíveis de referência, editáveis a qualquer momento em /setup.
 * Usadas só para converter faturas em moeda estrangeira (lançamento manual e leituras futuras de
 * e-mail/PDF) para reais — não são atualizadas automaticamente, por isso o card pede para revisar
 * de tempos em tempos. */
export const CAMBIO_USD_BRL_PADRAO = 5.3;
export const CAMBIO_EUR_BRL_PADRAO = 6.1;

/** Câmbio manual (não há chave de mercado nesta história): quanto vale 1 dólar e 1 euro em reais. */
export const CAMBIO: Integracao = {
  id: "cambio",
  titulo: "Câmbio",
  descricao: "Cotações usadas para converter faturas em dólar ou euro para reais. Atualize de vez em quando — não são buscadas automaticamente.",
  obrigatoria: false,
  campos: [
    { chave: "CAMBIO_USD_BRL", rotulo: "Dólar (USD) em reais", tipo: "text", padrao: String(CAMBIO_USD_BRL_PADRAO), placeholder: "5,30" },
    { chave: "CAMBIO_EUR_BRL", rotulo: "Euro (EUR) em reais", tipo: "text", padrao: String(CAMBIO_EUR_BRL_PADRAO), placeholder: "6,10" },
  ],
  testar: async (config) => {
    const usd = Number(String(config.CAMBIO_USD_BRL || CAMBIO_USD_BRL_PADRAO).replace(",", "."));
    const eur = Number(String(config.CAMBIO_EUR_BRL || CAMBIO_EUR_BRL_PADRAO).replace(",", "."));
    if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(eur) || eur <= 0) {
      return { ok: false, mensagem: "Informe valores numéricos maiores que zero para as duas cotações." };
    }
    return { ok: true, mensagem: `Cotações salvas. Dólar: R$ ${usd.toFixed(2)}. Euro: R$ ${eur.toFixed(2)}.` };
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, NOTIFICACOES, CAMBIO];

/** Converte um valor para reais na cotação salva (BRL passa direto). */
export function converterParaBRL(valor: number, moeda: "BRL" | "USD" | "EUR"): number {
  if (moeda === "BRL") return valor;
  const chave = moeda === "USD" ? "CAMBIO_USD_BRL" : "CAMBIO_EUR_BRL";
  const padrao = moeda === "USD" ? CAMBIO_USD_BRL_PADRAO : CAMBIO_EUR_BRL_PADRAO;
  const cotacao = Number(String(getConfig(chave) || padrao).replace(",", ".")) || padrao;
  return Math.round(valor * cotacao * 100) / 100;
}
