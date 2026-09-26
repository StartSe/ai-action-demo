// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
// A IA (OpenRouter) escreve os conceitos; o Higgsfield (servidor MCP com OAuth) gera o vídeo de verdade;
// as notificações avisam quando o vídeo fica pronto (a geração leva minutos).
import { integracaoMCP, openrouter, NOTIFICACOES, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ visao: true, beneficio: "Escreve os três conceitos a partir do seu briefing" });

/** Prefixo das chaves salvas (HIGGSFIELD_URL, HIGGSFIELD_CODIGO, HIGGSFIELD_REFRESH...). */
export const PREFIXO_HIGGSFIELD = "HIGGSFIELD";

/**
 * Higgsfield: servidor MCP remoto (com OAuth) que anima a imagem do produto com os efeitos da plataforma.
 * As ferramentas são escolhidas pelo nome conhecido (presets_show, media_upload, generate_video, job_status,
 * balance...) com fallback por palavra-chave; ver lib/higgsfield.ts. O `beneficio` e o `link` são texto de
 * negócio deste app, sobrepostos ao molde compartilhado por spread (nunca editando lib/setup-comum.ts).
 */
export const HIGGSFIELD: Integracao = {
  ...integracaoMCP({
    id: "higgsfield",
    titulo: "Higgsfield",
    descricao: "Autorize sua conta Higgsfield com OAuth2. As gerações usam créditos da sua conta; o uso ilimitado do site não se aplica.",
    ajudaUrl: "Endereço do servidor MCP do Higgsfield. Normalmente não precisa mudar: clique em Autorizar e entre com a sua conta.",
    urlPadrao: "https://mcp.higgsfield.ai/mcp",
    rotuloFerramentas: "Ferramentas",
    camposExtras: [{ chave: "HIGGSFIELD_CLIENT_ID", rotulo: "Client ID OAuth", tipo: "text", opcional: true, avancado: true, ajuda: "Necessário somente se o Higgsfield exigir registro prévio do aplicativo e não oferecer registro automático." }],
  }),
  beneficio: "Conecte sua conta para acessar os modelos do Higgsfield",

  link: { url: "https://higgsfield.ai", rotulo: "Criar conta no Higgsfield" },
};

/** O vídeo leva minutos: o aviso evita esperar de aba aberta. */
const AVISOS: Integracao = { ...NOTIFICACOES, beneficio: "Avisa você por e-mail ou Slack quando o vídeo fica pronto" };

export const MUAPI: Integracao = {
  id: "muapi", titulo: "MuAPI", descricao: "Gera imagens e vídeos nas etapas do Creative Flow.", beneficio: "Conecta Nano Banana 2 e Veo 3.1 ao seu fluxo", obrigatoria: false,
  link: { url: "https://muapi.ai/access-keys", rotulo: "Obter chave MuAPI" },
  campos: [{ chave: "MUAPI_API_KEY", rotulo: "Chave da API", tipo: "secret", ajuda: "A chave fica cifrada no servidor. As gerações consomem o saldo da sua conta MuAPI." }],
};
export const INTEGRACOES: Integracao[] = [MUAPI, OPENROUTER, HIGGSFIELD, AVISOS];
