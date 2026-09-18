// Tipos de rotina deste app: nenhum por enquanto — o briefing nasce de uma conversa, não de um
// disparo agendado. Arquivo mantido (nunca comparado por scripts/verificar-padrao.sh) porque
// lib/rotinas.ts e app/api/rotinas/** (INFRA compartilhada) dependem dele existir.
import type { TipoRotina } from "./rotinas";

export const TIPOS_ROTINA: TipoRotina[] = [];
