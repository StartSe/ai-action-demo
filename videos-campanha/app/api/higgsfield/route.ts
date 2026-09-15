// Situação da conta no Higgsfield para o painel: conectado ou não, saldo em créditos e quantos efeitos há.
import { abrirSessao, ErroHiggsfield, higgsfieldConfigurado, listarEfeitos, saldo } from "@/lib/higgsfield";
import { videoEmAndamento } from "@/lib/videos";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!higgsfieldConfigurado()) return Response.json({ conectado: false, saldo: null, efeitos: 0, emAndamento: null });
  try {
    const sessao = await abrirSessao();
    const [s, efeitos] = await Promise.all([saldo(sessao).catch(() => null), listarEfeitos(sessao).catch(() => [])]);
    return Response.json({ conectado: true, saldo: s, efeitos: efeitos.length, emAndamento: videoEmAndamento() });
  } catch (err) {
    const mensagem = err instanceof ErroHiggsfield ? err.message : "Não foi possível falar com o Higgsfield.";
    return Response.json({ conectado: true, saldo: null, efeitos: 0, emAndamento: videoEmAndamento(), erro: mensagem });
  }
}
