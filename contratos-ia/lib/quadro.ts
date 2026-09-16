// "Enviar pontos a negociar como tarefas": cada cláusula de risco vira um cartão no quadro de tarefas
// conectado (integração MCP_TAREFAS, ex.: o Agente de quadro desta suíte), uma chamada por ponto,
// marcando em Analise.pontosNoQuadro os índices já enviados para não duplicar. Arquivo próprio deste app.
import { atualizarSaida, obter } from "./historico";
import { chamar, conectar } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { integracaoConfigurada, MCP_TAREFAS } from "./setup-comum";
import type { Analise, EntradaAnalise } from "./types";

/** Configuração faltando é problema do pedido (400), não do quadro (502): a rota decide o status por instanceof. */
export class QuadroNaoConectado extends Error {
  constructor() {
    super("Conecte um quadro de tarefas em Configurações para enviar os pontos a negociar como cartões.");
    this.name = "QuadroNaoConectado";
  }
}

export class ContratoNaoEncontrado extends Error {
  constructor() {
    super('Este contrato não foi guardado. Marque "Guardar este resultado por 30 dias" antes de analisar para enviar os pontos ao quadro.');
    this.name = "ContratoNaoEncontrado";
  }
}

export type EnvioPonto = { indice: number; clausula: string; ok: boolean; mensagem: string };

function extrairMensagem(resultado: unknown, clausula: string): string {
  if (resultado && typeof resultado === "object") {
    const r = resultado as Record<string, unknown>;
    if (typeof r.resposta === "string" && r.resposta.trim()) return r.resposta.trim();
  }
  return `Criado: ${clausula}`;
}

/** Envia os pontos a negociar ainda não enviados do contrato `id` ao quadro; devolve a análise atualizada e o resultado por ponto. */
export async function enviarPontosAoQuadro(id: string): Promise<{ analise: Analise; resultados: EnvioPonto[] }> {
  const registro = obter<EntradaAnalise, Analise, unknown>(id);
  if (!registro || registro.tipo !== "contrato") throw new ContratoNaoEncontrado();
  if (!integracaoConfigurada(MCP_TAREFAS)) throw new QuadroNaoConectado();
  const conexao = await conexaoAutorizada("MCP_TAREFAS");
  if (!conexao) throw new QuadroNaoConectado();

  const analiseAtual = registro.saida;
  const clausulas = analiseAtual.clausulas_risco || [];
  const jaEnviados = new Set(analiseAtual.pontosNoQuadro ?? []);
  const resultados: EnvioPonto[] = [];
  const cliente = conectar(conexao.url, conexao.token);
  const etiqueta = analiseAtual.tipo_contrato || "Contrato";
  for (let indice = 0; indice < clausulas.length; indice++) {
    if (jaEnviados.has(indice)) continue;
    const c = clausulas[indice];
    const comando = `Crie o cartão "Negociar: ${c.clausula}" na lista de tarefas, com a descrição "${c.sugestao_negociacao}" e a etiqueta "Contrato: ${etiqueta}"`;
    try {
      const resultado = await chamar(cliente, "operar_quadro", { comando, confirmar: true });
      resultados.push({ indice, clausula: c.clausula, ok: true, mensagem: extrairMensagem(resultado, c.clausula) });
      jaEnviados.add(indice);
    } catch (err) {
      // lib/mcp-cliente.ts já lança mensagens curadas (sem status HTTP nem corpo do servidor remoto).
      resultados.push({ indice, clausula: c.clausula, ok: false, mensagem: err instanceof Error ? err.message : "Não foi possível enviar este ponto para o quadro agora." });
    }
  }

  const analise: Analise = { ...analiseAtual, pontosNoQuadro: [...jaEnviados].sort((a, b) => a - b) };
  atualizarSaida(id, analise);
  return { analise, resultados };
}
