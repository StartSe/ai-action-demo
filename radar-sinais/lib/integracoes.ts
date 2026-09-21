import { testarBrightData } from "./brightdata";
// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
// A busca na web (Exa ou Tavily) é usada só por este app, por isso mora aqui e não em lib/setup-comum.ts.
import { openrouter, NOTIFICACOES, type Integracao } from "./setup-comum";

NOTIFICACOES.beneficio = "Entrega resumos e novos sinais por e-mail ou Slack";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que agrupa os achados em sinais" });
if (OPENROUTER.oauth) OPENROUTER.oauth.rotulo = "Conectar com OpenRouter";

/** Mensagem do teste de conexão de uma fonte com chave, sem status HTTP cru na tela. */
async function testarFonte(nome: string, pedido: () => Promise<Response>): Promise<{ ok: boolean; mensagem: string }> {
  let r: Response;
  try {
    r = await pedido();
  } catch (err) {
    console.error(`Teste de conexão com a ${nome} falhou na rede:`, err);
    return { ok: false, mensagem: `Não foi possível falar com a ${nome}. Confira a conexão do servidor e tente de novo.` };
  }
  if (r.status === 401 || r.status === 403) return { ok: false, mensagem: `A ${nome} recusou a chave. Confira se copiou a chave inteira.` };
  if (!r.ok) {
    console.error(`Teste de conexão com a ${nome}:`, r.status, (await r.text().catch(() => "")).slice(0, 200));
    return { ok: false, mensagem: `A ${nome} não respondeu como esperado. Tente de novo em um minuto.` };
  }
  return { ok: true, mensagem: `Conectado à ${nome}.` };
}

/** Cartão único com duas chaves alternativas: basta uma para o radar ganhar notícias em português e páginas da web. O id continua "exa" para /setup#exa. */
export const BUSCA_WEB: Integracao = {
  id: "exa",
  titulo: "Notícias em português e web (Exa ou Tavily)",
  beneficio: "Traz notícias em português e páginas da web para o radar",
  descricao: "Sem chave, o radar já consulta Hacker News, Reddit, GitHub e Google Notícias. Uma chave da Exa ou da Tavily acrescenta notícias em português e páginas da web com trechos relevantes. Basta uma das duas.",
  obrigatoria: false,
  link: { url: "https://dashboard.exa.ai/api-keys", rotulo: "Obter uma chave da Exa" },
  campos: [
    { chave: "EXA_API_KEY", rotulo: "Chave da Exa", tipo: "secret", opcional: true, placeholder: "•••••••••••••••••", ajuda: "Fica em API Keys, no painel da Exa (dashboard.exa.ai)." },
    { chave: "TAVILY_API_KEY", rotulo: "Chave da Tavily", tipo: "secret", opcional: true, placeholder: "tvly-...", ajuda: "Alternativa à Exa; fica em API Keys, no painel da Tavily (app.tavily.com)." },
  ],
  campoConectado: ["EXA_API_KEY", "TAVILY_API_KEY"],
  testar: async (config) => {
    const exa = config.EXA_API_KEY;
    const tavily = config.TAVILY_API_KEY;
    if (!exa && !tavily) return { ok: false, mensagem: "Nenhuma chave salva ainda. Cole a chave da Exa ou da Tavily." };
    const resultados: { ok: boolean; mensagem: string }[] = [];
    if (exa) {
      resultados.push(
        await testarFonte("Exa", () =>
          fetch("https://api.exa.ai/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": exa },
            body: JSON.stringify({ query: "teste de conexão", numResults: 1 }),
            signal: AbortSignal.timeout(10_000),
          })
        )
      );
    }
    if (tavily) {
      resultados.push(
        await testarFonte("Tavily", () =>
          fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tavily}` },
            body: JSON.stringify({ query: "teste de conexão", max_results: 1 }),
            signal: AbortSignal.timeout(10_000),
          })
        )
      );
    }
    return { ok: resultados.some((r) => r.ok), mensagem: resultados.map((r) => r.mensagem).join(" ") };
  },
};

export const BRIGHTDATA: Integracao = {
  id: "brightdata", titulo: "Bright Data", beneficio: "Pesquisa a web e lê páginas em Markdown",
  descricao: "Conecta Search Engine e Scraper as Markdown via MCP HTTP. O modo Pro (pro=1) é ativado automaticamente. Até quatro páginas são lidas por radar.",
  obrigatoria: false,
  link: { url: "https://brightdata.com/cp/setting/users", rotulo: "Obter token da Bright Data" },
  campos: [{ chave: "BRIGHTDATA_API_TOKEN", rotulo: "Token da Bright Data", tipo: "secret", opcional: true }],
  campoConectado: "BRIGHTDATA_API_TOKEN", testar: testarBrightData,
};

OPENROUTER.campos.push({ chave: "OPENROUTER_MODEL_ONTOLOGIA", rotulo: "Modelo para sinais e ontologia", tipo: "text", opcional: true, placeholder: "ID do modelo no OpenRouter", ajuda: "Use um modelo com boa capacidade de raciocínio e saída JSON. Em branco, usa o modelo principal." });

export const GROK: Integracao = {
  id: "grok", titulo: "Grok · X Search", beneficio: "Identifica conversas e sinais recentes no X",
  descricao: "Consulta o X pela API xAI, com janela de datas e URLs citadas pela ferramenta. Exige créditos xAI; a escolha de Grok no OpenRouter não habilita esta busca.", obrigatoria: false,
  link: { url: "https://console.x.ai", rotulo: "Obter chave xAI" },
  campos: [{ chave: "XAI_API_KEY", rotulo: "Chave xAI", tipo: "secret", opcional: true }, { chave: "XAI_SEARCH_MODEL", rotulo: "Modelo de busca", tipo: "text", padrao: "grok-4.6", opcional: true }], campoConectado: "XAI_API_KEY",
  testar: config => testarFonte("xAI", () => fetch("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${config.XAI_API_KEY}` }, signal: AbortSignal.timeout(10000) })),
};
export const INTEGRACOES: Integracao[] = [OPENROUTER, BUSCA_WEB, BRIGHTDATA, GROK, NOTIFICACOES];
