// Tipos do domínio: um Quadro de Modelo de Negócios (Business Model Canvas) com nove blocos, montado
// pela IA a partir de uma descrição em texto livre, mais as inconsistências encontradas entre blocos.
export type BlocoCanvas =
  | "segmentoClientes"
  | "propostaValor"
  | "canais"
  | "relacionamentoClientes"
  | "fontesReceita"
  | "recursosChave"
  | "atividadesChave"
  | "parceriasChave"
  | "estruturaCustos";

/** Um bloco vale `null` quando a descrição não trouxe informação suficiente para preenchê-lo — nunca
 * é completado por suposição do modelo (reforçado no prompt de lib/validador.ts e conferido de novo na
 * normalização da resposta). */
export type CanvasNegocio = Record<BlocoCanvas, string | null>;

export interface Inconsistencia {
  blocoA: BlocoCanvas;
  blocoB: BlocoCanvas;
  descricao: string;
}

export interface ResultadoValidacao {
  canvas: CanvasNegocio;
  inconsistencias: Inconsistencia[];
}

export interface DadosValidador {
  descricao: string;
}
