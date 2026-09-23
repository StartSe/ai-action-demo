// Tipos de rotina deste app: nenhum. As rotinas (e as notificações que elas usam) saíram do produto em
// 21/09/2026 — a infraestrutura compartilhada (lib/rotinas.ts, app/api/rotinas) continua presente por ser INFRA
// da suíte, mas não há nada agendável aqui e o cartão "Rotinas" não aparece em Configurações.
import type { TipoRotina } from "./rotinas";

export const TIPOS_ROTINA: TipoRotina[] = [];
