// "Cobrar na véspera do prazo" (US-076): uma rotina "unica" por ação, um dia antes do prazo, avisando
// por e-mail o responsável daquela ação (endereço buscado em "E-mails dos participantes") com a ação,
// o prazo e o link de confirmação (US-065, reaproveitado de lib/confirmacoes.ts). Arquivo próprio deste
// app (não copiado sem alterar entre os 10 apps): nenhum outro tem "ações com responsável por nome" que
// precise resolver um e-mail a partir de um texto livre de participantes.
import type { Meta } from "./ai";
import { criarLinkConfirmacao } from "./confirmacoes";
import { atualizarSaida, obter } from "./historico";
import { apagar as apagarRotina, criar as criarRotina, registrarExecutor, type Rotina } from "./rotinas";
import { enderecoPublico } from "./setup-comum";
import type { Acao, Ata, EntradaAta } from "./types";

export const TIPO_COBRANCA = "cobranca-vespera-acao";

const PRAZO_VALIDO = /^\d{4}-\d{2}-\d{2}$/;

/** "AAAA-MM-DD" a partir das partes locais do Date (nunca `toISOString()`: ver gotcha de fuso em pdi-time/CLAUDE.md, US-070). */
function paraDataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function vesperaDoPrazo(prazoIso: string): string {
  const d = new Date(`${prazoIso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return paraDataLocal(d);
}

function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Lê "E-mails dos participantes" (uma pessoa por linha, "Nome: e-mail") num mapa nome normalizado -> e-mail. */
export function emailsPorNome(texto?: string): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const linha of (texto || "").split("\n")) {
    const indice = linha.indexOf(":");
    if (indice < 0) continue;
    const nome = linha.slice(0, indice).trim();
    const email = linha.slice(indice + 1).trim();
    if (!nome || !email) continue;
    mapa[normalizarNome(nome)] = email;
  }
  return mapa;
}

/** E-mail do responsável por uma ação: casa pelo nome completo e, se não achar, por um nome que contenha o outro (ex.: "Renata" casa com "Renata Cavalcanti"). */
export function emailDoResponsavel(emailsParticipantes: string | undefined, responsavel: string): string | undefined {
  const alvo = normalizarNome(responsavel || "");
  if (!alvo) return undefined;
  const mapa = emailsPorNome(emailsParticipantes);
  if (mapa[alvo]) return mapa[alvo];
  const chave = Object.keys(mapa).find((k) => k.includes(alvo) || alvo.includes(k));
  return chave ? mapa[chave] : undefined;
}

type ParametrosCobranca = { ataId: string; indice: number };

export type ResultadoCobranca = { indice: number; acao: string; ok: boolean; mensagem: string };

/** Cria (uma única vez por ação ainda pendente e com prazo válido) a rotina de cobrança na véspera. */
export function criarCobrancasVespera(ataId: string): { ata: Ata; resultados: ResultadoCobranca[] } | null {
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
    const email = emailDoResponsavel(emailsTexto, acao.responsavel);
    if (!email) {
      resultados.push({ indice, acao: acao.acao, ok: false, mensagem: `Sem e-mail cadastrado para "${acao.responsavel || "o responsável"}".` });
      return;
    }

    const token = acao.tokenConfirmacao || criarLinkConfirmacao(ataId, indice, acao);
    const parametros: ParametrosCobranca = { ataId, indice };
    const rotinaId = criarRotina({
      tipo: TIPO_COBRANCA,
      frequencia: "unica",
      hora: "08:00",
      dataUnica: vesperaDoPrazo(acao.prazo),
      canal: "email",
      destino: email,
      parametros,
    });
    acoesAtualizadas[indice] = { ...acao, tokenConfirmacao: token, cobrancaRotinaId: rotinaId };
    resultados.push({ indice, acao: acao.acao, ok: true, mensagem: `Cobrança agendada para ${email}.` });
  });

  const saida: Ata = { ...registro.saida, acoes: acoesAtualizadas };
  atualizarSaida(ataId, saida);
  return { ata: saida, resultados };
}

/** Cancela a cobrança agendada de uma ação (chamada quando ela é marcada como concluída). */
export function cancelarCobranca(acao: Acao): Acao {
  if (!acao.cobrancaRotinaId) return acao;
  apagarRotina(acao.cobrancaRotinaId);
  const { cobrancaRotinaId: _ignorado, ...resto } = acao;
  void _ignorado;
  return resto;
}

registrarExecutor(TIPO_COBRANCA, async (rotina: Rotina) => {
  const { ataId, indice } = (rotina as Rotina<ParametrosCobranca>).parametros;
  const registro = obter<EntradaAta, Ata, Meta>(ataId);
  const acao = registro?.saida.acoes?.[indice];
  if (!registro || !acao) {
    return { titulo: "Ação não encontrada", texto: "A ação referente a esta cobrança não foi encontrada (pode ter sido removida)." };
  }
  const base = enderecoPublico();
  if (!base) console.error(`Cobrança da ação "${acao.acao}": endereço público desconhecido, link de confirmação omitido do aviso.`);
  const linkConfirmacao = base && acao.tokenConfirmacao ? `${base}/f/${acao.tokenConfirmacao}` : undefined;
  return {
    titulo: `Lembrete: "${acao.acao}" vence amanhã`,
    texto: `A ação "${acao.acao}" tem prazo para ${acao.prazo}.${linkConfirmacao ? ` Confirme por este link: ${linkConfirmacao}` : ""}`,
    resultadoId: ataId,
  };
});
