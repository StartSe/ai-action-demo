// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { MCP_TAREFAS, NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que lê o contrato e aponta os riscos" });

/** Os avisos de 30 dias antes de cada prazo do contrato saem por aqui (botão "Avisar 30 dias antes"). */
const AVISOS: Integracao = { ...NOTIFICACOES, beneficio: "Avisa você 30 dias antes de cada prazo do contrato" };

/** Os pontos a negociar viram cartões no quadro onde o time já trabalha (menu "Mais" do resultado). */
const QUADRO: Integracao = { ...MCP_TAREFAS, beneficio: "Enviar pontos a negociar como tarefas" };

export const INTEGRACOES: Integracao[] = [OPENROUTER, AVISOS, QUADRO];
