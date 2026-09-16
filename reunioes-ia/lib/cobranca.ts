// "Cobrar na véspera do prazo" (US-076, revisado na US-025): uma rotina "unica" por ação, um dia antes
// do prazo, avisando o responsável daquela ação (e-mail buscado em "E-mails dos participantes", ou o
// canal do Slack quando esse é o canal escolhido em Notificações) com a ação, o prazo e o link de
// confirmação (US-065, reaproveitado de lib/confirmacoes.ts). Arquivo próprio deste app: nenhum outro
// tem "ações com responsável por nome" que precise resolver um e-mail a partir de um texto livre.
import type { Meta } from "./ai";
import { criarLinkConfirmacao } from "./confirmacoes";
import { data } from "./formato";
import { atualizarSaida, obter } from "./historico";
import type { Canal } from "./notificacoes";
import { emailDoResponsavel } from "./participantes";
import { apagar as apagarRotina, criar as criarRotina, obter as obterRotina, registrarExecutor, type Rotina } from "./rotinas";
import { enderecoPublico } from "./setup-comum";
import type { Acao, Ata, EntradaAta } from "./types";

export { emailDoResponsavel, emailsPorNome } from "./participantes";

export const TIPO_COBRANCA = "cobranca-vespera-acao";

const PRAZO_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
const PRAZO_PARTES = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "AAAA-MM-DD" a partir das partes locais do Date (nunca `toISOString()`: ver gotcha de fuso em pdi-time/CLAUDE.md, US-070). */
function paraDataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function vesperaDoPrazo(prazoIso: string): string {
  const d = new Date(`${prazoIso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return paraDataLocal(d);
}

/** "AAAA-MM-DD" -> "dd/mm/aaaa" sem passar por `new Date("AAAA-MM-DD")` (meia-noite UTC, viraria o dia anterior). */
function prazoLegivel(prazo: string): string {
  const m = PRAZO_PARTES.exec(prazo);
  if (!m) return prazo;
  return data(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), { comAno: true });
}

/** `base` é o endereço público visto na requisição que agendou (baseUrl(req)), guardado aqui porque no
 * executor de 60s não há requisição para consultar; `enderecoPublico()` fica só como reserva. */
type ParametrosCobranca = { ataId: string; indice: number; base?: string };

export type ResultadoCobranca = { indice: number; acao: string; ok: boolean; mensagem: string };

/** Cria (uma única vez por ação ainda pendente e com prazo válido) a rotina de cobrança na véspera. */
export function criarCobrancasVespera(ataId: string, { canal, base }: { canal: Canal; base: string }): { ata: Ata; resultados: ResultadoCobranca[] } | null {
  const registro = obter<EntradaAta, Ata, Meta>(ataId);
  if (!registro || registro.tipo !== "ata") return null;

  const acoes = registro.saida.acoes || [];
  const emailsTexto = registro.entrada?.emailsParticipantes;
  const acoesAtualizadas: Acao[] = [...acoes];
  const resultados: ResultadoCobranca[] = [];

  acoes.forEach((acao, indice) => {
    if (acao.concluida) {
      resultados.push({ indice, acao: acao.acao, ok: false, mensagem: "Ação já concluída, cobrança não é necessária." });
      return;
    }
    if (acao.cobrancaRotinaId) {
      resultados.push({ indice, acao: acao.acao, ok: true, mensagem: "Cobrança já estava agendada." });
      return;
    }
    if (!PRAZO_VALIDO.test(acao.prazo)) {
      resultados.push({ indice, acao: acao.acao, ok: false, mensagem: "Prazo sem data definida." });
      return;
    }
    // Por e-mail, cada responsável recebe no próprio endereço; pelo Slack, o aviso vai para o canal do webhook.
    const email = canal === "email" ? emailDoResponsavel(emailsTexto, acao.responsavel) : undefined;
    if (canal === "email" && !email) {
      resultados.push({ indice, acao: acao.acao, ok: false, mensagem: `Sem e-mail cadastrado para "${acao.responsavel || "o responsável"}". Preencha "E-mails dos participantes".` });
      return;
    }

    const token = acao.tokenConfirmacao || criarLinkConfirmacao(ataId, indice, acao);
    const parametros: ParametrosCobranca = { ataId, indice, base };
    const rotinaId = criarRotina({
      tipo: TIPO_COBRANCA,
      frequencia: "unica",
      hora: "08:00",
      dataUnica: vesperaDoPrazo(acao.prazo),
      canal,
      destino: email,
      parametros,
    });
    acoesAtualizadas[indice] = { ...acao, tokenConfirmacao: token, cobrancaRotinaId: rotinaId };
    resultados.push({
      indice,
      acao: acao.acao,
      ok: true,
      mensagem: canal === "email" ? `Cobrança agendada para ${email} em ${prazoLegivel(vesperaDoPrazo(acao.prazo))}.` : `Cobrança agendada no Slack para ${prazoLegivel(vesperaDoPrazo(acao.prazo))}.`,
    });
  });

  const saida: Ata = { ...registro.saida, acoes: acoesAtualizadas };
  atualizarSaida(ataId, saida);
  return { ata: anexarEstadoCobranca(saida), resultados };
}

/** Cancela a cobrança agendada de uma ação (chamada quando ela é marcada como concluída). */
export function cancelarCobranca(acao: Acao): Acao {
  if (!acao.cobrancaRotinaId) return acao;
  apagarRotina(acao.cobrancaRotinaId);
  const { cobrancaRotinaId: _ignorado, ...resto } = acao;
  void _ignorado;
  return resto;
}

/** Completa cada ação com o estado atual da sua cobrança (`cobrancaFalha`/`cobrancaEnviada`), lido da
 * rotina em vez de gravado na ata: assim a tela mostra "Cobrança não enviada: motivo" sem que a ata
 * precise ser reescrita a cada execução. Use ao devolver a ata para a tela (nunca antes de gravar). */
export function anexarEstadoCobranca(ata: Ata): Ata {
  const acoes = (ata.acoes || []).map((acao) => {
    if (!acao.cobrancaRotinaId) return acao;
    const rotina = obterRotina(acao.cobrancaRotinaId);
    if (!rotina) return acao;
    const { cobrancaFalha: _f, cobrancaEnviada: _e, ...limpa } = acao;
    void _f; void _e;
    if (rotina.ultimaFalha) return { ...limpa, cobrancaFalha: rotina.ultimaFalha };
    if (rotina.ultimaExecucao) return { ...limpa, cobrancaEnviada: true };
    return limpa;
  });
  return { ...ata, acoes };
}

registrarExecutor(TIPO_COBRANCA, async (rotina: Rotina) => {
  const { ataId, indice, base: baseGuardada } = (rotina as Rotina<ParametrosCobranca>).parametros;
  const registro = obter<EntradaAta, Ata, Meta>(ataId);
  const acao = registro?.saida.acoes?.[indice];
  if (!registro || !acao) {
    return { titulo: "Ação não encontrada", texto: "A ação referente a esta cobrança não foi encontrada (pode ter sido removida)." };
  }
  const base = baseGuardada || enderecoPublico();
  if (!base) console.error(`Cobrança da ação "${acao.acao}": endereço público desconhecido, link de confirmação omitido do aviso.`);
  const linkConfirmacao = base && acao.tokenConfirmacao ? `${base}/f/${acao.tokenConfirmacao}` : undefined;
  const responsavel = acao.responsavel ? ` (${acao.responsavel})` : "";
  return {
    titulo: `Lembrete: "${acao.acao}" vence amanhã`,
    texto: `A ação "${acao.acao}"${responsavel} tem prazo para ${prazoLegivel(acao.prazo)}.${linkConfirmacao ? ` Confirme ou ajuste o prazo por este link: ${linkConfirmacao}` : ""}`,
    resultadoId: ataId,
  };
});
