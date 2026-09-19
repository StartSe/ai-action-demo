import { obter, obterPorCodigo } from "./entrevistas";

export class TentativaEncerrada extends Error {
  constructor() { super("Esta entrevista foi reaberta pelo gestor. Recarregue a página para começar novamente."); }
}
export function conferirTentativa(id: string, tentativa: number): void {
  if (obter(id)?.tentativa !== tentativa) throw new TentativaEncerrada();
}
/** Abas anteriores à reabertura não podem escrever na nova conversa. */
export function tentativaDaRequisicao(req: Request): number {
  return Number(req.headers.get("X-Entrevista-Tentativa") ?? 1);
}
export function bloquearTentativaAntiga(req: Request, codigo: string): Response | null {
  const entrevista = obterPorCodigo(codigo);
  if (entrevista && entrevista.tentativa !== tentativaDaRequisicao(req)) {
    return Response.json({ error: new TentativaEncerrada().message }, { status: 409 });
  }
  return null;
}
