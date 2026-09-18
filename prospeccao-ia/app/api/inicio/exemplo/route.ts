import { criarProspeccaoExemplo, limparProspeccaoExemplo } from "@/lib/demo";

/** "Ver uma prospecção de exemplo" (estado vazio do Início, US-003): cria a prospecção de demonstração
 * (uma única vez, ver lib/demo.ts) e devolve o id para a tela recarregar o painel já preenchido. */
export async function POST() {
  const id = criarProspeccaoExemplo();
  return Response.json({ id });
}

/** "Limpar exemplo" (US-008): remove só o que o exemplo criou, sem tocar no que a pessoa cadastrou. */
export async function DELETE() {
  limparProspeccaoExemplo();
  return Response.json({ ok: true });
}
