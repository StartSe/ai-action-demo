// Credenciais das ferramentas prontas (mesmos serviços do catálogo de ferramentas do Flowise).
// Ficam no banco cifrado; a tela do Agente pede só o que a ferramenta escolhida precisa.
export type Credential = { chave: string; rotulo: string; ajuda?: string; link?: string; secret?: boolean };
export const TOOL_CREDENTIALS: Record<string, Credential[]> = {
  tavily: [{ chave: "TOOL_TAVILY_KEY", rotulo: "Chave da Tavily", link: "https://app.tavily.com/home", secret: true }],
  searchapi: [{ chave: "TOOL_SEARCHAPI_KEY", rotulo: "Chave da SearchApi", link: "https://www.searchapi.io/", secret: true }],
  exa: [{ chave: "TOOL_EXA_KEY", rotulo: "Chave da Exa", link: "https://dashboard.exa.ai/", secret: true }],
  serper: [{ chave: "TOOL_SERPER_KEY", rotulo: "Chave da Serper", link: "https://serper.dev/", secret: true }],
  serpapi: [{ chave: "TOOL_SERPAPI_KEY", rotulo: "Chave da SerpApi", link: "https://serpapi.com/", secret: true }],
  brave: [{ chave: "TOOL_BRAVE_KEY", rotulo: "Chave da Brave Search", link: "https://brave.com/search/api/", secret: true }],
  google: [
    { chave: "TOOL_GOOGLE_KEY", rotulo: "Chave do Google Custom Search", link: "https://developers.google.com/custom-search/v1/overview", secret: true },
    { chave: "TOOL_GOOGLE_CX", rotulo: "Identificador do mecanismo (cx)", ajuda: "Criado em programmablesearchengine.google.com." },
  ],
  wolfram: [{ chave: "TOOL_WOLFRAM_APPID", rotulo: "AppID do Wolfram Alpha", link: "https://developer.wolframalpha.com/", secret: true }],
  searxng: [{ chave: "TOOL_SEARXNG_URL", rotulo: "Endereço da sua instância SearXNG", ajuda: "Ex.: https://busca.suaempresa.com (com JSON habilitado)." }],
};
export const TOOL_CREDENTIAL_KEYS = Object.values(TOOL_CREDENTIALS).flatMap((l) => l.map((c) => c.chave));
