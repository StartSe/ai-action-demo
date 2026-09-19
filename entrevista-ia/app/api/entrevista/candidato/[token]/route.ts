import { bloquearTentativaAntiga } from "@/lib/tentativa";
// O fim da conversa do candidato (US-021): a sala avisa que a entrevistadora se despediu (ou que o
// candidato encerrou) e esta rota fecha a entrevista.
//
// **Ela responde na hora e não espera o parecer.** Quem está do outro lado já disse tudo o que tinha
// a dizer; o parecer é do gestor, e segurar a tela de agradecimento por meio minuto seria cobrar do
// candidato o tempo de uma análise que ele nunca vai ler. Quem marca, mede e dispara é
// `concluirEntrevista()` (lib/conclusao.ts), a porta única — o aviso de pós-conversa da ElevenLabs
// (nível 1) termina a entrevista pela mesma função.
//
// **O cookie de retomada sai aqui.** Ele existe para recarregar a página no meio da conversa e
// continuar de onde parou; depois do fim ele só faria este navegador continuar dono de uma entrevista
// que acabou.
//
// Os links antigos (tipo `scorecard`, ver lib/convite.ts) não têm entrevista no banco: a conversa
// deles viaja no corpo e o scorecard continua sendo gerado aqui mesmo, como sempre foi.
import { NextResponse } from "next/server";
import { concluirEntrevista } from "@/lib/conclusao";
import { FECHADO, resolverConvite } from "@/lib/convite";
import { gerarScorecard, normalizarHistorico } from "@/lib/entrevista";
import { responder } from "@/lib/formularios";
import { cookieSairCandidato } from "@/lib/sessao-candidato";

const SEM_CACHE = { "Cache-Control": "no-store" };
const FIM = { ...SEM_CACHE, "Set-Cookie": cookieSairCandidato() };

export async function POST(request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]">) {
  const { token } = await params;
  const bloqueio = bloquearTentativaAntiga(request, token);
  if (bloqueio) return bloqueio;
  const resolucao = resolverConvite(token);
  if (!resolucao.ok) {
    // Concluir duas vezes é comum (um toque duplo, um reenvio depois de a resposta se perder) e não é
    // erro: a entrevista está exatamente onde deveria estar, e a sala pode agradecer.
    if (resolucao.motivo === "concluida") return NextResponse.json({ ok: true }, { headers: FIM });
    const { titulo, status } = FECHADO[resolucao.motivo];
    return NextResponse.json({ error: `${titulo}.` }, { status, headers: SEM_CACHE });
  }

  const { entrevistaId, vaga } = resolucao.sala;
  if (entrevistaId) {
    const fim = concluirEntrevista(entrevistaId);
    if (!fim) {
      return NextResponse.json({ error: "Esta entrevista não vale mais." }, { status: 410, headers: SEM_CACHE });
    }
    // Consome o link de uso único: daqui em diante o mesmo endereço abre a tela de agradecimento.
    responder(token, {});
    return NextResponse.json({ ok: true, preparandoParecer: fim.preparando }, { headers: FIM });
  }

  const historico = normalizarHistorico(((await request.json().catch(() => null)) as { historico?: unknown } | null)?.historico);
  if (!historico.length) {
    return NextResponse.json({ error: "É preciso ao menos uma resposta para concluir a entrevista." }, { status: 400, headers: SEM_CACHE });
  }
  try {
    const { id } = await gerarScorecard(vaga, historico, { tipo: "scorecard", expiraEmDias: 90 });
    responder(token, {}, id);
    return NextResponse.json({ ok: true }, { headers: FIM });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Não foi possível concluir a entrevista agora. Tente novamente." }, { status: 500, headers: SEM_CACHE });
  }
}
