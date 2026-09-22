import { responderErro } from "@/app/api/erros";
import { aiEnabled, meta } from "@/lib/ai";
import { classificarEmSegundoPlano, responder } from "@/lib/atendente";
import { listarConversas } from "@/lib/conversas";
import { getConfig } from "@/lib/estado";
import { apagarTodos, listar } from "@/lib/historico";
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
    const { resposta, transferir, motivo, atendimentoHumano, detalhes } = await responder({ numero, texto: textoLimpo, origem: "simulador", config: configRascunho });
    // Com a resposta pronta, o assunto da conversa (para os relatórios), sem segurar esta resposta.
    classificarEmSegundoPlano(numero);
    const metaGerada = meta({ demo: !aiEnabled(), insumo: "mensagens do cliente e a base de conhecimento configurada" });
    // As conversas agora vivem no banco (lib/conversas.ts) e sobrevivem a um reinício: não há mais
    // snapshot da lista salvo no histórico a cada mensagem. A lista atualizada volta junto da resposta
    // só para a tela não precisar de um segundo fetch.
    // `detalhes` é o que o bloco "Por que respondeu assim" da bolha desenha (o antigo `ferramentaUsada`
    // virou uma das linhas dele).
    return Response.json({ resposta, transferir, motivo: motivo ?? null, detalhes, atendimentoHumano, conversas: listarConversas(), meta: metaGerada });
  } catch (err) {
    return responderErro(err, "Não foi possível gerar a resposta agora. Tente de novo.");
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
