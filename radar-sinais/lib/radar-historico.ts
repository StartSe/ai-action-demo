import { listarPorTipo, obter } from "./historico";
import { abrirBanco, getConfig, setConfig } from "./store";
import type { Meta } from "./ai";
import type { DadosRadar, Radar } from "./types";

// Inicializa também bancos antigos pela mesma migração do histórico compartilhado.
function banco() {
  listarPorTipo("radar", 0);
  return abrirBanco();
}
const EXEMPLO = "tipo = 'radar' AND json_type(meta, '$.demo') = 'true'";

export function contarExemplos(): number {
  return (banco().prepare(`SELECT count(*) AS total FROM resultados WHERE ${EXEMPLO}`).get() as { total: number }).total;
}

export function removerExemplos(): number {
  const removidos = Number(banco().prepare(`DELETE FROM resultados WHERE ${EXEMPLO}`).run().changes);
  setConfig("RADAR_OCULTAR_EXEMPLOS", "1");
  return removidos;
}

export function exemplosVisiveis(iaConectada: boolean): boolean {
  return !iaConectada && getConfig("RADAR_OCULTAR_EXEMPLOS") !== "1";
}

export function ultimoRadarReal() {
  const linha = banco().prepare("SELECT id FROM resultados WHERE tipo = 'radar' AND json_type(meta, '$.demo') = 'false' ORDER BY criadoEm DESC, rowid DESC LIMIT 1").get() as { id: string } | undefined;
  return linha ? obter<DadosRadar, Radar, Meta>(linha.id) : null;
}
