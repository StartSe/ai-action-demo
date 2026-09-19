// O que fazer com a conversa que ficou aberta (US-017).
//
// Fechar a aba no meio do treino é comum: o vendedor é interrompido, perde a rede, o celular apaga a
// tela. Quando ele volta ao link, a pergunta é uma só — **continuar aquela conversa ou começar outra?**
//
// A resposta depende de há quanto tempo ele sumiu. Voltou logo: a conversa continua de onde parou, com
// o tempo que sobrou (o cronômetro é do servidor, US-015). Sumiu de vez: a conversa é fechada, porque
// deixá-la aberta para sempre travaria a próxima tentativa e sumiria com ela do painel do gestor.
//
// Fechada, ela ainda pode valer nota: uma conversa com fala suficiente é avaliada com o que houver —
// é melhor receber o feedback do pedaço que aconteceu do que perder o treino inteiro. Abaixo disso não
// há o que avaliar, e a sessão vira `abandonada`: dar nota a duas frases seria inventar um resultado,
// e uma abandonada **não gasta tentativa** (lib/sessoes.ts), então quem mal começou não é penalizado.
import { avaliarSessao } from "./avaliacao";
import { encerrar, transcricao, type Sessao } from "./sessoes";

/** Parado por menos que isto, o vendedor volta para a mesma conversa. */
export const MINUTOS_PARA_RETOMAR = 10;

/** Falas (do vendedor e do cliente, somadas) abaixo das quais não há conversa para avaliar. */
export const FALAS_MINIMAS_PARA_AVALIAR = 4;

export type Retomada = "retomada" | "avaliada" | "abandonada";

/**
 * Decide o destino da conversa que este vendedor deixou aberta. Devolve `"retomada"` quando ela
 * continua valendo — e só nesse caso quem chama deve levá-lo de volta para a sala.
 *
 * O relógio é o da **última fala**, não o do começo da conversa: quem parou há dois minutos no meio de
 * um treino de quinze continua nele, e quem começou há quarenta e não fala há trinta não continua. Sem
 * fala nenhuma, vale o instante em que a conversa começou.
 *
 * `encerrar` acontece **antes** do primeiro `await`, pelo mesmo motivo da US-015: duas abas abertas
 * ao mesmo tempo chegariam as duas aqui, e a segunda encontra a sessão já fechada em vez de mandar a
 * mesma conversa para uma segunda avaliação (duas notas diferentes para o mesmo treino).
 */
export async function retomarOuFechar(sessao: Sessao): Promise<Retomada> {
  if (sessao.status !== "em_andamento") return "abandonada";

  const falas = transcricao(sessao.id);
  const ultimoSinal = new Date(falas.at(-1)?.criadoEm ?? sessao.iniciadaEm ?? sessao.criadoEm).getTime();
  const paradaHaMin = (Date.now() - ultimoSinal) / 60000;
  if (paradaHaMin < MINUTOS_PARA_RETOMAR) return "retomada";

  if (falas.length < FALAS_MINIMAS_PARA_AVALIAR || !falas.some((f) => f.papel === "vendedor")) {
    encerrar(sessao.id, { status: "abandonada" });
    return "abandonada";
  }

  const fechada = encerrar(sessao.id);
  if (!fechada) return "abandonada";
  try {
    await avaliarSessao(fechada.id);
  } catch (err) {
    // A conversa está fechada e gravada de qualquer jeito: o gestor a vê no painel e o vendedor a vê
    // no histórico, sem nota. Quem voltou ao link não pediu esta avaliação e não pode ser barrado por
    // ela ter falhado — a tela dele segue normalmente.
    console.error("Não foi possível avaliar a conversa que ficou aberta", err);
  }
  return "avaliada";
}
