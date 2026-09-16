// Último perfil buscado neste app, guardado em lib/store.ts para pré-preencher a rotina semanal criada
// pelo cartão genérico de /setup (que não tem como pedir segmento, cargo e proposta) e para o executor
// saber o que buscar. Módulo próprio: `getConfig`/`setConfig` já guardam texto, aqui só entra/sai JSON.
import { getConfig, setConfig } from "./store";
import type { DadosBusca } from "./types";

const CHAVE = "ULTIMA_BUSCA";

export function guardarUltimaBusca(dados: DadosBusca): void {
  setConfig(CHAVE, JSON.stringify(dados));
}

export function ultimaBusca(): Partial<DadosBusca> | null {
  const bruto = getConfig(CHAVE);
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto);
    return dados && typeof dados === "object" ? (dados as Partial<DadosBusca>) : null;
  } catch {
    return null;
  }
}
