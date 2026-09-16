// Cria, lista e cancela os avisos de "30 dias antes" de um contrato salvo (botão "Avisar 30 dias
// antes" no Resultado). Não é copiado entre apps: a lógica mora em lib/avisos-prazo.ts.
import { cancelarAvisosPrazo, criarAvisosPrazo, listarAvisosPrazo } from "@/lib/avisos-prazo";
import { obter } from "@/lib/historico";
import { canalDeAviso } from "@/lib/notificacoes-do-app";
import type { Analise, EntradaAnalise } from "@/lib/types";

const ACAO_NOTIFICACOES = { rotulo: "Configurar notificações", url: "/setup#notificacoes" };

function semResultado() {
  return Response.json(
    { error: 'Este contrato não foi guardado. Marque "Guardar este resultado por 30 dias" antes de analisar para poder agendar avisos.' },
    { status: 400 }
  );
}

export async function GET(req: Request) {
  const resultadoId = new URL(req.url).searchParams.get("resultadoId") || "";
  const { motivo } = canalDeAviso();
  return Response.json({ itens: resultadoId ? listarAvisosPrazo(resultadoId) : [], motivoCanal: motivo ?? null });
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const resultadoId = typeof corpo?.resultadoId === "string" ? corpo.resultadoId : "";
  if (!resultadoId) return semResultado();

  const registro = obter<EntradaAnalise, Analise, unknown>(resultadoId);
  if (!registro || registro.tipo !== "contrato") {
    return Response.json(
      { error: "Este resultado não está mais disponível: contratos guardados são apagados 30 dias depois. Analise o contrato de novo para agendar os avisos." },
      { status: 404 }
    );
  }

  if (!registro.saida.prazos || registro.saida.prazos.length === 0) {
    return Response.json({ error: "Este contrato não tem prazos identificados." }, { status: 400 });
  }

  if (listarAvisosPrazo(resultadoId).length > 0) {
    return Response.json({ error: "Os avisos deste contrato já foram agendados." }, { status: 409 });
  }

  // Um aviso agendado por um canal sem credencial (Slack sem webhook, e-mail sem Resend/SMTP/caixa
  // conectada) falharia em silêncio no dia do prazo: recusar agora, com o caminho para resolver.
  const { canal, destino, motivo } = canalDeAviso();
  if (motivo) return Response.json({ error: motivo, motivo: "notificacoes", acao: ACAO_NOTIFICACOES }, { status: 400 });

  const itens = criarAvisosPrazo({ resultadoId, tipoContrato: registro.saida.tipo_contrato || "Contrato", prazos: registro.saida.prazos, canal, destino });
  return Response.json({ itens });
}

/** "Cancelar avisos": apaga as rotinas criadas para este contrato (inclusive as que falharam). */
export async function DELETE(req: Request) {
  const resultadoId = new URL(req.url).searchParams.get("resultadoId") || "";
  if (!resultadoId) return semResultado();
  cancelarAvisosPrazo(resultadoId);
  return Response.json({ itens: [] });
}
