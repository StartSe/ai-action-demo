// Tipos de rotina deste app: nenhum. A capacidade "rotina" não está declarada em catalogo.json para
// analise-de-perda (a análise é sempre uma decisão de quem está na tela, sobre o CSV que acabou de subir).
// A infraestrutura compartilhada (lib/rotinas.ts, app/api/rotinas) continua presente por ser INFRA da
// suíte, mas o cartão "Rotinas" não aparece em Configurações.
import type { TipoRotina } from "./rotinas";

export const TIPOS_ROTINA: TipoRotina[] = [];
