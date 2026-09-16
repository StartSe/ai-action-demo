// "Gerar PDI agora" para uma autoavaliação recebida cuja geração falhou na hora (lib/autoavaliacoes.ts guarda o
// motivo). Reusa as mesmas respostas e os mesmos objetivos do link original; sucesso grava o resultado no estado
// próprio e o painel passa a mostrar "Abrir PDI". Rota privada, própria deste app.
import { respostaErro } from "@/lib/ai";
import { erroDeGeracao, obterEstado, registrarFalha, registrarResultado } from "@/lib/autoavaliacoes";
import { listarRespostasPorTipo, obter as obterFormulario } from "@/lib/formularios";
import { dadosDaAutoavaliacao, gerarPDI, type ParametrosAutoavaliacao } from "@/lib/pdi";

export async function POST(_req: Request, { params }: RouteContext<"/api/pdi/autoavaliacao/[id]/gerar">) {
  const { id } = await params;
  const resposta = listarRespostasPorTipo("autoavaliacao", 500).find((r) => r.id === id);
  if (!resposta) return Response.json({ error: "Autoavaliação não encontrada." }, { status: 404 });
  const formulario = obterFormulario<ParametrosAutoavaliacao>(resposta.token);
  if (!formulario) return Response.json({ error: "O link desta autoavaliação já foi apagado." }, { status: 404 });

  const existente = resposta.resultadoId ?? obterEstado(resposta.token)?.resultadoId;
  if (existente) return Response.json({ resultadoId: existente });

  try {
    const resultado = await gerarPDI(dadosDaAutoavaliacao(resposta.dados, formulario.parametros.objetivosEmpresa), { guardar: true });
    if (!resultado.id) throw new Error("O PDI foi gerado, mas não pôde ser salvo. Tente de novo.");
    registrarResultado(resposta.token, resultado.id);
    return Response.json({ resultadoId: resultado.id });
  } catch (err) {
    registrarFalha(resposta.token, erroDeGeracao(err));
    return respostaErro(err);
  }
}
