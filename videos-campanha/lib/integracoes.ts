// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
// A IA (OpenRouter) escreve os conceitos; o Higgsfield (servidor MCP com OAuth) gera o vídeo de verdade.
import { integracaoMCP, OPENROUTER, type Integracao } from "./setup-comum";

/** Prefixo das chaves salvas (HIGGSFIELD_URL, HIGGSFIELD_CODIGO, HIGGSFIELD_REFRESH...). */
export const PREFIXO_HIGGSFIELD = "HIGGSFIELD";

/**
 * Higgsfield: servidor MCP remoto (com OAuth) que anima a imagem do produto com os efeitos da plataforma.
 * As ferramentas são escolhidas pelo nome conhecido (presets_show, media_upload, generate_video, job_status,
 * balance...) com fallback por palavra-chave; ver lib/higgsfield.ts.
 */
export const HIGGSFIELD: Integracao = integracaoMCP({
  id: "higgsfield",
  titulo: "Higgsfield",
  descricao: "Gera o vídeo a partir da imagem do produto com os efeitos da plataforma. Sem conectar, a prévia é só ilustrativa e nenhum crédito é gasto.",
  ajudaUrl: "Endereço do servidor MCP do Higgsfield. Normalmente não precisa mudar: clique em Autorizar e entre com a sua conta.",
  urlPadrao: "https://mcp.higgsfield.ai",
  rotuloFerramentas: "Ferramentas",
});

export const INTEGRACOES: Integracao[] = [OPENROUTER, HIGGSFIELD];
