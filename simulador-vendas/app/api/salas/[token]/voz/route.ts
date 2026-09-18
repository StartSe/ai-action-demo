// A voz do cliente simulado, gerada no servidor (US-015), com a voz do tipo de cliente da sessão (US-028).
//
// Existe por um motivo só: a chave da ElevenLabs **não pode ir para o navegador**. O link do treino é
// público — quem abre é o vendedor, sem conta —, então uma chave entregue à tela ficaria ao alcance de
// qualquer pessoa que recebeu o endereço no grupo do time. A tela manda o texto, o servidor devolve o
// áudio pronto e a chave nunca sai daqui.
//
// Sem chave configurada esta rota não é chamada: a sala usa a voz do próprio navegador
// (`speechSynthesis`), que é o padrão do app e não exige o gestor configurar nada.
import { conversaAberta } from "@/lib/sala-do-vendedor";
import { falaDoCliente, MAX_CARACTERES } from "@/lib/vozes";

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/voz">) {
  const { token } = await params;

  // Mesma conferência das outras rotas da conversa: só quem está numa conversa aberta faz o servidor
  // gastar a cota de voz da conta do gestor.
  const lido = conversaAberta(req, token);
  if (lido instanceof Response) return lido;

  const corpo = (await req.json().catch(() => null)) as { texto?: unknown } | null;
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim().slice(0, MAX_CARACTERES) : "";
  if (!texto) return Response.json({ error: "Nada para falar." }, { status: 400 });

  // O tipo de cliente da sessão é o que dá a voz — e ele nunca atravessa para o navegador: o que volta
  // daqui é áudio, e a tela continua sem saber com que tipo de cliente está falando (D2).
  const audio = await falaDoCliente({ texto, personaId: lido.sessao.personaId });
  // 409 e não 502: para a tela isto não é falha, é "fale você mesmo" — ela troca para a voz do
  // navegador e a conversa segue sem o vendedor perceber nada.
  if (!audio) return Response.json({ error: "A voz do cliente vai sair pelo seu navegador." }, { status: 409 });
  return audio;
}
