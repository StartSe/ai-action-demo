// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { OPENROUTER, NOTIFICACOES, type Integracao } from "./setup-comum";
import { getConfig } from "./store";
import { credenciaisDoApp, gmailConectado, listarMensagens, obterPerfil } from "./email";

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

/**
 * Caixa do Gmail de onde as notas são lidas (US-021). Conexão em um clique via OAuth (PKCE) em
 * app/api/setup/oauth/google; o callback grava GMAIL_REFRESH_TOKEN (código de renovação) e GMAIL_CONTA
 * (e-mail conectado). As credenciais do app no Google Cloud (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)
 * vêm do ambiente ou de /setup — sem elas, o cartão explica à equipe técnica como criá-las.
 * O cartão em /setup é próprio (components/ConectarGmail.tsx), não o genérico: mostra "Conectado como
 * {e-mail}" e o bloco "Para a equipe técnica". Fica em INTEGRACOES para o PUT de /api/setup aceitar
 * as chaves, para o teste de conexão e para /api/status informar integrations.gmail.
 */
export const GMAIL: Integracao = {
  id: "gmail",
  titulo: "Gmail",
  descricao: "Conecte a caixa que recebe as notas e recibos das ferramentas de IA. O app só lê (nunca envia nem apaga), busca apenas mensagens com jeito de cobrança e não guarda o conteúdo dos e-mails — só a fatura reconhecida.",
  obrigatoria: false,
  oauth: { tipo: "google", rotulo: "Conectar o Gmail", url: "/api/setup/oauth/google" },
  campoConectado: "GMAIL_REFRESH_TOKEN",
  campos: [
    { chave: "GMAIL_CONTA", rotulo: "Conta conectada", tipo: "text", opcional: true, placeholder: "financeiro@empresa.com" },
    { chave: "GMAIL_REFRESH_TOKEN", rotulo: "Código de renovação", tipo: "secret", opcional: true, avancado: true, ajuda: "Gerado sozinho ao clicar em Conectar o Gmail." },
    { chave: "GOOGLE_CLIENT_ID", rotulo: "Identificador do cliente OAuth (Google Cloud)", tipo: "text", opcional: true, avancado: true, placeholder: "....apps.googleusercontent.com", ajuda: "Credencial do app, criada pela equipe técnica no Google Cloud. Alternativa à variável de ambiente GOOGLE_CLIENT_ID." },
    { chave: "GOOGLE_CLIENT_SECRET", rotulo: "Segredo do cliente OAuth (Google Cloud)", tipo: "secret", opcional: true, avancado: true, placeholder: "GOCSPX-...", ajuda: "Alternativa à variável de ambiente GOOGLE_CLIENT_SECRET." },
  ],
  testar: async () => {
    if (!credenciaisDoApp()) return { ok: false, mensagem: "As credenciais do Google deste app ainda não foram definidas. Veja \"Para a equipe técnica\" no cartão do Gmail." };
    if (!gmailConectado()) return { ok: false, mensagem: "Nenhuma conta conectada ainda. Clique em Conectar o Gmail." };
    try {
      const perfil = await obterPerfil();
      const { estimativa, truncado } = await listarMensagens({ dias: 30, limite: 100 });
      const quantas = truncado ? "mais de 100" : String(estimativa);
      return { ok: true, mensagem: `Conectado como ${perfil.emailAddress}. ${quantas} ${estimativa === 1 && !truncado ? "mensagem" : "mensagens"} com jeito de cobrança nos últimos 30 dias.` };
    } catch (err) {
      return { ok: false, mensagem: err instanceof Error ? err.message : "Não foi possível falar com o Gmail." };
    }
  },
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, NOTIFICACOES, CAMBIO, GMAIL];

/** Converte um valor para reais na cotação salva (BRL passa direto). */
export function converterParaBRL(valor: number, moeda: "BRL" | "USD" | "EUR"): number {
  if (moeda === "BRL") return valor;
  const chave = moeda === "USD" ? "CAMBIO_USD_BRL" : "CAMBIO_EUR_BRL";
  const padrao = moeda === "USD" ? CAMBIO_USD_BRL_PADRAO : CAMBIO_EUR_BRL_PADRAO;
  const cotacao = Number(String(getConfig(chave) || padrao).replace(",", ".")) || padrao;
  return Math.round(valor * cotacao * 100) / 100;
}
