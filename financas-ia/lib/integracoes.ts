// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
// O texto de negócio (`beneficio`) é sempre do app, por spread sobre a integração compartilhada —
// nunca editando lib/setup-comum.ts, que é igual nos dezessete.
import { MCP_DADOS, NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Escreve a leitura da planilha e responde às suas perguntas" });

const AVISOS: Integracao = { ...NOTIFICACOES, beneficio: "Entrega o resumo da planilha todo mês, sem você abrir o app" };

const FONTE_DADOS: Integracao = {
  ...MCP_DADOS,
  beneficio: "Lê a planilha compartilhada ou o ERP, sem exportar CSV",
  notaConexao: "Serve para qualquer planilha viva ou ERP que exponha um servidor MCP. Sem isso, o app continua lendo o CSV que você envia na tela.",
};

export const INTEGRACOES: Integracao[] = [OPENROUTER, AVISOS, FONTE_DADOS];
