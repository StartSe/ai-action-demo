import { obter as obterSimulacao } from "@/lib/simulacoes";
import { prepararRoteiro } from "@/lib/roteiro";
// Uma fala do vendedor na sala de treino (app/simular/[código]): devolve a próxima fala do cliente.
//
// A rota atende dois caminhos, distinguidos pelo corpo do pedido:
//
// - **Sessão** (US-015, o caminho de hoje): o navegador manda só a última fala (`{ fala }`) e a
//   transcrição fica no servidor, em `mensagens_sessao`. O prompt de cada turno é montado aqui, com o
//   personagem da sessão (que já carrega a ficha do produto) e as últimas 20 falas.
// - **Sala antiga** (`{ transcricao }`): os links criados antes da US-002 continuam abrindo, e a sala
//   deles reenvia a conversa inteira a cada turno. Reaproveita lib/simulacao.ts, sem mudança.
import { FALAS_NO_PROMPT, falaDoCliente } from "@/lib/conversa-sessao";
import { obter as obterSala, expirou } from "@/lib/salas";
import { obter as obterCenario } from "@/lib/cenarios";
import { conversaAberta, restanteSeg } from "@/lib/sala-do-vendedor";
import { encerrar, registrarAvisoTempo, registrarMensagem, ultimasMensagens, temFalaDoVendedor, transcricao } from "@/lib/sessoes";
import { responderComoCliente } from "@/lib/simulacao";
import { ErroIA } from "@/lib/ai";
import type { LinhaTranscricao } from "@/lib/types";

/** Uma fala falada não passa disto; o teto existe para um pedido torto não virar um prompt gigante. */
const MAX_CARACTERES_FALA = 2000;
const turnosEmCurso = new Set<string>();

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
  const simulacaoAtual = obterSimulacao(token);
  if (simulacaoAtual && simulacaoAtual.status !== "ativa") return Response.json({ error: simulacaoAtual.status === "pausada" ? "Este treino está pausado. Aguarde a reativação por quem enviou o link." : "Este treino foi encerrado." }, { status: 409 });
  const corpo = (await req.json().catch(() => null)) as { fala?: unknown; segundo?: unknown; tempoAcabou?: unknown; avisoTempo?: unknown; retomar?: unknown; transcricao?: unknown } | null;

  if (Array.isArray(corpo?.transcricao)) return turnoDaSalaAntiga(token, corpo.transcricao as LinhaTranscricao[]);

  const lido = conversaAberta(req, token);
  if (lido instanceof Response) return lido;
  const { simulacao, sessao } = lido;
  if (turnosEmCurso.has(sessao.id)) return Response.json({ error: "Aguarde o cliente terminar a resposta." }, { status: 409 });
  turnosEmCurso.add(sessao.id);
  try {
    const fala = typeof corpo?.fala === "string" ? corpo.fala.trim().slice(0, MAX_CARACTERES_FALA) : "";
    const pediuFim = corpo?.tempoAcabou === true;
    const pediuAviso = corpo?.avisoTempo === true;
    // `retomar` é o "Tentar de novo" da tela, depois de um turno em que o modelo não respondeu: a fala do
    // vendedor já foi gravada na tentativa anterior, então mandá-la outra vez duplicaria a conversa — o
    // que se pede de novo é só a resposta do cliente, a partir do que já está no servidor.
    const retomar = corpo?.retomar === true;
    if (!fala && !pediuFim && !retomar && !pediuAviso) {
      return Response.json({ error: "Não entendemos o que você falou. Tente de novo, um pouco mais perto do microfone." }, { status: 400 });
    }

    // A duração é uma referência. O aviso abre espaço para combinar a continuação,
    // e o botão de encerramento continua disponível depois da última resposta.
    const restante = restanteSeg(sessao, simulacao.duracaoMin);
    const despedir = pediuFim;
    if (pediuAviso && !fala && (restante > 0 || sessao.avisoTempoEm || !temFalaDoVendedor(transcricao(sessao.id)))) {
      return Response.json({ avisoTempo: Boolean(sessao.avisoTempoEm), encerrada: false });
    }
    const faseTempo = sessao.avisoTempoEm ? "concluir" : restante === 0 ? "avisar" : "normal";
    const segundo = typeof corpo?.segundo === "number" && Number.isFinite(corpo.segundo) ? Math.max(0, Math.round(corpo.segundo)) : undefined;

    // A fala do vendedor é gravada **antes** de montar o prompt: ela é a última linha do histórico que
    // o cliente responde. Gravada aqui, ela também não se perde se o modelo falhar no meio.
    if (fala) registrarMensagem({ sessaoId: sessao.id, papel: "vendedor", texto: fala, segundo });

    const roteiro = prepararRoteiro(sessao, simulacao);

    let texto: string;
    try {
      texto = await falaDoCliente({
        instrucoes: roteiro.instrucoes,
        historico: ultimasMensagens(sessao.id, FALAS_NO_PROMPT),
        despedir,
        faseTempo,
      });
    } catch (err) {
      return clienteMudo(err);
    }

    // A geração pode demorar; o gestor pode ter pausado ou apagado o treino nesse intervalo.
    const aindaAberta = conversaAberta(req, token);
    if (aindaAberta instanceof Response) return aindaAberta;
    const mensagem = registrarMensagem({ sessaoId: sessao.id, papel: "cliente", texto, segundo });
    if (faseTempo === "avisar") registrarAvisoTempo(sessao.id);
    // Compatibilidade com pedidos explícitos de encerramento de clientes anteriores.
    if (despedir) encerrar(sessao.id);

    // `instrucoes` e `personaId` não saem daqui de propósito: são o que estragaria o treino se o
    // vendedor lesse a resposta crua da rota no navegador.
    return Response.json({ texto, mensagemId: mensagem.id, restanteSeg: despedir ? 0 : restante, avisoTempo: faseTempo !== "normal", encerrada: despedir });
  } finally { turnosEmCurso.delete(sessao.id); }
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
