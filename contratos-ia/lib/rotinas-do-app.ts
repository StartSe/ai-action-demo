// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
import "./avisos-prazo";

// "aviso-prazo-contrato" fica de fora de propósito: é uma rotina "unica" criada pelo botão "Avisar 30
// dias antes" de um contrato salvo (parâmetros específicos daquele contrato), não pelo formulário
// genérico "Nova rotina" de /setup — mesmo padrão de "checkin-pdi" em pdi-time (ver CLAUDE.md, US-070).
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [];
