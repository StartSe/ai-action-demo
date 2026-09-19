// A sessão de treino do vendedor (US-014): a conversa que ele está prestes a ter dentro do link que o
// gestor mandou para o time inteiro.
//
// POST abre a sessão e devolve **o personagem**, nunca a persona (D2 do PRD): o vendedor não pode
// descobrir com que tipo de cliente vai falar lendo a tela — nem lendo a resposta desta rota, que é
// o que ele tem à mão no navegador. Por isso a resposta carrega só nome, cargo, empresa e contexto;
// o `personaId` e as instruções do modelo ficam no servidor.
//
// PUT é o "Começar conversa": a sessão sai de "preparando", o cronômetro começa e o modo da conversa
// fica gravado.
import { montarPersonagem } from "@/lib/cliente-simulado";
import { obter as obterParticipante } from "@/lib/participantes";
import { personasDe } from "@/lib/personas";
import { obter as obterProduto } from "@/lib/produtos";
import { cookieSessaoVendedor, ehSeguro, lerSessaoVendedor } from "@/lib/sessao-vendedor";
import { abrir, emAndamento, emPreparacao, iniciar, obter as obterSessao, tentativasDe, type ModoSessao } from "@/lib/sessoes";
import { obter as obterSimulacao, type Simulacao } from "@/lib/simulacoes";
import { baseUrl } from "@/lib/setup-comum";

/** O que o vendedor combina de fazer nesta conversa quando o gestor não escreveu um objetivo. */
const OBJETIVO_PADRAO = "Entender a situação do cliente e sair da conversa com um próximo passo combinado.";

/** Voz é o padrão do treino (US-015); só quem desligou a voz na simulação começa por texto (US-011). */
function modoInicial(simulacao: Simulacao): ModoSessao {
  return simulacao.permiteVoz ? "voz-navegador" : "texto";
}

type Contexto = { simulacao: Simulacao; participanteId: string; seguro: boolean };

/** O treino está aberto e quem bateu à porta já se identificou? Senão, a frase que o vendedor entende. */
function contexto(req: Request, codigo: string): Contexto | Response {
  const simulacao = obterSimulacao(codigo);
  if (!simulacao) return Response.json({ error: "Este link de treino não existe mais." }, { status: 404 });
  if (simulacao.status !== "ativa") {
    return Response.json({ error: "Este treino não está aberto no momento. Fale com quem enviou o link." }, { status: 409 });
  }

  const sessaoVendedor = lerSessaoVendedor(req.headers.get("cookie"));
  const participante = sessaoVendedor ? obterParticipante(sessaoVendedor.participanteId) : null;
  if (!participante) return Response.json({ error: "Diga o seu nome antes de começar o treino." }, { status: 401 });

  return { simulacao, participanteId: participante.id, seguro: ehSeguro(baseUrl(req)) };
}

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/sessao">) {
  const { token } = await params;
  const lido = contexto(req, token);
  if (lido instanceof Response) return lido;
  const { simulacao, participanteId, seguro } = lido;

  // Recarregar a tela não pode abrir outra conversa: a sessão que já está em preparação é reaproveitada,
  // com o mesmo cliente. Só quando não existe nenhuma é que o limite de tentativas (US-011) é conferido
  // — a que já está aberta foi contada quando nasceu, e recontá-la barraria o vendedor na própria vez.
  const aberta = emPreparacao(token, participanteId) ?? emAndamento(token, participanteId);
  if (!aberta && simulacao.maxTentativas !== null && tentativasDe(token, participanteId) >= simulacao.maxTentativas) {
    return Response.json({ error: "Você já usou todas as suas conversas neste treino." }, { status: 409 });
  }

  const sessao = aberta ?? abrir({ simulacaoCodigo: token, participanteId, modo: modoInicial(simulacao) });
  const produto = obterProduto(simulacao.produtoId);
  const personagem = montarPersonagem({
    persona: personasDe([sessao.personaId])[0],
    dificuldade: simulacao.dificuldade,
    produto: produto ?? { nome: simulacao.nome, conhecimento: undefined },
    // A semente é o id da sessão: o personagem é remontado a cada turno da conversa (US-015) e sem ela
    // o cliente trocaria de nome no meio da ligação.
    semente: sessao.id,
  });

  return Response.json(
    {
      // `instrucoes` (o que o modelo recebe) e `personaId` ficam de fora de propósito: são exatamente
      // o que estragaria o treino se o vendedor olhasse.
      cliente: { nome: personagem.nome, cargo: personagem.cargo, empresa: personagem.empresa, contexto: personagem.contexto },
      objetivo: simulacao.objetivo?.trim() || OBJETIVO_PADRAO,
      duracaoMin: simulacao.duracaoMin,
      // A tela avisa sobre o microfone antes de pedir a permissão; num treino só por texto o aviso
      // certo é outro, e é por isto que o modo viaja junto.
      porVoz: simulacao.permiteVoz,
      comecou: sessao.status === "em_andamento",
    },
    { headers: { "Set-Cookie": cookieSessaoVendedor({ participanteId, sessaoId: sessao.id, seguro }) } },
  );
}

export async function PUT(req: Request, { params }: RouteContext<"/api/salas/[token]/sessao">) {
  const { token } = await params;
  const lido = contexto(req, token);
  if (lido instanceof Response) return lido;
  const { simulacao, participanteId } = lido;

  // O id da conversa vem do cookie, mas o banco é a rede de segurança: um navegador que perdeu o
  // cookie entre a preparação e o clique (aba restaurada, cookie de sessão apagado) ainda começa a
  // conversa que já estava preparada, em vez de ver um erro no único botão da tela.
  const sessaoVendedor = lerSessaoVendedor(req.headers.get("cookie"));
  const doCookie = sessaoVendedor?.sessaoId ? obterSessao(sessaoVendedor.sessaoId) : null;
  const sessao = doCookie ?? emPreparacao(token, participanteId);
  if (!sessao || sessao.participanteId !== participanteId || sessao.simulacaoCodigo !== token) {
    return Response.json({ error: "Esta conversa não está mais disponível. Abra o link de novo para recomeçar." }, { status: 404 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { modo?: string };
  const pedido = corpo.modo === "texto" || corpo.modo === "voz-navegador" ? (corpo.modo as ModoSessao) : undefined;
  const atualizada = iniciar(sessao.id, pedido ?? modoInicial(simulacao));
  return Response.json({ comecou: atualizada?.status === "em_andamento" });
}
