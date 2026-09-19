// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { testarFonte, type FonteOpcional } from "./pesquisa-fontes";
import { testarBrightData } from "./brightdata";
import { MCP_CRM, NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que escreve a abordagem de cada lead" });

// Título sem nome de fornecedor (o cartão é "o que isso faz por você"); a Apollo aparece na descrição
// e no link, que é onde a pessoa precisa saber onde criar a conta.
export const APOLLO: Integracao = {
  id: "apollo",
  titulo: "Busca de leads",
  descricao: "Fonte alternativa de contatos: traz nome, cargo, empresa e LinkedIn da base da Apollo.io a partir do perfil de cliente ideal. Sem ela, a pesquisa de mercado já encontra pessoas por fontes públicas.",
  beneficio: "Troca os leads de exemplo por contatos reais do seu mercado",
  obrigatoria: false,
  link: { url: "https://app.apollo.io/#/settings/integrations/api", rotulo: "Criar conta e obter a chave na Apollo" },
  campos: [{ chave: "APOLLO_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "•••••••••••••••••", ajuda: "Fica em Settings › Integrations › API, dentro da sua conta da Apollo." }],
  testar: async (config) => {
    const chave = config.APOLLO_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    let r: Response;
    try {
      r = await fetch("https://api.apollo.io/api/v1/auth/health", { headers: { "x-api-key": chave } });
    } catch (err) {
      console.error("Apollo: falha de rede no teste de conexão", err);
      return { ok: false, mensagem: "A busca de leads não respondeu; tente de novo em um minuto." };
    }
    if (r.status === 401 || r.status === 403) return { ok: false, mensagem: "A chave foi recusada. Copie de novo em Settings › Integrations › API." };
    if (!r.ok) {
      console.error("Apollo: teste de conexão recusado", r.status);
      return { ok: false, mensagem: "A busca de leads não respondeu; tente de novo em um minuto." };
    }
    // O endereço de saúde devolve sucesso mesmo com chave inválida; quem indica se autenticou é "is_logged_in".
    const data = (await r.json().catch(() => ({}))) as { is_logged_in?: boolean };
    if (!data.is_logged_in) return { ok: false, mensagem: "A chave foi recusada. Copie de novo em Settings › Integrations › API." };
    return { ok: true, mensagem: "Conectado. A próxima busca traz contatos reais." };
  },
};

export const BRIGHTDATA: Integracao = {
  id: "brightdata",
  titulo: "Pesquisa de mercado e sinais",
  descricao: "Encontra empresas, pessoas e sinais públicos de verdade para a prospecção, pela Bright Data. Inclui busca na web, datasets e leitura de perfis públicos de LinkedIn e Instagram.",
  beneficio: "Encontra empresas, pessoas e sinais públicos de verdade",
  obrigatoria: false,
  link: { url: "https://brightdata.com/cp/mcp", rotulo: "Criar conta e gerar a chave na Bright Data" },
  campos: [
    { chave: "BRIGHTDATA_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "•••••••••••••••••", ajuda: "Use a chave da sua conta Bright Data. A conexão usa MCP com todas as ferramentas habilitadas, sem configurar zonas." },
    {
      chave: "BRIGHTDATA_TETO_CONSULTAS",
      rotulo: "Teto de consultas por prospecção",
      tipo: "text",
      opcional: true,
      avancado: true,
      padrao: "60",
      ajuda: "Quantas buscas e leituras uma prospecção pode fazer antes de parar para não consumir sua cota.",
    },
  ],
  testar: testarBrightData,
};

function fonteOpcional(id: FonteOpcional, nome: string, descricao: string, url: string): Integracao {
  const prefixo = id.toUpperCase();
  return {
    id, titulo: nome, descricao, beneficio: descricao, obrigatoria: false,
    campoConectado: `${prefixo}_API_KEY`,
    link: { url, rotulo: `Obter chave no ${nome}` },
    notaConexao: "Opcional. A consulta de teste e as buscas consomem a cota da sua conta.",
    campos: [
      { chave: `${prefixo}_API_KEY`, rotulo: "Chave da API", tipo: "secret", placeholder: "••••••••••••••••" },
      { chave: `${prefixo}_TETO_CONSULTAS`, rotulo: "Limite de consultas por prospecção", tipo: "text", opcional: true, avancado: true, padrao: "10", ajuda: "Conta buscas e leituras. Ao atingir o limite, tenta outra fonte conectada." },
      ...(id === "exa" ? [{ chave: "EXA_TIPO_BUSCA", rotulo: "Profundidade da pesquisa", tipo: "select" as const, opcional: true, padrao: "deep", opcoes: [{ valor: "auto", rotulo: "Automática" }, { valor: "deep-lite", rotulo: "Pesquisa rápida" }, { valor: "deep", rotulo: "Profunda" }, { valor: "deep-reasoning", rotulo: "Profunda com raciocínio" }] }] : []),
      ...(id === "tavily" ? [{ chave: "TAVILY_PROFUNDIDADE", rotulo: "Profundidade da pesquisa", tipo: "select" as const, opcional: true, padrao: "advanced", opcoes: [{ valor: "basic", rotulo: "Básica" }, { valor: "advanced", rotulo: "Avançada" }] }] : []),
    ],
    testar: config => testarFonte(id, config),
  };
}
export const EXA = fonteOpcional("exa", "Exa", "Pesquisa aprofundada para encontrar empresas e pessoas com o perfil desejado.", "https://dashboard.exa.ai/api-keys");
export const TAVILY = fonteOpcional("tavily", "Tavily", "Pesquisa na web e leitura de páginas para encontrar candidatos e evidências públicas.", "https://app.tavily.com");
export const SEARCHAPI = fonteOpcional("searchapi", "SearchAPI", "Busca alternativa no Google quando as outras fontes não trouxerem resultados.", "https://www.searchapi.io/dashboard");

const CRM: Integracao = {
  ...MCP_CRM,
  beneficio: "Manda o lead aprovado direto para onde o time trabalha",
};

const AVISOS: Integracao = {
  ...NOTIFICACOES,
  beneficio: "Entrega os leads novos da semana a quem cuida das vendas",
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, APOLLO, BRIGHTDATA, EXA, TAVILY, SEARCHAPI, AVISOS, CRM];
