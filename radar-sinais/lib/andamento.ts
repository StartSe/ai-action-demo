// Andamento de uma rodada de busca, em memória: quais fontes já responderam. A tela passa um id de rodada no
// POST /api/radar e consulta GET /api/radar/andamento enquanto o Loading está na tela. Some sozinho depois de
// 10 minutos (ou quando a rota encerra a rodada), sem tabela nova.
const VALIDADE_MS = 10 * 60_000;

type Rodada = { respondidas: string[]; em: number };

const rodadas = new Map<string, Rodada>();

function limparAntigas() {
  const agora = Date.now();
  rodadas.forEach((r, id) => {
    if (agora - r.em > VALIDADE_MS) rodadas.delete(id);
  });
}

/** Id de rodada aceito: curto e só com caracteres seguros (vem do navegador). */
export function rodadaValida(valor: unknown): string | undefined {
  return typeof valor === "string" && /^[a-zA-Z0-9_-]{6,48}$/.test(valor) ? valor : undefined;
}

export function registrarResposta(rodada: string, fonte: string): void {
  limparAntigas();
  const atual = rodadas.get(rodada) ?? { respondidas: [], em: Date.now() };
  if (!atual.respondidas.includes(fonte)) atual.respondidas.push(fonte);
  atual.em = Date.now();
  rodadas.set(rodada, atual);
}

export function fontesRespondidas(rodada: string): string[] {
  return rodadas.get(rodada)?.respondidas ?? [];
}

export function encerrarRodada(rodada: string): void {
  rodadas.delete(rodada);
}
