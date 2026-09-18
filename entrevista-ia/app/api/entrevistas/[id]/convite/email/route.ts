// Enviar o convite por e-mail (US-014), pelo canal que a pessoa já conectou em Configurações.
//
// O texto é o MESMO que o diálogo mostra em "Copiar convite" (`mensagemConvite`, lib/convite.ts): o
// candidato não pode receber uma promessa diferente da que está na tela de quem enviou.
//
// A mensagem de falha vem pronta de `lib/notificacoes.ts` — ela já traduz "o Resend recusou a chave"
// ou "o SMTP não respondeu" em algo que a pessoa de RH consegue agir. Aqui não se reescreve nada.
import { sessaoAtual } from "@/lib/conta";
import { conviteDaEntrevista } from "@/lib/convite";
import { enviar } from "@/lib/notificacoes";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  registrarEnderecoPublico(req);
  const resultado = conviteDaEntrevista(id, baseUrl(req), sessaoAtual(req)?.nome);
  if (!resultado.ok) return Response.json({ error: resultado.erro }, { status: resultado.status });

  const { convite } = resultado;
  if (!convite.candidatoEmail) {
    return Response.json({ error: `${convite.candidatoNome} não tem e-mail cadastrado. Edite o candidato para incluir o endereço.` }, { status: 400 });
  }

  const envio = await enviar({
    canal: "email",
    destino: convite.candidatoEmail,
    titulo: convite.assunto,
    // O link já está dentro da mensagem, na frase que explica o que fazer com ele; repeti-lo em
    // `link` faria o e-mail mostrar o mesmo endereço duas vezes.
    texto: convite.mensagem,
  });
  if (!envio.ok) return Response.json({ error: envio.mensagem }, { status: 502 });
  return Response.json({ ok: true, mensagem: envio.mensagem });
}
