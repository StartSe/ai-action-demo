import { aiEnabled, meta } from "@/lib/ai";
import { processarMensagem, type HistoricoItem } from "@/lib/agente";
import { apagarTodos, listar, salvar } from "@/lib/historico";
import { trelloConfigurado } from "@/lib/quadro";
import { quadroDemoPara } from "@/lib/quadro-demo";
import { mcpTarefasConfigurado, quadroMcp } from "@/lib/quadro-mcp";
import { trello } from "@/lib/trello";
import { visitanteId } from "@/lib/visitante";

export const dynamic = "force-dynamic";

// Precedência do provedor de quadro (US-072): um quadro de tarefas conectado por MCP vem antes do
// Trello, que vem antes do quadro de exemplo em memória.
function provedor(id: string) {
  if (mcpTarefasConfigurado()) return quadroMcp;
  return trelloConfigurado() ? trello : quadroDemoPara(id);
}

/** Título curto para a lista "Últimos resultados": a própria mensagem, cortada. */
function titulo(mensagem: string): string {
  return mensagem.length > 80 ? `${mensagem.slice(0, 77)}...` : mensagem;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mensagem?: string; historico?: HistoricoItem[]; confirmar?: boolean };
  const { mensagem, historico, confirmar } = body;
  if (!mensagem || !String(mensagem).trim()) {
    return Response.json({ error: 'Escreva um comando para o agente, como "crie um cartão...".' }, { status: 400 });
  }
  try {
    const idVisitante = await visitanteId();
    const modoReal = trelloConfigurado() || mcpTarefasConfigurado();
    const provedorAtual = provedor(idVisitante);

    // Com um quadro real conectado (Trello ou MCP), exige confirmação antes de agir (US-035/US-072);
    // em modo demo (quadro de exemplo), executa direto, como antes. Uma consulta só de leitura
    // (plano vazio) também segue direto.
    if (modoReal && !confirmar) {
      const { plano } = await processarMensagem({ mensagem, historico, provedor: provedorAtual, planejar: true });
      if (plano.length > 0) return Response.json({ plano });
    }

    const resultado = await processarMensagem({ mensagem, historico, provedor: provedorAtual });
    const metaGerada = meta({ demo: !aiEnabled(), insumo: "o quadro e o comando enviado ao agente" });
    const id = salvar({ tipo: "agente-kanban", titulo: titulo(mensagem), entrada: { mensagem }, saida: resultado, meta: metaGerada });
    return Response.json({ ...resultado, meta: metaGerada, id, quadroDemo: !modoReal });
  } catch (err) {
    console.error(err);
    const mensagemErro = err instanceof Error ? err.message : "Não foi possível falar com o agente agora. Tente novamente.";
    return Response.json({ error: mensagemErro }, { status: 500 });
  }
}

/** Últimos resultados salvos, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
