// Lembretes de check-in do PDI: três rotinas "unica" (30, 60 e 90 dias a partir da conversa) que
// avisam o líder no marco certo, com as ações daquele marco e um link de formulário "O que avançou?".
// A resposta do formulário vira uma entrada em pdi.acompanhamento, anexada ao PDI já salvo.
// Arquivo próprio deste app (não copiado sem alterar entre os 10 apps).
import { criar as criarFormulario, registrarCallback, type CampoFormulario, type ParametrosPublicos } from "./formularios";
import { atualizarSaida, obter } from "./historico";
import type { Canal } from "./notificacoes";
import { criar as criarRotina, listar as listarRotinas, registrarExecutor, type Rotina } from "./rotinas";
import { enderecoPublico } from "./setup-comum";
import type { DadosPDI, EntradaAcompanhamento, PDI } from "./types";

export type Marco = 30 | 60 | 90;
const MARCOS: Marco[] = [30, 60, 90];

type AcaoMarco = { objetivo: string; acao: string };

type ParametrosRotinaCheckin = { resultadoId: string; nome: string; marco: Marco; acoes: AcaoMarco[] };
type ParametrosFormularioCheckin = ParametrosPublicos & { resultadoId: string; marco: Marco; acoes: AcaoMarco[] };

/** As ações de todos os objetivos cujo prazo é o marco pedido (ex.: todas as ações "30 dias"). */
function acoesDoMarco(pdi: PDI, marco: Marco): AcaoMarco[] {
  const prazo = `${marco} dias`;
  return pdi.objetivos.flatMap((o) => o.acoes.filter((a) => a.prazo === prazo).map((a) => ({ objetivo: o.titulo, acao: a.acao })));
}

function camposCheckin(acoes: AcaoMarco[]): CampoFormulario[] {
  return [
    { chave: "relato", rotulo: "O que avançou desde a conversa?", tipo: "textarea", obrigatorio: true },
    ...acoes.map((a, i): CampoFormulario => ({ chave: `acao-${i}`, rotulo: `Status de "${a.acao}"`, tipo: "texto", obrigatorio: true })),
  ];
}

/** "AAAA-MM-DD" a partir das partes locais do Date (nunca `toISOString()`: converteria para UTC e
 * poderia mudar o dia — o mesmo valor depois é reinterpretado como meia-noite local por lib/rotinas.ts). */
function paraDataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Cria as 3 rotinas (30/60/90 dias a partir de `desde`, ou de hoje) para o líder ser lembrado do check-in. */
export function criarLembretesCheckin({ resultadoId, nome, pdi, desde, canal, destino }: {
  resultadoId: string; nome: string; pdi: PDI; desde?: string; canal: Canal; destino?: string;
}): { id: string; marco: Marco; dataUnica: string }[] {
  const base = desde ? new Date(`${desde}T00:00:00`) : new Date();
  return MARCOS.map((marco) => {
    const alvo = new Date(base);
    alvo.setDate(alvo.getDate() + marco);
    const dataUnica = paraDataLocal(alvo);
    const parametros: ParametrosRotinaCheckin = { resultadoId, nome, marco, acoes: acoesDoMarco(pdi, marco) };
    const id = criarRotina({ tipo: "checkin-pdi", frequencia: "unica", hora: "09:00", dataUnica, canal, destino, parametros });
    return { id, marco, dataUnica };
  });
}

/** Lembretes já agendados para um PDI salvo (para o botão saber se já foi criado). */
export function listarLembretesCheckin(resultadoId: string): { id: string; marco: Marco; dataUnica: string; executado: boolean }[] {
  return listarRotinas<ParametrosRotinaCheckin>()
    .filter((r) => r.tipo === "checkin-pdi" && r.parametros.resultadoId === resultadoId)
    .map((r) => ({ id: r.id, marco: r.parametros.marco, dataUnica: r.dataUnica ?? "", executado: Boolean(r.ultimaExecucao) }))
    .sort((a, b) => a.marco - b.marco);
}

registrarExecutor("checkin-pdi", async (rotina: Rotina) => {
  const { resultadoId, nome, marco, acoes } = (rotina as Rotina<ParametrosRotinaCheckin>).parametros;
  const parametros: ParametrosFormularioCheckin = {
    marca: "P",
    nome: "PDI do Time",
    titulo: "O que avançou?",
    descricao: `Check-in de ${marco} dias do PDI de ${nome}. Conte o que avançou e o status de cada ação deste marco.`,
    resultadoId,
    marco,
    acoes,
  };
  const token = criarFormulario({ tipo: "checkin-pdi", campos: camposCheckin(acoes), parametros, expiraEmDias: 30, limite: 1 });
  const base = enderecoPublico();
  const listaAcoes = acoes.length ? acoes.map((a) => `- ${a.objetivo}: ${a.acao}`).join("\n") : "Nenhuma ação prevista para este marco.";
  if (!base) console.error(`Check-in de ${marco} dias (PDI de ${nome}): endereço público desconhecido, link omitido do aviso.`);
  const registrar = base ? `Registre o que avançou: ${base}/f/${token}` : "Abra o app para registrar o que avançou (endereço público ainda não configurado).";
  return {
    titulo: `Check-in de ${marco} dias: PDI de ${nome}`,
    texto: `Chegou a hora do check-in de ${marco} dias do PDI de ${nome}.\n\nAções deste marco:\n${listaAcoes}\n\n${registrar}`,
  };
});

registrarCallback("checkin-pdi", async ({ dados, parametros }) => {
  const { resultadoId, marco, acoes } = parametros as ParametrosFormularioCheckin;
  const registro = obter<DadosPDI, PDI, unknown>(resultadoId);
  if (!registro || registro.tipo !== "pdi") return {};

  const entrada: EntradaAcompanhamento = {
    data: new Date().toISOString(),
    marco,
    texto: dados.relato || "",
    statusAcoes: acoes.map((a, i) => ({ objetivo: a.objetivo, acao: a.acao, status: dados[`acao-${i}`] || "" })),
  };
  const saida: PDI = { ...registro.saida, acompanhamento: [...(registro.saida.acompanhamento || []), entrada] };
  atualizarSaida(resultadoId, saida);
  return { resultadoId };
});
