// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { processarMensagem } from "./agente";
import type { Ferramenta } from "./mcp";
import { trelloConfigurado, type ProvedorQuadro } from "./quadro";
import { quadroDemoPara } from "./quadro-demo";
import { mcpTarefasConfigurado, quadroMcp } from "./quadro-mcp";
import { trello } from "./trello";

export const NOME_SERVIDOR = "agente-kanban";

// Identidade fixa para o quadro de exemplo quando esta ferramenta é chamada via MCP (US-072): um
// assistente de IA não mantém o cookie de visitante entre chamadas (diferente do navegador, que
// usa lib/visitante.ts), então cada chamada veria um quadro de exemplo novo e vazio se usasse
// visitanteId() aqui — com uma chave fixa, o mesmo quadro em memória persiste entre as chamadas.
const VISITANTE_MCP = "mcp";

async function provedorAtual(): Promise<ProvedorQuadro> {
  if (mcpTarefasConfigurado()) return quadroMcp;
  if (trelloConfigurado()) return trello;
  return quadroDemoPara(VISITANTE_MCP);
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "operar_quadro",
    descricao:
      "Opera o quadro Kanban de RH a partir de um comando em português: cria, move, atribui, comenta ou arquiva cartões. Por padrão (confirmar=false ou ausente) só descreve o plano da ação, sem alterar nada; chame de novo com confirmar=true para executar de verdade.",
    schema: {
      type: "object",
      properties: {
        comando: { type: "string", description: "Comando em linguagem natural, por exemplo: 'mova o cartão Revisar contrato para Concluído'" },
        confirmar: { type: "boolean", description: "true para executar o comando de verdade; false ou ausente só devolve o plano, sem alterar o quadro" },
      },
      required: ["comando"],
    },
    async executar(args) {
      const comando = String(args.comando || "").trim();
      if (!comando) throw new Error("Informe o comando para o agente.");
      const provedor = await provedorAtual();
      if (!args.confirmar) {
        const { plano } = await processarMensagem({ mensagem: comando, provedor, planejar: true });
        return { plano };
      }
      return processarMensagem({ mensagem: comando, provedor });
    },
  },
];
