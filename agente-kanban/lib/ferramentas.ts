// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { processarMensagem } from "./agente";
import type { Ferramenta } from "./mcp";
import { trelloConfigurado, type ProvedorQuadro } from "./quadro";
import { quadroDemoPara } from "./quadro-demo";
import { trello } from "./trello";
import { visitanteId } from "./visitante";

export const NOME_SERVIDOR = "agente-kanban";

async function provedorAtual(): Promise<ProvedorQuadro> {
  const id = await visitanteId();
  return trelloConfigurado() ? trello : quadroDemoPara(id);
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
