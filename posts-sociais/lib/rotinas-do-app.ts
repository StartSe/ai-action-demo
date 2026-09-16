// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
// Importar lib/rascunhos.ts registra o executor "rascunhos-semanais" (rascunhos de posts a partir dos temas
// do trimestre); TIPO_RASCUNHOS traz o `validar` que confere temas e empresa antes de criar a rotina.
import { TIPO_RASCUNHOS } from "./rascunhos";
import type { TipoRotina } from "./rotinas";

export const TIPOS_ROTINA: TipoRotina[] = [TIPO_RASCUNHOS];
