// "Avisar 30 dias antes": uma rotina "unica" por prazo do contrato (30 dias antes de cada data),
// avisando o executivo com o contrato, o prazo e a cláusula/ação sugerida (já em prazo.descricao).
// Arquivo próprio deste app (não copiado sem alterar entre os 10 apps).
import type { Canal } from "./notificacoes";
import { apagar as apagarRotina, criar as criarRotina, listar as listarRotinas, registrarExecutor, type Rotina } from "./rotinas";
import type { Prazo } from "./types";

type ParametrosAvisoPrazo = { resultadoId: string; tipoContrato: string; prazo: Prazo };

/** "AAAA-MM-DD" a partir das partes locais do Date (nunca `toISOString()`: ver gotcha de fuso em pdi-time/CLAUDE.md, US-070). */
function paraDataLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function trintaDiasAntes(dataPrazo: string): string {
  const d = new Date(`${dataPrazo}T00:00:00`);
  d.setDate(d.getDate() - 30);
  return paraDataLocal(d);
}

/** Cria uma rotina "unica" por prazo (30 dias antes de cada data) para avisar o executivo. */
export function criarAvisosPrazo({ resultadoId, tipoContrato, prazos, canal, destino }: {
  resultadoId: string; tipoContrato: string; prazos: Prazo[]; canal: Canal; destino?: string;
}): { id: string; tipo: string; dataAviso: string }[] {
  return prazos.map((prazo) => {
    const dataAviso = trintaDiasAntes(prazo.data);
    const parametros: ParametrosAvisoPrazo = { resultadoId, tipoContrato, prazo };
    const id = criarRotina({ tipo: "aviso-prazo-contrato", frequencia: "unica", hora: "09:00", dataUnica: dataAviso, canal, destino, parametros });
    return { id, tipo: prazo.tipo, dataAviso };
  });
}

export type AvisoPrazo = { id: string; tipo: string; dataAviso: string; executado: boolean; falha: string | null };

/** Avisos já agendados para um contrato salvo (para o botão saber se já foi criado e mostrar falhas). */
export function listarAvisosPrazo(resultadoId: string): AvisoPrazo[] {
  return listarRotinas<ParametrosAvisoPrazo>()
    .filter((r) => r.tipo === "aviso-prazo-contrato" && r.parametros.resultadoId === resultadoId)
    .map((r) => ({ id: r.id, tipo: r.parametros.prazo.tipo, dataAviso: r.dataUnica ?? "", executado: Boolean(r.ultimaExecucao), falha: r.ultimaFalha }));
}

/** Apaga os avisos deste contrato (botão "Cancelar avisos"), inclusive os que já falharam. */
export function cancelarAvisosPrazo(resultadoId: string): void {
  for (const aviso of listarAvisosPrazo(resultadoId)) apagarRotina(aviso.id);
}

registrarExecutor("aviso-prazo-contrato", async (rotina: Rotina) => {
  const { resultadoId, tipoContrato, prazo } = (rotina as Rotina<ParametrosAvisoPrazo>).parametros;
  return {
    titulo: `Prazo em 30 dias: ${prazo.tipo} — ${tipoContrato}`,
    texto: `Faltam 30 dias para "${prazo.tipo}" do contrato "${tipoContrato}".\n\n${prazo.descricao}`,
    resultadoId,
  };
});
