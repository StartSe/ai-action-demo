// Leitura e validação do pedido que chega às rotas de geração e de esclarecimento (RF-01 a1/a2). Sem import node:*.
export const MINIMO_DESCRICAO = 10;
export const MAXIMO_DESCRICAO = 1000;

type Corpo = { descricao?: unknown; esclarecimentos?: unknown };

/** Lê e valida `descricao`/`esclarecimentos` do corpo; devolve a resposta 400 pronta quando algo está errado. */
export function lerPedido(corpo: Corpo): { descricao: string; esclarecimentos?: Record<string, string> } | Response {
  const descricao = typeof corpo.descricao === "string" ? corpo.descricao.trim() : "";
  if (descricao.length < MINIMO_DESCRICAO) {
    return Response.json({ error: "Descreva com um pouco mais de detalhe (pelo menos 10 letras)." }, { status: 400 });
  }
  if (descricao.length > MAXIMO_DESCRICAO) {
    return Response.json({ error: "Descreva o painel em até 1.000 caracteres." }, { status: 400 });
  }
  let esclarecimentos: Record<string, string> | undefined;
  if (corpo.esclarecimentos && typeof corpo.esclarecimentos === "object" && !Array.isArray(corpo.esclarecimentos)) {
    esclarecimentos = {};
    for (const [k, v] of Object.entries(corpo.esclarecimentos as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) esclarecimentos[k.slice(0, 140)] = v.trim().slice(0, 200);
    }
    if (Object.keys(esclarecimentos).length === 0) esclarecimentos = undefined;
  }
  return { descricao, esclarecimentos };
}
