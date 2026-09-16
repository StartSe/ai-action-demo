// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { cotacaoAutomatica, dataDaCotacao, type EstadoCambio } from "./cambio";
import { openrouter, NOTIFICACOES, type Integracao } from "./setup-comum";
import { getConfig } from "./store";
import { credenciaisDoApp, listarMensagens, obterPerfil, obterPerfilOutlook, provedorConectado, type ProvedorEmail } from "./email";

const OPENROUTER = openrouter({ visao: true, beneficio: "Lê fornecedor, valor e data de cada nota fiscal" });

const AVISOS: Integracao = { ...NOTIFICACOES, beneficio: "Manda o fechamento do mês para você e para o time" };

/** Referência embutida (2026-09-14), usada só enquanto a cotação do Banco Central não chegou: converter
 * uma fatura em dólar por um número qualquer seria pior do que por um número plausível. Assim que
 * atualizarCambio() roda (lib/cambio.ts), a PTAX do dia toma o lugar destes valores. */
export const CAMBIO_USD_BRL_PADRAO = 5.3;
export const CAMBIO_EUR_BRL_PADRAO = 6.1;

const PADRAO: Record<"USD" | "EUR", number> = { USD: CAMBIO_USD_BRL_PADRAO, EUR: CAMBIO_EUR_BRL_PADRAO };
const CHAVE_MANUAL: Record<"USD" | "EUR", string> = { USD: "CAMBIO_USD_BRL", EUR: "CAMBIO_EUR_BRL" };

function reais(valor: number): string {
  return `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor)}`;
}

/** "2026-09-15" -> "15/09/2026" (a data vem da API do Banco Central, sempre nesse formato). */
function dataBrasileira(iso?: string): string {
  const partes = (iso ?? "").split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : "hoje";
}

/** Cotação digitada à mão em /setup, quando existir (tem prioridade sobre a do Banco Central). */
function cotacaoManual(moeda: "USD" | "EUR"): number | undefined {
  const bruto = getConfig(CHAVE_MANUAL[moeda]);
  if (!bruto) return undefined;
  const valor = Number(String(bruto).replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

/** Cotação em vigor de uma moeda: manual > Banco Central > referência embutida. */
export function cotacaoEmVigor(moeda: "USD" | "EUR"): number {
  return cotacaoManual(moeda) ?? cotacaoAutomatica(moeda) ?? PADRAO[moeda];
}

/** As duas cotações em vigor e de onde elas vêm, para a tela dizer a verdade sobre o número. */
export function estadoCambio(): EstadoCambio {
  const manual = cotacaoManual("USD") !== undefined || cotacaoManual("EUR") !== undefined;
  const automatica = cotacaoAutomatica("USD") !== undefined || cotacaoAutomatica("EUR") !== undefined;
  return {
    usd: cotacaoEmVigor("USD"),
    eur: cotacaoEmVigor("EUR"),
    fonte: manual ? "manual" : automatica ? "automatica" : "padrao",
    cotadoEm: dataDaCotacao(),
  };
}

/** Câmbio: buscado sozinho na PTAX do Banco Central (lib/cambio.ts), com os campos manuais em
 * "Opções avançadas" para quem quer fixar a cotação do próprio contrato. */
export const CAMBIO: Integracao = {
  id: "cambio",
  titulo: "Câmbio (automático)",
  beneficio: "Converte faturas em dólar e euro pela cotação do dia",
  descricao: "As faturas em dólar e euro são convertidas para reais pela cotação de fechamento do Banco Central, buscada uma vez por dia. Não precisa configurar nada.",
  obrigatoria: false,
  campos: [
    { chave: "CAMBIO_USD_BRL", rotulo: "Fixar o dólar (USD) em reais", tipo: "text", opcional: true, avancado: true, placeholder: "5,30", ajuda: "Preenchido, substitui a cotação do Banco Central. Deixe vazio para usar a do dia." },
    { chave: "CAMBIO_EUR_BRL", rotulo: "Fixar o euro (EUR) em reais", tipo: "text", opcional: true, avancado: true, placeholder: "6,10", ajuda: "Preenchido, substitui a cotação do Banco Central. Deixe vazio para usar a do dia." },
  ],
  testar: async () => {
    const usd = cotacaoManual("USD");
    const eur = cotacaoManual("EUR");
    if ((getConfig(CHAVE_MANUAL.USD) && usd === undefined) || (getConfig(CHAVE_MANUAL.EUR) && eur === undefined)) {
      return { ok: false, mensagem: "As cotações fixadas precisam ser números maiores que zero. Apague o campo para voltar à cotação do dia." };
    }
    const { atualizarCambio } = await import("./cambio");
    await atualizarCambio();
    const estado = estadoCambio();
    const de = estado.fonte === "manual" ? "fixadas por você" : estado.fonte === "automatica" ? `do Banco Central, de ${dataBrasileira(estado.cotadoEm)}` : "de referência (o Banco Central ainda não respondeu)";
    return { ok: true, mensagem: `Cotações ${de}. Dólar: ${reais(estado.usd)}. Euro: ${reais(estado.eur)}.` };
  },
};

/** Teste de conexão comum às duas caixas: conta conectada e quantas mensagens com jeito de cobrança em 30 dias. */
function testarCaixa(provedor: ProvedorEmail, nome: string, empresa: string) {
  return async () => {
    if (!credenciaisDoApp(provedor)) return { ok: false, mensagem: `As credenciais ${empresa} deste app ainda não foram definidas. Veja "Para a equipe técnica" no cartão do ${nome}.` };
    if (!provedorConectado(provedor)) return { ok: false, mensagem: `Nenhuma conta conectada ainda. Clique em Conectar o ${nome}.` };
    try {
      const perfil = provedor === "gmail" ? await obterPerfil() : await obterPerfilOutlook();
      const { estimativa, truncado } = await listarMensagens({ provedor, dias: 30, limite: 100 });
      const quantas = truncado ? "mais de 100" : String(estimativa);
      return { ok: true, mensagem: `Conectado como ${perfil.emailAddress}. ${quantas} ${estimativa === 1 && !truncado ? "mensagem" : "mensagens"} com jeito de cobrança nos últimos 30 dias.` };
    } catch (err) {
      return { ok: false, mensagem: err instanceof Error ? err.message : `Não foi possível falar com o ${nome}.` };
    }
  };
}

/**
 * Caixa do Gmail de onde as notas são lidas (US-021). Conexão em um clique via OAuth (PKCE) em
 * app/api/setup/oauth/google; o callback grava GMAIL_REFRESH_TOKEN (código de renovação) e GMAIL_CONTA
 * (e-mail conectado). As credenciais do app no Google Cloud (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)
 * vêm do ambiente ou de /setup — sem elas, o cartão explica à equipe técnica como criá-las.
 * O cartão em /setup é próprio (components/ConectarEmail.tsx), não o genérico: mostra "Conectado como
 * {e-mail}" e o bloco "Para a equipe técnica". Fica em INTEGRACOES para o PUT de /api/setup aceitar
 * as chaves, para o teste de conexão e para /api/status informar integrations.gmail.
 */
export const GMAIL: Integracao = {
  id: "gmail",
  titulo: "Gmail",
  beneficio: "Lê as notas das ferramentas de IA direto da sua caixa",
  descricao: "Conecte a caixa que recebe as notas e recibos das ferramentas de IA. O app busca apenas mensagens com jeito de cobrança, nunca apaga nada e não guarda o conteúdo dos e-mails — só a fatura reconhecida. A mesma conexão envia para você o fechamento do mês, quando você pedir.",
  obrigatoria: false,
  oauth: { tipo: "google", rotulo: "Conectar o Gmail", url: "/api/setup/oauth/google" },
  campoConectado: "GMAIL_REFRESH_TOKEN",
  campos: [
    { chave: "GMAIL_CONTA", rotulo: "Conta conectada", tipo: "text", opcional: true, placeholder: "financeiro@empresa.com" },
    { chave: "GMAIL_REFRESH_TOKEN", rotulo: "Código de renovação", tipo: "secret", opcional: true, avancado: true, ajuda: "Gerado sozinho ao clicar em Conectar o Gmail." },
    { chave: "GOOGLE_CLIENT_ID", rotulo: "Identificador do cliente OAuth (Google Cloud)", tipo: "text", opcional: true, avancado: true, placeholder: "....apps.googleusercontent.com", ajuda: "Credencial do app, criada pela equipe técnica no Google Cloud. Alternativa à variável de ambiente GOOGLE_CLIENT_ID." },
    { chave: "GOOGLE_CLIENT_SECRET", rotulo: "Segredo do cliente OAuth (Google Cloud)", tipo: "secret", opcional: true, avancado: true, placeholder: "GOCSPX-...", ajuda: "Alternativa à variável de ambiente GOOGLE_CLIENT_SECRET." },
  ],
  testar: testarCaixa("gmail", "Gmail", "do Google"),
};

/**
 * Caixa do Outlook / Microsoft 365 (US-034): mesmo desenho do Gmail, contra o Entra ID
 * (login.microsoftonline.com/common, PKCE, escopos Mail.Read offline_access User.Read) em
 * app/api/setup/oauth/microsoft; o callback grava OUTLOOK_REFRESH_TOKEN e OUTLOOK_CONTA. As credenciais
 * do registro de aplicativo (MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET) vêm do ambiente ou de /setup.
 */
export const OUTLOOK: Integracao = {
  id: "outlook",
  titulo: "Outlook (Microsoft 365)",
  beneficio: "Lê as notas das ferramentas de IA direto da sua caixa",
  descricao: "Conecte a caixa do Outlook que recebe as notas e recibos das ferramentas de IA. O app busca apenas mensagens com jeito de cobrança, nunca apaga nada e não guarda o conteúdo dos e-mails — só a fatura reconhecida. A mesma conexão envia para você o fechamento do mês, quando você pedir.",
  obrigatoria: false,
  oauth: { tipo: "microsoft", rotulo: "Conectar o Outlook", url: "/api/setup/oauth/microsoft" },
  campoConectado: "OUTLOOK_REFRESH_TOKEN",
  campos: [
    { chave: "OUTLOOK_CONTA", rotulo: "Conta conectada", tipo: "text", opcional: true, placeholder: "financeiro@empresa.com" },
    { chave: "OUTLOOK_REFRESH_TOKEN", rotulo: "Código de renovação", tipo: "secret", opcional: true, avancado: true, ajuda: "Gerado sozinho ao clicar em Conectar o Outlook." },
    { chave: "MICROSOFT_CLIENT_ID", rotulo: "Identificador do aplicativo (Entra ID)", tipo: "text", opcional: true, avancado: true, placeholder: "00000000-0000-0000-0000-000000000000", ajuda: "Registro de aplicativo criado pela equipe técnica no Entra ID. Alternativa à variável de ambiente MICROSOFT_CLIENT_ID." },
    { chave: "MICROSOFT_CLIENT_SECRET", rotulo: "Segredo do cliente (Entra ID)", tipo: "secret", opcional: true, avancado: true, ajuda: "Valor do segredo do cliente (não o id do segredo). Alternativa à variável de ambiente MICROSOFT_CLIENT_SECRET." },
  ],
  testar: testarCaixa("outlook", "Outlook", "da Microsoft"),
};

/** Integrações com cartão próprio em /setup (components/ConectarEmail.tsx): saem da lista genérica do GET /api/setup. */
export const COM_CARTAO_PROPRIO: Integracao[] = [GMAIL, OUTLOOK];

export const INTEGRACOES: Integracao[] = [OPENROUTER, AVISOS, CAMBIO, GMAIL, OUTLOOK];

/** Converte um valor para reais na cotação em vigor (BRL passa direto). */
export function converterParaBRL(valor: number, moeda: "BRL" | "USD" | "EUR"): number {
  if (moeda === "BRL") return valor;
  return Math.round(valor * cotacaoEmVigor(moeda) * 100) / 100;
}
