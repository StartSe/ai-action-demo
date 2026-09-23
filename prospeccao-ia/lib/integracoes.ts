// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { testarProspectHalo } from "./prospecthalo";
import { testarFonte, type FonteOpcional } from "./pesquisa-fontes";
import { testarBrightData } from "./brightdata";
import { MCP_CRM, NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que qualifica os leads e escreve a abordagem de cada um" });
// Com a conta ChatGPT como alternativa (components/ConexaoIA.tsx), o botão precisa dizer qual conta conecta.
if (OPENROUTER.oauth) OPENROUTER.oauth.rotulo = "Conectar com OpenRouter";

export const PROSPECTHALO: Integracao = {
  id: "prospecthalo", titulo: "ProspectHalo · busca de contatos",
  descricao: "Encontra perfis profissionais com os critérios do seu cliente ideal e complementa a pesquisa pública das empresas e pessoas.",
  beneficio: "Traz contatos para qualificar com evidências públicas", obrigatoria: false,
  campoConectado: "PROSPECTHALO_API_KEY",
  link: { url: "https://app.prospecthalo.ai", rotulo: "Abrir o ProspectHalo e obter a chave" },
  notaConexao: "Conexão MCP. Requer uma conta LinkedIn conectada no ProspectHalo. Buscas consomem a cota do plano; o teste apenas verifica a conexão. Não envia mensagens.",
  campos: [
    { chave: "PROSPECTHALO_API_KEY", rotulo: "Chave ou link de conexão", tipo: "secret", placeholder: "••••••••••••••••", ajuda: "No ProspectHalo: Settings › AI agents and MCP › Generate key. Cole a chave ou o link MCP com key. O acesso é salvo de forma protegida." },
    { chave: "PROSPECTHALO_TETO_CONSULTAS", rotulo: "Limite de consultas por prospecção", tipo: "text", opcional: true, avancado: true, padrao: "10", ajuda: "Inclui buscas e consultas de andamento. Cada busca respeita a quantidade solicitada." },
  ],
  testar: testarProspectHalo,
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
export const SEARCHAPI = fonteOpcional("searchapi", "SearchAPI", "Pesquisa no Google para ampliar e cruzar os resultados das outras fontes.", "https://www.searchapi.io/dashboard");

const CRM: Integracao = {
  ...MCP_CRM,
  beneficio: "Manda o lead aprovado direto para onde o time trabalha",
};

const AVISOS: Integracao = {
  ...NOTIFICACOES,
  beneficio: "Entrega os leads novos da semana a quem cuida das vendas",
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, PROSPECTHALO, BRIGHTDATA, EXA, TAVILY, SEARCHAPI, AVISOS, CRM];
