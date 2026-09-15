// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { integracaoMCP, NOTIFICACOES, OPENROUTER, type Integracao } from "./setup-comum";
import { getConfig } from "./store";

/** Prefixo das chaves salvas (PROSPECTHALO_URL, PROSPECTHALO_CODIGO, PROSPECTHALO_FERRAMENTAS...). */
export const PREFIXO_PROSPECTHALO = "PROSPECTHALO";

/** Nome do campo avançado com o mapeamento manual de ferramentas (JSON {"buscar":"...","campanha":"...","estado":"..."}). */
export const CAMPO_FERRAMENTAS = `${PREFIXO_PROSPECTHALO}_FERRAMENTAS`;

/** Lê o mapeamento manual salvo no campo avançado; JSON inválido vale como vazio. */
export function mapeamentoManual(): Record<string, string> {
  const bruto = getConfig(CAMPO_FERRAMENTAS);
  if (!bruto) return {};
  try {
    const obj = JSON.parse(bruto) as unknown;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    return Object.fromEntries(Object.entries(obj as Record<string, unknown>).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, String(v).trim()]));
  } catch {
    return {};
  }
}

/**
 * Prospect Halo: servidor MCP remoto (com OAuth) que busca leads no LinkedIn do usuário e envia as
 * mensagens aprovadas da conta dele. Os nomes reais das ferramentas são descobertos em tempo de
 * execução (lib/prospecthalo.ts); o campo avançado guarda um mapeamento manual para correção.
 */
export const PROSPECTHALO: Integracao = integracaoMCP({
  id: "prospecthalo",
  titulo: "Prospect Halo",
  descricao: "Busca leads no seu LinkedIn e envia as mensagens aprovadas. Sem conectar, a lista sai com dados de exemplo e nada é enviado.",
  ajudaUrl: "Endereço do servidor MCP do Prospect Halo. Normalmente não precisa mudar: clique em Autorizar e entre com a sua conta.",
  urlPadrao: "https://app.prospecthalo.ai/api/agent/v1/mcp",
  rotuloFerramentas: "Ferramentas",
  camposExtras: [
    {
      chave: CAMPO_FERRAMENTAS,
      rotulo: "Mapeamento das ferramentas (JSON)",
      tipo: "text",
      opcional: true,
      avancado: true,
      placeholder: '{"buscar": "search_leads", "campanha": "create_campaign", "estado": "campaign_status"}',
      ajuda: "Só se o app escolher a ferramenta errada. Deixe em branco para identificar sozinho pelos nomes (buscar, campanha e estado).",
    },
  ],
  testarExtra: (ferramentas) => {
    const manual = mapeamentoManual();
    const nomes = new Set(ferramentas.map((f) => f.nome));
    const ausentes = Object.entries(manual).filter(([, nome]) => !nomes.has(nome));
    if (ausentes.length > 0) {
      return { ok: false, mensagem: `Conectado, mas ${ausentes.map(([papel, nome]) => `"${nome}" (${papel})`).join(", ")} não existe no Prospect Halo. Ferramentas disponíveis: ${ferramentas.map((f) => f.nome).join(", ")}.` };
    }
    return undefined;
  },
});

export const INTEGRACOES: Integracao[] = [OPENROUTER, PROSPECTHALO, NOTIFICACOES];
