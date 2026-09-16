// Temas do trimestre, cadastrados uma vez em /setup (components/TemasTrimestre.tsx). A rotina semanal de
// rascunhos consome um tema por vez, em ordem, voltando ao início da lista depois do último. O mesmo cartão
// guarda o nome da empresa usado nos rascunhos; sem ele, a rotina reaproveita a última empresa para a qual
// alguém gerou posts na tela principal (ULTIMA_EMPRESA, gravada por lib/posts.ts).
import { getConfig, setConfig } from "./store";

export type Tema = { tema: string; tom: string };

const CHAVE_TEMAS = "TEMAS_TRIMESTRE";
const CHAVE_PROXIMO_INDICE = "TEMAS_PROXIMO_INDICE";
const CHAVE_EMPRESA = "TEMAS_EMPRESA";
const CHAVE_ULTIMA_EMPRESA = "ULTIMA_EMPRESA";

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

/** Empresa cadastrada em "Temas do trimestre" (pode ser vazia). */
export function getEmpresaTemas(): string {
  return getConfig(CHAVE_EMPRESA) || "";
}

export function salvarEmpresaTemas(empresa: string): void {
  setConfig(CHAVE_EMPRESA, empresa.trim() || null);
}

/** Lembra a última empresa para a qual alguém gerou posts na tela (reaproveitada pela rotina quando o cartão não tem empresa). */
export function registrarUltimaEmpresa(empresa: string): void {
  const nome = empresa.trim();
  if (nome) setConfig(CHAVE_ULTIMA_EMPRESA, nome);
}

/** Empresa que a rotina semanal usa: a do cartão, senão a última usada na tela; vazia quando não há nenhuma. */
export function empresaDaRotina(): string {
  return getEmpresaTemas() || getConfig(CHAVE_ULTIMA_EMPRESA) || "";
}

/** Devolve o próximo tema da lista (em ordem, voltando ao início depois do último) e avança o ponteiro; null sem temas cadastrados. */
export function proximoTema(): Tema | null {
  const temas = getTemas();
  if (temas.length === 0) return null;
  const indice = Number(getConfig(CHAVE_PROXIMO_INDICE) || "0") % temas.length;
  setConfig(CHAVE_PROXIMO_INDICE, String((indice + 1) % temas.length));
  return temas[indice];
}
