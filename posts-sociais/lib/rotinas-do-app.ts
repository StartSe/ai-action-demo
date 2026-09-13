// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
// Registra o executor "rascunhos-semanais" (rascunhos de posts a partir dos temas do trimestre).
import "./rascunhos";

export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "rascunhos-semanais", rotulo: "Rascunhos semanais de posts" }];
