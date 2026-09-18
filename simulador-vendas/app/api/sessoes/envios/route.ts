// Os feedbacks que não chegaram ao e-mail do vendedor (US-020).
//
// O envio acontece sozinho, logo depois da avaliação, e por isso a falha dele é invisível: o vendedor
// leu o feedback na tela e seguiu em frente, e quem pode consertar a conta de e-mail não estava lá.
// Esta lista é o que põe a falha na frente do gestor, em Resultados, com o motivo em uma frase.
import { obter as obterParticipante } from "@/lib/participantes";
import { falhasDeEnvioEmail } from "@/lib/sessoes";
import { obter as obterSimulacao } from "@/lib/simulacoes";

export async function GET() {
  const itens = falhasDeEnvioEmail().map((s) => {
    const participante = obterParticipante(s.participanteId);
    return {
      id: s.id,
      simulacao: obterSimulacao(s.simulacaoCodigo)?.nome ?? "Treino removido",
      vendedor: participante?.nome ?? "Vendedor",
      email: participante?.email ?? "",
      quando: s.encerradaEm ?? s.criadoEm,
      motivo: s.envioEmailMotivo ?? "",
    };
  });
  return Response.json({ itens });
}
