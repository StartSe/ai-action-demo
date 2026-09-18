// "Responder como IA" da conversa aberta: devolve um rascunho de resposta para a última mensagem do
// cliente, sem gravar nada e sem enviar nada. Quem decide o que vai para o cliente é sempre a pessoa —
// ela lê o rascunho no campo, corrige o que quiser e só então envia.
//
// Diferente de POST /api/simular e do webhook, que respondem o cliente de verdade: aqui a resposta
// nunca sai sozinha, por isso `sugerirResposta` (lib/atendente.ts) é a função certa — ela nunca devolve
// a mensagem de transferência, que não serviria de rascunho para ninguém.
import { responderErro } from "@/app/api/erros";
import { type ParametroNumero, CONVERSA_SUMIU } from "../comum";
import { aiEnabled, ErroIA } from "@/lib/ai";
import { sugerirResposta } from "@/lib/atendente";
import { obterConversa } from "@/lib/conversas";

export const dynamic = "force-dynamic";

const SEM_PERGUNTA = "Este cliente ainda não escreveu nada nesta conversa, então não há o que responder.";
// Sem IA conectada a sugestão vira erro na tela, e nunca texto dentro do campo de mensagem: `sugerirResposta`
// devolve nesse caso uma frase explicando que falta conectar a IA — útil no relatório diário, péssima aqui,
// onde ela cairia no campo de escrever e poderia ser enviada ao cliente por engano.
const SEM_IA = "A IA ainda não está conectada, então não há como escrever uma sugestão. Responda por aqui mesmo ou conecte a IA em Configurações.";
const FALHA = "Não foi possível escrever uma sugestão agora. Tente de novo em alguns instantes.";

export async function POST(_req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  const conversa = obterConversa(numero);
  if (!conversa) return Response.json({ error: CONVERSA_SUMIU }, { status: 404 });

  if (!aiEnabled()) {
    return responderErro(new ErroIA("chave_ausente", SEM_IA, 400, { rotulo: "Conectar a IA", url: "/setup#openrouter" }), FALHA);
  }

  const ultimaDoCliente = [...conversa.mensagens].reverse().find((m) => m.papel === "cliente");
  if (!ultimaDoCliente) return Response.json({ error: SEM_PERGUNTA }, { status: 400 });

  try {
    const { resposta, ferramentaUsada } = await sugerirResposta(ultimaDoCliente.texto);
    return Response.json({ sugestao: resposta, ferramentaUsada });
  } catch (err) {
    return responderErro(err, FALHA);
  }
}
