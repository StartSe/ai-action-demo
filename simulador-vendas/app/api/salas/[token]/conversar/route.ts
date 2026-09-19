// Uma fala do vendedor na sala de treino (app/simular/[código]): devolve a próxima fala do cliente.
//
// A rota atende dois caminhos, distinguidos pelo corpo do pedido:
//
// - **Sessão** (US-015, o caminho de hoje): o navegador manda só a última fala (`{ fala }`) e a
//   transcrição fica no servidor, em `mensagens_sessao`. O prompt de cada turno é montado aqui, com o
//   personagem da sessão (que já carrega a ficha do produto) e as últimas 20 falas.
// - **Sala antiga** (`{ transcricao }`): os links criados antes da US-002 continuam abrindo, e a sala
//   deles reenvia a conversa inteira a cada turno. Reaproveita lib/simulacao.ts, sem mudança.
import { montarPersonagem } from "@/lib/cliente-simulado";
import { FALAS_NO_PROMPT, falaDoCliente } from "@/lib/conversa-sessao";
import { personasDe } from "@/lib/personas";
import { obter as obterProduto } from "@/lib/produtos";
import { obter as obterSala, expirou } from "@/lib/salas";
import { obter as obterCenario } from "@/lib/cenarios";
import { conversaAberta, restanteSeg } from "@/lib/sala-do-vendedor";
import { encerrar, registrarMensagem, ultimasMensagens } from "@/lib/sessoes";
import { responderComoCliente } from "@/lib/simulacao";
import { ErroIA } from "@/lib/ai";
import type { LinhaTranscricao } from "@/lib/types";

/** Uma fala falada não passa disto; o teto existe para um pedido torto não virar um prompt gigante. */
const MAX_CARACTERES_FALA = 2000;

/**
 * Quem está desta ponta é o vendedor treinando, não o gestor: ele não configura nada e não pode
 * receber "conecte a IA em Configurações". Sempre a mesma frase, com o código técnico só no log.
 */
function clienteMudo(err: unknown): Response {
  console.error("Sala de treino: o cliente simulado não respondeu", err instanceof ErroIA ? err.codigo : err);
  return Response.json({ error: "O cliente não conseguiu responder agora. Tente falar de novo." }, { status: 502 });
}

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/conversar">) {
  const { token } = await params;
  const corpo = (await req.json().catch(() => null)) as { fala?: unknown; segundo?: unknown; tempoAcabou?: unknown; retomar?: unknown; transcricao?: unknown } | null;

  if (Array.isArray(corpo?.transcricao)) return turnoDaSalaAntiga(token, corpo.transcricao as LinhaTranscricao[]);

  const lido = conversaAberta(req, token);
  if (lido instanceof Response) return lido;
  const { simulacao, sessao } = lido;

  const fala = typeof corpo?.fala === "string" ? corpo.fala.trim().slice(0, MAX_CARACTERES_FALA) : "";
  const pediuFim = corpo?.tempoAcabou === true;
  // `retomar` é o "Tentar de novo" da tela, depois de um turno em que o modelo não respondeu: a fala do
  // vendedor já foi gravada na tentativa anterior, então mandá-la outra vez duplicaria a conversa — o
  // que se pede de novo é só a resposta do cliente, a partir do que já está no servidor.
  const retomar = corpo?.retomar === true;
  if (!fala && !pediuFim && !retomar) {
    return Response.json({ error: "Não entendemos o que você falou. Tente de novo, um pouco mais perto do microfone." }, { status: 400 });
  }

  // O relógio é conferido antes do turno: se o tempo já acabou, esta é a despedida, mesmo que o
  // navegador não tenha percebido (aba em segundo plano congela o cronômetro da tela).
  const restante = restanteSeg(sessao, simulacao.duracaoMin);
  const despedir = pediuFim || restante === 0;
  const segundo = typeof corpo?.segundo === "number" && Number.isFinite(corpo.segundo) ? Math.max(0, Math.round(corpo.segundo)) : undefined;

  // A fala do vendedor é gravada **antes** de montar o prompt: ela é a última linha do histórico que
  // o cliente responde. Gravada aqui, ela também não se perde se o modelo falhar no meio.
  if (fala) registrarMensagem({ sessaoId: sessao.id, papel: "vendedor", texto: fala, segundo });

  const produto = obterProduto(simulacao.produtoId);
  const personagem = montarPersonagem({
    persona: personasDe([sessao.personaId])[0],
    dificuldade: simulacao.dificuldade,
    produto: produto ?? { nome: simulacao.nome, conhecimento: undefined },
    // Mesma semente da preparação (US-014): sem ela o cliente trocaria de nome no meio da conversa.
    semente: sessao.id,
  });

  let texto: string;
  try {
    texto = await falaDoCliente({
      instrucoes: personagem.instrucoes,
      historico: ultimasMensagens(sessao.id, FALAS_NO_PROMPT),
      despedir,
    });
  } catch (err) {
    return clienteMudo(err);
  }

  registrarMensagem({ sessaoId: sessao.id, papel: "cliente", texto, segundo });
  // Com o tempo esgotado a conversa fecha aqui, na despedida: quem treinou não precisa clicar em nada
  // para a sessão ficar consistente, e o resultado é pedido logo depois pela rota de encerramento.
  if (despedir) encerrar(sessao.id);

  // `instrucoes` e `personaId` não saem daqui de propósito: são o que estragaria o treino se o
  // vendedor lesse a resposta crua da rota no navegador.
  return Response.json({ texto, restanteSeg: despedir ? 0 : restante, encerrada: despedir });
}

/** O turno das salas criadas antes da US-002, que mandam a conversa inteira a cada fala. */
async function turnoDaSalaAntiga(codigo: string, transcricao: LinhaTranscricao[]): Promise<Response> {
  const sala = obterSala(codigo);
  if (!sala || expirou(sala)) {
    return Response.json({ error: "Esta sala não está mais disponível." }, { status: 404 });
  }
  if (transcricao.length === 0 || transcricao[transcricao.length - 1]?.papel !== "vendedor") {
    return Response.json({ error: "Escreva uma fala antes de continuar." }, { status: 400 });
  }

  const cenario = sala.cenarioId ? obterCenario(sala.cenarioId) : null;
  try {
    const texto = await responderComoCliente(transcricao, cenario);
    return Response.json({ texto });
  } catch (err) {
    return clienteMudo(err);
  }
}
