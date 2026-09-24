// Este app não tem tarefa agendada na v1: o painel é gerado sob demanda e os números são de exemplo,
// então não há o que resumir nem sobre o que alertar. A infraestrutura (lib/rotinas.ts,
// app/api/rotinas, instrumentation.ts) continua copiada e ociosa, pronta para quando existir dado
// real; o cartão "Rotinas" NÃO é renderizado em /setup (components/Rotinas.tsx foi removido, como
// no videos-campanha, que também não tem a capacidade "rotina").
import type { TipoRotina } from "./rotinas";

export const TIPOS_ROTINA: TipoRotina[] = [];
