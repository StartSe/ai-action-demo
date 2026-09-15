// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho. Nenhuma rotina própria: clone-site não declara a capacidade
// "rotina" em catalogo.json (gerar uma página é sempre uma ação de quem envia a captura).
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [];
