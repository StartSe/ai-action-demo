// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho. Nenhuma rotina própria: `videos-campanha` não declara a
// capacidade "rotina" em catalogo.json (criar conceitos e gastar créditos é sempre uma decisão de quem
// está na tela). As notificações aqui servem só para avisar que um vídeo pedido ficou pronto, ver
// lib/notificacoes-do-app.ts.
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [];
