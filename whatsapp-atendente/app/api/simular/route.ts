import { aiEnabled, meta } from "@/lib/ai";
import { listarConversas, responder } from "@/lib/atendente";
import { getConfig } from "@/lib/estado";
import { apagarTodos, listar, salvar } from "@/lib/historico";
import type { Config } from "@/lib/types";

// Simulador de conversa (celular na tela).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { de?: string; texto?: string; config?: Partial<Config> };
  const { de, texto, config } = body;
  if (!texto || !String(texto).trim()) {
    return Response.json({ error: "Digite uma mensagem para simular." }, { status: 400 });
  }
  const numero = de && String(de).trim() ? String(de).trim() : "simulador";
  const textoLimpo = String(texto).trim();
  // O simulador testa o rascunho que a pessoa está editando no painel, não só a configuração já salva.
  const configRascunho: Config | undefined = config ? { ...getConfig(), ...config } : undefined;
  try {
    const { resposta, transferir, ferramentaUsada } = await responder({ numero, texto: textoLimpo, origem: "simulador", config: configRascunho });
    const metaGerada = meta({ demo: !aiEnabled(), insumo: "mensagens do cliente e a base de conhecimento configurada" });
    const conversas = listarConversas();
    const id = salvar({
      tipo: "atendimento",
      titulo: `Atendimento: ${textoLimpo.length > 60 ? `${textoLimpo.slice(0, 57)}...` : textoLimpo}`,
      entrada: { numero, texto: textoLimpo },
      saida: { resposta, transferir, conversas },
      meta: metaGerada,
    });
    return Response.json({ resposta, transferir, ferramentaUsada, conversas, meta: metaGerada, id });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a resposta agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

/** Últimos atendimentos salvos, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
