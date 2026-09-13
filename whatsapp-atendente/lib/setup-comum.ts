// Tipos e utilitários do setup inicial. Compartilhado por toda a suíte: copie sem alterar.
// A lista de integrações de cada app fica em lib/integracoes.ts.
import { getConfig, mascarar, origemConfig } from "./store";

export type Opcao = { valor: string; rotulo: string };

export type Campo = {
  chave: string;
  rotulo: string;
  tipo: "secret" | "text" | "select";
  ajuda?: string;
  placeholder?: string;
  opcional?: boolean;
  padrao?: string;
  opcoes?: Opcao[];
  /** Opções carregadas da própria integração (ex.: quadros do Trello) quando as chaves anteriores já existem. */
  opcoesDinamicas?: (config: Record<string, string | undefined>) => Promise<Opcao[]>;
};

export type Integracao = {
  id: string;
  titulo: string;
  descricao: string;
  obrigatoria: boolean;
  /** Onde a pessoa obtém a chave. */
  link?: { url: string; rotulo: string };
  /** Fluxo de conexão em um clique. "openrouter" é genérico; outros são tratados pelo app. */
  oauth?: { tipo: string; rotulo: string; url: string };
  campos: Campo[];
  /** Valida as chaves salvas chamando a integração. */
  testar?: (config: Record<string, string | undefined>) => Promise<{ ok: boolean; mensagem: string }>;
};

export type CampoStatus = Omit<Campo, "opcoesDinamicas"> & { definido: boolean; origem: "env" | "banco" | null; mascarado: string | null; valorVisivel?: string };
export type IntegracaoStatus = Omit<Integracao, "campos" | "testar"> & { campos: CampoStatus[]; configurada: boolean };

/** Chaves necessárias para a integração contar como configurada. */
export function integracaoConfigurada(i: Integracao): boolean {
  return i.campos.filter((c) => !c.opcional).every((c) => Boolean(getConfig(c.chave)));
}

export function lerConfig(i: Integracao): Record<string, string | undefined> {
  return Object.fromEntries(i.campos.map((c) => [c.chave, getConfig(c.chave) ?? c.padrao]));
}

export async function statusIntegracoes(lista: Integracao[]): Promise<{ integracoes: IntegracaoStatus[]; pronto: boolean }> {
  const integracoes: IntegracaoStatus[] = [];
  for (const i of lista) {
    const config = lerConfig(i);
    const campos: CampoStatus[] = [];
    for (const c of i.campos) {
      const valor = getConfig(c.chave);
      let opcoes = c.opcoes;
      if (c.opcoesDinamicas) {
        try { opcoes = await c.opcoesDinamicas(config); } catch { opcoes = c.opcoes ?? []; }
      }
      const { opcoesDinamicas: _ignorado, ...resto } = c;
      void _ignorado;
      campos.push({
        ...resto,
        opcoes,
        definido: Boolean(valor),
        origem: valor ? origemConfig(c.chave) : null,
        mascarado: c.tipo === "secret" ? mascarar(valor) : null,
        valorVisivel: c.tipo !== "secret" ? valor ?? c.padrao : undefined,
      });
    }
    const { campos: _c, testar: _t, ...cabecalho } = i;
    void _c; void _t;
    integracoes.push({ ...cabecalho, campos, configurada: integracaoConfigurada(i) });
  }
  const pronto = lista.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  return { integracoes, pronto };
}

/** URL pública do app, respeitando proxies (Render, Docker). */
export function baseUrl(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Integração de IA usada por todos os apps. */
export const MODELOS_GRATUITOS: Opcao[] = [
  { valor: "nvidia/nemotron-3-super-120b-a12b:free", rotulo: "Nemotron 3 Super 120B (gratuito, padrão)" },
  { valor: "google/gemma-4-31b-it:free", rotulo: "Gemma 4 31B (gratuito)" },
  { valor: "nvidia/nemotron-3-ultra-550b-a55b:free", rotulo: "Nemotron 3 Ultra 550B (gratuito)" },
  { valor: "anthropic/claude-sonnet-4.5", rotulo: "Claude Sonnet 4.5 (pago, mais qualidade)" },
  { valor: "openai/gpt-5-mini", rotulo: "GPT-5 mini (pago)" },
];

export const OPENROUTER: Integracao = {
  id: "openrouter",
  titulo: "Inteligência artificial",
  descricao: "Uma conta gratuita no OpenRouter dá acesso a dezenas de modelos, vários sem custo. Conecte em um clique ou cole uma chave.",
  obrigatoria: true,
  link: { url: "https://openrouter.ai/keys", rotulo: "Criar uma chave gratuita" },
  oauth: { tipo: "openrouter", rotulo: "Conectar a IA", url: "/api/setup/oauth/openrouter" },
  campos: [
    { chave: "OPENROUTER_API_KEY", rotulo: "Chave da API", tipo: "secret", placeholder: "sk-or-v1-..." },
    { chave: "OPENROUTER_MODEL", rotulo: "Modelo", tipo: "select", opcional: true, padrao: "nvidia/nemotron-3-super-120b-a12b:free", opcoes: MODELOS_GRATUITOS, ajuda: "Comece com um gratuito. Troque por um pago quando quiser mais qualidade." },
  ],
  testar: async (config) => {
    const chave = config.OPENROUTER_API_KEY;
    if (!chave) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
    const r = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: { Authorization: `Bearer ${chave}` } });
    if (r.status === 401) return { ok: false, mensagem: "Chave inválida ou revogada." };
    if (!r.ok) return { ok: false, mensagem: `OpenRouter respondeu HTTP ${r.status}.` };
    const data = (await r.json()) as { data?: { label?: string; limit?: number | null; usage?: number } };
    const uso = data.data?.usage != null ? ` Uso até agora: US$ ${Number(data.data.usage).toFixed(2)}.` : "";
    return { ok: true, mensagem: `Conectado.${uso} Modelo: ${config.OPENROUTER_MODEL || "padrão gratuito"}.` };
  },
};
