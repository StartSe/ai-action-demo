// Sondada a cada poucos segundos pela sala do agente conversacional (US-016) enquanto ela espera a
// avaliação da conversa, que chega de fora — pelo aviso de pós-conversa, não pela tela.
//
// A pergunta é sempre "a **minha** conversa já foi avaliada?": no modelo de hoje a resposta é o
// `resultadoId` da sessão de quem está sondando (trinta vendedores no mesmo link, trinta respostas
// diferentes). Nas salas criadas antes da US-002 não há sessão, e a resposta continua sendo o último
// resultado da sala — comparado com `desde` (o que a tela já conhecia) para não devolver uma análise
// antiga da mesma sala como se fosse a atual.
import { obter as obterParticipante } from "@/lib/participantes";
import { obter as obterSala } from "@/lib/salas";
import { lerSessaoVendedor } from "@/lib/sessao-vendedor";
import { obter as obterSessao, ultimaDe } from "@/lib/sessoes";
import { obter as obterSimulacao } from "@/lib/simulacoes";

export async function GET(req: Request, { params }: RouteContext<"/api/salas/[token]/ultima">) {
  const { token } = await params;

  if (obterSimulacao(token)) {
    const sessaoVendedor = lerSessaoVendedor(req.headers.get("cookie"));
    const participante = sessaoVendedor ? obterParticipante(sessaoVendedor.participanteId) : null;
    if (participante) {
      const doCookie = sessaoVendedor?.sessaoId ? obterSessao(sessaoVendedor.sessaoId) : null;
      const daPessoa = doCookie && doCookie.participanteId === participante.id && doCookie.simulacaoCodigo === token ? doCookie : null;
      const sessao = daPessoa ?? ultimaDe(token, participante.id);
      const id = sessao?.resultadoId ?? null;
      return Response.json({ pronto: Boolean(id), id });
    }
  }

  const sala = obterSala(token);
  if (!sala) {
    return Response.json({ error: "Esta sala não está mais disponível." }, { status: 404 });
  }
  const desde = new URL(req.url).searchParams.get("desde") || null;
  const pronto = Boolean(sala.ultimoResultadoId) && sala.ultimoResultadoId !== desde;
  return Response.json({ pronto, id: pronto ? sala.ultimoResultadoId : null });
}
