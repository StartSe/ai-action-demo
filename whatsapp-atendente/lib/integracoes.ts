// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { randomBytes } from "node:crypto";
import { NOTIFICACOES, openrouter, integracaoMCP, type Integracao } from "./setup-comum";
import { getConfig, setConfig } from "./store";
import { conferirNumero } from "./whatsapp";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que responde os clientes com a base do seu negócio" });

/**
 * O valor de verificação do webhook precisa existir antes da pessoa abrir /setup, para ela só copiar.
 * Gera um valor aleatório (32 bytes) na primeira vez que for necessário e persiste no banco.
 */
export function verifyTokenWhatsApp(): string {
  const atual = getConfig("WHATSAPP_VERIFY_TOKEN");
  if (atual) return atual;
  const gerado = randomBytes(32).toString("hex");
  setConfig("WHATSAPP_VERIFY_TOKEN", gerado);
  return gerado;
}

export const WHATSAPP: Integracao = {
  id: "whatsapp",
  titulo: "Número de WhatsApp da empresa",
  beneficio: "Faz o atendente responder clientes no número real da empresa",
  descricao:
    "Conecte o número real da empresa para o atendente responder clientes de verdade. Sem isso, o simulador (o celular na tela) continua funcionando normalmente para testar o atendente.",
  // Resumo de negócio antes dos campos: o que a empresa precisa ter antes de colar os valores.
  notaConexao:
    "A empresa precisa de uma conta na z-api e de uma instância criada lá (a z-api cobra um valor mensal por instância, direto com eles). Com a instância criada, conectar o número aqui é só colar os três valores abaixo e escanear um QR Code com o celular da empresa.",
  obrigatoria: false,
  link: { url: "https://app.z-api.io", rotulo: "Abrir o painel da z-api" },
  // Dois caminhos no mesmo cartão: a z-api (principal) e a Cloud API da Meta (avançado). Por isso a
  // conexão não pode ser "todos os campos preenchidos" — basta a chave de um dos dois provedores.
  campoConectado: ["ZAPI_TOKEN", "WHATSAPP_TOKEN"],
  campos: [
    {
      chave: "ZAPI_INSTANCE_ID",
      rotulo: "Identificação da instância",
      tipo: "text",
      placeholder: "3D1A2B...",
      ajuda: "No painel da z-api, em Instâncias, clique em editar a instância e copie o valor de \"ID\".",
    },
    {
      chave: "ZAPI_TOKEN",
      rotulo: "Chave da instância",
      tipo: "secret",
      ajuda: "Na mesma tela da instância no painel da z-api, logo abaixo, copie o valor de \"Token\".",
    },
    {
      chave: "ZAPI_CLIENT_TOKEN",
      rotulo: "Chave de segurança da conta",
      tipo: "secret",
      ajuda: "No painel da z-api, em Segurança, copie o token de segurança da conta (vale para todas as instâncias).",
    },
    {
      chave: "WHATSAPP_TOKEN",
      rotulo: "Código de acesso permanente",
      tipo: "secret",
      opcional: true,
      avancado: true,
      ajuda: "No painel da Meta, em Configurações do app › Usuários do sistema, gere um código permanente (que não expira) para o usuário de sistema com acesso ao WhatsApp.",
    },
    {
      chave: "WHATSAPP_PHONE_NUMBER_ID",
      rotulo: "Identificador do número",
      tipo: "text",
      opcional: true,
      avancado: true,
      placeholder: "1234567890",
      ajuda: "No painel da Meta, em WhatsApp › Configuração da API, copie o número que aparece no bloco \"De\".",
    },
  ],
  testar: conferirNumero,
};

/**
 * Integrações com cartão próprio em /setup: saem da lista genérica devolvida pelo `GET /api/setup` e
 * continuam em `INTEGRACOES` para o `PUT`, para o botão de testar e para o `/api/status` (mesmo desenho
 * que `custos-ia` usa com Gmail e Outlook). O WhatsApp está aqui porque `components/ConexaoWhatsApp.tsx`
 * faz tudo o que o cartão genérico fazia — e mais: QR Code, estado da conexão, número conectado,
 * "Desconectar" e o bloco da equipe técnica. Com os dois na tela, a mesma pessoa era convidada a colar
 * as mesmas três credenciais duas vezes seguidas (achado aberto da US-020).
 */
export const COM_CARTAO_PROPRIO: Integracao[] = [WHATSAPP];

export const AGENDA = integracaoMCP({
  id: "mcp-agenda",
  titulo: "Agenda de atendimento",
  descricao: "Conecte sua agenda por um servidor MCP compatível com Google Calendar ou Outlook Calendar. Autorize a conta e escolha as ferramentas que o atendente pode usar. Sem conexão, ele coleta preferências e encaminha à equipe.",
  ajudaUrl: "Informe o endereço MCP fornecido pelo serviço de agenda da empresa. A conexão de e-mail deste app não dá acesso à agenda.",
  rotuloFerramentas: "Ferramentas",
  camposExtras: [{ chave: "MCP_AGENDA_FERRAMENTAS", rotulo: "Ferramentas autorizadas", tipo: "text", opcional: true,
    ajuda: "Use Testar conexão para ver os nomes. Informe os nomes exatos, separados por vírgula, de consulta de horários e criação de eventos. Nenhuma ferramenta é liberada automaticamente." }],
  testarExtra: (ferramentas) => {
    const nomes = (getConfig("MCP_AGENDA_FERRAMENTAS") || "").split(",").map((n) => n.trim()).filter(Boolean);
    const faltam = nomes.filter((n) => !ferramentas.some((f) => f.nome === n));
    if (!nomes.length || faltam.length) return { ok: false, mensagem: `Escolha ferramentas válidas em Opções avançadas. Disponíveis: ${ferramentas.map((f) => f.nome).join(", ")}.` };
    return { ok: true, mensagem: `Agenda disponível. Ferramentas autorizadas: ${nomes.join(", ")}.` };
  },
});
export const INTEGRACOES: Integracao[] = [OPENROUTER, WHATSAPP, AGENDA, NOTIFICACOES];

/**
 * Integrações que saem dos cartões numerados de /setup e vão para um bloco recolhido no fim da página.
 * Elas continuam inteiras (mesmo cartão, mesmos campos, mesmo "Salvar") — só deixam de disputar a
 * atenção de quem chegou para fazer uma coisa: pôr o atendente no ar. Avisos por e-mail ou Slack são um
 * ajuste de quem já está rodando, não um passo da configuração inicial.
 */
export const SECUNDARIAS: Integracao[] = [NOTIFICACOES];

/** O que o cartão genérico de /setup desenha em destaque: tudo menos quem tem cartão próprio ou é secundária. */
export const GENERICAS: Integracao[] = INTEGRACOES.filter(
  (i) => !COM_CARTAO_PROPRIO.some((p) => p.id === i.id) && !SECUNDARIAS.some((p) => p.id === i.id)
);
