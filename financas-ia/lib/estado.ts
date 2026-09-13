// Leituras de planilha guardadas em memória por 1 hora, para responder perguntas via MCP depois de ler_planilha.
// Some ao reiniciar o servidor; nada é gravado em disco.
import type { LancamentoResumo, Resumo } from "./types";

interface Leitura {
  resumo: Resumo;
  amostra: LancamentoResumo[];
  expira: number;
}

const UMA_HORA = 60 * 60 * 1000;
const leituras = new Map<string, Leitura>();

function limpar() {
  const agora = Date.now();
  for (const [id, l] of leituras) if (l.expira < agora) leituras.delete(id);
}

export function guardarLeitura(dados: { resumo: Resumo; amostra: LancamentoResumo[] }): string {
  limpar();
  const id = crypto.randomUUID();
  leituras.set(id, { ...dados, expira: Date.now() + UMA_HORA });
  return id;
}

export function obterLeitura(id: string): Leitura | null {
  const l = leituras.get(id);
  if (!l) return null;
  if (l.expira < Date.now()) {
    leituras.delete(id);
    return null;
  }
  return l;
}
