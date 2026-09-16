// "Enviar próximos passos ao quadro": cada próximo passo do diagnóstico vira um cartão no quadro de tarefas
// conectado (integração MCP_TAREFAS, ex.: o Agente de quadro desta suíte), uma chamada por passo, marcando em
// Analise.passosNoQuadro os índices já enviados para não duplicar. Arquivo próprio deste app.
import { atualizarSaida, obter } from "./historico";
import { chamar, conectar } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { integracaoConfigurada, MCP_TAREFAS } from "./setup-comum";
import type { Avaliacao } from "./types";

/** Configuração faltando é problema do pedido (400), não do quadro (502): a rota decide o status por instanceof. */
export class QuadroNaoConectado extends Error {
  constructor() {
    super("Conecte um quadro de tarefas em Configurações para enviar os próximos passos como cartões.");
    this.name = "QuadroNaoConectado";
  }
}

export class DiagnosticoNaoEncontrado extends Error {
  constructor() {
    super("Diagnóstico não encontrado.");
    this.name = "DiagnosticoNaoEncontrado";
  }
}

export type EnvioPasso = { indice: number; passo: string; ok: boolean; mensagem: string };

function extrairMensagem(resultado: unknown, passo: string): string {
  if (resultado && typeof resultado === "object") {
    const r = resultado as Record<string, unknown>;
    if (typeof r.resposta === "string" && r.resposta.trim()) return r.resposta.trim();
  }
  return `Criado: ${passo}`;
}

/** Envia os próximos passos ainda não enviados do diagnóstico `id` ao quadro; devolve a avaliação atualizada e o resultado por passo. */
export async function enviarPassosAoQuadro(id: string): Promise<{ avaliacao: Avaliacao; resultados: EnvioPasso[] }> {
  const registro = obter<unknown, Avaliacao, unknown>(id);
  if (!registro || registro.tipo !== "avaliacao" || !registro.saida.analise) throw new DiagnosticoNaoEncontrado();
  if (!integracaoConfigurada(MCP_TAREFAS)) throw new QuadroNaoConectado();
  const conexao = await conexaoAutorizada("MCP_TAREFAS");
  if (!conexao) throw new QuadroNaoConectado();

  const analise = registro.saida.analise;
  const jaEnviados = new Set(analise.passosNoQuadro ?? []);
  const resultados: EnvioPasso[] = [];
  const cliente = conectar(conexao.url, conexao.token);
  for (let indice = 0; indice < analise.proximosPassos.length; indice++) {
    if (jaEnviados.has(indice)) continue;
    const passo = analise.proximosPassos[indice];
    const comando = `Crie o cartão "${passo}" na lista de tarefas, com a etiqueta "Maturidade em IA: ${registro.saida.titulo}"`;
    try {
      const resultado = await chamar(cliente, "operar_quadro", { comando, confirmar: true });
      resultados.push({ indice, passo, ok: true, mensagem: extrairMensagem(resultado, passo) });
      jaEnviados.add(indice);
    } catch (err) {
      // lib/mcp-cliente.ts já lança mensagens curadas (sem status HTTP nem corpo do servidor remoto).
      resultados.push({ indice, passo, ok: false, mensagem: err instanceof Error ? err.message : "Não foi possível enviar este passo para o quadro agora." });
    }
  }

  const avaliacao: Avaliacao = { ...registro.saida, analise: { ...analise, passosNoQuadro: [...jaEnviados].sort((a, b) => a - b) } };
  atualizarSaida(id, avaliacao);
  return { avaliacao, resultados };
}
