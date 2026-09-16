// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, MCP_TAREFAS, NOTIFICACOES, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que escreve a leitura do diagnóstico" });

/** Os próximos passos do diagnóstico viram cartões no quadro onde o time já trabalha ("Enviar próximos passos ao quadro" no resultado). */
const QUADRO: Integracao = { ...MCP_TAREFAS, beneficio: "Manda os próximos passos como cartões para o time" };

/** Por onde chega o resumo diário da coleta de respostas (rotina "Resumo da coleta"). */
const AVISOS: Integracao = { ...NOTIFICACOES, beneficio: "Avisa quantas respostas chegaram, sem abrir o app" };

export const INTEGRACOES: Integracao[] = [OPENROUTER, QUADRO, AVISOS];
