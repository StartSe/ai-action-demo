// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { randomBytes } from "node:crypto";
import { MCP_EMPRESA, NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";
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
  // Resumo de negócio antes dos campos: o que a empresa precisa ter e quanto tempo isso costuma levar.
  notaConexao:
    "Você precisa de uma conta Meta Business com o WhatsApp Cloud API ativado e o número da empresa já verificado. Com a conta pronta, a equipe técnica leva cerca de 30 minutos para ligar o número a este app, usando os dados de \"Ligar o número na Meta\" logo abaixo.",
  obrigatoria: false,
  link: { url: "https://business.facebook.com/", rotulo: "Abrir a conta Meta Business" },
  campos: [
    {
      chave: "WHATSAPP_TOKEN",
      rotulo: "Código de acesso permanente",
      tipo: "secret",
      avancado: true,
      ajuda: "No painel da Meta, em Configurações do app › Usuários do sistema, gere um código permanente (que não expira) para o usuário de sistema com acesso ao WhatsApp.",
    },
    {
      chave: "WHATSAPP_PHONE_NUMBER_ID",
      rotulo: "Identificador do número",
      tipo: "text",
      avancado: true,
      placeholder: "1234567890",
      ajuda: "No painel da Meta, em WhatsApp › Configuração da API, copie o número que aparece no bloco \"De\".",
    },
  ],
  testar: conferirNumero,
};

/**
 * Texto de negócio por cima da integração compartilhada (padrão da suíte: nunca editar
 * lib/setup-comum.ts para um app só). O título genérico carrega a sigla do protocolo, que não diz
 * nada para quem vai conectar — aqui o cartão fala do que o atendente ganha com a conexão.
 */
const SISTEMAS_DA_EMPRESA: Integracao = {
  ...MCP_EMPRESA,
  titulo: "Sistemas da empresa",
  beneficio: "Deixa o atendente consultar pedidos e estoque antes de responder",
  descricao:
    "Conecte o sistema onde ficam pedidos, estoque ou cadastro de clientes (um ERP, um CRM, uma planilha compartilhada) para o atendente consultar dados reais em vez de responder só pela base de conhecimento.",
  campos: MCP_EMPRESA.campos.map((c) =>
    c.chave === "MCP_EMPRESA_URL"
      ? { ...c, ajuda: "A equipe que cuida do seu ERP ou CRM tem esse endereço. Se o sistema for outro app desta suíte, ele aparece no cartão \"Usar dentro do seu assistente\" de lá." }
      : c
  ),
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, WHATSAPP, NOTIFICACOES, SISTEMAS_DA_EMPRESA];
