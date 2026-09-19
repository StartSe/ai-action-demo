import type { PassoPesquisa } from "./progresso-pesquisa";

// Referências iniciais de interface, não medições nem prazos garantidos.
export function referenciaEtapa(titulo: string) {
  if (titulo.startsWith("Preparando os dados")) return { fase: 3, segundos: 5, estimativa: "até 5 s" };
  if (titulo.startsWith("Organizando")) return { fase: 2, segundos: 60, estimativa: "15–60 s" };
  if (titulo.startsWith("Preparando a pesquisa")) return { fase: 0, segundos: 15, estimativa: "5–15 s" };
  if (titulo.startsWith("Planejando")) return { fase: 0, segundos: 30, estimativa: "10–30 s" };
  return { fase: 1, segundos: 60, estimativa: "5–60 s por consulta" };
}
export function segundosEtapa(passo: PassoPesquisa, agora: number): number | null {
  if (!passo.iniciadoEm) return null;
  const inicio = Date.parse(passo.iniciadoEm);
  // Registros antigos podem não ter datas; não inventar duração.
  const fim = passo.concluidoEm ? Date.parse(passo.concluidoEm) : passo.estado === "em_andamento" ? agora : NaN;
  return Number.isFinite(inicio) && Number.isFinite(fim) ? Math.max(0, Math.floor((fim - inicio) / 1000)) : null;
}
export function formatarTempo(segundos: number) {
  return segundos < 60 ? `${segundos} s` : `${Math.floor(segundos / 60)} min ${segundos % 60} s`;
}
