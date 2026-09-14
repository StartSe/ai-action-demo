// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho.
import { listar as listarHistorico, listarPorTipo, salvar } from "./historico";
import { montarRadar } from "./radar";
import { registrarExecutor, type Rotina } from "./rotinas";
import type { DadosRadar, Radar, Sinal } from "./types";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [
  { tipo: "resumo-radar-sinais", rotulo: "Resumo dos radares gerados" },
  { tipo: "radar-semanal", rotulo: "Radar semanal dos meus temas" },
];

registrarExecutor("resumo-radar-sinais", async (rotina: Rotina) => {
  const desde = rotina.ultimaExecucao ? new Date(rotina.ultimaExecucao) : new Date(0);
  const recentes = listarHistorico(50).filter((r) => r.tipo === "radar" && new Date(r.criadoEm) > desde);
  const titulo = "Resumo do Radar de Sinais";
  if (recentes.length === 0) return { titulo, texto: "Nenhum radar novo foi montado desde a última rotina.", enviar: false };
  const texto = `${recentes.length} radar${recentes.length > 1 ? "es" : ""} montado${recentes.length > 1 ? "s" : ""} desde a última rotina: ${recentes.map((r) => r.titulo).join(", ")}.`;
  return { titulo, texto, resultadoId: recentes[0].id };
});

/** Normaliza temas+setor para reconhecer duas execuções (ou um radar manual) como o mesmo perfil acompanhado. Mesmo espírito de chavePerfil em prospeccao-ia/lib/leads-vistos.ts. */
function chavePerfil(temas: string[], setor?: string): string {
  return [...temas.map((t) => t.trim().toLowerCase()).sort(), (setor || "").trim().toLowerCase()].join("|");
}

function tituloNormalizado(s: Sinal): string {
  return s.titulo.trim().toLowerCase();
}

registrarExecutor("radar-semanal", async (rotina: Rotina) => {
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

  const { meta, ...radar } = await montarRadar({ temas, periodoDias: 7, setor });

  const tituloSalvo = `Radar de sinais: ${temas.slice(0, 2).join(", ")}${temas.length > 2 ? "..." : ""}`;
  const resultadoId = salvar({ tipo: "radar", titulo: tituloSalvo, entrada: { temas, periodoDias: 7, setor }, saida: radar, meta });

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
