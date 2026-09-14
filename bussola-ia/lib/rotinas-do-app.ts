// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho. Nenhuma rotina própria ainda: bussola-ia não declara a
// capacidade "rotina" em catalogo.json nesta história.
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [];
