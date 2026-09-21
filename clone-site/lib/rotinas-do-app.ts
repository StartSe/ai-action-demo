// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho. Único tipo: o resumo semanal de um site (lib/resumo-site.ts), criado
// pelo painel Métricas do workspace (que já sabe qual site é). Ele também aparece no seletor genérico do cartão
// "Rotinas" de /setup, mas o `validar` exige o site — a mensagem manda criar pelo painel.
import { TIPO } from "./resumo-site";
import type { TipoRotina } from "./rotinas";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: TipoRotina[] = [TIPO as TipoRotina];
