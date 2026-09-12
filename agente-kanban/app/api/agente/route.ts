import { processarMensagem, type HistoricoItem } from "@/lib/agente";
import { trelloConfigurado } from "@/lib/quadro";
import { quadroDemo } from "@/lib/quadro-demo";
import { trello } from "@/lib/trello";

export const dynamic = "force-dynamic";

function provedor() {
  return trelloConfigurado() ? trello : quadroDemo;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mensagem?: string; historico?: HistoricoItem[] };
  const { mensagem, historico } = body;
  if (!mensagem || !String(mensagem).trim()) {
    return Response.json({ error: 'Escreva um comando para o agente, como "crie um cartão...".' }, { status: 400 });
  }
  try {
    const resultado = await processarMensagem({ mensagem, historico, provedor: provedor() });
    return Response.json(resultado);
  } catch (err) {
    console.error(err);
    const mensagemErro = err instanceof Error ? err.message : "Não foi possível falar com o agente agora. Tente novamente.";
    return Response.json({ error: mensagemErro }, { status: 500 });
  }
}
