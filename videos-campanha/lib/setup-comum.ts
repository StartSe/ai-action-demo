// Tipos e utilitários do setup inicial. Compartilhado por toda a suíte: copie sem alterar.
// A lista de integrações de cada app fica em lib/integracoes.ts.
import { getConfig, mascarar, origemConfig, setConfig } from "./store";
import { enviar, type Canal } from "./notificacoes";
import { conectar, listarFerramentas, type FerramentaMCP } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";

export type Opcao = { valor: string; rotulo: string };

export type Campo = {
  chave: string;
  rotulo: string;
  tipo: "secret" | "text" | "select";
  ajuda?: string;
  placeholder?: string;
  opcional?: boolean;
  /** Campo secundário: fica dentro de "Opções avançadas" no cartão, em vez do grupo principal. */
  avancado?: boolean;
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
  /** Campo cujo valor define sozinho se a integração conta como conectada (chip "conectado", botão Autorizar/Conectado). Por padrão, usa todos os campos não opcionais. */
  campoConectado?: string;
};

export type CampoStatus = Omit<Campo, "opcoesDinamicas"> & { definido: boolean; origem: "env" | "banco" | null; mascarado: string | null; valorVisivel?: string };
export type IntegracaoStatus = Omit<Integracao, "campos" | "testar"> & { campos: CampoStatus[]; configurada: boolean };

/** Chaves necessárias para a integração contar como configurada. */
export function integracaoConfigurada(i: Integracao): boolean {
  if (i.campoConectado) return Boolean(getConfig(i.campoConectado));
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

/** Endereço público usado para montar links absolutos em e-mail/Slack (rotinas, lembretes,
 * formulários, pedidos). Nunca "localhost" fora de desenvolvimento: sem `APP_URL` configurada em
 * produção, devolve `undefined` e quem monta o link deve tratar (ex.: enviar sem link, avisar
 * "endereço público desconhecido"). Ver `registrarEnderecoPublico`, que preenche `APP_URL` sozinho a
 * partir da primeira requisição real que chegar numa rota que cria algo com link. */
export function enderecoPublico(): string | undefined {
  const valor = getConfig("APP_URL");
  if (valor) return valor;
  if (process.env.NODE_ENV !== "production") return `http://localhost:${process.env.PORT || 3000}`;
  return undefined;
}

/** Grava `APP_URL` a partir do host real da requisição, para toda rota que cria uma rotina, um
 * lembrete, um formulário ou um pedido que vai gerar um link em e-mail/Slack mais tarde. Nunca
 * sobrescreve um valor vindo de variável de ambiente, e só regrava quando o host muda. */
export function registrarEnderecoPublico(req: Request): void {
  if (origemConfig("APP_URL") === "env") return;
  const atual = baseUrl(req);
  if (getConfig("APP_URL") === atual) return;
  setConfig("APP_URL", atual);
}

/** Integração de IA usada por todos os apps. */
export const MODELOS_GRATUITOS: Opcao[] = [
  { valor: "nvidia/nemotron-3-super-120b-a12b:free", rotulo: "Nemotron 3 Super 120B (gratuito, padrão)" },
  { valor: "google/gemma-4-31b-it:free", rotulo: "Gemma 4 31B (gratuito)" },
  { valor: "nvidia/nemotron-3-ultra-550b-a55b:free", rotulo: "Nemotron 3 Ultra 550B (gratuito)" },
  { valor: "anthropic/claude-sonnet-4.5", rotulo: "Claude Sonnet 4.5 (pago, mais qualidade)" },
  { valor: "openai/gpt-5-mini", rotulo: "GPT-5 mini (pago)" },
];

/** Modelos com suporte a imagem no OpenRouter. Verificado em 2026-09-14 em openrouter.ai/models (filtro "image" em input modalities); primeiro gratuito. */
export const MODELOS_VISAO: Opcao[] = [
  { valor: "inclusionai/ling-3.0-flash-vl:free", rotulo: "Ling 3.0 Flash VL (gratuito, padrão)" },
  { valor: "nex-agi/nex-n2.5-pro:free", rotulo: "Nex N2.5 Pro (gratuito)" },
  { valor: "anthropic/claude-sonnet-4.5", rotulo: "Claude Sonnet 4.5 (pago, mais qualidade)" },
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
    { chave: "OPENROUTER_MODEL_VISAO", rotulo: "Modelo para imagens", tipo: "select", opcional: true, avancado: true, padrao: MODELOS_VISAO[0].valor, opcoes: MODELOS_VISAO, ajuda: "Modelo usado quando o app precisa ler uma imagem" },
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

/** Por onde o app avisa você quando um formulário chega ou uma rotina roda. */
export const NOTIFICACOES: Integracao = {
  id: "notificacoes",
  titulo: "Notificações",
  descricao: "Escolha por onde o app avisa você quando um formulário público chega ou uma rotina roda: e-mail ou Slack.",
  obrigatoria: false,
  link: { url: "https://resend.com/api-keys", rotulo: "Criar uma chave gratuita do Resend" },
  campos: [
    { chave: "NOTIFICACOES_CANAL", rotulo: "Canal", tipo: "select", padrao: "email", opcoes: [{ valor: "email", rotulo: "E-mail" }, { valor: "slack", rotulo: "Slack" }] },
    { chave: "NOTIFICACOES_DESTINO", rotulo: "Destino", tipo: "text", opcional: true, placeholder: "voce@empresa.com", ajuda: "Para e-mail, o endereço que recebe. Para Slack, opcional (sobrepõe o canal padrão do webhook)." },
    { chave: "NOTIFICACOES_RESEND_API_KEY", rotulo: "Chave do Resend", tipo: "secret", opcional: true, placeholder: "re_...", ajuda: "Para enviar e-mail sem servidor próprio. Alternativa: preencha os dados de SMTP abaixo." },
    { chave: "NOTIFICACOES_SMTP_HOST", rotulo: "Servidor SMTP", tipo: "text", opcional: true, placeholder: "smtp.seudominio.com" },
    { chave: "NOTIFICACOES_SMTP_PORTA", rotulo: "Porta SMTP", tipo: "text", opcional: true, placeholder: "587" },
    { chave: "NOTIFICACOES_SMTP_USUARIO", rotulo: "Usuário SMTP", tipo: "text", opcional: true },
    { chave: "NOTIFICACOES_SMTP_SENHA", rotulo: "Senha SMTP", tipo: "secret", opcional: true },
    { chave: "NOTIFICACOES_SLACK_WEBHOOK", rotulo: "URL do webhook de entrada do Slack", tipo: "secret", opcional: true, placeholder: "https://hooks.slack.com/services/..." },
  ],
  testar: async (config) => {
    const canal = (config.NOTIFICACOES_CANAL as Canal | undefined) || "email";
    return enviar({
      canal,
      destino: config.NOTIFICACOES_DESTINO,
      titulo: "Mensagem de teste",
      texto: "Se você recebeu isto, as notificações deste app estão prontas para uso.",
    });
  },
};

/**
 * Molde para uma integração MCP externa que a pessoa autoriza em um clique (botão "Autorizar",
 * via lib/mcp-oauth.ts) em vez de precisar colar um código manualmente. O código manual continua
 * disponível dentro de "Opções avançadas", para servidores que não suportam OAuth.
 */
export function integracaoMCP(opts: {
  id: string;
  titulo: string;
  descricao: string;
  ajudaUrl: string;
  /** Endereço sugerido quando este serviço tem um único destino conhecido (ex.: outro app da própria suíte). */
  urlPadrao?: string;
  /** Palavra usada na mensagem do teste de conexão (ex.: "Ações", "Consultas", "Ferramentas"). */
  rotuloFerramentas: string;
  /** Campos próprios desta integração além de endereço e código (ex.: nome de uma ferramenta específica). Sempre em "Opções avançadas". */
  camposExtras?: Campo[];
  /** Validação extra depois de listar as ferramentas remotas (ex.: conferir se a ferramenta escolhida existe). */
  testarExtra?: (ferramentas: FerramentaMCP[]) => { ok: boolean; mensagem: string } | undefined;
}): Integracao {
  const prefixo = opts.id.toUpperCase().replace(/-/g, "_");
  return {
    id: opts.id,
    titulo: opts.titulo,
    descricao: opts.descricao,
    obrigatoria: false,
    oauth: { tipo: "mcp", rotulo: "Autorizar", url: `/api/setup/oauth/mcp/${prefixo}` },
    campoConectado: `${prefixo}_CODIGO`,
    campos: [
      {
        chave: `${prefixo}_URL`,
        rotulo: "Endereço",
        tipo: "text",
        placeholder: "https://seu-servico.exemplo.com/mcp",
        ajuda: opts.ajudaUrl,
        padrao: opts.urlPadrao,
      },
      {
        chave: `${prefixo}_CODIGO`,
        rotulo: "Código de acesso",
        tipo: "secret",
        opcional: true,
        avancado: true,
        ajuda: "Alternativa ao botão Autorizar: cole aqui um código de acesso gerado manualmente no serviço.",
      },
      ...(opts.camposExtras ?? []),
    ],
    testar: async () => {
      const conexao = await conexaoAutorizada(prefixo);
      if (!conexao) return { ok: false, mensagem: "Autorize com o botão acima ou informe o endereço e o código de acesso antes de testar." };
      try {
        const ferramentas = await listarFerramentas(conectar(conexao.url, conexao.token));
        if (ferramentas.length === 0) return { ok: true, mensagem: `Conectado, mas o serviço ainda não expõe nenhuma ${opts.rotuloFerramentas.toLowerCase().replace(/s$/, "")}.` };
        const extra = opts.testarExtra?.(ferramentas);
        if (extra) return extra;
        return { ok: true, mensagem: `Conectado. ${opts.rotuloFerramentas} disponíveis: ${ferramentas.map((f) => f.nome).join(", ")}.` };
      } catch (err) {
        return { ok: false, mensagem: err instanceof Error ? err.message : "Não foi possível conectar ao serviço." };
      }
    },
  };
}

/** Quadro de tarefas externo (outro app da suíte, como o Agente de quadro, ou qualquer servidor MCP compatível) que recebe as ações geradas aqui como cartões. */
export const MCP_TAREFAS: Integracao = integracaoMCP({
  id: "mcp-tarefas",
  titulo: "Quadro de tarefas (MCP)",
  descricao: "Conecte um quadro de tarefas (como o Agente de quadro desta suíte) para transformar as ações desta conversa em cartões onde o seu time já trabalha.",
  ajudaUrl: "Copie do cartão \"Usar dentro do seu assistente\", no setup do quadro de tarefas.",
  rotuloFerramentas: "Ações",
});

/** CRM ou sistema de atendimento externo (como HubSpot, Zendesk ou Intercom, que expõem um servidor MCP dentro da própria conta) que recebe os leads e negócios gerados aqui, ou de onde importamos tickets de atendimento. */
export const MCP_CRM: Integracao = integracaoMCP({
  id: "mcp-crm",
  titulo: "CRM (MCP)",
  descricao: "Conecte o CRM ou sistema de atendimento onde o seu time trabalha (HubSpot, Zendesk e Intercom, por exemplo, expõem um servidor MCP nas configurações de integrações da conta) para mandar contatos e negócios ou importar tickets direto daqui.",
  ajudaUrl: "No HubSpot, no Zendesk ou no Intercom, fica em Configurações › Integrações › Conectar aplicativos privados/MCP. Copie o endereço mostrado lá.",
  rotuloFerramentas: "Ações",
});

/** Sistemas internos da empresa (pedidos, estoque, ERP...) que um assistente pode consultar via MCP antes de responder. */
export const MCP_EMPRESA: Integracao = integracaoMCP({
  id: "mcp-empresa",
  titulo: "Sistemas da empresa (MCP)",
  descricao: "Conecte os sistemas onde ficam pedidos, estoque ou outros dados do seu negócio (um ERP, uma planilha compartilhada, um CRM — o que já expuser um servidor MCP) para o assistente consultar dados reais antes de responder.",
  ajudaUrl: "Copie do painel de integrações do seu ERP/CRM, ou do cartão \"Usar dentro do seu assistente\" de outro app desta suíte.",
  rotuloFerramentas: "Consultas",
});

/** Fonte de dados externa (uma planilha viva, um ERP, ou qualquer serviço que exponha um servidor MCP) para ler números sempre atualizados sem depender de exportação manual de CSV. */
export const MCP_DADOS: Integracao = integracaoMCP({
  id: "mcp-dados",
  titulo: "Fonte de dados (MCP)",
  descricao: "Conecte a planilha viva ou o ERP onde seus dados já vivem (qualquer serviço que exponha um servidor MCP) para ler direto de lá, sem exportar CSV toda vez.",
  ajudaUrl: "Copie do painel de integrações do seu ERP/planilha, ou do cartão \"Usar dentro do seu assistente\" de outro app desta suíte.",
  rotuloFerramentas: "Ferramentas",
  camposExtras: [
    {
      chave: "MCP_DADOS_FERRAMENTA",
      rotulo: "Nome da ferramenta de leitura",
      tipo: "text",
      opcional: true,
      avancado: true,
      placeholder: "ex.: ler_planilha",
      ajuda: "Deixe em branco para o app tentar identificar sozinho pelo nome das ferramentas disponíveis.",
    },
    {
      chave: "MCP_DADOS_ARGUMENTOS",
      rotulo: "Argumentos da ferramenta (JSON)",
      tipo: "text",
      opcional: true,
      avancado: true,
      placeholder: '{"aba": "Despesas"}',
      ajuda: "Só quando a ferramenta escolhida exigir parâmetros extras, como o nome de uma aba ou um período.",
    },
  ],
  testarExtra: (ferramentas) => {
    const escolhida = getConfig("MCP_DADOS_FERRAMENTA");
    if (escolhida && !ferramentas.some((f) => f.nome === escolhida)) {
      return { ok: false, mensagem: `Conectado, mas a ferramenta "${escolhida}" não existe nessa fonte. Ferramentas disponíveis: ${ferramentas.map((f) => f.nome).join(", ")}.` };
    }
    return undefined;
  },
});
