// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho. Este app não tem nenhuma rotina agendada: a validação acontece
// sob demanda, então o cartão "Rotinas" de /setup fica sem tipos para oferecer.
import type { TipoRotina } from "./rotinas";

export const TIPOS_ROTINA: TipoRotina[] = [];
