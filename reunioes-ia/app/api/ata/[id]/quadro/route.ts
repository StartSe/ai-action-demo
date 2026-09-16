import { atualizarSaida, obter } from "@/lib/historico";
import { chamar, conectar } from "@/lib/mcp-cliente";
import { integracaoConfigurada, lerConfig, MCP_TAREFAS } from "@/lib/setup-comum";
import type { Acao, Ata } from "@/lib/types";

interface ResultadoEnvio {
  indice: number;
  acao: string;
  ok: boolean;
  mensagem: string;
  link?: string;
}

function extrairMensagem(resultado: unknown, acao: Acao): string {
  if (resultado && typeof resultado === "object") {
    const r = resultado as Record<string, unknown>;
    if (typeof r.resposta === "string" && r.resposta.trim()) return r.resposta.trim();
  }
  return `Criado: ${acao.acao}`;
}

function extrairLink(resultado: unknown): string | undefined {
  if (resultado && typeof resultado === "object") {
    const r = resultado as Record<string, unknown>;
    if (typeof r.link === "string") return r.link;
    if (typeof r.url === "string") return r.url;
  }
  return undefined;
}

/** Envia cada ação da ata (ainda não enviada) como um comando ao quadro de tarefas conectado via MCP, uma chamada por ação. */
export async function POST(_req: Request, { params }: RouteContext<"/api/ata/[id]/quadro">) {
  const { id } = await params;
  const registro = obter<unknown, Ata, unknown>(id);
  if (!registro || registro.tipo !== "ata") {
    return Response.json({ error: "Ata não encontrada." }, { status: 404 });
  }
  if (!integracaoConfigurada(MCP_TAREFAS)) {
    return Response.json({ error: "Conecte um quadro de tarefas em /setup antes de enviar as ações.", integracao: MCP_TAREFAS.id }, { status: 400 });
  }

  const config = lerConfig(MCP_TAREFAS);
  const conexao = conectar(config.MCP_TAREFAS_URL!, config.MCP_TAREFAS_CODIGO);
  const acoes = registro.saida.acoes || [];
  const resultados: ResultadoEnvio[] = [];
  const acoesAtualizadas: Acao[] = [...acoes];

  for (let indice = 0; indice < acoes.length; indice++) {
    const acao = acoes[indice];
    if (acao.noQuadro) continue;
    const comando = `Crie o cartão "${acao.acao}" para ${acao.responsavel || "a definir"} até ${acao.prazo}`;
    try {
      const resultado = await chamar(conexao, "operar_quadro", { comando, confirmar: true });
      resultados.push({ indice, acao: acao.acao, ok: true, mensagem: extrairMensagem(resultado, acao), link: extrairLink(resultado) });
      acoesAtualizadas[indice] = { ...acao, noQuadro: true };
    } catch (err) {
      // lib/mcp-cliente.ts já lança mensagens curadas (sem status HTTP nem corpo do servidor remoto).
      resultados.push({ indice, acao: acao.acao, ok: false, mensagem: err instanceof Error ? err.message : "Não foi possível enviar esta ação para o quadro agora." });
    }
  }

  const saida: Ata = { ...registro.saida, acoes: acoesAtualizadas };
  atualizarSaida(id, saida);
  return Response.json({ ata: saida, resultados });
}
