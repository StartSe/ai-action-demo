// Temas do trimestre, cadastrados uma vez em /setup (components/TemasTrimestre.tsx). A rotina semanal de
// rascunhos consome um tema por vez, em ordem, voltando ao início da lista depois do último.
import { getConfig, setConfig } from "./store";

export type Tema = { tema: string; tom: string };

const CHAVE_TEMAS = "TEMAS_TRIMESTRE";
const CHAVE_PROXIMO_INDICE = "TEMAS_PROXIMO_INDICE";

export function getTemas(): Tema[] {
  const bruto = getConfig(CHAVE_TEMAS);
  if (!bruto) return [];
  try {
    const salvo = JSON.parse(bruto) as Tema[];
    return Array.isArray(salvo) ? salvo : [];
  } catch (err) {
    console.error("Falha ao ler os temas do trimestre", err);
    return [];
  }
}

export function salvarTemas(temas: Tema[]): void {
  setConfig(CHAVE_TEMAS, JSON.stringify(temas));
  setConfig(CHAVE_PROXIMO_INDICE, "0");
}

/** Devolve o próximo tema da lista (em ordem, voltando ao início depois do último) e avança o ponteiro; null sem temas cadastrados. */
export function proximoTema(): Tema | null {
  const temas = getTemas();
  if (temas.length === 0) return null;
  const indice = Number(getConfig(CHAVE_PROXIMO_INDICE) || "0") % temas.length;
  setConfig(CHAVE_PROXIMO_INDICE, String((indice + 1) % temas.length));
  return temas[indice];
}
