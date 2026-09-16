// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
// Os moldes (openrouter, NOTIFICACOES, MCP_CRM, MCP_DADOS) vêm de lib/setup-comum.ts (compartilhado, copiado
// sem alterar); o texto de negócio de cada cartão é deste app e fica aqui, por cima do molde.
import { MCP_CRM, MCP_DADOS, NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que lê os comentários e prioriza as ações" });

/** Por onde chegam a análise semanal e o alerta de detratores (lib/rotinas-do-app.ts). */
const AVISOS: Integracao = { ...NOTIFICACOES, beneficio: "Entrega a análise semanal e avisa quando os detratores subirem" };

const AJUDA_CRM =
  "HubSpot: Configurações › Integrações › Aplicativos conectados. Zendesk: Admin › Apps e integrações. Intercom: Configurações › Integrações. Copie o endereço mostrado lá.";

/** CRM ou sistema de atendimento de onde importamos tickets (botão "Importar tickets do período"). */
const CRM: Integracao = {
  ...MCP_CRM,
  beneficio: "Traz os tickets de atendimento para a mesma análise",
  descricao: "Conecte o HubSpot, o Zendesk ou o Intercom para importar os tickets de atendimento de um período e analisá-los junto com os comentários dos clientes.",
  link: { url: "https://developers.hubspot.com/mcp", rotulo: "Como ativar a conexão no HubSpot" },
  campos: MCP_CRM.campos.map((c) => (c.chave === "MCP_CRM_URL" ? { ...c, ajuda: AJUDA_CRM } : c)),
};

const AJUDA_PLANILHA = "Copie do painel de conexões da sua planilha ou do ERP; a aba e as colunas ficam em Opções avançadas.";

/** Planilha viva (ou ERP) onde as respostas de NPS já chegam: lida direto de lá, sem exportar CSV. */
const PLANILHA: Integracao = {
  ...MCP_DADOS,
  beneficio: "Lê as notas de NPS direto da sua planilha viva",
  descricao: "Conecte a planilha onde as respostas de NPS já chegam (uma planilha compartilhada, um ERP ou outro serviço com conexão) para ler notas e comentários de lá, sem exportar CSV toda vez.",
  campos: MCP_DADOS.campos.map((c) => (c.chave === "MCP_DADOS_URL" ? { ...c, ajuda: AJUDA_PLANILHA } : c)),
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, AVISOS, CRM, PLANILHA];
