// Contratos guardados em memória por 1 hora, para responder perguntas depois da análise.
// Some ao reiniciar o servidor; nada é gravado em disco.

interface Contrato {
  /** Uma entrada por página do PDF (texto colado vira uma só): a caixa de perguntas reaproveita o mesmo corte de lib/contratos.ts. */
  paginas: string[];
  papel: string;
  preocupacao: string;
  expira: number;
}

const UMA_HORA = 60 * 60 * 1000;
const contratos = new Map<string, Contrato>();

function limpar() {
  const agora = Date.now();
  for (const [id, c] of contratos) if (c.expira < agora) contratos.delete(id);
}

export function guardarContrato(dados: { paginas: string[]; papel: string; preocupacao: string }): string {
  limpar();
  const id = crypto.randomUUID();
  contratos.set(id, { ...dados, expira: Date.now() + UMA_HORA });
  return id;
}

export function obterContrato(id: string): Contrato | null {
  const c = contratos.get(id);
  if (!c) return null;
  if (c.expira < Date.now()) {
    contratos.delete(id);
    return null;
  }
  return c;
}
