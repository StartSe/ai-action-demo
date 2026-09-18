import { criarProspeccaoExemplo } from "@/lib/demo";

/** "Ver uma prospecção de exemplo" (estado vazio do Início, US-003): cria a prospecção de demonstração
 * (uma única vez, ver lib/demo.ts) e devolve o id para a tela recarregar o painel já preenchido. */
export async function POST() {
  const id = criarProspeccaoExemplo();
  return Response.json({ id });
}
