// O convite público de um treino (US-029): um link que coleta nome e e-mail e devolve o endereço do
// treino, para quem prefere divulgar o treino em vez de mandar o link direto.
//
// `GET` conta o que já chegou; `POST` cria o convite (ou devolve o que já existe — um treino tem um
// convite, não um por clique).
import { conviteDe, criarLinkConvite } from "@/lib/convite";
import { contarRespostas } from "@/lib/formularios";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";

export async function GET(req: Request, { params }: RouteContext<"/api/simulacoes/[codigo]/convite">) {
  const { codigo } = await params;
  const convite = conviteDe(codigo);
  if (!convite) return Response.json({ convite: null });
  return Response.json({ convite: { url: `${baseUrl(req)}/f/${convite.token}`, respostas: contarRespostas(convite.token) } });
}

export async function POST(req: Request, { params }: RouteContext<"/api/simulacoes/[codigo]/convite">) {
  const { codigo } = await params;
  // O convite guarda o endereço do treino dentro do texto de confirmação, então a instalação precisa
  // saber o próprio endereço antes de criá-lo — é a mesma requisição real que ensina isso.
  registrarEnderecoPublico(req);
  const criado = criarLinkConvite(codigo, baseUrl(req));
  if (!criado) {
    return Response.json({ error: "Esse treino não existe mais." }, { status: 404 });
  }
  return Response.json({ convite: { url: criado.url, respostas: contarRespostas(criado.token) } });
}
