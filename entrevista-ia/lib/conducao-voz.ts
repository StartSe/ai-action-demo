/** O adaptador grava cada turno no banco: geração especulativa consumiria perguntas
 * que o candidato ainda não ouviu. Só gerar quando a fala estiver confirmada. */
export const CONDUCAO_VOZ = {
  turnDetection: "vad" as const,
  preemptiveGeneration: { enabled: false },
  endpointing: { minDelay: 1800, maxDelay: 6000 },
  interruption: { minDuration: 900, minWords: 3, resumeFalseInterruption: true },
};
