import type { Prospeccao, Jornada } from "./types";
import { etapasDaProspeccao } from "./execucao-etapas";

export type TemposEtapas = Record<string, { inicio: string; fim?: string }>;

export function duracaoSegundos(inicio: string | undefined, fim: string | number): number | null {
  if (!inicio) return null;
  const segundos = ((typeof fim === "number" ? fim : Date.parse(fim)) - Date.parse(inicio)) / 1000;
  return Number.isFinite(segundos) ? Math.max(0, Math.floor(segundos)) : null;
}

export function tempoLegivel(segundos: number | null): string {
  if (segundos === null) return "Tempo não registrado";
  if (segundos < 1) return "Menos de 1 s";
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  return `${minutos} min${segundos % 60 ? ` ${segundos % 60} s` : ""}`;
}

export function estimativaLegivel([minimo, maximo]: readonly [number, number]): string {
  if (maximo < 60) return `${minimo}–${maximo} s`;
  if (minimo < 60) return `${minimo} s–${maximo / 60} min`;
  return `${minimo / 60}–${maximo / 60} min`;
}

export function progressoEtapas(prospeccao: Prospeccao, jornada: Jornada, agora: number) {
  const etapas = etapasDaProspeccao(prospeccao.modo, jornada);
  const indice = etapas.findIndex(e => e.chave === prospeccao.etapa);
  const executando = prospeccao.estado === "executando";
  return etapas.map((etapa, i) => {
    const registro = prospeccao.temposEtapas?.[etapa.chave];
    const atual = i === indice;
    // Uma execução encerrada antes do fim não torna as etapas futuras concluídas.
    const concluida = i < indice || (atual && prospeccao.estado === "pronta" && (!prospeccao.erro || i === etapas.length - 1));
    const estado = indice < 0 && !executando ? "sem_registro" : concluida ? "concluida" : atual ? (executando ? "ativa" : "interrompida") : executando ? "aguardando" : "nao_executada";
    const segundos = duracaoSegundos(registro?.inicio, registro?.fim ?? (executando ? agora : prospeccao.concluidoEm ?? ""));
    return { ...etapa, estado, segundos, demorando: estado === "ativa" && segundos !== null && segundos > etapa.estimativa[1] };
  });
}
