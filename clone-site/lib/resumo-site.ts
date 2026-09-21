// Rotina "Resumo semanal do site": visitas dos últimos 7 dias, comparação com os 7 anteriores, principal origem e a
// primeira sugestão do agente, entregues por e-mail ou Slack (lib/rotinas.ts + lib/notificacoes.ts) com o link
// para o workspace. Registrado por lib/rotinas-do-app.ts.
import { resumo, resumoEmTexto } from "./metricas";
import { obter } from "./projetos";
import { registrarExecutor, type ResultadoRotina, type Rotina, type TipoRotina } from "./rotinas";
import { enderecoPublico } from "./setup-comum";
import { sugerir } from "./sugestoes";

export const TIPO_RESUMO_SITE = "resumo-site";
export type ParametrosResumoSite = { projetoId?: string };

export const TIPO: TipoRotina<ParametrosResumoSite> = {
  tipo: TIPO_RESUMO_SITE,
  rotulo: "Resumo semanal do site",
  validar: (parametros) => {
    const p = parametros?.projetoId ? obter(parametros.projetoId) : null;
    if (!p) return "Escolha o site que vai receber o resumo (crie a rotina pelo painel Métricas do site).";
    if (p.estado !== "pronto") return "O site ainda não está no ar: o resumo só faz sentido depois de publicado.";
    return undefined;
  },
};

/** O texto do resumo (também usado pelo agente e pela tela de teste). */
export async function montarResumo(projetoId: string): Promise<{ titulo: string; texto: string; link?: string }> {
  const p = obter(projetoId);
  if (!p) return { titulo: "Resumo do site", texto: "O site deste resumo não existe mais. Apague a rotina em Configurações." };
  const r = resumo(projetoId, 7);
  const linhas = [
    `Visitas: ${resumoEmTexto(projetoId, 7)}`,
    r.total > 0 && r.origens.length > 1 ? `Outras origens: ${r.origens.slice(1, 4).map((o) => `${o.origem} (${o.visitas})`).join(", ")}.` : "",
    `Versão no ar: ${p.versaoPublicada ?? "1"}.`,
  ].filter(Boolean);
  try {
    const s = await sugerir(projetoId);
    if (s.sugestoes[0]) linhas.push(`Sugestão do agente: ${s.sugestoes[0].titulo} — ${s.sugestoes[0].motivo}`);
  } catch (err) {
    console.error("Resumo semanal sem sugestão:", err instanceof Error ? err.message : err);
  }
  const base = enderecoPublico();
  return { titulo: `Resumo semanal do site «${p.nome}»`, texto: linhas.join("\n"), ...(base ? { link: `${base}/sites/${p.id}` } : {}) };
}

registrarExecutor(TIPO_RESUMO_SITE, async (rotina: Rotina): Promise<ResultadoRotina> => {
  const { projetoId } = (rotina.parametros ?? {}) as ParametrosResumoSite;
  if (!projetoId) return { titulo: "Resumo do site", texto: "Esta rotina não está ligada a nenhum site. Apague e crie de novo pelo painel Métricas." };
  const r = await montarResumo(projetoId);
  // O link absoluto vai no próprio texto: lib/rotinas.ts só monta link para /r/<resultadoId>, e o site mora em /sites/<id>.
  return { titulo: r.titulo, texto: r.link ? `${r.texto}\n\nAbrir o site: ${r.link}` : r.texto };
});
