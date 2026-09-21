import { obterRadar } from "./radares";
import { aiEnabled } from "./ai";
import { TIPO_MONITORAMENTO, validarMonitoramento } from "./monitoramento";
// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho.
import { listar as listarHistorico, listarPorTipo, salvar } from "./historico";
import { chavePerfil } from "./perfil";
import { montarRadar } from "./radar";
import { registrarExecutor, type Rotina, type TipoRotina } from "./rotinas";
import type { DadosRadar, Radar, Sinal } from "./types";

/** Rotina semanal: precisa dos temas, então só nasce pelo botão "Receber este radar toda semana" no resultado
 * (POST /api/radar/semanal). Continua em TIPOS_ROTINA para o cartão "Rotinas" de /setup mostrar o rótulo certo,
 * mas `validar` recusa a criação pelo formulário genérico (que não tem campo de temas) com a orientação. */
export const TIPO_RADAR_SEMANAL: TipoRotina<Partial<DadosRadar>> = {
  tipo: "radar-semanal",
  rotulo: "Radar semanal dos meus temas",
  validar: (parametros) => {
    const temas = Array.isArray(parametros?.temas) ? parametros.temas.filter((t) => String(t).trim()) : [];
    return temas.length > 0 ? undefined : "O radar semanal precisa dos temas: monte um radar na tela inicial e clique em 'Receber este radar toda semana'.";
  },
};

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: TipoRotina[] = [{ tipo: "resumo-radar-sinais", rotulo: "Resumo dos radares gerados" }, TIPO_RADAR_SEMANAL as TipoRotina, { tipo: TIPO_MONITORAMENTO, rotulo: "Monitoramento diário", cadastroProprio: true, validar: (p) => { try { validarMonitoramento(p); } catch (e) { return (e as Error).message; } } }];

registrarExecutor("resumo-radar-sinais", async (rotina: Rotina) => {
  const desde = rotina.ultimaExecucao ? new Date(rotina.ultimaExecucao) : new Date(0);
  const recentes = listarHistorico(50).filter((r) => r.tipo === "radar" && new Date(r.criadoEm) > desde);
  const titulo = "Resumo do Radar de Sinais";
  if (recentes.length === 0) return { titulo, texto: "Nenhum radar novo foi montado desde a última rotina.", enviar: false };
  const texto = `${recentes.length} radar${recentes.length > 1 ? "es" : ""} montado${recentes.length > 1 ? "s" : ""} desde a última rotina: ${recentes.map((r) => r.titulo).join(", ")}.`;
  return { titulo, texto, resultadoId: recentes[0].id };
});

function tituloNormalizado(s: Sinal): string {
  return s.titulo.trim().toLowerCase();
}

registrarExecutor(TIPO_RADAR_SEMANAL.tipo, async (rotina: Rotina) => {
  if (!(await aiEnabled())) throw new Error("Conecte a IA em Configurações para monitorar fontes reais.");
  const titulo = "Radar semanal dos seus temas";
  const parametros = rotina.parametros as Partial<DadosRadar> | undefined;
  const temas = Array.isArray(parametros?.temas) ? parametros.temas.map((t) => String(t).trim()).filter(Boolean) : [];
  if (temas.length === 0) {
    return { titulo, texto: "Esta rotina precisa dos temas a acompanhar: crie-a pelo botão 'Receber este radar toda semana', na tela de resultado de um radar.", enviar: false };
  }
  const setor = parametros?.setor;
  const perfil = chavePerfil(temas, setor);

  // O radar anterior da mesma rotina é o último resultado salvo (tipo "radar") com o mesmo perfil
  // (temas+setor normalizados) — pode ter vindo de uma execução anterior desta rotina ou de um radar
  // montado manualmente na tela com os mesmos temas, o que é aceitável (mesma ambiguidade já existe
  // no dedup por perfil de prospeccao-ia).
  const anterior = listarPorTipo<DadosRadar, Radar>("radar", 50).find((r) => chavePerfil(r.entrada.temas, r.entrada.setor) === perfil);
  const titulosAnteriores = new Set((anterior?.saida.sinais ?? []).map(tituloNormalizado));

  const { meta, ...radar } = await montarRadar({ radarId: parametros?.radarId, temas, periodoDias: 7, setor });

  const tituloSalvo = `Radar de sinais: ${temas.slice(0, 2).join(", ")}${temas.length > 2 ? "..." : ""}`;
  const resultadoId = salvar({ tipo: "radar", titulo: tituloSalvo, entrada: { radarId: obterRadar(parametros?.radarId).id, temas, periodoDias: 7, setor }, saida: radar, meta });

  const novos = radar.sinais.filter((s) => !titulosAnteriores.has(tituloNormalizado(s)));
  const continuamFortes = radar.sinais.filter((s) => titulosAnteriores.has(tituloNormalizado(s)) && s.forca === "alta");

  if (novos.length === 0 && continuamFortes.length === 0) {
    return { titulo, texto: "Nenhum sinal novo nem sinal que continue forte nos seus temas nesta semana.", resultadoId };
  }

  const partes: string[] = [];
  if (novos.length > 0) partes.push(`Novos (${novos.length}): ${novos.map((s) => s.titulo).join("; ")}.`);
  if (continuamFortes.length > 0) partes.push(`Continuam fortes (${continuamFortes.length}): ${continuamFortes.map((s) => s.titulo).join("; ")}.`);

  return { titulo, texto: partes.join("\n\n"), resultadoId };
});

registrarExecutor(TIPO_MONITORAMENTO, async (rotina: Rotina) => {
  if (!(await aiEnabled())) throw new Error("Conecte a IA em Configurações para monitorar fontes reais.");
  const agenda = validarMonitoramento(rotina.parametros);
  const cadastro = obterRadar(agenda.radarId);
  const dados = validarMonitoramento({ ...agenda, radarId: cadastro.id, temas: cadastro.pesquisa.termos.filter(t => t.ativo).map(t => t.termo), setor: cadastro.pesquisa.setor, periodoDias: cadastro.pesquisa.periodoDias });
  const { meta, ...radar } = await montarRadar(dados);
  if (meta.demo) throw new Error("O monitoramento não envia dados de demonstração.");
  const titulo = `Radar: ${dados.temas.join(", ")}`;
  const resultadoId = salvar({ tipo: "radar", titulo, entrada: dados, saida: radar, meta });
  const texto = radar.sinais.length ? radar.sinais.map(s => `${s.titulo} (${s.forca})\n${s.resumo}\nAção sugerida: ${s.oQueFazer}\n${s.fontes.map(f => `${f.veiculo}: ${f.url}`).join("\n")}`).join("\n\n") : "Nenhum insight sustentado pelas fontes nesta rodada. O monitoramento continua nos próximos horários.";
  return { titulo, texto, resultadoId };
});
